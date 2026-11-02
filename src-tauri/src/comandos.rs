use crate::db::{self, Sentencia};
use crate::intercambio::{self, Sesiones, alcance, fusion, revision};
use crate::organizaciones::{
    Base, ESPERA_ARRANQUE, ESPERA_CAMBIO, Entrada, OTRA_BASE, OrganizacionVista, abrir_base,
    abrir_entrada, anotar_abierta, base_de, bloquear, cargar_lista, escribir_lista, vistas,
};
use crate::respaldos::{self, Fallo, Respaldo};
use crate::rutas::{self, InfoProyecto, Rutas};
use rusqlite::Connection;
use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::fs::File;
use std::path::PathBuf;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Mutex, RwLock, TryLockError};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder};
use tauri_plugin_opener::OpenerExt;

/// El texto que `errores.ts` reconoce para volver a decirlo en el idioma activo.
fn motivo_de_apertura(f: Fallo) -> String {
    match f.codigo {
        "esquema_nuevo" => db::texto_esquema_nuevo(f.detalle, db::MIGRACIONES.len()),
        "abierta_en_otra_copia" => format!(
            "Otra copia de BoldoAtlas tiene abierta esta base: {}",
            f.detalle
        ),
        _ => f.detalle,
    }
}

/// La organización que no abrió al arrancar, y por qué. Se abrió `boldo.db` en su lugar.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AvisoInicio {
    codigo: &'static str,
    nombre: String,
}

/// Si iniciar falla, la app no se cierra: guarda el error y el frontend lo muestra.
pub struct Estado {
    conn: Mutex<Option<Connection>>,
    /// Se escribe solo con `conn` tomado. Sigue ahí tras `cerrar_ordenado`: es lo que abre `reabrir`.
    base: Mutex<Option<Base>>,
    bloqueo: Mutex<Option<File>>,
    /// Se toma durante todo leer, cambiar y escribir `organizaciones.json`. Orden: `conn`, luego `lista`.
    lista: Mutex<()>,
    rutas: Option<Rutas>,
    version_esquema: AtomicI64,
    error: Mutex<Option<String>>,
    aviso_inicio: Mutex<Option<AvisoInicio>>,
}

impl Estado {
    /// Se llama al comienzo de `run()`, antes de que existan otros hilos: la portable ajusta aquí
    /// variables de entorno del proceso. La base abre después, en `abrir_inicial`.
    pub fn iniciar() -> Self {
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
            Ok::<_, String>(r)
        })();
        let (rutas, error) = match resultado {
            Ok(r) => (Some(r), None),
            Err(e) => (None, Some(e)),
        };
        Estado {
            conn: Mutex::new(None),
            base: Mutex::new(None),
            bloqueo: Mutex::new(None),
            lista: Mutex::new(()),
            rutas,
            version_esquema: AtomicI64::new(0),
            error: Mutex::new(error),
            aviso_inicio: Mutex::new(None),
        }
    }

    #[cfg(test)]
    pub(crate) fn de_prueba(
        conn: Option<Connection>,
        base: Option<Base>,
        rutas: Option<Rutas>,
    ) -> Estado {
        Estado {
            conn: Mutex::new(conn),
            base: Mutex::new(base),
            bloqueo: Mutex::new(None),
            lista: Mutex::new(()),
            rutas,
            version_esquema: AtomicI64::new(0),
            error: Mutex::new(None),
            aviso_inicio: Mutex::new(None),
        }
    }

    /// Se llama en `setup`.
    pub fn abrir_inicial(&self) {
        self.abrir_inicial_con(ESPERA_ARRANQUE, db::MIGRACIONES);
    }

    /// Abre la última organización abierta. Si no se puede, `boldo.db` (o lo crea vacío) y deja el aviso: nada de lo que le
    /// pase a la lista o a otro archivo deja sin base. La pantalla de error queda solo para cuando falla el propio `boldo.db`.
    pub fn abrir_inicial_con(&self, espera: Duration, migraciones: &[&str]) {
        let Some(r) = self.rutas.as_ref() else {
            return;
        };
        let mut conn = self.conn.lock().unwrap_or_else(|p| p.into_inner());
        let _lista = self.lista.lock().unwrap_or_else(|p| p.into_inner());
        let mut lista = cargar_lista(r);
        let guardar_error = |f| {
            *self.error.lock().unwrap_or_else(|p| p.into_inner()) = Some(motivo_de_apertura(f));
        };
        let ultima = lista
            .organizaciones
            .iter()
            .max_by(|a, b| a.abierta.cmp(&b.abierta))
            .cloned();
        let mut aviso = None;
        let mut abierta = None;
        let mut es_la_ultima = true;
        if let Some(e) = ultima {
            match abrir_entrada(r, &e, espera, migraciones) {
                Ok(a) => abierta = Some((a, e)),
                // ya se intentó `boldo.db`: intentarlo de nuevo solo volvería a esperar el bloqueo
                Err(f) if e.es_principal() && !matches!(f.codigo, "no_encontrado" | "otro_id") => {
                    return guardar_error(f);
                }
                Err(f) => {
                    // la otra sigue siendo la última: el próximo arranque la reintenta, por si vuelve el pendrive
                    es_la_ultima = e.es_principal();
                    aviso = Some(AvisoInicio {
                        codigo: f.codigo,
                        nombre: e.nombre,
                    })
                }
            }
        }
        let (a, e) = match abierta {
            Some(x) => x,
            None => match abrir_base(&r.bd, &r.respaldos, None, espera, migraciones) {
                Ok(a) => {
                    let e = Entrada::principal(&a.id);
                    (a, e)
                }
                Err(f) => return guardar_error(f),
            },
        };
        // la lista no es imprescindible: sin poder escribirla (o si salió marcada) se abre igual, y se reintenta la próxima vez
        if anotar_abierta(&mut lista, &e, &a.conn, es_la_ultima).is_ok() {
            let _ = escribir_lista(r, &lista);
        }
        *conn = Some(a.conn);
        *self.bloqueo.lock().unwrap_or_else(|p| p.into_inner()) = Some(a.bloqueo);
        *self.base.lock().unwrap_or_else(|p| p.into_inner()) = Some(base_de(r, &e));
        self.version_esquema.store(a.version, Ordering::Relaxed);
        *self.aviso_inicio.lock().unwrap_or_else(|p| p.into_inner()) = aviso;
    }

    fn listar_organizaciones(&self) -> Result<Vec<OrganizacionVista>, Fallo> {
        let r = self.rutas()?;
        let lista = {
            let _lista = self.lista.lock().unwrap_or_else(|p| p.into_inner());
            cargar_lista(r)
        };
        let activa = self.base_abierta().map(|b| b.id);
        Ok(vistas(r, &lista, activa.as_deref()))
    }

    pub fn base_abierta(&self) -> Option<Base> {
        self.base.lock().unwrap_or_else(|p| p.into_inner()).clone()
    }

    fn soltar_bloqueo(&self) {
        *self.bloqueo.lock().unwrap_or_else(|p| p.into_inner()) = None;
    }

    fn motivo_sin_base(&self) -> String {
        self.error
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
            .unwrap_or_else(|| "La base de datos no está abierta.".into())
    }

    /// La base abierta, solo si es la que cree tener quien pregunta.
    fn comprobar(&self, base_id: &str) -> Result<Base, String> {
        match self.base_abierta() {
            Some(b) if b.id == base_id => Ok(b),
            Some(_) => Err(OTRA_BASE.into()),
            None => Err(self.motivo_sin_base()),
        }
    }

    pub(crate) fn base(&self, base_id: &str) -> Result<Base, Fallo> {
        Ok(self.comprobar(base_id)?)
    }

    /// El seguro contra mezclas: compara con `conn` tomado, que es con lo que se cambia de base.
    pub(crate) fn con_conexion<T, E: From<String>>(
        &self,
        base_id: &str,
        f: impl FnOnce(&mut Connection) -> Result<T, E>,
    ) -> Result<T, E> {
        let mut guardia = self
            .conn
            .lock()
            .map_err(|_| "La conexión quedó en un estado inválido.".to_string())?;
        self.comprobar(base_id)?;
        let conn = guardia.as_mut().ok_or_else(|| self.motivo_sin_base())?;
        f(conn)
    }

    /// Como `con_conexion`, para lo que cierra y reemplaza la conexión: restaurar y reemplazar.
    pub(crate) fn con_ranura<T>(
        &self,
        base_id: &str,
        f: impl FnOnce(&mut Option<Connection>, &Base) -> Result<T, Fallo>,
    ) -> Result<T, Fallo> {
        let mut guardia = self
            .conn
            .lock()
            .map_err(|_| "La conexión quedó en un estado inválido.".to_string())?;
        let base = self.base(base_id)?;
        f(&mut guardia, &base)
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
                    self.soltar_bloqueo();
                    return true;
                }
                Err(TryLockError::Poisoned(p)) => {
                    drop(p.into_inner().take());
                    self.soltar_bloqueo();
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
            let Some(base) = self.base_abierta() else {
                self.rutas
                    .as_ref()
                    .ok_or("No se ubicó la carpeta de datos.")?;
                // `abrir_inicial` falló: no hay base que reabrir y su motivo sigue en pantalla
                return Ok(());
            };
            let bloqueo = bloquear(&base.bd, ESPERA_CAMBIO).map_err(motivo_de_apertura)?;
            *conn = Some(db::abrir(&base.bd)?);
            *self.bloqueo.lock().unwrap_or_else(|p| p.into_inner()) = Some(bloqueo);
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
    base_id: String,
    dir_datos: String,
    ruta_bd: String,
    portable: bool,
    version_esquema: i64,
    error: Option<String>,
    aviso_inicio: Option<AvisoInicio>,
}

