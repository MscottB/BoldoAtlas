use crate::db::{self, Sentencia};
use crate::intercambio::{self, Sesiones, alcance, fusion};
use crate::respaldos::{self, Fallo, Respaldo};
use crate::rutas::{self, InfoProyecto, Rutas};
use rusqlite::Connection;
use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, TryLockError};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder};
use tauri_plugin_opener::OpenerExt;

/// Si iniciar falla, la app no se cierra: guarda el error y el frontend lo muestra.
pub struct Estado {
    conn: Mutex<Option<Connection>>,
    rutas: Option<Rutas>,
    version_esquema: i64,
    error: Option<String>,
}

impl Estado {
    /// Se llama al comienzo de `run()`, antes de que existan otros hilos: la portable ajusta aquí
    /// variables de entorno del proceso.
    pub fn iniciar() -> Self {
        let mut rutas_ok = None;
        let resultado = (|| {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let linux = |v| {
                std::env::var_os(v)
                    .filter(|_| cfg!(target_os = "linux"))
                    .map(PathBuf::from)
            };
            let (appimage, appdir) = (linux("APPIMAGE"), linux("APPDIR"));
            let exe_dir = rutas::carpeta_programa(&exe, appimage.as_deref(), appdir.as_deref())
                .ok_or("No se pudo ubicar la carpeta del programa.")?;
            let r = rutas::dir_datos(&exe_dir, dirs::data_dir().as_deref())?;
            if r.portable {
                for (nombre, ruta) in rutas::entorno_portable(std::env::consts::OS, &r.datos) {
                    std::fs::create_dir_all(&ruta).map_err(|e| e.to_string())?;
                    // SAFETY: aún no hay otros hilos que lean el entorno (ver la nota de la función)
                    unsafe { std::env::set_var(nombre, ruta) };
                }
            }
            rutas_ok = Some(r.clone());
            let mut conn = db::abrir(&r.bd)?;
            let version = db::migrar(&mut conn, &r.respaldos)?;
            db::asegurar_meta(&conn)?;
            Ok::<_, String>((conn, version))
        })();
        match resultado {
            Ok((conn, version)) => Estado {
                conn: Mutex::new(Some(conn)),
                rutas: rutas_ok,
                version_esquema: version,
                error: None,
            },
            Err(e) => Estado {
                conn: Mutex::new(None),
                rutas: rutas_ok,
                version_esquema: 0,
                error: Some(e),
            },
        }
    }

    fn con_conexion<T, E: From<String>>(
        &self,
        f: impl FnOnce(&mut Connection) -> Result<T, E>,
    ) -> Result<T, E> {
        let mut guardia = self
            .conn
            .lock()
            .map_err(|_| "La conexión quedó en un estado inválido.".to_string())?;
        let conn = guardia.as_mut().ok_or_else(|| {
            self.error
                .clone()
                .unwrap_or_else(|| "La base de datos no está abierta.".into())
        })?;
        f(conn)
    }

    /// Cierra la conexión al salir: SQLite vuelca el WAL y borra -wal/-shm. Si un respaldo tiene la
    /// conexión, espera `espera` y se rinde (devuelve false) para no colgar el cierre.
    pub fn cerrar_ordenado(&self, espera: Duration) -> bool {
        let limite = Instant::now() + espera;
        loop {
            match self.conn.try_lock() {
                Ok(mut g) => {
                    if let Some(c) = g.take() {
                        let _ = c.close();
                    }
                    return true;
                }
                Err(TryLockError::Poisoned(p)) => {
                    drop(p.into_inner().take());
                    return true;
                }
                Err(TryLockError::WouldBlock) if Instant::now() < limite => {
                    std::thread::sleep(Duration::from_millis(25))
                }
                Err(TryLockError::WouldBlock) => return false,
            }
        }
    }

    /// Perfil del WebView (localStorage, caché) de la portable: dentro de `datos/`. Instalada: el de Tauri.
    /// macOS no permite elegirlo: WKWebView usa siempre ~/Library/WebKit.
    /// Si no se pudo usar `datos/` (abierta desde el zip, pendrive de solo lectura, app translocada…), la
    /// pantalla de error usa el perfil por defecto de Tauri, fuera de la carpeta: es solo para mostrar el
    /// error, y una carpeta del sistema que se puede escribir es mejor que no poder mostrarlo.
    pub fn dir_webview(&self) -> Option<PathBuf> {
        let r = self.rutas.as_ref().filter(|r| r.portable)?;
        Some(r.datos.join("webview"))
    }

