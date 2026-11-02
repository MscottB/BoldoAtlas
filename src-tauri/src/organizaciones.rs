//! Cada organización es un archivo aparte. Aquí está lo que hace falta para abrir uno, su identidad y su bloqueo, y la lista
//! de las que tiene esta copia de la app.
use crate::db;
use crate::intercambio::validar::{solo_lectura_cerrada, version_leida, version_y_esquema};
use crate::respaldos::{Fallo, con_sufijo, limpiar_parciales};
use crate::rutas::Rutas;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions, TryLockError};
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, Instant, UNIX_EPOCH};

/// Quien pide datos cree tener abierta otra base: no se ejecuta nada.
pub const OTRA_BASE: &str = "otra_base";

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

/// Un disco lleno se arregla liberando espacio: no es una migración fallida.
fn fallo_al_migrar(e: String) -> Fallo {
    if e == db::SIN_ESPACIO {
        e.into()
    } else {
        Fallo::de("migracion", e)
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
    let version = db::migrar_con(&mut conn, migraciones, respaldos).map_err(fallo_al_migrar)?;
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

const LISTA: &str = "organizaciones.json";
const VERSION_LISTA: u32 = 1;
/// El archivo de siempre: no se mueve, y sus respaldos siguen en `respaldos/`.
const PRINCIPAL: &str = "boldo.db";
const CARPETA: &str = "organizaciones";
const ARCHIVO: &str = "organizacion.db";

pub const PALETA: [&str; 8] = [
    "#3b6fb5", "#2f855a", "#b7791f", "#c05621", "#9b2c2c", "#805ad5", "#2c7a7b", "#b83280",
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Entrada {
    pub id: String,
    /// Relativa a la carpeta de datos, para que se pueda mover; absoluta si es externa.
    pub ruta: String,
    pub externa: bool,
    /// Copia de `meta.org_nombre`, para mostrarla sin abrir el archivo.
    pub nombre: String,
    pub color: String,
    pub abierta: String,
    #[serde(default)]
    pub ejemplo: bool,
}

impl Entrada {
    pub fn principal(id: &str) -> Entrada {
        Entrada {
            id: id.into(),
            ruta: PRINCIPAL.into(),
            externa: false,
            nombre: String::new(),
            color: String::new(),
            abierta: String::new(),
            ejemplo: false,
        }
    }

    pub fn es_principal(&self) -> bool {
        !self.externa && self.ruta == PRINCIPAL
    }

    /// `Normal` en cada parte deja fuera `..`, y también lo que haría que `join` ignore la carpeta de datos (`C:x`, `\x`).
    fn es_valida(&self) -> bool {
        let ruta = Path::new(&self.ruta);
        es_id_valido(&self.id)
            && if self.externa {
                ruta.is_absolute()
            } else {
                !self.ruta.is_empty()
                    && ruta.components().all(|c| matches!(c, Component::Normal(_)))
            }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Lista {
    pub version: u32,
    pub organizaciones: Vec<Entrada>,
}

/// Lo que Inicio muestra de cada organización.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizacionVista {
    pub id: String,
    pub nombre: String,
    pub color: String,
    pub abierta: String,
    pub externa: bool,
    pub ruta: String,
    pub existe: bool,
    pub activa: bool,
    pub logo: Option<String>,
    pub bytes_base: u64,
    pub bytes_respaldos: u64,
    pub ejemplo: bool,
}

pub fn ruta_de(r: &Rutas, e: &Entrada) -> PathBuf {
    if e.externa {
        PathBuf::from(&e.ruta)
    } else {
        r.datos.join(&e.ruta)
    }
}

pub fn base_de(r: &Rutas, e: &Entrada) -> Base {
    Base {
        id: e.id.clone(),
        bd: ruta_de(r, e),
        respaldos: if e.es_principal() {
            r.respaldos.clone()
        } else {
            r.datos.join(CARPETA).join(&e.id).join("respaldos")
        },
    }
}

fn leer_meta(conn: &Connection, clave: &str) -> Option<String> {
    conn.query_row("SELECT valor FROM meta WHERE clave = ?1", [clave], |f| {
        f.get(0)
    })
    .ok()
}

/// Sin unidades ni trabajadores, ni siquiera eliminados, y sin nombre: lo que deja una instalación nueva.
pub fn esta_vacia(conn: &Connection) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT NOT EXISTS (SELECT 1 FROM unidades)
            AND NOT EXISTS (SELECT 1 FROM trabajadores)
            AND COALESCE((SELECT valor FROM meta WHERE clave = 'org_nombre'), '') = ''",
        [],
        |f| f.get(0),
    )
}

/// El menos usado; entre iguales, el primero de la paleta.
pub fn color_libre(l: &Lista) -> &'static str {
    PALETA
        .into_iter()
        .min_by_key(|c| l.organizaciones.iter().filter(|e| e.color == *c).count())
        .unwrap_or(PALETA[0])
}

/// La entrada de un archivo que se reconstruye, sin tocarlo. `carpeta`: el id que debe tener para estar donde está.
fn entrada_de(bd: &Path, ruta: String, carpeta: Option<&str>) -> Option<Entrada> {
    let conn = solo_lectura_cerrada(bd).ok()?;
    let id = leer_meta(&conn, "db_id")
        .filter(|id| es_id_valido(id) && carpeta.is_none_or(|c| c == id))?;
    // si no se puede revisar (un esquema más nuevo) se lista igual: al abrirla se dice el motivo
    if esta_vacia(&conn).unwrap_or(false) {
        return None;
    }
    let modificado = fs::metadata(bd).ok()?.modified().ok()?;
    let segundos = modificado.duration_since(UNIX_EPOCH).ok()?.as_secs_f64();
    let abierta = conn
        .query_row(
            "SELECT strftime('%Y-%m-%dT%H:%M:%fZ', ?1, 'unixepoch')",
            [segundos],
            |f| f.get(0),
        )
        .ok()?;
    Some(Entrada {
        id,
        ruta,
        externa: false,
        nombre: leer_meta(&conn, "org_nombre").unwrap_or_default(),
        color: String::new(),
        abierta,
        ejemplo: false,
    })
}

/// Con `boldo.db` y lo que haya en `organizaciones/`. Las externas no se pueden saber: salen de la lista, y sus archivos siguen donde están.
fn reconstruir(r: &Rutas) -> Lista {
    let mut encontradas = vec![entrada_de(&r.bd, PRINCIPAL.into(), None)];
    for carpeta in fs::read_dir(r.datos.join(CARPETA))
        .into_iter()
        .flatten()
        .flatten()
    {
        let nombre = carpeta.file_name();
        if let Some(id) = nombre.to_str().filter(|n| es_id_valido(n)) {
            encontradas.push(entrada_de(
                &carpeta.path().join(ARCHIVO),
                format!("{CARPETA}/{id}/{ARCHIVO}"),
                Some(id),
            ));
        }
    }
    let mut l = Lista {
        version: VERSION_LISTA,
        organizaciones: Vec::new(),
    };
    for mut e in encontradas.into_iter().flatten() {
        e.color = color_libre(&l).into();
        l.organizaciones.push(e);
    }
    l
}

/// La lista, o la reconstruida si falta o está dañada. Una entrada que apunta afuera de donde debe se descarta.
pub fn cargar_lista(r: &Rutas) -> Lista {
    let leida = fs::read(r.datos.join(LISTA))
        .ok()
        .and_then(|b| serde_json::from_slice::<Lista>(&b).ok());
    match leida {
        Some(mut l) => {
            l.organizaciones.retain(Entrada::es_valida);
            l
        }
        None => reconstruir(r),
    }
}

/// A un temporal, que se renombra: un corte no la deja a medias.
pub fn escribir_lista(r: &Rutas, l: &Lista) -> Result<(), Fallo> {
    let destino = r.datos.join(LISTA);
    let temporal = con_sufijo(&destino, ".tmp");
    let escribir = || -> Result<(), Fallo> {
        let bytes = serde_json::to_vec_pretty(l).map_err(|e| e.to_string())?;
        let mut archivo = File::create(&temporal)?;
        archivo.write_all(&bytes)?;
        archivo.sync_all()?;
        drop(archivo);
        fs::rename(&temporal, &destino)?;
        Ok(())
    };
    let hecho = escribir();
    if hecho.is_err() {
        let _ = fs::remove_file(&temporal);
    }
    hecho
}

/// Abre lo que dice la entrada, si sigue siendo eso. Un archivo externo pudo cambiar desde que se agregó: se revisa antes de
/// abrirlo para escribir.
pub fn abrir_entrada(
    r: &Rutas,
    e: &Entrada,
    espera: Duration,
    migraciones: &[&str],
) -> Result<Abierta, Fallo> {
    let base = base_de(r, e);
    if !base.bd.is_file() {
        return Err(Fallo::de("no_encontrado", base.bd.display()));
    }
    if e.externa {
        version_y_esquema(&base.bd, migraciones)?;
    }
    let a = abrir_base(&base.bd, &base.respaldos, None, espera, migraciones)?;
    if a.id != e.id {
        return Err(Fallo::de("otro_id", base.bd.display()));
    }
    Ok(a)
}

/// Deja en la lista lo que se acaba de abrir, con su nombre y su hora. Un `boldo.db` vacío no se lista: lo usa la primera
/// organización que se cree.
pub fn anotar_abierta(l: &mut Lista, e: &Entrada, conn: &Connection) -> rusqlite::Result<()> {
    // el mismo archivo con otro id (se reemplazó por fuera): la entrada anterior ya no apunta a nada
    l.organizaciones
        .retain(|o| o.id == e.id || o.ruta != e.ruta || o.externa != e.externa);
    if e.es_principal() && esta_vacia(conn)? {
        l.organizaciones.retain(|o| !o.es_principal());
        return Ok(());
    }
    let nombre = leer_meta(conn, "org_nombre").unwrap_or_default();
    let abierta: String =
        conn.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |f| {
            f.get(0)
        })?;
    if let Some(o) = l.organizaciones.iter_mut().find(|o| o.id == e.id) {
        o.nombre = nombre;
        o.abierta = abierta;
    } else {
        let color = color_libre(l).into();
        l.organizaciones.push(Entrada {
            nombre,
            color,
            abierta,
            ..e.clone()
        });
    }
    Ok(())
}

