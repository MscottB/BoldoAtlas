use crate::db::{self, Sentencia};
use crate::respaldos::{self, Fallo, Respaldo};
use crate::rutas::{self, InfoProyecto, Rutas};
use rusqlite::Connection;
use serde::Serialize;
use serde_json::{Map, Value};
use std::path::PathBuf;
use std::sync::{Mutex, TryLockError};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};
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
            respaldos::limpiar_parciales(&r.respaldos);
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

#[tauri::command]
pub fn db_consultar(
    estado: State<Estado>,
    sql: String,
    params: Vec<Value>,
) -> Result<Vec<Map<String, Value>>, String> {
    estado.con_conexion(|c| db::consultar(c, &sql, &params))
}

#[tauri::command]
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
    fn cerrar_ordenado_se_rinde_si_un_respaldo_tiene_la_conexion() {
        let dir = tempfile::tempdir().unwrap();
        let e = estado(db::abrir(&dir.path().join("boldo.db")).unwrap());
        let _ocupada = e.conn.lock().unwrap();
        let t = Instant::now();
        assert!(!e.cerrar_ordenado(Duration::from_millis(100)));
        assert!(t.elapsed() < Duration::from_secs(2));
    }
}
