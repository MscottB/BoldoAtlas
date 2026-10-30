use crate::db::{self, Sentencia};
use crate::respaldos::{self, Fallo, Respaldo};
use crate::rutas::{self, Rutas};
use rusqlite::Connection;
use serde::Serialize;
use serde_json::{Map, Value};
use std::sync::Mutex;
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
    pub fn iniciar() -> Self {
        let mut rutas_ok = None;
        let resultado = (|| {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let exe_dir = exe
                .parent()
                .ok_or("No se pudo ubicar la carpeta del programa.")?;
            let appdata = std::env::var_os("APPDATA").map(std::path::PathBuf::from);
            let r = rutas::dir_datos(exe_dir, appdata.as_deref())?;
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

/// Abre la carpeta conocida por Rust; la interfaz nunca envía una ruta.
#[tauri::command]
pub fn abrir_carpeta_respaldos(app: AppHandle, estado: State<Estado>) -> Result<(), Fallo> {
    app.opener()
        .open_path(estado.rutas()?.respaldos.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string().into())
}