fn bytes_de_archivos(carpeta: &Path) -> u64 {
    fs::read_dir(carpeta)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|f| f.metadata().ok())
        .filter(|m| m.is_file())
        .map(|m| m.len())
        .sum()
}

/// El logo sale del archivo: la lista no guarda imágenes.
fn logo_de(bd: &Path) -> Option<String> {
    leer_meta(&solo_lectura_cerrada(bd).ok()?, "logo_png").filter(|l| !l.is_empty())
}

pub fn vistas(r: &Rutas, l: &Lista, activa: Option<&str>) -> Vec<OrganizacionVista> {
    l.organizaciones
        .iter()
        .map(|e| {
            let base = base_de(r, e);
            let tam = |p: &Path| fs::metadata(p).map(|m| m.len()).unwrap_or(0);
            OrganizacionVista {
                id: e.id.clone(),
                nombre: e.nombre.clone(),
                color: e.color.clone(),
                abierta: e.abierta.clone(),
                externa: e.externa,
                ruta: base.bd.display().to_string(),
                existe: base.bd.is_file(),
                activa: activa == Some(e.id.as_str()),
                logo: logo_de(&base.bd),
                bytes_base: tam(&base.bd) + tam(&con_sufijo(&base.bd, "-wal")),
                bytes_respaldos: bytes_de_archivos(&base.respaldos),
                ejemplo: e.ejemplo,
            }
        })
        .collect()
}