/// En un hilo aparte: mira cada archivo, y una unidad externa lenta no debe congelar la ventana.
#[tauri::command]
pub async fn listar_organizaciones(app: AppHandle) -> Result<Vec<OrganizacionVista>, Fallo> {
    tauri::async_runtime::spawn_blocking(move || app.state::<Estado>().listar_organizaciones())
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn info_app(estado: State<Estado>) -> InfoApp {
    let r = estado.rutas.as_ref();
    InfoApp {
        base_id: estado.base_abierta().map(|b| b.id).unwrap_or_default(),
        dir_datos: r.map(|r| r.datos.display().to_string()).unwrap_or_default(),
        ruta_bd: r.map(|r| r.bd.display().to_string()).unwrap_or_default(),
        portable: r.is_some_and(|r| r.portable),
        version_esquema: estado.version_esquema.load(Ordering::Relaxed),
        error: estado
            .error
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone(),
        aviso_inicio: estado
            .aviso_inicio
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone(),
    }
}

// En `spawn_blocking`: ni el hilo principal ni los trabajadores de tokio quedan esperando la conexión mientras un respaldo
// o una importación la tienen. El orden de los lotes lo guarda `colaLotes` en src/db/cliente.ts.
#[tauri::command]
pub async fn db_consultar(
    app: AppHandle,
    base_id: String,
    sql: String,
    params: Vec<Value>,
) -> Result<Vec<Map<String, Value>>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<Estado>()
            .con_conexion(&base_id, |c| db::consultar(c, &sql, &params))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn db_lote(
    app: AppHandle,
    base_id: String,
    sentencias: Vec<Sentencia>,
    version_app: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<Estado>()
            .con_conexion(&base_id, |c| db::lote(c, &sentencias, &version_app))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn listar_respaldos(app: AppHandle, base_id: String) -> Result<Vec<Respaldo>, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        respaldos::listar(&app.state::<Estado>().base(&base_id)?.respaldos)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Como `respaldar_ahora`, pero con un nombre propio que la poda nunca borra: lo usa «reemplazar los datos».
#[tauri::command]
pub async fn respaldar_antes_de_reemplazar(
    app: AppHandle,
    base_id: String,
) -> Result<String, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let estado = app.state::<Estado>();
        let dir = estado.base(&base_id)?.respaldos;
        estado.con_conexion(&base_id, |c| {
            respaldos::respaldar_antes_de_reemplazar(c, &dir, &respaldos::sello_local(c)?)
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Antes de optimizar las fotos: conserva las originales, y de estos quedan los últimos 3.
#[tauri::command]
pub async fn respaldar_antes_de_optimizar(
    app: AppHandle,
    base_id: String,
) -> Result<String, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let estado = app.state::<Estado>();
        let dir = estado.base(&base_id)?.respaldos;
        estado.con_conexion(&base_id, |c| {
            respaldos::respaldar_antes_de_optimizar(c, &dir, &respaldos::sello_local(c)?)
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// En un hilo aparte: el VACUUM INTO no congela la ventana.
#[tauri::command]
pub async fn respaldar_ahora(app: AppHandle, base_id: String) -> Result<String, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let estado = app.state::<Estado>();
        let dir = estado.base(&base_id)?.respaldos;
        estado.con_conexion(&base_id, |c| {
            respaldos::respaldar(c, &dir, &respaldos::sello_local(c)?)
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Si sale bien, reinicia la app: todo el estado (Rust y frontend) se vuelve a cargar desde la base restaurada.
#[tauri::command]
pub async fn restaurar_respaldo(
    app: AppHandle,
    base_id: String,
    nombre: String,
) -> Result<(), Fallo> {
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        app2.state::<Estado>().con_ranura(&base_id, |conexion, b| {
            respaldos::restaurar(conexion, b, &nombre, db::MIGRACIONES)
        })
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
pub fn abrir_carpeta_respaldos(
    app: AppHandle,
    estado: State<Estado>,
    base_id: String,
) -> Result<(), Fallo> {
    let base = estado.base(&base_id)?;
    abrir_carpeta(&app, estado.rutas()?, &base.respaldos)
}

/// Datos del proyecto abierto (modo, ruta, tamaño, última modificación); la ruta la conoce Rust.
#[tauri::command]
pub fn info_proyecto(estado: State<Estado>, base_id: String) -> Result<InfoProyecto, Fallo> {
    let base = estado.base(&base_id)?;
    Ok(rutas::info_proyecto(estado.rutas()?, &base)?)
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
    base_id: String,
    trabajo: String,
    raices: Option<Vec<String>>,
) -> Result<alcance::ResumenExportacion, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let (estado, sesiones) = (app.state::<Estado>(), app.state::<Sesiones>());
        let datos = &estado.rutas()?.datos;
        sesiones.empezar(&trabajo)?;
        avisar(&app, &trabajo, "copiando", 0, 0);
        let copia = estado.con_conexion(&base_id, |c| alcance::copiar(c, datos))?;
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

/// Pregunta dónde guardar. false si no se eligió un lugar; la copia sigue preparada. No es un trabajo: espera al usuario.
#[tauri::command]
pub async fn exportar_elegir_destino(app: AppHandle, trabajo: String) -> Result<bool, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let sesiones = app.state::<Sesiones>();
        let copia = sesiones.ruta_exportacion(&trabajo)?;
        let elegido = dialogo(&app)
            .set_file_name(intercambio::nombre_sugerido(&copia)?)
            .blocking_save_file();
        let Some(destino) = elegido.and_then(|f| f.into_path().ok()) else {
            return Ok(false);
        };
        sesiones.guardar_destino(&trabajo, intercambio::con_extension(destino)?)?;
        Ok(true)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Cifra al destino elegido. Devuelve el código una sola vez.
#[tauri::command]
pub async fn exportar_guardar(app: AppHandle, trabajo: String) -> Result<Guardado, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let (temporal, destino) = app.state::<Sesiones>().tomar_exportacion(&trabajo)?;
        let codigo = intercambio::guardar(
            temporal.ruta(),
            &destino,
            seguimiento(&app, &trabajo, "cifrando"),
        )?;
        Ok(Guardado {
            nombre: nombre_archivo(&destino),
            codigo,
        })
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
            sesiones.empezar(&trabajo)?;
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
    base_id: String,
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
        let resumen = estado.con_conexion(&base_id, |c| intercambio::revisar(c, &i))?;
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
    base_id: String,
    trabajo: String,
    lugares: HashMap<String, Option<String>>,
    version_app: String,
) -> Result<fusion::Informe, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let (estado, sesiones) = (app.state::<Estado>(), app.state::<Sesiones>());
        let dir = estado.base(&base_id)?.respaldos;
        let i = sesiones.tomar_importacion(&trabajo)?;
        let hecho = estado.con_conexion(&base_id, |c| {
            intercambio::agregar(c, &dir, &i, &lugares, &version_app)
        });
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
pub async fn importar_reemplazar(
    app: AppHandle,
    base_id: String,
    trabajo: String,
) -> Result<(), Fallo> {
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (estado, sesiones) = (app2.state::<Estado>(), app2.state::<Sesiones>());
        let i = sesiones.tomar_importacion(&trabajo)?;
        let hecho = estado.con_ranura(&base_id, |conexion, b| {
            intercambio::reemplazar(conexion, b, &i, db::MIGRACIONES)
        });
        if hecho.is_err() {
            let _ = sesiones.guardar_importacion(&trabajo, i);
        }
        hecho
    })
    .await
    .map_err(|e| e.to_string())??;
    app.restart()
}

/// «Revisar y decidir»: compara el archivo con la base, sin escribir nada. Comparar de nuevo conserva las decisiones sobre las
/// filas que no cambiaron.
#[tauri::command]
pub async fn importar_comparar(
    app: AppHandle,
    base_id: String,
    trabajo: String,
    lugares: HashMap<String, Option<String>>,
) -> Result<revision::ResumenRevision, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let (estado, sesiones) = (app.state::<Estado>(), app.state::<Sesiones>());
        let i = sesiones.importacion(&trabajo)?;
        let anterior = sesiones.revision(&trabajo).ok();
        let guardia = anterior.as_ref().map(|a| leer(a));
        let r = estado.con_conexion(&base_id, |c| {
            revision::abrir(
                c,
                &i,
                lugares,
                guardia.as_deref(),
                seguimiento(&app, &trabajo, "comparando"),
            )
        })?;
        drop(guardia);
        let resumen = r.resumen();
        sesiones.guardar_revision(&trabajo, r)?;
        Ok(resumen)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Volver a elegir qué hacer con el archivo. Las decisiones se pierden; la interfaz ya avisó.
#[tauri::command]
pub fn importar_volver(sesiones: State<Sesiones>, trabajo: String) {
    sesiones.soltar_revision(&trabajo);
}

fn leer(r: &RwLock<revision::Revision>) -> std::sync::RwLockReadGuard<'_, revision::Revision> {
    r.read().unwrap_or_else(|p| p.into_inner())
}

fn escribir(r: &RwLock<revision::Revision>) -> std::sync::RwLockWriteGuard<'_, revision::Revision> {
    r.write().unwrap_or_else(|p| p.into_inner())
}

/// Lo que necesita mirar la revisión, ya abierta: la base y el archivo, solo para leer.
fn con_revision<T: Send + 'static>(
    app: AppHandle,
    base_id: String,
    trabajo: String,
    f: impl FnOnce(&Connection, &Connection, &revision::Revision) -> Result<T, Fallo> + Send + 'static,
) -> tauri::async_runtime::JoinHandle<Result<T, Fallo>> {
    tauri::async_runtime::spawn_blocking(move || {
        let (estado, sesiones) = (app.state::<Estado>(), app.state::<Sesiones>());
        let (i, r) = (
            sesiones.importacion(&trabajo)?,
            sesiones.revision(&trabajo)?,
        );
        let imp = i.solo_lectura()?;
        let guardia = leer(&r);
        estado.con_conexion(&base_id, |c| f(c, &imp, &guardia))
    })
}

#[tauri::command]
pub async fn revision_resumen(
    app: AppHandle,
    trabajo: String,
) -> Result<revision::ResumenRevision, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let r = app.state::<Sesiones>().revision(&trabajo)?;
        let resumen = leer(&r).resumen();
        Ok(resumen)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn revision_pagina(
    app: AppHandle,
    base_id: String,
    trabajo: String,
    filtro: revision::Filtro,
) -> Result<revision::Pagina, Fallo> {
    con_revision(app, base_id, trabajo, move |c, imp, r| {
        r.pagina(c, imp, &filtro)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn revision_detalle(
    app: AppHandle,
    base_id: String,
    trabajo: String,
    tabla: String,
    id: String,
) -> Result<revision::DetalleCaso, Fallo> {
    con_revision(app, base_id, trabajo, move |c, imp, r| {
        r.detalle(c, imp, &tabla, &id)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Anota una decisión. Lo aplicado sale de aquí, no de lo que la interfaz mande al final.
#[tauri::command]
pub async fn revision_decidir(
    app: AppHandle,
    trabajo: String,
    tabla: String,
    id: String,
    eleccion: revision::Eleccion,
) -> Result<revision::ResumenRevision, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let r = app.state::<Sesiones>().revision(&trabajo)?;
        let mut g = escribir(&r);
        g.decidir(&tabla, &id, eleccion)?;
        Ok(g.resumen())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn revision_masivo(
    app: AppHandle,
    trabajo: String,
    accion: revision::Masivo,
) -> Result<revision::ResumenRevision, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let r = app.state::<Sesiones>().revision(&trabajo)?;
        let mut g = escribir(&r);
        g.masivo(accion);
        Ok(g.resumen())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// La misma pasada que al aplicar, deshecha al final: dice qué detendría «Aplicar» con las decisiones de ahora.
#[tauri::command]
pub async fn revision_verificar(
    app: AppHandle,
    base_id: String,
    trabajo: String,
) -> Result<revision::ResumenRevision, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let (estado, sesiones) = (app.state::<Estado>(), app.state::<Sesiones>());
        let (i, r) = (
            sesiones.importacion(&trabajo)?,
            sesiones.revision(&trabajo)?,
        );
        let v = {
            let g = leer(&r);
            let sesiones = &sesiones;
            let trabajo = &trabajo;
            estado.con_conexion(&base_id, |c| {
                revision::verificar(c, &i, &g, || sesiones.sigue(trabajo))
            })?
        };
        let mut g = escribir(&r);
        g.anotar_verificacion(v);
        Ok(g.resumen())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn revision_bloqueos(
    app: AppHandle,
    base_id: String,
    trabajo: String,
    desde: usize,
    cuantos: usize,
) -> Result<revision::PaginaBloqueos, Fallo> {
    con_revision(app, base_id, trabajo, move |c, imp, r| {
        r.pagina_bloqueos(c, imp, desde, cuantos)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// A qué se puede reasignar una referencia: filas vivas de esta base.
#[tauri::command]
pub async fn revision_opciones(
    app: AppHandle,
    base_id: String,
    trabajo: String,
    destino: String,
    texto: String,
) -> Result<Vec<revision::Opcion>, Fallo> {
    con_revision(app, base_id, trabajo, move |c, _, _| {
        revision::opciones(c, &destino, &texto)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Aplica lo decidido en esta revisión, en una sola transacción y con respaldo. `version` es la revisión que se vio: si hubo
/// otra decisión después, o la base cambió, no se escribe nada.
#[tauri::command]
pub async fn revision_aplicar(
    app: AppHandle,
    base_id: String,
    trabajo: String,
    version: u64,
    confirmado: bool,
    version_app: String,
) -> Result<revision::InformeRevision, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let (estado, sesiones) = (app.state::<Estado>(), app.state::<Sesiones>());
        let dir = estado.base(&base_id)?.respaldos;
        let r = sesiones.revision(&trabajo)?;
        let i = sesiones.importacion(&trabajo)?;
        let hecho = {
            let g = leer(&r);
            estado.con_conexion(&base_id, |c| {
                revision::aplicar(c, &dir, &i, &g, version, confirmado, &version_app)
            })
        };
        // ya aplicado no se puede aplicar dos veces
        if hecho.is_ok() {
            let _ = sesiones.tomar_importacion(&trabajo);
            sesiones.soltar_revision(&trabajo);
        }
        hecho
    })
    .await
    .map_err(|e| e.to_string())?
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
        Estado::de_prueba(Some(conn), None, None)
    }

    /// La carpeta de una portable, temporal: las pruebas nunca tocan los datos reales.
    fn rutas_de_prueba() -> (tempfile::TempDir, Rutas) {
        let exe = tempfile::tempdir().unwrap();
        std::fs::write(exe.path().join("portable.flag"), "").unwrap();
        let r = rutas::dir_datos(exe.path(), None).unwrap();
        (exe, r)
    }

    #[test]
    fn cerrar_ordenado_suelta_el_bloqueo() {
        let (_exe, r) = rutas_de_prueba();
        let bd = r.bd.clone();
        let e = Estado::de_prueba(None, None, Some(r));
        e.abrir_inicial();
        let base = e.base_abierta().unwrap();
        assert_eq!(base.bd, bd);
        assert_eq!(
            e.version_esquema.load(Ordering::Relaxed),
            db::MIGRACIONES.len() as i64
        );
        assert_eq!(
            bloquear(&bd, ESPERA_CAMBIO).unwrap_err().codigo,
            "abierta_en_otra_copia"
        );
        assert!(e.cerrar_ordenado(Duration::from_secs(1)));
        bloquear(&bd, ESPERA_CAMBIO).unwrap();
        // la base sigue anotada: es a la que vuelve `reabrir`
        assert_eq!(e.base_abierta(), Some(base));
    }

    #[test]
    fn reabrir_vuelve_a_la_base_abierta_con_su_bloqueo() {
        let (_exe, r) = rutas_de_prueba();
        let bd = r.datos.join("otra.db");
        let respaldos = r.datos.join("otra-respaldos");
        let a = abrir_base(&bd, &respaldos, None, ESPERA_CAMBIO, db::MIGRACIONES)
            .ok()
            .unwrap();
        let base = Base {
            id: a.id.clone(),
            bd: bd.clone(),
            respaldos,
        };
        let principal = r.bd.clone();
        let e = Estado::de_prueba(Some(a.conn), Some(base), Some(r));
        *e.bloqueo.lock().unwrap() = Some(a.bloqueo);
        assert!(e.cerrar_ordenado(Duration::from_secs(1)));
        drop(bloquear(&bd, ESPERA_CAMBIO).unwrap());

        e.reabrir().unwrap();
        let id: String = e
            .con_conexion(&a.id, |c| {
                c.query_row("SELECT valor FROM meta WHERE clave = 'db_id'", [], |f| {
                    f.get(0)
                })
                .map_err(|x| x.to_string())
            })
            .unwrap();
        assert_eq!(id, a.id);
        assert!(!principal.exists());
        assert_eq!(
            bloquear(&bd, ESPERA_CAMBIO).unwrap_err().codigo,
            "abierta_en_otra_copia"
        );
    }

    #[test]
    fn abrir_inicial_con_esquema_nuevo_guarda_el_texto_de_hoy() {
        let (_exe, r) = rutas_de_prueba();
        let c = db::abrir(&r.bd).unwrap();
        c.pragma_update(None, "user_version", 99).unwrap();
        c.close().unwrap();
        let e = Estado::de_prueba(None, None, Some(r));
        e.abrir_inicial();
        let error = e.error.lock().unwrap().clone().unwrap();
        let esperado = format!(
            "esquema 99; esta app conoce hasta el {}",
            db::MIGRACIONES.len()
        );
        assert!(error.contains(&esperado), "{error}");
        assert!(e.conn.lock().unwrap().is_none());
        assert_eq!(e.base_abierta(), None);
        // el motivo también llega a quien pida datos
        let datos = e.con_conexion("A", |_| Ok::<_, String>(())).unwrap_err();
        assert_eq!(datos, error);
        // no hay nada que reabrir: si falló una actualización, sigue la pantalla de error
        e.reabrir().unwrap();
        assert!(e.conn.lock().unwrap().is_none());
    }

    #[test]
    fn el_motivo_de_otra_copia_es_el_que_traduce_la_interfaz() {
        assert_eq!(
            motivo_de_apertura(Fallo::de("abierta_en_otra_copia", "C:/x")),
            "Otra copia de BoldoAtlas tiene abierta esta base: C:/x"
        );
        // un motivo vacío dejaría pasar el arranque sin pantalla de error
        assert_eq!(
            motivo_de_apertura(db::SIN_ESPACIO.to_string().into()),
            db::SIN_ESPACIO
        );
    }

    /// Una base «A» en una carpeta temporal, ya migrada.
    fn con_base_a() -> (tempfile::TempDir, Estado) {
        let dir = tempfile::tempdir().unwrap();
        let bd = dir.path().join("a.db");
        let mut conn = db::abrir(&bd).unwrap();
        db::migrar(&mut conn, dir.path()).unwrap();
        db::asegurar_meta(&conn).unwrap();
        let base = Base {
            id: "A".into(),
            bd,
            respaldos: dir.path().join("respaldos"),
        };
        (dir, Estado::de_prueba(Some(conn), Some(base), None))
    }

    #[test]
    fn con_conexion_con_otra_base_no_ejecuta_nada() {
        let (_dir, e) = con_base_a();
        let mut corrio = false;
        let r: Result<(), String> = e.con_conexion("B", |_| {
            corrio = true;
            Ok(())
        });
        assert_eq!(r.unwrap_err(), "otra_base");
        assert!(!corrio);
        // y con la base que está abierta, sí
        e.con_conexion("A", |_| Ok::<_, String>(())).unwrap();
    }

    #[test]
    fn lote_con_base_antigua_no_escribe() {
        let (_dir, e) = con_base_a();
        let revision = || -> String {
            e.con_conexion("A", |c| {
                c.query_row(
                    "SELECT valor FROM meta WHERE clave = 'data_revision'",
                    [],
                    |f| f.get(0),
                )
                .map_err(|x| x.to_string())
            })
            .unwrap()
        };
        let antes = revision();
        let antigua = e.con_conexion("antigua", |c| db::lote(c, &[], "t"));
        assert_eq!(antigua.unwrap_err(), "otra_base");
        assert_eq!(revision(), antes);
        e.con_conexion("A", |c| db::lote(c, &[], "t")).unwrap();
        assert_ne!(revision(), antes);
    }

    #[test]
    fn con_ranura_y_base_rechazan_otra_base() {
        let (_dir, e) = con_base_a();
        let mut corrio = false;
        let r = e.con_ranura("B", |_, _| {
            corrio = true;
            Ok(())
        });
        assert_eq!(r.unwrap_err().codigo, "otra_base");
        assert!(!corrio);
        assert_eq!(e.base("B").unwrap_err().codigo, "otra_base");

        assert_eq!(e.base("A").unwrap().id, "A");
        let id = e.con_ranura("A", |ranura, base| {
            assert!(ranura.is_some());
            Ok(base.id.clone())
        });
        assert_eq!(id.unwrap(), "A");
    }

    #[test]
    fn sin_base_abierta_se_responde_el_motivo_y_no_otra_base() {
        let e = Estado::de_prueba(None, None, None);
        *e.error.lock().unwrap() = Some("motivo".into());
        assert_eq!(e.base("A").unwrap_err().detalle, "motivo");
        assert_eq!(
            e.con_ranura("A", |_, _| Ok(())).unwrap_err().detalle,
            "motivo"
        );
    }

    #[test]
    fn fallo_desde_texto_reconoce_otra_base_y_sin_espacio() {
        let de = |t: &str| Fallo::from(t.to_string());
        assert_eq!(de("otra_base").codigo, "otra_base");
        assert_eq!(de("sin_espacio").codigo, "sin_espacio");
        let otro = de("algo más");
        assert_eq!((otro.codigo, otro.detalle.as_str()), ("fallo", "algo más"));
    }

    #[test]
    fn un_disco_lleno_da_sin_espacio() {
        let io = std::io::Error::from(std::io::ErrorKind::StorageFull);
        assert_eq!(Fallo::from(io).codigo, "sin_espacio");
        let lleno = rusqlite::Error::SqliteFailure(rusqlite::ffi::Error::new(13), None);
        assert_eq!(
            lleno.sqlite_error_code(),
            Some(rusqlite::ErrorCode::DiskFull)
        );
        assert_eq!(Fallo::from(lleno).codigo, "sin_espacio");
        // los demás errores siguen como estaban
        let otro = std::io::Error::from(std::io::ErrorKind::NotFound);
        assert_eq!(Fallo::from(otro).codigo, "fallo");
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
        let base = Base {
            id: String::new(),
            bd: r.bd.clone(),
            respaldos: r.respaldos.clone(),
        };
        let e = Estado::de_prueba(Some(conn), Some(base), Some(r));
        // abierta: no hace nada
        e.reabrir().unwrap();
        assert!(e.cerrar_ordenado(Duration::from_secs(1)));
        assert!(e.conn.lock().unwrap().is_none());
        e.reabrir().unwrap();
        let n: i64 = e
            .con_conexion("", |c| {
                c.query_row("SELECT count(*) FROM meta", [], |f| f.get(0))
                    .map_err(|x| x.to_string())
            })
            .unwrap();
        assert!(n > 0);
    }

    #[test]
    fn reabrir_sin_rutas_falla_sin_entrar_en_panico() {
        let e = Estado::de_prueba(None, None, None);
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

#[cfg(test)]
mod arranque_organizaciones {
    use super::*;
    use crate::organizaciones::prueba::{crear, entrada, escribir, interna, rutas, sin_rastros};
    use crate::organizaciones::{Entrada, Lista, base_de, cargar_lista, ruta_de};
    use std::fs;

    const YA: Duration = Duration::ZERO;

    fn arrancar(r: &Rutas) -> Estado {
        let e = Estado::de_prueba(None, None, Some(r.clone()));
        e.abrir_inicial_con(Duration::from_millis(100), db::MIGRACIONES);
        e
    }

    fn lista_del_json(r: &Rutas) -> Lista {
        serde_json::from_slice(&fs::read(r.datos.join("organizaciones.json")).unwrap()).unwrap()
    }

    /// Que quien arrancó tenga `boldo.db` y lo pueda usar.
    fn abrio_boldo_db(e: &Estado, r: &Rutas) -> Base {
        let base = e.base_abierta().unwrap();
        assert_eq!(base.bd, r.bd);
        assert_eq!(base.respaldos, r.respaldos);
        assert_eq!(*e.error.lock().unwrap(), None);
        e.con_conexion(&base.id, |_| Ok::<_, String>(())).unwrap();
        base
    }

    fn aviso(e: &Estado) -> (&'static str, String) {
        let a = e.aviso_inicio.lock().unwrap().clone().unwrap();
        (a.codigo, a.nombre)
    }

    /// `boldo.db` con datos y otra organización abierta después: es la que intentará abrir al arrancar.
    fn con_principal(r: &Rutas, ultima: Entrada) -> String {
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        escribir(r, vec![entrada(&id, "boldo.db", false, "2020"), ultima]);
        id
    }

    fn fija_meta(bd: &std::path::Path, clave: &str, valor: &str) {
        let c = db::abrir(bd).unwrap();
        c.execute(
            "INSERT OR REPLACE INTO meta (clave, valor) VALUES (?1, ?2)",
            [clave, valor],
        )
        .unwrap();
        c.close().unwrap();
    }

    #[test]
    fn primer_arranque_lista_boldo_db_sin_moverlo() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", &db::MIGRACIONES[..1]);
        let c = db::abrir(&r.bd).unwrap();
        c.execute(
            "INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at)
             VALUES ('u1', '00000000-0000-7000-8000-000000000001', 'Gerencia', 'x', 'x')",
            [],
        )
        .unwrap();
        c.close().unwrap();
        let respaldo = r.respaldos.join("boldo-20200101-0000.db");
        fs::write(&respaldo, "un respaldo").unwrap();

        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert_eq!(*e.aviso_inicio.lock().unwrap(), None);
        assert_eq!(
            e.version_esquema.load(Ordering::Relaxed),
            db::MIGRACIONES.len() as i64
        );
        let nombre: String = e
            .con_conexion(&id, |c| {
                c.query_row("SELECT nombre FROM unidades WHERE id = 'u1'", [], |f| {
                    f.get(0)
                })
                .map_err(|x| x.to_string())
            })
            .unwrap();
        assert_eq!(nombre, "Gerencia");
        assert_eq!(fs::read(&respaldo).unwrap(), b"un respaldo");
        assert!(fs::read_dir(&r.respaldos).unwrap().flatten().any(|f| {
            f.file_name()
                .to_string_lossy()
                .starts_with("antes-migracion-1-")
        }));

        let l = lista_del_json(&r);
        assert_eq!(l.version, 1);
        assert_eq!(l.organizaciones.len(), 1);
        let o = &l.organizaciones[0];
        assert_eq!(o.id, id);
        assert_eq!(o.ruta, "boldo.db");
        assert!(!o.externa);
        assert_eq!(o.nombre, "La mía");
        assert!(!r.datos.join("organizaciones").join(&id).exists());
    }

    #[test]
    fn sin_boldo_db_se_crea_vacio_y_no_se_lista() {
        let (_exe, r) = rutas();
        let e = arrancar(&r);
        abrio_boldo_db(&e, &r);
        assert!(r.bd.is_file());
        assert!(cargar_lista(&r).organizaciones.is_empty());
    }

    #[test]
    fn boldo_db_vaciado_sale_de_la_lista() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "", db::MIGRACIONES);
        escribir(&r, vec![entrada(&id, "boldo.db", false, "2020")]);
        abrio_boldo_db(&arrancar(&r), &r);
        assert!(lista_del_json(&r).organizaciones.is_empty());
    }

    #[test]
    fn rutas_relativas_sobreviven_a_mover_la_carpeta() {
        let (_exe, r) = rutas();
        let o = interna(&r, "2026");
        crear(&r.bd, "La mía", db::MIGRACIONES);
        escribir(&r, vec![o.clone()]);

        let nueva = tempfile::tempdir().unwrap();
        fs::write(nueva.path().join("portable.flag"), "").unwrap();
        fs::rename(&r.datos, nueva.path().join("datos")).unwrap();
        let movida = rutas::dir_datos(nueva.path(), None).unwrap();

        let e = arrancar(&movida);
        let base = e.base_abierta().unwrap();
        assert_eq!(base.id, o.id);
        assert!(base.bd.starts_with(&movida.datos), "{}", base.bd.display());
        assert_eq!(*e.aviso_inicio.lock().unwrap(), None);
    }

    #[test]
    fn arranca_en_la_ultima_abierta() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        let vieja = interna(&r, "2026-01-01T00:00:00.000Z");
        let ultima = interna(&r, "2026-06-01T00:00:00.000Z");
        escribir(
            &r,
            vec![
                entrada(&id, "boldo.db", false, "2025-01-01T00:00:00.000Z"),
                ultima.clone(),
                vieja.clone(),
            ],
        );
        let e = arrancar(&r);
        let base = e.base_abierta().unwrap();
        assert_eq!(base, base_de(&r, &ultima));
        assert!(base.respaldos.is_dir());
        assert_eq!(
            bloquear(&base.bd, YA).unwrap_err().codigo,
            "abierta_en_otra_copia"
        );

        // queda al día y con el nombre del archivo; las demás, como estaban
        let l = lista_del_json(&r);
        let de = |id: &str| l.organizaciones.iter().find(|o| o.id == id).unwrap();
        assert_ne!(de(&ultima.id).abierta, ultima.abierta);
        assert_eq!(de(&ultima.id).nombre, "Interna");
        assert_eq!(de(&ultima.id).color, ultima.color);
        assert_eq!(de(&vieja.id), &vieja);

        let vista = e.listar_organizaciones().unwrap();
        assert_eq!(vista.len(), 3);
        for v in &vista {
            assert_eq!(v.activa, v.id == ultima.id, "{}", v.nombre);
        }
    }

    #[test]
    fn con_la_ultima_ausente_abre_boldo_db_y_avisa() {
        let (_exe, r) = rutas();
        let afuera = tempfile::tempdir().unwrap();
        let pendrive = afuera.path().join("retirado.db");
        let ausente = entrada(
            &uuid::Uuid::now_v7().to_string(),
            pendrive.to_str().unwrap(),
            true,
            "2026",
        );
        let id = con_principal(&r, ausente.clone());

        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert_eq!(aviso(&e), ("no_encontrado", ausente.nombre.clone()));
        assert!(!pendrive.exists());

        // la ausente sigue, igual que estaba, para cuando vuelva el pendrive
        let l = lista_del_json(&r);
        assert_eq!(l.organizaciones.len(), 2);
        assert!(l.organizaciones.contains(&ausente));
        // `boldo.db` no pasa a ser la última: su hora sigue igual
        let principal = l.organizaciones.iter().find(|o| o.id == id).unwrap();
        assert_eq!(principal.abierta, "2020");
    }

    #[test]
    fn al_volver_el_pendrive_se_reabre_la_ultima() {
        let (_exe, r) = rutas();
        let afuera = tempfile::tempdir().unwrap();
        let pendrive = afuera.path().join("externa.db");
        let guardada = afuera.path().join("guardada.db");
        let id_externa = crear(&pendrive, "Del pendrive", db::MIGRACIONES);
        fs::rename(&pendrive, &guardada).unwrap();
        let o = entrada(&id_externa, pendrive.to_str().unwrap(), true, "2026");
        con_principal(&r, o);

        // el aviso se repite mientras no abra
        for _ in 0..2 {
            let e = arrancar(&r);
            abrio_boldo_db(&e, &r);
            assert_eq!(aviso(&e).0, "no_encontrado");
            assert!(e.cerrar_ordenado(Duration::from_secs(1)));
        }

        fs::rename(&guardada, &pendrive).unwrap();
        let e = arrancar(&r);
        assert_eq!(e.base_abierta().unwrap().id, id_externa);
        assert_eq!(*e.aviso_inicio.lock().unwrap(), None);
    }

    #[test]
    fn un_boldo_db_sin_entrada_se_lista_sin_pasar_a_ser_la_ultima() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        let afuera = tempfile::tempdir().unwrap();
        let ausente = entrada(
            &uuid::Uuid::now_v7().to_string(),
            afuera.path().join("retirado.db").to_str().unwrap(),
            true,
            "2026",
        );
        escribir(&r, vec![ausente.clone()]);

        let e = arrancar(&r);
        abrio_boldo_db(&e, &r);
        assert!(e.cerrar_ordenado(Duration::from_secs(1)));
        let l = lista_del_json(&r);
        assert_eq!(l.organizaciones.len(), 2);
        assert!(l.organizaciones.iter().any(|o| o.id == id));
        assert!(l.organizaciones.contains(&ausente));

        // sigue intentando la ausente
        assert_eq!(aviso(&arrancar(&r)).0, "no_encontrado");
    }

    #[test]
    fn boldo_db_con_el_id_de_otra_no_pisa_su_entrada() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        let otra = entrada(
            &id,
            &format!("organizaciones/{id}/organizacion.db"),
            false,
            "2026",
        );
        escribir(&r, vec![otra.clone()]);
        let e = arrancar(&r);
        abrio_boldo_db(&e, &r);
        let l = lista_del_json(&r);
        assert_eq!(l.organizaciones.len(), 2);
        assert!(l.organizaciones.contains(&otra));
        assert!(l.organizaciones.iter().any(|o| o.es_principal()));
    }

    #[test]
    fn otro_id_no_escribe_en_el_archivo_ajeno() {
        let (_exe, r) = rutas();
        let o = interna(&r, "2026");
        let bd = ruta_de(&r, &o);
        // un archivo de esquema anterior, con otro id, en el lugar de la entrada: abrirlo lo migraría
        fs::remove_file(&bd).unwrap();
        crear(&bd, "Ajena", &db::MIGRACIONES[..1]);
        let antes = fs::read(&bd).unwrap();
        let id = con_principal(&r, o.clone());

        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert_eq!(aviso(&e).0, "otro_id");
        assert_eq!(fs::read(&bd).unwrap(), antes);
        sin_rastros(&bd);
        assert!(!respaldos::con_sufijo(&bd, ".bloqueo").exists());
        assert!(!base_de(&r, &o).respaldos.exists());
    }

    #[test]
    fn un_db_id_invalido_tambien_da_otro_id() {
        let (_exe, r) = rutas();
        let o = interna(&r, "2026");
        fija_meta(&ruta_de(&r, &o), "db_id", "../../x");
        con_principal(&r, o);
        assert_eq!(aviso(&arrancar(&r)).0, "otro_id");
    }

    /// Lo que escribiría una versión más nueva: otro formato de entrada al lado de una que aún se entiende.
    fn json_de_version_mayor(o: &Entrada) -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({
            "version": 2,
            "organizaciones": [{ "formato": "nuevo" }, o],
            "ajustes": { "tema": "oscuro" },
        }))
        .unwrap()
    }

    #[test]
    fn version_mayor_no_se_reescribe_y_abre_lo_que_entiende() {
        let (_exe, r) = rutas();
        crear(&r.bd, "La mía", db::MIGRACIONES);
        let o = interna(&r, "2026");
        let json = r.datos.join("organizaciones.json");
        let antes = json_de_version_mayor(&o);
        fs::write(&json, &antes).unwrap();

        let e = arrancar(&r);
        assert_eq!(e.base_abierta().unwrap().id, o.id);
        assert_eq!(fs::read(&json).unwrap(), antes);
        assert!(!r.datos.join("organizaciones.json.danado").exists());
    }

    #[test]
    fn version_mayor_sin_nada_que_entender_abre_boldo_db() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        let json = r.datos.join("organizaciones.json");
        let antes = br#"{"version":2,"lista":{"otra":"forma"}}"#;
        fs::write(&json, antes).unwrap();

        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert_eq!(fs::read(&json).unwrap(), antes);
    }

    /// Tomado como lo toma un antivirus: no deja leerlo, y sí reemplazarlo.
    #[cfg(windows)]
    fn tomar(ruta: &std::path::Path) -> fs::File {
        use std::os::windows::fs::OpenOptionsExt;
        const SOLO_BORRAR: u32 = 4; // FILE_SHARE_DELETE
        fs::OpenOptions::new()
            .read(true)
            .share_mode(SOLO_BORRAR)
            .open(ruta)
            .unwrap()
    }

    #[cfg(windows)]
    #[test]
    fn archivo_tomado_deja_la_lista_intacta() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        let afuera = tempfile::tempdir().unwrap();
        let externa = entrada(
            &uuid::Uuid::now_v7().to_string(),
            afuera.path().join("externa.db").to_str().unwrap(),
            true,
            "2020",
        );
        escribir(&r, vec![externa.clone()]);
        let json = r.datos.join("organizaciones.json");
        let antes = fs::read(&json).unwrap();

        let tomado = tomar(&json);
        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        drop(tomado);

        assert_eq!(fs::read(&json).unwrap(), antes);
        assert!(!r.datos.join("organizaciones.json.danado").exists());
        assert_eq!(cargar_lista(&r).organizaciones, vec![externa]);
    }

    #[cfg(windows)]
    #[test]
    fn un_error_pasajero_al_leer_se_reintenta() {
        let (_exe, r) = rutas();
        let o = entrada(&uuid::Uuid::now_v7().to_string(), "boldo.db", false, "x");
        escribir(&r, vec![o.clone()]);
        let tomado = tomar(&r.datos.join("organizaciones.json"));
        let hilo = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(20));
            drop(tomado);
        });
        assert_eq!(cargar_lista(&r).organizaciones, vec![o]);
        hilo.join().unwrap();
    }

    #[test]
    fn sin_poder_guardar_la_copia_del_danado_no_se_reemplaza() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        let json = r.datos.join("organizaciones.json");
        fs::write(&json, "{ dañado").unwrap();
        fs::create_dir(r.datos.join("organizaciones.json.danado")).unwrap();
        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert_eq!(fs::read_to_string(&json).unwrap(), "{ dañado");
    }

    #[test]
    fn con_la_unica_ausente_crea_boldo_db_y_avisa() {
        let (_exe, r) = rutas();
        let afuera = tempfile::tempdir().unwrap();
        let ausente = entrada(
            &uuid::Uuid::now_v7().to_string(),
            afuera.path().join("retirado.db").to_str().unwrap(),
            true,
            "2026",
        );
        escribir(&r, vec![ausente.clone()]);
        let e = arrancar(&r);
        abrio_boldo_db(&e, &r);
        assert_eq!(aviso(&e).0, "no_encontrado");
        assert_eq!(lista_del_json(&r).organizaciones, vec![ausente]);
    }

    #[test]
    fn con_la_ultima_en_otra_copia_abre_boldo_db_y_avisa() {
        let (_exe, r) = rutas();
        let ocupada = interna(&r, "2026");
        let id = con_principal(&r, ocupada.clone());
        let _otra_copia = bloquear(&ruta_de(&r, &ocupada), YA).unwrap();

        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert_eq!(aviso(&e).0, "abierta_en_otra_copia");
    }

    #[test]
    fn arranque_con_externa_con_trigger_abre_boldo_db_y_avisa() {
        let (_exe, r) = rutas();
        let afuera = tempfile::tempdir().unwrap();
        let bd = afuera.path().join("externa.db");
        let id_externa = crear(&bd, "Con trigger", db::MIGRACIONES);
        let c = db::abrir(&bd).unwrap();
        c.execute_batch("CREATE TRIGGER t AFTER INSERT ON meta BEGIN SELECT 1; END;")
            .unwrap();
        c.close().unwrap();
        let antes = fs::read(&bd).unwrap();
        let o = entrada(&id_externa, bd.to_str().unwrap(), true, "2026");
        let id = con_principal(&r, o.clone());

        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert_eq!(aviso(&e).0, "contenido_invalido");
        // no se abrió para escribir: ni un archivo al lado, ni su carpeta de respaldos
        assert_eq!(fs::read(&bd).unwrap(), antes);
        sin_rastros(&bd);
        assert!(!respaldos::con_sufijo(&bd, ".bloqueo").exists());
        assert!(!base_de(&r, &o).respaldos.exists());
    }

    #[test]
    fn arranque_con_otro_id_abre_boldo_db_y_avisa() {
        let (_exe, r) = rutas();
        let cambiada = interna(&r, "2026");
        let bd = ruta_de(&r, &cambiada);
        fija_meta(&bd, "db_id", &uuid::Uuid::now_v7().to_string());
        let id = con_principal(&r, cambiada);

        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert_eq!(aviso(&e).0, "otro_id");
        // la soltó
        bloquear(&bd, YA).unwrap();
    }

    #[test]
    fn un_boldo_db_con_otro_id_no_duplica_su_entrada() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        let vieja = uuid::Uuid::now_v7().to_string();
        escribir(&r, vec![entrada(&vieja, "boldo.db", false, "2020")]);
        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert_eq!(aviso(&e).0, "otro_id");
        let l = lista_del_json(&r);
        assert_eq!(l.organizaciones.len(), 1);
        assert_eq!(l.organizaciones[0].id, id);
    }

    #[test]
    fn si_falla_el_propio_boldo_db_queda_la_pantalla_de_error() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        escribir(&r, vec![entrada(&id, "boldo.db", false, "2020")]);
        let _otra_copia = bloquear(&r.bd, YA).unwrap();
        let e = arrancar(&r);
        assert_eq!(e.base_abierta(), None);
        let error = e.error.lock().unwrap().clone().unwrap();
        assert!(error.contains("Otra copia"), "{error}");
        assert_eq!(*e.aviso_inicio.lock().unwrap(), None);
    }

    #[test]
    fn sin_poder_leer_ni_escribir_la_lista_abre_boldo_db() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        // una carpeta con el nombre del archivo: no se puede leer ni reemplazar
        let json = r.datos.join("organizaciones.json");
        fs::create_dir(&json).unwrap();
        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert!(json.is_dir());
        assert!(!r.datos.join("organizaciones.json.tmp").exists());
        assert!(!r.datos.join("organizaciones.json.danado").exists());
    }

    #[test]
    fn json_danado_abre_boldo_db_y_lo_reescribe() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        fs::write(r.datos.join("organizaciones.json"), "{ dañado").unwrap();
        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert_eq!(lista_del_json(&r).organizaciones[0].id, id);
        assert_eq!(
            fs::read_to_string(r.datos.join("organizaciones.json.danado")).unwrap(),
            "{ dañado"
        );
    }

    #[test]
    fn listar_no_deja_archivos_junto_a_una_cerrada() {
        let (_exe, r) = rutas();
        let o = interna(&r, "2026");
        let bd = ruta_de(&r, &o);
        fija_meta(&bd, "logo_png", "QUJD");
        let carpeta = base_de(&r, &o).respaldos;
        fs::create_dir_all(&carpeta).unwrap();
        fs::write(carpeta.join("boldo-20200101-0000.db"), "12345").unwrap();
        escribir(&r, vec![o.clone()]);
        let antes = fs::read(&bd).unwrap();
        // el archivo sigue en WAL: abrirlo solo para leer dejaría -wal y -shm
        assert_eq!(antes[18], 2);

        let e = Estado::de_prueba(None, None, Some(r.clone()));
        let vista = e.listar_organizaciones().unwrap();
        assert_eq!(vista.len(), 1);
        let v = &vista[0];
        assert_eq!(v.logo.as_deref(), Some("QUJD"));
        assert!(v.existe && !v.activa);
        assert_eq!(v.bytes_base, antes.len() as u64);
        assert_eq!(v.bytes_respaldos, 5);
        assert_eq!(v.nombre, o.nombre);
        sin_rastros(&bd);
        assert_eq!(fs::read(&bd).unwrap(), antes);
    }

    #[test]
    fn listar_una_con_logo_vacio_no_da_logo() {
        let (_exe, r) = rutas();
        let o = interna(&r, "2026");
        fija_meta(&ruta_de(&r, &o), "logo_png", "");
        escribir(&r, vec![o]);
        let e = Estado::de_prueba(None, None, Some(r.clone()));
        assert_eq!(e.listar_organizaciones().unwrap()[0].logo, None);
    }

    #[test]
    fn restaurar_vuelve_a_la_que_estaba_abierta() {
        let (_exe, r) = rutas();
        let ultima = interna(&r, "2026");
        con_principal(&r, ultima.clone());

        let e = arrancar(&r);
        let base = e.base_abierta().unwrap();
        assert_eq!(base.id, ultima.id);
        let nombre = e
            .con_conexion(&base.id, |c| {
                respaldos::respaldar(c, &base.respaldos, "20200101-0000")
            })
            .unwrap();
        e.con_ranura(&base.id, |conexion, b| {
            respaldos::restaurar(conexion, b, &nombre, db::MIGRACIONES)
        })
        .unwrap();
        // lo que hace `app.restart()`
        assert!(e.cerrar_ordenado(Duration::from_secs(1)));
        drop(e);

        let e = arrancar(&r);
        assert_eq!(e.base_abierta(), Some(base));
        assert_eq!(*e.aviso_inicio.lock().unwrap(), None);
    }
}
