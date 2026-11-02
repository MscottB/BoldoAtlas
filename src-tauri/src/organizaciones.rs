//! Cada organización es un archivo aparte. Aquí está lo que hace falta para abrir uno: su identidad y su bloqueo.
use crate::db;
use crate::intercambio::validar::{solo_lectura_cerrada, version_leida};
use crate::respaldos::{Fallo, con_sufijo};
use rusqlite::Connection;
use std::fs::{self, File, OpenOptions, TryLockError};
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

/// Al arrancar se espera a que suelte el archivo la copia que se está cerrando (un reinicio, una actualización).
pub const ESPERA_ARRANQUE: Duration = Duration::from_secs(8);
/// Al cambiar de organización, quien tiene el archivo es otra copia en uso: esperar solo demoraría el aviso.
pub const ESPERA_CAMBIO: Duration = Duration::ZERO;

/// La base abierta: la organización con que trabaja esta copia de la app.
#[derive(Debug, Clone, PartialEq)]
pub struct Base {
    pub id: String,
    pub bd: PathBuf,
    pub respaldos: PathBuf,
}

/// Un archivo ya listo para usar. El bloqueo dura lo que dure `bloqueo`.
pub struct Abierta {
    pub conn: Connection,
    pub bloqueo: File,
    pub id: String,
    pub version: i64,
}

/// Solo la forma canónica: el id da nombre a una carpeta, y las demás formas del UUID serían otra carpeta para el mismo id.
pub fn es_id_valido(id: &str) -> bool {
    uuid::Uuid::try_parse(id).is_ok_and(|u| u.to_string() == id)
}