/// Los temporales que dejó un corte en cada organización. Solo carpetas con nombre de id: nada sale de lo que diga un archivo.
pub fn limpiar_carpetas(r: &Rutas) {
    for carpeta in fs::read_dir(r.datos.join(CARPETA))
        .into_iter()
        .flatten()
        .flatten()
    {
        if carpeta.file_name().to_str().is_some_and(es_id_valido) {
            let dir = carpeta.path();
            limpiar_parciales(&dir, Some(&dir.join(ARCHIVO)));
            limpiar_parciales(&dir.join("respaldos"), None);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::MIGRACIONES;

    #[test]
    fn un_disco_lleno_al_migrar_no_cuenta_como_migracion_fallida() {
        assert_eq!(
            fallo_al_migrar(db::SIN_ESPACIO.into()).codigo,
            "sin_espacio"
        );
        assert_eq!(fallo_al_migrar("otra cosa".into()).codigo, "migracion");
    }

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

#[cfg(test)]
pub(crate) mod prueba {
    use super::*;

    /// La carpeta de una portable, temporal: las pruebas nunca tocan los datos reales.
    pub fn rutas() -> (tempfile::TempDir, Rutas) {
        let exe = tempfile::tempdir().unwrap();
        fs::write(exe.path().join("portable.flag"), "").unwrap();
        let r = crate::rutas::dir_datos(exe.path(), None).unwrap();
        (exe, r)
    }

    /// Una base ya cerrada, con ese nombre. Devuelve su `db_id`.
    pub fn crear(bd: &Path, nombre: &str, migraciones: &[&str]) -> String {
        let carpeta = bd.parent().unwrap();
        fs::create_dir_all(carpeta).unwrap();
        let mut c = db::abrir(bd).unwrap();
        db::migrar_con(&mut c, migraciones, carpeta).unwrap();
        db::asegurar_meta(&c).unwrap();
        c.execute(
            "INSERT OR REPLACE INTO meta (clave, valor) VALUES ('org_nombre', ?1)",
            [nombre],
        )
        .unwrap();
        let id = identidad(&c).unwrap();
        c.close().unwrap();
        id
    }

    pub fn entrada(id: &str, ruta: &str, externa: bool, abierta: &str) -> Entrada {
        Entrada {
            id: id.into(),
            ruta: ruta.into(),
            externa,
            nombre: format!("Org {ruta}"),
            color: PALETA[0].into(),
            abierta: abierta.into(),
            ejemplo: false,
        }
    }

    /// Una organización con nombre en su carpeta de `organizaciones/`, y su entrada.
    pub fn interna(r: &Rutas, abierta: &str) -> Entrada {
        let temporal = r.datos.join("por-mover.db");
        let id = crear(&temporal, "Interna", db::MIGRACIONES);
        let ruta = format!("organizaciones/{id}/organizacion.db");
        fs::create_dir_all(r.datos.join("organizaciones").join(&id)).unwrap();
        fs::rename(&temporal, r.datos.join(&ruta)).unwrap();
        entrada(&id, &ruta, false, abierta)
    }

    pub fn escribir(r: &Rutas, organizaciones: Vec<Entrada>) {
        escribir_lista(
            r,
            &Lista {
                version: VERSION_LISTA,
                organizaciones,
            },
        )
        .unwrap();
    }

    pub fn sin_rastros(bd: &Path) {
        assert!(!con_sufijo(bd, "-wal").exists(), "{}", bd.display());
        assert!(!con_sufijo(bd, "-shm").exists(), "{}", bd.display());
    }
}

#[cfg(test)]
mod tests_lista {
    use super::prueba::*;
    use super::*;
    use crate::db::MIGRACIONES;
    use crate::respaldos;

    fn nuevo_id() -> String {
        uuid::Uuid::now_v7().to_string()
    }

    fn ids(l: &Lista) -> Vec<&str> {
        l.organizaciones.iter().map(|e| e.id.as_str()).collect()
    }

    #[test]
    fn base_vacia_no_se_lista() {
        let (_exe, r) = rutas();
        crear(&r.bd, "", MIGRACIONES);
        assert!(cargar_lista(&r).organizaciones.is_empty());
    }

    #[test]
    fn una_fila_eliminada_no_la_deja_vacia() {
        let (_exe, r) = rutas();
        crear(&r.bd, "", MIGRACIONES);
        let c = db::abrir(&r.bd).unwrap();
        assert!(esta_vacia(&c).unwrap());
        c.execute(
            "INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at, deleted_at)
             VALUES ('u', '00000000-0000-7000-8000-000000000001', 'U', 'x', 'x', 'x')",
            [],
        )
        .unwrap();
        assert!(!esta_vacia(&c).unwrap());
    }

    #[test]
    fn json_ausente_se_reconstruye() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", MIGRACIONES);
        let e = interna(&r, "");
        let l = cargar_lista(&r);
        assert_eq!(l.version, 1);
        let principal = l.organizaciones.iter().find(|o| o.id == id).unwrap();
        assert_eq!(principal.ruta, "boldo.db");
        assert!(!principal.externa);
        assert_eq!(principal.nombre, "La mía");
        // `abierta` sale de la fecha de modificación
        assert!(principal.abierta.ends_with('Z'), "{}", principal.abierta);
        assert!(!principal.abierta.starts_with("1970"));
        let otra = l.organizaciones.iter().find(|o| o.id == e.id).unwrap();
        assert_eq!(otra.ruta, e.ruta);
        // cada una con su color
        assert_ne!(principal.color, otra.color);
        assert!(PALETA.contains(&principal.color.as_str()));
        // leerla no escribe ni deja nada al lado
        assert!(!r.datos.join("organizaciones.json").exists());
        sin_rastros(&r.bd);
        sin_rastros(&ruta_de(&r, otra));
    }

    #[test]
    fn json_danado_se_reconstruye_sin_externas_ni_tocar_archivos() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", MIGRACIONES);
        let e = interna(&r, "");
        let afuera = tempfile::tempdir().unwrap();
        let externa = afuera.path().join("externa.db");
        crear(&externa, "Ajena", MIGRACIONES);
        let archivos = [r.bd.clone(), ruta_de(&r, &e), externa];
        let antes = archivos.clone().map(|p| fs::read(p).unwrap());

        for danado in ["{ esto no es json", r#"{"version":1}"#, ""] {
            fs::write(r.datos.join("organizaciones.json"), danado).unwrap();
            let l = cargar_lista(&r);
            let mut hay = ids(&l);
            hay.sort();
            let mut esperado = vec![id.as_str(), e.id.as_str()];
            esperado.sort();
            assert_eq!(hay, esperado, "{danado}");
        }
        assert_eq!(antes, archivos.map(|p| fs::read(p).unwrap()));
    }

    #[test]
    fn carpeta_con_otro_db_id_no_se_lista() {
        let (_exe, r) = rutas();
        let otra = nuevo_id();
        crear(
            &r.datos
                .join(format!("organizaciones/{otra}/organizacion.db")),
            "Con otro id",
            MIGRACIONES,
        );
        crear(
            &r.datos.join("organizaciones/no-es-un-id/organizacion.db"),
            "Carpeta rara",
            MIGRACIONES,
        );
        assert!(cargar_lista(&r).organizaciones.is_empty());
    }

    #[test]
    fn entrada_con_ruta_con_puntos_se_descarta() {
        let (_exe, r) = rutas();
        let id = nuevo_id();
        let mut lista: Vec<Entrada> = [
            "../x.db",
            "organizaciones/../../x.db",
            "/x.db",
            "",
            "C:\\x.db",
            "\\x.db",
            "C:x.db",
        ]
        .iter()
        // en otros sistemas estas dos últimas formas son nombres de archivo corrientes
        .filter(|ruta| cfg!(windows) || !(ruta.contains('\\') || ruta.contains(':')))
        .map(|ruta| entrada(&nuevo_id(), ruta, false, "x"))
        .collect();
        // una externa debe tener ruta absoluta, y un id inválido nunca da nombre a una carpeta
        lista.push(entrada(&nuevo_id(), "relativa.db", true, "x"));
        lista.push(entrada("../../x", "x.db", false, "x"));
        lista.push(entrada(&id, "boldo.db", false, "x"));
        escribir(&r, lista);
        assert_eq!(ids(&cargar_lista(&r)), [id.as_str()]);
    }

    #[test]
    fn escribir_no_deja_temporal() {
        let (_exe, r) = rutas();
        let e = entrada(&nuevo_id(), "boldo.db", false, "x");
        escribir(&r, vec![e.clone()]);
        assert_eq!(cargar_lista(&r).organizaciones, vec![e]);
        let nombres: Vec<_> = fs::read_dir(&r.datos)
            .unwrap()
            .flatten()
            .map(|f| f.file_name().to_string_lossy().into_owned())
            .filter(|n| n.starts_with("organizaciones"))
            .collect();
        assert_eq!(nombres, ["organizaciones.json"]);
    }

    #[test]
    fn el_ejemplo_es_opcional_en_el_json() {
        let (_exe, r) = rutas();
        let id = nuevo_id();
        fs::write(
            r.datos.join("organizaciones.json"),
            format!(
                r##"{{"version":1,"organizaciones":[{{"id":"{id}","ruta":"boldo.db","externa":false,"nombre":"N","color":"#3b6fb5","abierta":"x"}}]}}"##
            ),
        )
        .unwrap();
        assert!(!cargar_lista(&r).organizaciones[0].ejemplo);
    }

    #[test]
    fn la_poda_no_ve_otra_carpeta() {
        let (_exe, r) = rutas();
        let principal = entrada(&nuevo_id(), "boldo.db", false, "x");
        let otra = interna(&r, "x");
        let (a, b) = (base_de(&r, &principal), base_de(&r, &otra));
        assert_eq!(a.bd, r.bd);
        assert_eq!(a.respaldos, r.respaldos);
        assert_eq!(
            b.respaldos,
            r.datos
                .join("organizaciones")
                .join(&otra.id)
                .join("respaldos")
        );
        fs::create_dir_all(&b.respaldos).unwrap();

        crear(&r.bd, "Origen", MIGRACIONES);
        let c = db::abrir(&r.bd).unwrap();
        let de_b = respaldos::respaldar(&c, &b.respaldos, "20200101-0000").unwrap();
        let contenido = fs::read(b.respaldos.join(&de_b)).unwrap();
        for i in 0..12 {
            respaldos::respaldar(&c, &a.respaldos, &format!("20210101-00{i:02}")).unwrap();
        }
        assert_eq!(
            respaldos::listar(&a.respaldos).unwrap().len(),
            respaldos::CONSERVAR
        );
        assert_eq!(respaldos::listar(&b.respaldos).unwrap().len(), 1);
        assert_eq!(fs::read(b.respaldos.join(&de_b)).unwrap(), contenido);
    }

    #[test]
    fn una_externa_guarda_sus_respaldos_en_la_app() {
        let (_exe, r) = rutas();
        let afuera = tempfile::tempdir().unwrap();
        let bd = afuera.path().join("externa.db");
        let e = entrada(&nuevo_id(), bd.to_str().unwrap(), true, "x");
        let base = base_de(&r, &e);
        assert_eq!(base.bd, bd);
        assert_eq!(
            base.respaldos,
            r.datos.join("organizaciones").join(&e.id).join("respaldos")
        );
    }

    #[test]
    fn color_libre_da_el_menos_usado_en_orden() {
        let con_color = |c: &str| Entrada {
            color: c.into(),
            ..entrada("x", "x", false, "x")
        };
        let mut l = Lista {
            version: 1,
            organizaciones: vec![],
        };
        assert_eq!(color_libre(&l), PALETA[0]);
        l.organizaciones
            .extend([PALETA[0], PALETA[2], PALETA[1]].map(con_color));
        assert_eq!(color_libre(&l), PALETA[3]);
        l.organizaciones
            .extend(PALETA[3..].iter().map(|c| con_color(c)));
        // todos con uno: vuelve al primero
        assert_eq!(color_libre(&l), PALETA[0]);
    }

    #[test]
    fn externa_ausente_aparece_como_no_existe() {
        let (_exe, r) = rutas();
        let afuera = tempfile::tempdir().unwrap();
        let bd = afuera.path().join("no-esta.db");
        let l = Lista {
            version: 1,
            organizaciones: vec![entrada(&nuevo_id(), bd.to_str().unwrap(), true, "x")],
        };
        let v = &vistas(&r, &l, None)[0];
        assert!(!v.existe && !v.activa);
        assert_eq!((v.bytes_base, v.bytes_respaldos), (0, 0));
        assert_eq!(v.logo, None);
        assert_eq!(v.ruta, bd.display().to_string());
        // mirarla no crea nada
        assert!(!bd.exists());
    }

    #[test]
    fn limpiar_carpetas_llega_a_cada_organizacion() {
        let (_exe, r) = rutas();
        let carpeta = r.datos.join("organizaciones").join(nuevo_id());
        let rara = r.datos.join("organizaciones").join("no-es-un-id");
        fs::create_dir_all(carpeta.join("respaldos")).unwrap();
        fs::create_dir_all(&rara).unwrap();
        fs::write(carpeta.join("organizacion.db"), "x").unwrap();
        let copia = carpeta.join("organizacion.restaurando");
        let parcial = carpeta.join("respaldos").join("boldo-1.db.tmp");
        let ajeno = carpeta.join("respaldos").join("notas.tmp");
        let en_la_rara = rara.join("boldo-1.db.tmp");
        for p in [&copia, &parcial, &ajeno, &en_la_rara] {
            fs::write(p, "x").unwrap();
        }
        limpiar_carpetas(&r);
        assert!(!copia.exists());
        assert!(!parcial.exists());
        assert!(ajeno.exists());
        assert!(en_la_rara.exists());
        assert!(carpeta.join("organizacion.db").exists());
    }
}