    /// Vuelve a abrir la base que cerró `cerrar_ordenado` cuando lo que venía después falló (p. ej. el instalador de
    /// Windows no se pudo lanzar). Con la base abierta no hace nada.
    pub fn reabrir(&self) -> Result<(), String> {
        let mut conn = self.conn.lock().unwrap_or_else(|p| p.into_inner());
        if conn.is_none() {
            let r = self
                .rutas
                .as_ref()
                .ok_or("No se ubicó la carpeta de datos.")?;
            *conn = Some(db::abrir(&r.bd)?);
        }
        Ok(())
    }

    /// Rutas de datos, si se pudieron ubicar (las usa el actualizador).
    pub fn rutas_app(&self) -> Option<&Rutas> {
        self.rutas.as_ref()
    }

    fn rutas(&self) -> Result<&Rutas, Fallo> {
        self.rutas
            .as_ref()
            .ok_or_else(|| "No se ubicó la carpeta de datos.".to_string().into())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InfoApp {
    dir_datos: String,
    ruta_bd: String,
    portable: bool,
    version_esquema: i64,
    error: Option<String>,
}

#[tauri::command]
pub fn info_app(estado: State<Estado>) -> InfoApp {
    let r = estado.rutas.as_ref();
    InfoApp {
        dir_datos: r.map(|r| r.datos.display().to_string()).unwrap_or_default(),
        ruta_bd: r.map(|r| r.bd.display().to_string()).unwrap_or_default(),
        portable: r.is_some_and(|r| r.portable),
        version_esquema: estado.version_esquema,
        error: estado.error.clone(),
    }
}

// `async`: fuera del hilo principal, que no debe quedar esperando la conexión mientras un respaldo o una importación la
// tienen. El orden de las escrituras lo guarda la cola de `lote` en src/db/cliente.ts.
#[tauri::command(async)]
pub fn db_consultar(
    estado: State<Estado>,
    sql: String,
    params: Vec<Value>,
) -> Result<Vec<Map<String, Value>>, String> {
    estado.con_conexion(|c| db::consultar(c, &sql, &params))
}

#[tauri::command(async)]
pub fn db_lote(
    estado: State<Estado>,
    sentencias: Vec<Sentencia>,
    version_app: String,
) -> Result<(), String> {
    estado.con_conexion(|c| db::lote(c, &sentencias, &version_app))
}

#[tauri::command]
pub async fn listar_respaldos(app: AppHandle) -> Result<Vec<Respaldo>, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        respaldos::listar(&app.state::<Estado>().rutas()?.respaldos)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Como `respaldar_ahora`, pero con un nombre propio que la poda nunca borra: lo usa «reemplazar los datos».
#[tauri::command]
pub async fn respaldar_antes_de_reemplazar(app: AppHandle) -> Result<String, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let estado = app.state::<Estado>();
        let dir = &estado.rutas()?.respaldos;
        estado.con_conexion(|c| {
            respaldos::respaldar_antes_de_reemplazar(c, dir, &respaldos::sello_local(c)?)
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// En un hilo aparte: el VACUUM INTO no congela la ventana.
#[tauri::command]
pub async fn respaldar_ahora(app: AppHandle) -> Result<String, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let estado = app.state::<Estado>();
        let dir = &estado.rutas()?.respaldos;
        estado.con_conexion(|c| respaldos::respaldar(c, dir, &respaldos::sello_local(c)?))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Si sale bien, reinicia la app: todo el estado (Rust y frontend) se vuelve a cargar desde la base restaurada.
#[tauri::command]
pub async fn restaurar_respaldo(app: AppHandle, nombre: String) -> Result<(), Fallo> {
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let estado = app2.state::<Estado>();
        let r = estado.rutas()?;
        let mut conexion = estado
            .conn
            .lock()
            .map_err(|_| "La conexión quedó en un estado inválido.".to_string())?;
        respaldos::restaurar(&mut conexion, &r.bd, &r.respaldos, &nombre, db::MIGRACIONES)
    })
    .await
    .map_err(|e| e.to_string())??;
    app.restart()
}

/// Abre una carpeta en el gestor de archivos. En la portable de Linux, xdg-open se lanza sin las variables que
/// la app apunta a `datos/` (ver `rutas::entorno_portable`): un gestor de archivos lanzado directamente las
/// heredaría y pondría su papelera y sus recientes en el pendrive. Quedan sin definir, o sea, las por defecto.
fn abrir_carpeta(app: &AppHandle, r: &Rutas, carpeta: &std::path::Path) -> Result<(), Fallo> {
    #[cfg(target_os = "linux")]
    if r.portable {
        let mut xdg = std::process::Command::new("xdg-open");
        for (nombre, _) in rutas::entorno_portable("linux", &r.datos) {
            xdg.env_remove(nombre);
        }
        if let Ok(mut hijo) = xdg.arg(carpeta).spawn() {
            // se espera en otro hilo para no dejar un proceso zombi
            std::thread::spawn(move || hijo.wait());
            return Ok(());
        }
    }
    #[cfg(not(target_os = "linux"))]
    let _ = r;
    app.opener()
        .open_path(carpeta.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string().into())
}

/// Abre la carpeta conocida por Rust; la interfaz nunca envía una ruta.
#[tauri::command]
pub fn abrir_carpeta_respaldos(app: AppHandle, estado: State<Estado>) -> Result<(), Fallo> {
    let r = estado.rutas()?;
    abrir_carpeta(&app, r, &r.respaldos)
}

/// Datos del proyecto abierto (modo, ruta, tamaño, última modificación); la ruta la conoce Rust.
#[tauri::command]
pub fn info_proyecto(estado: State<Estado>) -> Result<InfoProyecto, Fallo> {
    Ok(rutas::info_proyecto(estado.rutas()?)?)
}

/// Abre la carpeta de datos conocida por Rust; la interfaz nunca envía una ruta.
#[tauri::command]
pub fn abrir_carpeta_datos(app: AppHandle, estado: State<Estado>) -> Result<(), Fallo> {
    let r = estado.rutas()?;
    abrir_carpeta(&app, r, &r.datos)
}

#[derive(Clone, Serialize)]
struct Avance {
    trabajo: String,
    etapa: &'static str,
    hecho: u64,
    total: u64,
}

fn avisar(app: &AppHandle, trabajo: &str, etapa: &'static str, hecho: u64, total: u64) {
    let _ = app.emit(
        "intercambio-avance",
        Avance {
            trabajo: trabajo.to_string(),
            etapa,
            hecho,
            total,
        },
    );
}

/// El avance de `etapa`; deja de seguir cuando se cancela ese trabajo.
fn seguimiento(
    app: &AppHandle,
    trabajo: &str,
    etapa: &'static str,
) -> impl FnMut(u64, u64) -> bool + use<> {
    let (app, trabajo) = (app.clone(), trabajo.to_string());
    move |hecho, total| {
        avisar(&app, &trabajo, etapa, hecho, total);
        app.state::<Sesiones>().sigue(&trabajo)
    }
}

/// Diálogo nativo desde Rust: la interfaz nunca ve ni envía una ruta, y no necesita ningún permiso del plugin.
fn dialogo(app: &AppHandle) -> FileDialogBuilder<tauri::Wry> {
    let d = app.dialog().file().add_filter("BoldoAtlas", &["boldo"]);
    match app.get_webview_window("main") {
        Some(v) => d.set_parent(&v),
        None => d,
    }
}

fn nombre_archivo(ruta: &std::path::Path) -> String {
    ruta.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Copia la base y le quita lo que no va (`raices` None: va toda). Queda esperando a que se elija dónde guardarla.
#[tauri::command]
pub async fn exportar_preparar(
    app: AppHandle,
    trabajo: String,
    raices: Option<Vec<String>>,
) -> Result<alcance::ResumenExportacion, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let (estado, sesiones) = (app.state::<Estado>(), app.state::<Sesiones>());
        let datos = &estado.rutas()?.datos;
        sesiones.empezar(&trabajo);
        avisar(&app, &trabajo, "copiando", 0, 0);
        let copia = estado.con_conexion(|c| alcance::copiar(c, datos))?;
        let (temporal, resumen) = alcance::preparar(copia, datos, raices.as_deref())?;
        // si se canceló mientras tanto, el temporal se borra al soltarlo
        sesiones.guardar_exportacion(&trabajo, temporal)?;
        Ok(resumen)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
pub struct Guardado {
    nombre: String,
    codigo: String,
}

/// Pregunta dónde guardar y cifra. Devuelve el código una sola vez; None si no se eligió un lugar.
#[tauri::command]
pub async fn exportar_guardar(app: AppHandle, trabajo: String) -> Result<Option<Guardado>, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let sesiones = app.state::<Sesiones>();
        let temporal = sesiones.tomar_exportacion(&trabajo)?;
        let elegido = dialogo(&app)
            .set_file_name(intercambio::nombre_sugerido(temporal.ruta())?)
            .blocking_save_file();
        let Some(destino) = elegido.and_then(|f| f.into_path().ok()) else {
            sesiones.guardar_exportacion(&trabajo, temporal)?;
            return Ok(None);
        };
        let destino = match intercambio::con_extension(destino) {
            Ok(d) => d,
            Err(e) => {
                // la copia sigue preparada: se puede elegir otro nombre
                sesiones.guardar_exportacion(&trabajo, temporal)?;
                return Err(e);
            }
        };
        let codigo = intercambio::guardar(
            temporal.ruta(),
            &destino,
            seguimiento(&app, &trabajo, "cifrando"),
        )?;
        Ok(Some(Guardado {
            nombre: nombre_archivo(&destino),
            codigo,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
pub struct ArchivoElegido {
    nombre: String,
    bytes: u64,
}

/// Elige el archivo a importar. Rust se queda con la ruta; la interfaz solo recibe qué mostrar.
#[tauri::command]
pub async fn importar_elegir(
    app: AppHandle,
    trabajo: String,
) -> Result<Option<ArchivoElegido>, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let sesiones = app.state::<Sesiones>();
        // no elegir nada deja como estaba lo que ya se había elegido
        if !sesiones.sigue(&trabajo) {
            sesiones.empezar(&trabajo);
        }
        let Some(ruta) = dialogo(&app)
            .blocking_pick_file()
            .and_then(|f| f.into_path().ok())
        else {
            return Ok(None);
        };
        let elegido = ArchivoElegido {
            nombre: nombre_archivo(&ruta),
            bytes: std::fs::metadata(&ruta)?.len(),
        };
        sesiones.guardar_archivo(&trabajo, ruta)?;
        Ok(Some(elegido))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Descifra, revisa y calcula lo que pasaría, sin aplicar nada. El código no sale de esta función.
#[tauri::command]
pub async fn importar_abrir(
    app: AppHandle,
    trabajo: String,
    codigo: String,
) -> Result<intercambio::ResumenImportacion, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let (estado, sesiones) = (app.state::<Estado>(), app.state::<Sesiones>());
        let archivo = sesiones.archivo(&trabajo)?;
        let i = intercambio::abrir(
            &archivo,
            &estado.rutas()?.datos,
            &codigo,
            db::MIGRACIONES,
            seguimiento(&app, &trabajo, "descifrando"),
        )?;
        avisar(&app, &trabajo, "revisando", 0, 0);
        let resumen = estado.con_conexion(|c| intercambio::revisar(c, &i))?;
        sesiones.guardar_importacion(&trabajo, i)?;
        Ok(resumen)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// «Agregar lo nuevo». Si falla, la importación sigue abierta para reintentar o cancelar.
#[tauri::command]
pub async fn importar_agregar(
    app: AppHandle,
    trabajo: String,
    lugares: HashMap<String, Option<String>>,
    version_app: String,
) -> Result<fusion::Informe, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let (estado, sesiones) = (app.state::<Estado>(), app.state::<Sesiones>());
        let dir = &estado.rutas()?.respaldos;
        let i = sesiones.tomar_importacion(&trabajo)?;
        let hecho =
            estado.con_conexion(|c| intercambio::agregar(c, dir, &i, &lugares, &version_app));
        if hecho.is_err() {
            let _ = sesiones.guardar_importacion(&trabajo, i);
        }
        hecho
    })
    .await
    .map_err(|e| e.to_string())?
}

/// «Reemplazar todo». Si sale bien, reinicia la app, como al restaurar un respaldo.
#[tauri::command]
pub async fn importar_reemplazar(app: AppHandle, trabajo: String) -> Result<(), Fallo> {
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (estado, sesiones) = (app2.state::<Estado>(), app2.state::<Sesiones>());
        let r = estado.rutas()?;
        let i = sesiones.tomar_importacion(&trabajo)?;
        let mut conexion = estado
            .conn
            .lock()
            .map_err(|_| "La conexión quedó en un estado inválido.".to_string())?;
        let hecho =
            intercambio::reemplazar(&mut conexion, &r.bd, &r.respaldos, &i, db::MIGRACIONES);
        if hecho.is_err() {
            let _ = sesiones.guardar_importacion(&trabajo, i);
        }
        hecho
    })
    .await
    .map_err(|e| e.to_string())??;
    app.restart()
}

/// Detiene ese trabajo y borra sus temporales. Nada se aplicó.
#[tauri::command]
pub fn intercambio_cancelar(sesiones: State<Sesiones>, trabajo: String) {
    sesiones.cancelar(&trabajo);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn estado(conn: Connection) -> Estado {
        Estado {
            conn: Mutex::new(Some(conn)),
            rutas: None,
            version_esquema: 0,
            error: None,
        }
    }

    #[test]
    fn cerrar_ordenado_no_deja_wal_ni_shm() {
        let dir = tempfile::tempdir().unwrap();
        let bd = dir.path().join("boldo.db");
        let mut conn = db::abrir(&bd).unwrap();
        db::migrar(&mut conn, dir.path()).unwrap();
        db::asegurar_meta(&conn).unwrap();
        db::lote(&mut conn, &[], "t").unwrap();
        let wal = dir.path().join("boldo.db-wal");
        assert!(wal.exists(), "con la conexión abierta el WAL existe");
        let e = estado(conn);
        assert!(e.cerrar_ordenado(Duration::from_secs(1)));
        assert!(!wal.exists());
        assert!(!dir.path().join("boldo.db-shm").exists());
        assert!(e.conn.lock().unwrap().is_none());
        // cerrar dos veces no falla
        assert!(e.cerrar_ordenado(Duration::from_millis(10)));
    }

    #[test]
    fn reabrir_tras_cerrar_deja_la_base_usable() {
        let exe = tempfile::tempdir().unwrap();
        std::fs::write(exe.path().join("portable.flag"), "").unwrap();
        let r = rutas::dir_datos(exe.path(), None).unwrap();
        let mut conn = db::abrir(&r.bd).unwrap();
        db::migrar(&mut conn, &r.respaldos).unwrap();
        db::asegurar_meta(&conn).unwrap();
        let e = Estado {
            conn: Mutex::new(Some(conn)),
            rutas: Some(r),
            version_esquema: 0,
            error: None,
        };
        // abierta: no hace nada
        e.reabrir().unwrap();
        assert!(e.cerrar_ordenado(Duration::from_secs(1)));
        assert!(e.conn.lock().unwrap().is_none());
        e.reabrir().unwrap();
        let n: i64 = e
            .con_conexion(|c| {
                c.query_row("SELECT count(*) FROM meta", [], |f| f.get(0))
                    .map_err(|x| x.to_string())
            })
            .unwrap();
        assert!(n > 0);
    }

    #[test]
    fn reabrir_sin_rutas_falla_sin_entrar_en_panico() {
        let e = Estado {
            conn: Mutex::new(None),
            rutas: None,
            version_esquema: 0,
            error: None,
        };
        assert!(e.reabrir().is_err());
    }

    #[test]
    fn cerrar_ordenado_se_rinde_si_un_respaldo_tiene_la_conexion() {
        let dir = tempfile::tempdir().unwrap();
        let e = estado(db::abrir(&dir.path().join("boldo.db")).unwrap());
        let _ocupada = e.conn.lock().unwrap();
        let t = Instant::now();
        assert!(!e.cerrar_ordenado(Duration::from_millis(100)));
        assert!(t.elapsed() < Duration::from_secs(2));
    }
}