/// El `db_id` del archivo. Si falta o no es válido (el archivo puede venir de cualquier parte), escribe uno nuevo.
pub fn identidad(conn: &Connection) -> Result<String, String> {
    let actual: Option<String> = conn
        .query_row("SELECT valor FROM meta WHERE clave = 'db_id'", [], |f| {
            f.get(0)
        })
        .ok();
    if let Some(id) = actual.filter(|id| es_id_valido(id)) {
        return Ok(id);
    }
    let id = uuid::Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO meta (clave, valor) VALUES ('db_id', ?1)
         ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
        [&id],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

/// `ErrorKind` no clasifica los códigos habituales de un controlador o una carpeta de red sin bloqueos. Con su valor numérico,
/// para no sumar `libc` por dos constantes.
fn bloqueo_sin_soporte(e: &io::Error) -> bool {
    let codigos: &[i32] = if cfg!(windows) {
        &[1, 50] // ERROR_INVALID_FUNCTION, ERROR_NOT_SUPPORTED
    } else if cfg!(target_os = "linux") {
        &[37, 95] // ENOLCK (NFS sin lockd), ENOTSUP
    } else if cfg!(target_os = "macos") {
        &[77, 45] // ENOLCK, ENOTSUP
    } else {
        &[]
    };
    e.kind() == io::ErrorKind::Unsupported || e.raw_os_error().is_some_and(|c| codigos.contains(&c))
}

/// Toma `<bd>.bloqueo`, reintentando hasta `espera`. El sistema lo suelta al cerrar el archivo o si la app se cae.
pub fn bloquear(bd: &Path, espera: Duration) -> Result<File, Fallo> {
    let archivo = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(con_sufijo(bd, ".bloqueo"))?;
    let limite = Instant::now() + espera;
    loop {
        match archivo.try_lock() {
            Ok(()) => return Ok(archivo),
            Err(TryLockError::WouldBlock) if Instant::now() < limite => {
                std::thread::sleep(Duration::from_millis(25))
            }
            Err(TryLockError::WouldBlock) => {
                return Err(Fallo::de("abierta_en_otra_copia", bd.display()));
            }
            // shortcut: en un sistema de archivos sin bloqueos dos copias pueden abrir el mismo archivo, cambiarlo si
            // alguno de esos sistemas ofrece otra forma de detectarlo
            Err(TryLockError::Error(e)) if bloqueo_sin_soporte(&e) => return Ok(archivo),
            Err(TryLockError::Error(e)) => return Err(e.into()),
        }
    }
}

/// Bloquea, revisa sin tocar el archivo y solo entonces lo abre para escribir: uno de esquema más nuevo o que no es SQLite
/// queda como estaba. `id_nuevo` es para un archivo recién creado; si no, el id es el que el archivo ya tiene.
pub fn abrir_base(
    bd: &Path,
    respaldos: &Path,
    id_nuevo: Option<&str>,
    espera: Duration,
    migraciones: &[&str],
) -> Result<Abierta, Fallo> {
    fs::create_dir_all(respaldos)?;
    let bloqueo = bloquear(bd, espera)?;
    if bd.exists() {
        version_leida(&solo_lectura_cerrada(bd)?, migraciones)?;
    }
    let mut conn = db::abrir(bd)?;
    let version =
        db::migrar_con(&mut conn, migraciones, respaldos).map_err(|e| Fallo::de("migracion", e))?;
    if let Some(id) = id_nuevo {
        conn.execute("INSERT INTO meta (clave, valor) VALUES ('db_id', ?1)", [id])?;
    }
    db::asegurar_meta(&conn)?;
    let id = identidad(&conn)?;
    Ok(Abierta {
        conn,
        bloqueo,
        id,
        version,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::MIGRACIONES;

    fn id_de(conn: &Connection) -> String {
        conn.query_row("SELECT valor FROM meta WHERE clave = 'db_id'", [], |f| {
            f.get(0)
        })
        .unwrap()
    }

    fn base_en(dir: &Path) -> (PathBuf, PathBuf) {
        (dir.join("boldo.db"), dir.join("respaldos"))
    }

    #[test]
    fn id_valido_solo_en_forma_canonica() {
        let bueno = uuid::Uuid::now_v7();
        assert!(es_id_valido(&bueno.to_string()));
        for malo in [
            String::new(),
            "../x".to_string(),
            bueno.to_string().to_uppercase(),
            bueno.simple().to_string(),
            bueno.braced().to_string(),
            bueno.urn().to_string(),
        ] {
            assert!(!es_id_valido(&malo), "{malo}");
        }
    }

    #[test]
    fn identidad_reemplaza_un_db_id_invalido() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE meta (clave TEXT PRIMARY KEY NOT NULL, valor TEXT);
             INSERT INTO meta VALUES ('db_id', '../../x');",
        )
        .unwrap();
        let id = identidad(&c).unwrap();
        assert!(es_id_valido(&id), "{id}");
        assert_eq!(id_de(&c), id);
        // uno válido no cambia
        assert_eq!(identidad(&c).unwrap(), id);
        assert_eq!(id_de(&c), id);
    }

    #[test]
    fn segundo_bloqueo_da_abierta_en_otra_copia() {
        let dir = tempfile::tempdir().unwrap();
        let (bd, _) = base_en(dir.path());
        let primero = bloquear(&bd, ESPERA_CAMBIO).unwrap();
        assert!(con_sufijo(&bd, ".bloqueo").is_file());
        let e = bloquear(&bd, Duration::from_millis(100)).unwrap_err();
        assert_eq!(e.codigo, "abierta_en_otra_copia");
        assert_eq!(e.detalle, bd.display().to_string());
        drop(primero);
        bloquear(&bd, ESPERA_CAMBIO).unwrap();
    }

    #[test]
    fn bloquear_espera_a_que_se_suelte() {
        let dir = tempfile::tempdir().unwrap();
        let (bd, _) = base_en(dir.path());
        let primero = bloquear(&bd, ESPERA_CAMBIO).unwrap();
        let hilo = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(50));
            drop(primero);
        });
        bloquear(&bd, ESPERA_ARRANQUE).unwrap();
        hilo.join().unwrap();
    }

    #[test]
    fn con_espera_cambio_no_espera() {
        let dir = tempfile::tempdir().unwrap();
        let (bd, _) = base_en(dir.path());
        let _primero = bloquear(&bd, ESPERA_CAMBIO).unwrap();
        let t = Instant::now();
        let e = bloquear(&bd, ESPERA_CAMBIO).unwrap_err();
        assert_eq!(e.codigo, "abierta_en_otra_copia");
        assert_eq!(ESPERA_CAMBIO, Duration::ZERO);
        assert!(t.elapsed() < ESPERA_ARRANQUE);
    }

    #[test]
    fn bloqueo_sin_soporte_reconoce_lo_que_da_cada_sistema() {
        assert!(bloqueo_sin_soporte(&io::Error::from(
            io::ErrorKind::Unsupported
        )));
        assert!(!bloqueo_sin_soporte(&io::Error::from(
            io::ErrorKind::PermissionDenied
        )));
        // (código, si es falta de soporte); el permiso denegado y los demás siguen siendo un error
        #[cfg(windows)]
        let casos = [(1, true), (50, true), (120, true), (5, false), (33, false)];
        #[cfg(target_os = "linux")]
        let casos = [(37, true), (95, true), (13, false), (11, false)];
        #[cfg(target_os = "macos")]
        let casos = [(77, true), (45, true), (13, false), (35, false)];
        for (codigo, esperado) in casos {
            let e = io::Error::from_raw_os_error(codigo);
            assert_eq!(bloqueo_sin_soporte(&e), esperado, "{codigo}: {e}");
        }
    }

    #[test]
    fn abrir_base_no_toca_un_archivo_de_esquema_mas_nuevo() {
        let dir = tempfile::tempdir().unwrap();
        let (bd, respaldos) = base_en(dir.path());
        let c = db::abrir(&bd).unwrap();
        c.pragma_update(None, "user_version", 99).unwrap();
        c.close().unwrap();
        let e = abrir_base(&bd, &respaldos, None, ESPERA_CAMBIO, MIGRACIONES)
            .err()
            .unwrap();
        assert_eq!(e.codigo, "esquema_nuevo");
        assert_eq!(e.detalle, "99");
        assert!(!con_sufijo(&bd, "-wal").exists());
        assert!(!con_sufijo(&bd, "-shm").exists());
        let c = solo_lectura_cerrada(&bd).unwrap();
        let v: i64 = c
            .pragma_query_value(None, "user_version", |f| f.get(0))
            .unwrap();
        assert_eq!(v, 99);
    }

    #[test]
    fn abrir_base_rechaza_lo_que_no_es_sqlite() {
        let dir = tempfile::tempdir().unwrap();
        let (bd, respaldos) = base_en(dir.path());
        std::fs::write(&bd, "no soy sqlite").unwrap();
        let e = abrir_base(&bd, &respaldos, None, ESPERA_CAMBIO, MIGRACIONES)
            .err()
            .unwrap();
        assert_eq!(e.codigo, "danado");
        assert_eq!(std::fs::read(&bd).unwrap(), b"no soy sqlite");
    }

    #[test]
    fn abrir_base_con_migracion_que_falla_da_migracion() {
        let dir = tempfile::tempdir().unwrap();
        let (bd, respaldos) = base_en(dir.path());
        let e = abrir_base(&bd, &respaldos, None, ESPERA_CAMBIO, &["ESTO NO ES SQL;"])
            .err()
            .unwrap();
        assert_eq!(e.codigo, "migracion");
        assert!(e.detalle.contains("syntax error"), "{}", e.detalle);
        // al fallar suelta el bloqueo
        bloquear(&bd, ESPERA_CAMBIO).unwrap();
    }

    #[test]
    fn abrir_base_crea_la_base_con_el_id_pedido_y_la_mantiene_bloqueada() {
        let dir = tempfile::tempdir().unwrap();
        let (bd, respaldos) = base_en(dir.path());
        let id = uuid::Uuid::now_v7().to_string();
        let a = abrir_base(&bd, &respaldos, Some(&id), ESPERA_CAMBIO, MIGRACIONES)
            .ok()
            .unwrap();
        assert_eq!(a.id, id);
        assert_eq!(id_de(&a.conn), id);
        assert_eq!(a.version, MIGRACIONES.len() as i64);
        assert!(respaldos.is_dir());
        assert_eq!(
            bloquear(&bd, ESPERA_CAMBIO).unwrap_err().codigo,
            "abierta_en_otra_copia"
        );
        drop(a);
        // al volver a abrirla conserva su id
        let a = abrir_base(&bd, &respaldos, None, ESPERA_CAMBIO, MIGRACIONES)
            .ok()
            .unwrap();
        assert_eq!(a.id, id);
    }
}
