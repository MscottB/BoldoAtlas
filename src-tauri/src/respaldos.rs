use crate::db::{self, SIN_ESPACIO};
use crate::intercambio::validar;
use crate::organizaciones::{Base, OTRA_BASE};
use rusqlite::{Connection, ErrorCode, OpenFlags};
use serde::Serialize;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

const PREFIJO: &str = "boldo-";
/// Copia de la base actual que se hace antes de restaurar: se lista (para poder deshacer) pero nunca se poda.
const PREFIJO_SEGURIDAD: &str = "boldo-antes-de-restaurar-";
/// Copia que se hace antes de reemplazar los datos por una organización nueva o el ejemplo: tampoco se poda.
const PREFIJO_REEMPLAZO: &str = "boldo-antes-de-reemplazar-";
/// Copia que se hace antes de agregar o fusionar lo que trae un `.boldo`: de estas quedan las últimas `CONSERVAR_IMPORTAR`.
const PREFIJO_IMPORTAR: &str = "boldo-antes-de-importar-";
/// Copia que se hace antes de optimizar las fotos, con las originales: de estas quedan las últimas `CONSERVAR_OPTIMIZAR`.
const PREFIJO_OPTIMIZAR: &str = "boldo-antes-de-optimizar-";
const SUFIJO_TEMPORAL: &str = ".tmp";
/// Lo que `db.rs` deja antes de migrar, con el nombre de ahora (`.db`) o de versiones anteriores (`.boldo`).
const PREFIJO_MIGRACION: &str = "antes-migracion-";
pub const CONSERVAR: usize = 10;
/// Cuántos `boldo-antes-de-importar-` quedan al crear uno nuevo.
pub const CONSERVAR_IMPORTAR: usize = 20;
/// Pocos: cada uno guarda las fotos sin reducir, y puede pesar cientos de MB.
pub const CONSERVAR_OPTIMIZAR: usize = 3;

/// Error con un código estable que el frontend traduce (`respaldos.error.<codigo>`); `detalle` es técnico.
#[derive(Debug, Serialize)]
pub struct Fallo {
    pub codigo: &'static str,
    pub detalle: String,
    /// Para un archivo o una base que se pasa de un tope: en qué fila y campo, para poder corregirlo.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub donde: Option<Donde>,
}

#[derive(Debug, Serialize)]
pub struct Donde {
    pub tabla: String,
    pub columna: String,
    pub nombre: Option<String>,
}

impl Fallo {
    pub fn de(codigo: &'static str, detalle: impl ToString) -> Self {
        Fallo {
            codigo,
            detalle: detalle.to_string(),
            donde: None,
        }
    }
}

impl From<&'static str> for Fallo {
    fn from(e: &'static str) -> Self {
        Fallo::de("fallo", e)
    }
}
impl From<String> for Fallo {
    fn from(e: String) -> Self {
        match e.as_str() {
            OTRA_BASE => Fallo::de(OTRA_BASE, e),
            SIN_ESPACIO => Fallo::de(SIN_ESPACIO, e),
            _ => Fallo::de("fallo", e),
        }
    }
}
impl From<rusqlite::Error> for Fallo {
    fn from(e: rusqlite::Error) -> Self {
        match e.sqlite_error_code() {
            Some(ErrorCode::DiskFull) => Fallo::de(SIN_ESPACIO, SIN_ESPACIO),
            _ => Fallo::de("fallo", e),
        }
    }
}
impl From<std::io::Error> for Fallo {
    fn from(e: std::io::Error) -> Self {
        match e.kind() {
            ErrorKind::StorageFull => Fallo::de(SIN_ESPACIO, SIN_ESPACIO),
            _ => Fallo::de("fallo", e),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Respaldo {
    pub nombre: String,
    /// Hora local del nombre, `AAAA-MM-DDTHH:MM` (JS la lee como hora local).
    pub fecha: String,
    pub bytes: u64,
    pub revision: Option<i64>,
    pub legible: bool,
    pub seguridad: bool,
    /// Seguridad hecha antes de reemplazar los datos (si no, antes de restaurar).
    pub reemplazo: bool,
    /// Seguridad hecha antes de agregar o fusionar un archivo importado.
    pub importacion: bool,
    /// Seguridad hecha antes de optimizar las fotos.
    pub optimizacion: bool,
}

/// `AAAAMMDD-HHMM` en hora local.
pub fn sello_local(conn: &Connection) -> Result<String, Fallo> {
    Ok(conn.query_row(
        "SELECT strftime('%Y%m%d-%H%M', 'now', 'localtime')",
        [],
        |f| f.get(0),
    )?)
}

struct Entrada {
    nombre: String,
    sello: String,
    n: u32,
    seguridad: bool,
    reemplazo: bool,
    importacion: bool,
    optimizacion: bool,
}

/// `boldo-[antes-de-restaurar-|antes-de-reemplazar-|antes-de-importar-|antes-de-optimizar-]AAAAMMDD-HHMM[-N].db`; cualquier otro nombre no es un respaldo.
fn entrada(nombre: &str) -> Option<Entrada> {
    let reemplazo = nombre.strip_prefix(PREFIJO_REEMPLAZO);
    let importacion = nombre.strip_prefix(PREFIJO_IMPORTAR);
    let optimizacion = nombre.strip_prefix(PREFIJO_OPTIMIZAR);
    let especial = reemplazo
        .or(importacion)
        .or(optimizacion)
        .or_else(|| nombre.strip_prefix(PREFIJO_SEGURIDAD));
    let (seguridad, resto) = match especial {
        Some(r) => (true, r),
        None => (false, nombre.strip_prefix(PREFIJO)?),
    };
    let resto = resto.strip_suffix(".db")?;
    let sello = resto.get(..13)?;
    let es_sello = sello.bytes().enumerate().all(|(i, c)| {
        if i == 8 {
            c == b'-'
        } else {
            c.is_ascii_digit()
        }
    });
    let n = match &resto[13..] {
        "" => 1,
        s => s
            .strip_prefix('-')
            .filter(|s| s.bytes().all(|c| c.is_ascii_digit()))?
            .parse()
            .ok()
            .filter(|n| *n >= 2)?,
    };
    es_sello.then(|| Entrada {
        nombre: nombre.to_string(),
        sello: sello.to_string(),
        n,
        seguridad,
        reemplazo: reemplazo.is_some(),
        importacion: importacion.is_some(),
        optimizacion: optimizacion.is_some(),
    })
}

/// Del más nuevo al más viejo.
fn entradas(dir: &Path) -> Result<Vec<Entrada>, Fallo> {
    let mut v = Vec::new();
    for e in fs::read_dir(dir)? {
        let e = e?;
        if let Some(en) = e.file_name().to_str().and_then(entrada)
            && e.file_type()?.is_file()
        {
            v.push(en);
        }
    }
    v.sort_by(|a, b| (&b.sello, b.n).cmp(&(&a.sello, a.n)));
    Ok(v)
}

pub(crate) fn volcar(
    conn: &Connection,
    dir: &Path,
    prefijo: &str,
    sello: &str,
) -> Result<String, Fallo> {
    let nombre = (1..)
        .map(|n| match n {
            1 => format!("{prefijo}{sello}.db"),
            n => format!("{prefijo}{sello}-{n}.db"),
        })
        .find(|n| !dir.join(n).exists())
        .expect("siempre hay un sufijo libre");
    // Se escribe a un nombre que no es de respaldo y se renombra al terminar: un cierre a mitad
    // nunca deja un archivo parcial con nombre válido.
    let temporal = dir.join(format!("{nombre}{SUFIJO_TEMPORAL}"));
    let _ = fs::remove_file(&temporal);
    let hecho = conn
        .execute("VACUUM INTO ?1", [temporal.to_string_lossy()])
        .map_err(Fallo::from)
        .and_then(|_| fs::rename(&temporal, dir.join(&nombre)).map_err(Fallo::from));
    if hecho.is_err() {
        let _ = fs::remove_file(&temporal);
    }
    hecho.map(|_| nombre)
}

/// Dónde `cambiar_base` prepara la copia, al lado de la base.
pub(crate) fn copia_de(bd: &Path) -> PathBuf {
    bd.with_extension("restaurando")
}

/// La de `base`. La carpeta de una externa es ajena, y su `x.restaurando` puede ser de otra organización: se reconoce porque sus
/// respaldos no están al lado, y su copia lleva el id.
pub(crate) fn copia_de_base(base: &Base) -> PathBuf {
    if base.bd.parent() == base.respaldos.parent() {
        copia_de(&base.bd)
    } else {
        con_sufijo(&base.bd, &format!(".{}.restaurando", base.id))
    }
}

/// Borra los temporales que dejó un respaldo, un `.boldo` o una restauración interrumpidos. Se llama en `setup`, ya pasado
/// el plugin de instancia única: una segunda instancia sale antes y no le borra nada a la que está trabajando.
/// `bd` es la base que vive en `dir`, si hay una.
pub fn limpiar_parciales(dir: &Path, bd: Option<&Path>) {
    let temporal = format!(".db{SUFIJO_TEMPORAL}");
    // la copia de `cambiar_base` nunca es lo único que hay: la base se reemplaza con un renombre atómico, así que si la
    // copia sigue ahí no se llegó a usar. Sin la base al lado no se toca, por si acaso.
    let copia = bd.filter(|b| b.is_file()).map(copia_de);
    for e in fs::read_dir(dir).into_iter().flatten().flatten() {
        let nombre = e.file_name().to_string_lossy().into_owned();
        // solo los temporales propios (`boldo-….db.tmp`, con su diario de SQLite), nunca otro .tmp de la carpeta
        let base = ["-journal", "-wal", "-shm"]
            .iter()
            .find_map(|s| nombre.strip_suffix(s))
            .unwrap_or(&nombre);
        if (nombre.starts_with(PREFIJO) && base.ends_with(&temporal))
            || copia.as_deref() == Some(dir.join(base).as_path())
        {
            let _ = fs::remove_file(e.path());
        }
    }
}

/// `VACUUM INTO respaldos/boldo-<sello>.db` (o `-2`, `-3`… si ya existe) y poda a los últimos CONSERVAR.
pub fn respaldar(conn: &Connection, dir: &Path, sello: &str) -> Result<String, Fallo> {
    let nombre = volcar(conn, dir, PREFIJO, sello)?;
    // el respaldo ya está hecho: si la poda falla (archivo abierto, permisos), se reintenta la próxima vez
    for viejo in entradas(dir)
        .unwrap_or_default()
        .iter()
        .filter(|e| !e.seguridad)
        .skip(CONSERVAR)
    {
        let _ = fs::remove_file(dir.join(&viejo.nombre));
    }
    Ok(nombre)
}

/// Respaldo previo a reemplazar los datos: va aparte de los automáticos y no se poda.
pub fn respaldar_antes_de_reemplazar(
    conn: &Connection,
    dir: &Path,
    sello: &str,
) -> Result<String, Fallo> {
    volcar(conn, dir, PREFIJO_REEMPLAZO, sello)
}

/// Respaldo previo a agregar o fusionar un archivo importado: va aparte de los automáticos, y de estos quedan los últimos
/// `CONSERVAR_IMPORTAR`. Los demás tipos no se tocan.
pub fn respaldar_antes_de_importar(
    conn: &Connection,
    dir: &Path,
    sello: &str,
) -> Result<String, Fallo> {
    let nombre = volcar(conn, dir, PREFIJO_IMPORTAR, sello)?;
    // el respaldo ya está hecho: si la poda falla, se reintenta la próxima vez
    for viejo in entradas(dir)
        .unwrap_or_default()
        .iter()
        // el recién hecho nunca, aunque su sello sea anterior: el reloj pudo cambiar
        .filter(|e| e.importacion && e.nombre != nombre)
        .skip(CONSERVAR_IMPORTAR - 1)
    {
        let _ = fs::remove_file(dir.join(&viejo.nombre));
    }
    Ok(nombre)
}

/// Respaldo previo a optimizar las fotos: va aparte de los automáticos, y de estos quedan los últimos `CONSERVAR_OPTIMIZAR`.
pub fn respaldar_antes_de_optimizar(
    conn: &Connection,
    dir: &Path,
    sello: &str,
) -> Result<String, Fallo> {
    let nombre = volcar(conn, dir, PREFIJO_OPTIMIZAR, sello)?;
    // el respaldo ya está hecho: si la poda falla, se reintenta la próxima vez
    for viejo in entradas(dir)
        .unwrap_or_default()
        .iter()
        .filter(|e| e.optimizacion && e.nombre != nombre)
        .skip(CONSERVAR_OPTIMIZAR - 1)
    {
        let _ = fs::remove_file(dir.join(&viejo.nombre));
    }
    Ok(nombre)
}

fn revision(ruta: &Path) -> Option<i64> {
    let c = Connection::open_with_flags(ruta, OpenFlags::SQLITE_OPEN_READ_ONLY).ok()?;
    c.query_row(
        "SELECT CAST(valor AS INTEGER) FROM meta WHERE clave = 'data_revision'",
        [],
        |f| f.get(0),
    )
    .ok()
}

/// `AAAAMMDD-HHMM` como `AAAA-MM-DDTHH:MM`.
fn fecha_de_sello(s: &str) -> String {
    format!(
        "{}-{}-{}T{}:{}",
        &s[..4],
        &s[4..6],
        &s[6..8],
        &s[9..11],
        &s[11..]
    )
}

/// La fecha de una copia de `organizaciones-eliminadas/`: `<nombre>_AAAAMMDD-HHMM[-N].db`, con la misma cola que un respaldo.
/// `None` si no tiene esa forma: no es una de ellas.
pub(crate) fn fecha_de_eliminada(nombre: &str) -> Option<String> {
    let (_, cola) = nombre.rsplit_once('_')?;
    entrada(&format!("{PREFIJO}{cola}"))
        .filter(|e| !e.seguridad)
        .map(|e| fecha_de_sello(&e.sello))
}

/// Respaldos de la carpeta, del más nuevo al más viejo. Un archivo ilegible se lista sin revisión;
/// uno que ni siquiera se puede consultar (desapareció, sin permisos) se omite.
pub fn listar(dir: &Path) -> Result<Vec<Respaldo>, Fallo> {
    Ok(entradas(dir)?
        .into_iter()
        .filter_map(|e| {
            let ruta = dir.join(&e.nombre);
            let bytes = fs::metadata(&ruta).ok()?.len();
            let revision = revision(&ruta);
            Some(Respaldo {
                fecha: fecha_de_sello(&e.sello),
                bytes,
                legible: revision.is_some(),
                revision,
                seguridad: e.seguridad,
                reemplazo: e.reemplazo,
                importacion: e.importacion,
                optimizacion: e.optimizacion,
                nombre: e.nombre,
            })
        })
        .collect())
}

pub(crate) fn con_sufijo(ruta: &Path, sufijo: &str) -> PathBuf {
    let mut s = ruta.as_os_str().to_owned();
    s.push(sufijo);
    s.into()
}

/// Borra el archivo y sus -wal/-shm/-journal, si existen. Primero el archivo: si algo lo retiene, lo que sigue en su `-wal` no se
/// pierde.
pub fn borrar_bd(ruta: &Path) -> std::io::Result<()> {
    for p in [
        ruta.into(),
        con_sufijo(ruta, "-wal"),
        con_sufijo(ruta, "-shm"),
        con_sufijo(ruta, "-journal"),
    ] {
        match fs::remove_file(p) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e),
            _ => {}
        }
    }
    Ok(())
}

/// Los respaldos de una organización que se elimina. Solo los nombres propios: lo demás de la carpeta es del usuario.
/// Lo que `borrar_respaldos` considera suyo: un `notas.txt` del usuario no.
fn es_propio(nombre: &str) -> bool {
    entrada(nombre).is_some() || nombre.starts_with(PREFIJO_MIGRACION)
}

/// Lo que ocupa lo que `borrar_respaldos` borraría. `None` si no se pudo leer: no es lo mismo que no tener nada.
pub fn bytes_propios(dir: &Path) -> Option<u64> {
    let archivos = match fs::read_dir(dir) {
        Err(e) if e.kind() == ErrorKind::NotFound => return Some(0),
        otro => otro.ok()?,
    };
    let mut total = 0;
    for f in archivos {
        let f = f.ok()?;
        if f.file_name().to_str().is_some_and(es_propio) {
            let m = f.metadata().ok()?;
            if m.is_file() {
                total += m.len();
            }
        }
    }
    Some(total)
}

pub fn borrar_respaldos(dir: &Path) -> Result<(), Fallo> {
    limpiar_parciales(dir, None);
    let archivos = match fs::read_dir(dir) {
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(()),
        otro => otro?,
    };
    for f in archivos {
        let f = f?;
        let propio = f.file_name().to_str().is_some_and(es_propio);
        if propio && f.file_type()?.is_file() {
            fs::remove_file(f.path())?;
        }
    }
    Ok(())
}

/// Reemplaza la base por el respaldo `nombre` (uno de `listar`). Si algo falla, la base actual queda como estaba.
pub fn restaurar(
    conexion: &mut Option<Connection>,
    base: &Base,
    nombre: &str,
    migraciones: &[&str],
) -> Result<(), Fallo> {
    // solo nombres de la lista: nunca una ruta que venga de la interfaz
    if !entradas(&base.respaldos)?
        .iter()
        .any(|e| e.nombre == nombre)
    {
        return Err(Fallo::de("desconocido", nombre));
    }
    let origen = base.respaldos.join(nombre);
    let danado = |e: rusqlite::Error| Fallo::de("danado", e);
    {
        // lo primero: triggers, vistas o tablas extra quedarían activos en la base local. Un respaldo legítimo tiene el de
        // su versión.
        validar::version_y_esquema(&origen, migraciones).map_err(|e| match e.codigo {
            "contenido_invalido" => Fallo::de("danado", e.detalle),
            _ => e,
        })?;
        let c = Connection::open_with_flags(&origen, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(danado)?;
        let estado: String = c
            .query_row("PRAGMA quick_check", [], |f| f.get(0))
            .map_err(danado)?;
        if estado != "ok" {
            return Err(Fallo::de("danado", estado));
        }
        // sin meta no es una base de BoldoAtlas (p. ej. un archivo vacío, que SQLite abre como base vacía)
        c.query_row(
            "SELECT valor FROM meta WHERE clave = 'data_revision'",
            [],
            |_| Ok(()),
        )
        .map_err(danado)?;
    }
    cambiar_base(conexion, base, &origen, migraciones, PREFIJO_SEGURIDAD)
}

/// Reemplaza la base por `origen`, ya revisado, con el respaldo previo a reemplazar: lo usa «Reemplazar todo» al importar.
pub fn reemplazar_antes_respaldando(
    conexion: &mut Option<Connection>,
    base: &Base,
    origen: &Path,
    migraciones: &[&str],
) -> Result<(), Fallo> {
    cambiar_base(conexion, base, origen, migraciones, PREFIJO_REEMPLAZO)
}

/// Lo escrito en la copia vive en su WAL hasta cerrarla. Si SQLite no pudo volcarlo, cierra sin avisar, y al renombrar se
/// perdería: la base quedaría sin migrar y con el `db_id` del archivo que llegó.
pub(crate) fn cerrar_copia(c: Connection, copia: &Path) -> Result<(), Fallo> {
    c.close().map_err(|(_, e)| e)?;
    if con_sufijo(copia, "-wal").exists() {
        return Err(Fallo::de("fallo", copia.display()));
    }
    Ok(())
}

fn cambiar_base(
    conexion: &mut Option<Connection>,
    base: &Base,
    origen: &Path,
    migraciones: &[&str],
    prefijo_seguridad: &str,
) -> Result<(), Fallo> {
    let (bd, dir) = (&base.bd, &base.respaldos);
    // Se prepara (y migra) una copia aparte: la base actual no se toca hasta el reemplazo final.
    let copia = copia_de_base(base);
    let mut reemplazar = || -> Result<(), Fallo> {
        borrar_bd(&copia)?;
        fs::copy(origen, &copia)?;
        let mut c = db::abrir(&copia)?;
        db::migrar_con(&mut c, migraciones, dir)?;
        db::asegurar_meta(&c)?;
        // la identidad es de la base, no de lo que llega: de ella cuelgan sus pestañas y preferencias
        c.execute(
            "UPDATE meta SET valor = ?1 WHERE clave = 'db_id'",
            [&base.id],
        )?;
        cerrar_copia(c, &copia)?;

        let actual = conexion
            .take()
            .ok_or_else(|| Fallo::de("fallo", "la base no está abierta"))?;
        let seguridad = match sello_local(&actual)
            .and_then(|sello| volcar(&actual, dir, prefijo_seguridad, &sello))
        {
            Ok(nombre) => dir.join(nombre),
            Err(e) => {
                *conexion = Some(actual);
                return Err(e);
            }
        };
        let cambiar = || -> Result<(), Fallo> {
            // Al cerrar la última conexión SQLite vuelca el WAL y lo borra; si sigue ahí, otra ventana usa la base.
            actual.close().map_err(|(_, e)| e)?;
            if con_sufijo(bd, "-wal").exists() {
                return Err(Fallo::de("en_uso", bd.display()));
            }
            // un -shm sin -wal no guarda datos; se quita para que el respaldo arranque limpio
            let _ = fs::remove_file(con_sufijo(bd, "-shm"));
            fs::rename(&copia, bd)?;
            Ok(())
        };
        // si no se reemplazó, la copia «antes de restaurar» sobra (y contaría como último respaldo)
        cambiar().inspect_err(|_| {
            let _ = fs::remove_file(&seguridad);
        })
    };
    let resultado = reemplazar();
    let _ = borrar_bd(&copia);
    // Tras el éxito la conexión queda cerrada hasta el reinicio: nada escribe en la base restaurada
    // sin pasar por el respaldo de seguridad. Si falló, se reabre la base de siempre.
    if resultado.is_err() && conexion.is_none() {
        *conexion = Some(db::abrir(bd)?);
    }
    resultado
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organizaciones::identidad;
    use db::MIGRACIONES;

    fn base(dir: &Path) -> (Base, PathBuf, Connection) {
        base_en(dir, "boldo.db")
    }

    fn base_en(dir: &Path, archivo: &str) -> (Base, PathBuf, Connection) {
        let respaldos = dir.join("respaldos");
        fs::create_dir_all(&respaldos).unwrap();
        let bd = dir.join(archivo);
        let mut conn = db::abrir(&bd).unwrap();
        db::migrar(&mut conn, &respaldos).unwrap();
        db::asegurar_meta(&conn).unwrap();
        let b = Base {
            id: identidad(&conn).unwrap(),
            bd,
            respaldos: respaldos.clone(),
        };
        (b, respaldos, conn)
    }

    fn id_de(conn: &Connection) -> String {
        conn.query_row("SELECT valor FROM meta WHERE clave = 'db_id'", [], |f| {
            f.get(0)
        })
        .unwrap()
    }

    fn revision(conn: &Connection) -> i64 {
        conn.query_row(
            "SELECT CAST(valor AS INTEGER) FROM meta WHERE clave = 'data_revision'",
            [],
            |f| f.get(0),
        )
        .unwrap()
    }

    fn escribir(conn: &mut Connection, veces: usize) {
        for _ in 0..veces {
            db::lote(conn, &[], "t").unwrap();
        }
    }

    fn archivos(dir: &Path) -> Vec<String> {
        let mut v: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        v.sort();
        v
    }

    #[test]
    fn bytes_propios_no_cuenta_lo_ajeno_ni_inventa_un_cero() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(bytes_propios(&d.path().join("no_existe")), Some(0));
        fs::write(d.path().join("boldo-20200101-0000.db"), "12345").unwrap();
        fs::write(d.path().join("notas.txt"), "1234567").unwrap();
        assert_eq!(bytes_propios(d.path()), Some(5));
        // un archivo donde debería haber una carpeta: no se pudo leer, y no es lo mismo que vacío
        assert_eq!(bytes_propios(&d.path().join("notas.txt")), None);
    }

    #[test]
    fn nombra_con_hora_local_y_sufijo_si_choca() {
        let dir = tempfile::tempdir().unwrap();
        let (_, respaldos, conn) = base(dir.path());
        let sello = sello_local(&conn).unwrap();
        let b = sello.as_bytes();
        assert_eq!(b.len(), 13, "{sello}");
        assert!(
            b.iter().enumerate().all(|(i, c)| if i == 8 {
                *c == b'-'
            } else {
                c.is_ascii_digit()
            }),
            "{sello}"
        );
        assert_eq!(
            respaldar(&conn, &respaldos, &sello).unwrap(),
            format!("boldo-{sello}.db")
        );
        assert_eq!(
            respaldar(&conn, &respaldos, &sello).unwrap(),
            format!("boldo-{sello}-2.db")
        );
        assert_eq!(
            respaldar(&conn, &respaldos, &sello).unwrap(),
            format!("boldo-{sello}-3.db")
        );
    }

    #[test]
    fn un_respaldo_interrumpido_no_se_lista_y_se_limpia() {
        let dir = tempfile::tempdir().unwrap();
        let (_, respaldos, conn) = base(dir.path());
        // lo que deja un cierre a mitad de `VACUUM INTO`: el nombre temporal, nunca uno válido
        fs::write(respaldos.join("boldo-20260101-0900.db.tmp"), "a medias").unwrap();
        fs::write(respaldos.join("notas.txt"), "x").unwrap();
        // un .tmp que no es de un respaldo no se toca
        fs::write(respaldos.join("ajeno.tmp"), "x").unwrap();
        fs::write(respaldos.join("boldo-notas.tmp"), "x").unwrap();
        assert!(listar(&respaldos).unwrap().is_empty());
        limpiar_parciales(&respaldos, None);
        assert_eq!(
            archivos(&respaldos),
            ["ajeno.tmp", "boldo-notas.tmp", "notas.txt"]
        );
        // uno completo sí se lista y no deja temporales de respaldo
        respaldar(&conn, &respaldos, "20260101-0900").unwrap();
        assert_eq!(listar(&respaldos).unwrap().len(), 1);
        assert!(archivos(&respaldos).iter().all(|n| !n.ends_with(".db.tmp")));
    }

    #[test]
    fn un_temporal_viejo_no_impide_respaldar_con_ese_nombre() {
        let dir = tempfile::tempdir().unwrap();
        let (_, respaldos, conn) = base(dir.path());
        fs::write(respaldos.join("boldo-20260101-0900.db.tmp"), "a medias").unwrap();
        assert_eq!(
            respaldar(&conn, &respaldos, "20260101-0900").unwrap(),
            "boldo-20260101-0900.db"
        );
        assert_eq!(listar(&respaldos).unwrap()[0].revision, Some(0));
    }

    /// Lo que retiene un antivirus: una carpeta con ese nombre tampoco se puede quitar con `remove_file`, en ningún sistema.
    #[test]
    fn borrar_bd_no_quita_el_wal_si_no_puede_quitar_el_archivo() {
        let dir = tempfile::tempdir().unwrap();
        let bd = dir.path().join("x.db");
        fs::create_dir(&bd).unwrap();
        let wal = con_sufijo(&bd, "-wal");
        fs::write(&wal, "filas sin aplicar").unwrap();
        assert!(borrar_bd(&bd).is_err());
        assert_eq!(fs::read(&wal).unwrap(), b"filas sin aplicar");
    }

    #[test]
    fn poda_solo_los_respaldos_propios() {
        let dir = tempfile::tempdir().unwrap();
        let (_, respaldos, conn) = base(dir.path());
        let ajenos = [
            // los de antes de la migración, con el nombre de ahora y con el de versiones anteriores
            "antes-migracion-1-20200101000000-abcd1234.db",
            "antes-migracion-1-20200101000000-abcd1234.boldo",
            "boldo-antes-de-restaurar-20200101-0000.db",
            "boldo-2020.db",
            "notas.txt",
        ];
        for a in ajenos {
            fs::write(respaldos.join(a), "x").unwrap();
        }
        for d in 1..=12 {
            respaldar(&conn, &respaldos, &format!("202001{d:02}-0000")).unwrap();
        }
        let quedan = archivos(&respaldos);
        for a in ajenos {
            assert!(quedan.contains(&a.to_string()), "{a} {quedan:?}");
        }
        let propios: Vec<_> = quedan
            .iter()
            .filter(|n| n.starts_with("boldo-202001"))
            .collect();
        assert_eq!(propios.len(), CONSERVAR, "{quedan:?}");
        assert_eq!(propios[0], "boldo-20200103-0000.db");
    }

    #[test]
    fn el_respaldo_previo_a_reemplazar_se_lista_aparte_y_no_se_poda() {
        let dir = tempfile::tempdir().unwrap();
        let (_, respaldos, conn) = base(dir.path());
        let previo = respaldar_antes_de_reemplazar(&conn, &respaldos, "20200101-0000").unwrap();
        assert_eq!(previo, "boldo-antes-de-reemplazar-20200101-0000.db");
        for d in 1..=CONSERVAR + 5 {
            respaldar(&conn, &respaldos, &format!("202002{d:02}-0000")).unwrap();
        }
        let lista = listar(&respaldos).unwrap();
        let p = lista
            .iter()
            .find(|r| r.nombre == previo)
            .expect("sigue ahí");
        assert!(p.seguridad && p.reemplazo && p.legible);
        assert_eq!(lista.iter().filter(|r| !r.seguridad).count(), CONSERVAR);
        // restaurar sigue ofreciendo solo nombres de la lista: este también vale
        assert!(
            entradas(&respaldos)
                .unwrap()
                .iter()
                .any(|e| e.nombre == previo)
        );
    }

    #[cfg(windows)]
    #[test]
    fn un_error_al_podar_no_hace_fallar_el_respaldo() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = tempfile::tempdir().unwrap();
        let (_, respaldos, conn) = base(dir.path());
        for d in 1..=CONSERVAR {
            respaldar(&conn, &respaldos, &format!("202001{d:02}-0000")).unwrap();
        }
        // sin compartir: Windows no deja borrar el más viejo mientras esté abierto
        let _bloqueo = fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(respaldos.join("boldo-20200101-0000.db"))
            .unwrap();
        assert_eq!(
            respaldar(&conn, &respaldos, "20200201-0000").unwrap(),
            "boldo-20200201-0000.db"
        );
        assert!(respaldos.join("boldo-20200201-0000.db").is_file());
    }

    #[test]
    fn lista_del_mas_nuevo_y_marca_los_ilegibles() {
        let dir = tempfile::tempdir().unwrap();
        let (_, respaldos, mut conn) = base(dir.path());
        respaldar(&conn, &respaldos, "20260101-0900").unwrap();
        escribir(&mut conn, 1);
        respaldar(&conn, &respaldos, "20260101-0900").unwrap();
        fs::write(respaldos.join("boldo-20250101-0000.db"), "no soy sqlite").unwrap();
        fs::write(respaldos.join("otra-cosa.db"), "x").unwrap();
        let lista = listar(&respaldos).unwrap();
        let resumen: Vec<_> = lista
            .iter()
            .map(|r| (r.nombre.as_str(), r.fecha.as_str(), r.revision, r.legible))
            .collect();
        assert_eq!(
            resumen,
            [
                (
                    "boldo-20260101-0900-2.db",
                    "2026-01-01T09:00",
                    Some(1),
                    true
                ),
                ("boldo-20260101-0900.db", "2026-01-01T09:00", Some(0), true),
                ("boldo-20250101-0000.db", "2025-01-01T00:00", None, false),
            ]
        );
        assert!(lista.iter().all(|r| r.bytes > 0 && !r.seguridad));
        // leer la revisión no deja archivos -wal/-shm en la carpeta
        assert!(
            archivos(&respaldos)
                .iter()
                .all(|n| !n.ends_with("-wal") && !n.ends_with("-shm"))
        );
    }

    #[test]
    fn restaurar_rechaza_nombres_fuera_de_la_lista() {
        let dir = tempfile::tempdir().unwrap();
        let (b, respaldos, conn) = base(dir.path());
        let nombre = respaldar(&conn, &respaldos, "20260101-0900").unwrap();
        fs::write(respaldos.join("notas.txt"), "x").unwrap();
        let absoluta = respaldos.join(&nombre).display().to_string();
        let mut slot = Some(conn);
        for malo in [
            "../boldo.db",
            "..\\boldo.db",
            "respaldos/boldo-20260101-0900.db",
            absoluta.as_str(),
            "boldo-20990101-0000.db",
            "notas.txt",
            "",
        ] {
            let err = restaurar(&mut slot, &b, malo, MIGRACIONES).unwrap_err();
            assert_eq!(err.codigo, "desconocido", "{malo}");
        }
        assert_eq!(revision(slot.as_ref().unwrap()), 0);
    }

    #[test]
    fn restaurar_vuelve_al_respaldo_sin_reaplicar_el_wal_viejo() {
        let dir = tempfile::tempdir().unwrap();
        let (b, respaldos, mut conn) = base(dir.path());
        escribir(&mut conn, 1);
        let nombre = respaldar(&conn, &respaldos, "20260101-0900").unwrap();
        escribir(&mut conn, 3);
        // los cambios posteriores al respaldo viven en el WAL de la base actual
        let wal = dir.path().join("boldo.db-wal");
        assert!(fs::metadata(&wal).unwrap().len() > 0);
        let mut slot = Some(conn);
        restaurar(&mut slot, &b, &nombre, MIGRACIONES).unwrap();
        // tras el éxito la conexión queda cerrada: nada escribe en la base restaurada antes del reinicio
        assert!(slot.is_none());
        assert_eq!(revision(&db::abrir(&b.bd).unwrap()), 1);
        // la base de antes quedó respaldada (revisión 4) y se puede volver a ella
        let lista = listar(&respaldos).unwrap();
        let seguridad: Vec<_> = lista.iter().filter(|r| r.seguridad).collect();
        assert_eq!(seguridad.len(), 1);
        assert!(seguridad[0].nombre.starts_with("boldo-antes-de-restaurar-"));
        assert_eq!(seguridad[0].revision, Some(4));
        assert!(
            archivos(dir.path())
                .iter()
                .all(|n| !n.contains("restaurando")),
            "{:?}",
            archivos(dir.path())
        );
    }

    #[test]
    fn restaurar_migra_un_respaldo_de_esquema_anterior() {
        let dir = tempfile::tempdir().unwrap();
        let (b, respaldos, conn) = base(dir.path());
        let nombre = respaldar(&conn, &respaldos, "20260101-0900").unwrap();
        let otra = [MIGRACIONES, &["CREATE TABLE extra (x INTEGER);"]].concat();
        let mut slot = Some(conn);
        restaurar(&mut slot, &b, &nombre, &otra).unwrap();
        assert!(slot.is_none());
        let c = db::abrir(&b.bd).unwrap();
        let v: i64 = c
            .pragma_query_value(None, "user_version", |f| f.get(0))
            .unwrap();
        assert_eq!(v, MIGRACIONES.len() as i64 + 1);
        c.execute("INSERT INTO extra VALUES (1)", []).unwrap();
    }

    #[test]
    fn restaurar_que_falla_al_migrar_deja_la_base_intacta() {
        let dir = tempfile::tempdir().unwrap();
        let (b, respaldos, mut conn) = base(dir.path());
        let nombre = respaldar(&conn, &respaldos, "20260101-0900").unwrap();
        escribir(&mut conn, 2);
        let rota = [MIGRACIONES, &["ESTO NO ES SQL;"]].concat();
        let mut slot = Some(conn);
        let err = restaurar(&mut slot, &b, &nombre, &rota).unwrap_err();
        assert_eq!(err.codigo, "fallo");
        assert_eq!(revision(slot.as_ref().unwrap()), 2);
        assert!(
            archivos(dir.path())
                .iter()
                .all(|n| !n.contains("restaurando"))
        );
    }

    #[test]
    fn restaurar_rechaza_respaldo_de_esquema_mas_nuevo() {
        let dir = tempfile::tempdir().unwrap();
        let (b, respaldos, mut conn) = base(dir.path());
        let nombre = respaldar(&conn, &respaldos, "20260101-0900").unwrap();
        Connection::open(respaldos.join(&nombre))
            .unwrap()
            .pragma_update(None, "user_version", 99)
            .unwrap();
        escribir(&mut conn, 2);
        let mut slot = Some(conn);
        let err = restaurar(&mut slot, &b, &nombre, MIGRACIONES).unwrap_err();
        assert_eq!(err.codigo, "esquema_nuevo");
        assert_eq!(revision(slot.as_ref().unwrap()), 2);
        assert!(listar(&respaldos).unwrap().iter().all(|r| !r.seguridad));
    }

    #[test]
    fn limpiar_parciales_borra_una_restauracion_interrumpida_si_esta_la_base() {
        let dir = tempfile::tempdir().unwrap();
        let (b, _respaldos, conn) = base(dir.path());
        drop(conn);
        let copia = b.bd.with_extension("restaurando");
        fs::write(&copia, "a medias").unwrap();
        fs::write(con_sufijo(&copia, "-wal"), "x").unwrap();
        limpiar_parciales(dir.path(), Some(&b.bd));
        assert!(!copia.exists() && !con_sufijo(&copia, "-wal").exists());
        assert!(b.bd.exists());
        // sin la base al lado no se toca
        fs::write(&copia, "lo único").unwrap();
        fs::remove_file(&b.bd).unwrap();
        limpiar_parciales(dir.path(), Some(&b.bd));
        assert!(copia.exists());
    }

    #[test]
    fn limpiar_parciales_usa_el_nombre_de_la_base() {
        let dir = tempfile::tempdir().unwrap();
        let bd = dir.path().join("organizacion.db");
        fs::write(&bd, "base").unwrap();
        let copia = dir.path().join("organizacion.restaurando");
        fs::write(&copia, "a medias").unwrap();
        fs::write(con_sufijo(&copia, "-wal"), "x").unwrap();
        // la de otro nombre no se toca, y sin base (`None`) tampoco esta
        let ajena = dir.path().join("boldo.restaurando");
        fs::write(&ajena, "de otra").unwrap();
        limpiar_parciales(dir.path(), None);
        assert!(copia.exists());
        limpiar_parciales(dir.path(), Some(&bd));
        assert!(!copia.exists() && !con_sufijo(&copia, "-wal").exists());
        assert!(bd.exists() && ajena.exists());
        // sin la base al lado no se toca
        fs::write(&copia, "lo único").unwrap();
        fs::remove_file(&bd).unwrap();
        limpiar_parciales(dir.path(), Some(&bd));
        assert!(copia.exists());
    }

    #[test]
    fn restaurar_funciona_con_otro_nombre_y_carpeta() {
        let dir = tempfile::tempdir().unwrap();
        let carpeta = dir.path().join("organizaciones").join("x");
        fs::create_dir_all(&carpeta).unwrap();
        let (b, respaldos, mut conn) = base_en(&carpeta, "organizacion.db");
        escribir(&mut conn, 1);
        let nombre = respaldar(&conn, &respaldos, "20260101-0900").unwrap();
        escribir(&mut conn, 3);
        let mut slot = Some(conn);
        restaurar(&mut slot, &b, &nombre, MIGRACIONES).unwrap();
        assert_eq!(revision(&db::abrir(&b.bd).unwrap()), 1);
        assert!(listar(&respaldos).unwrap().iter().any(|r| r.seguridad));
        assert!(
            archivos(&carpeta)
                .iter()
                .all(|n| !n.contains("restaurando")),
            "{:?}",
            archivos(&carpeta)
        );
        assert!(!dir.path().join("boldo.db").exists());
    }

    #[test]
    fn restaurar_una_externa_no_toca_lo_ajeno_de_su_carpeta() {
        let dir = tempfile::tempdir().unwrap();
        let (mut b, _, mut conn) = base_en(dir.path(), "x.db");
        escribir(&mut conn, 1);
        let app = tempfile::tempdir().unwrap();
        b.respaldos = app.path().join("respaldos");
        fs::create_dir_all(&b.respaldos).unwrap();
        let nombre = respaldar(&conn, &b.respaldos, "20260101-0900").unwrap();
        escribir(&mut conn, 3);
        let ajeno = dir.path().join("x.restaurando");
        fs::write(&ajeno, "de otra organización").unwrap();
        // el nombre no se puede confundir con un archivo del usuario, ni con la propia base
        let copia = copia_de_base(&b);
        assert_ne!(copia, ajeno);
        assert!(copia.to_string_lossy().contains(&b.id));

        let mut slot = Some(conn);
        restaurar(&mut slot, &b, &nombre, MIGRACIONES).unwrap();
        assert_eq!(revision(&db::abrir(&b.bd).unwrap()), 1);
        assert_eq!(fs::read_to_string(&ajeno).unwrap(), "de otra organización");
        assert!(!copia.exists());
    }

    #[test]
    fn la_copia_interna_conserva_su_nombre() {
        let dir = tempfile::tempdir().unwrap();
        let (b, _, _conn) = base_en(dir.path(), "organizacion.db");
        assert_eq!(copia_de_base(&b), copia_de(&b.bd));
    }

    #[test]
    fn restaurar_conserva_el_db_id_de_la_base() {
        // el respaldo trae otro id, uno que no es válido o ninguno
        for sql in [
            "UPDATE meta SET valor = '01900000-0000-7000-8000-000000000000' WHERE clave = 'db_id'",
            "UPDATE meta SET valor = '../x' WHERE clave = 'db_id'",
            "DELETE FROM meta WHERE clave = 'db_id'",
        ] {
            let dir = tempfile::tempdir().unwrap();
            let (b, respaldos, conn) = base(dir.path());
            let nombre = respaldar(&conn, &respaldos, "20260101-0900").unwrap();
            Connection::open(respaldos.join(&nombre))
                .unwrap()
                .execute(sql, [])
                .unwrap();
            let mut slot = Some(conn);
            restaurar(&mut slot, &b, &nombre, MIGRACIONES).unwrap();
            assert_eq!(id_de(&db::abrir(&b.bd).unwrap()), b.id, "{sql}");
        }
    }

    #[test]
    fn si_la_copia_no_vuelca_su_wal_no_se_usa() {
        let dir = tempfile::tempdir().unwrap();
        let copia = dir.path().join("a.restaurando");
        let c = db::abrir(&copia).unwrap();
        c.execute_batch("CREATE TABLE t (x);").unwrap();
        // con otra conexión abierta, cerrar no vuelca el WAL ni avisa: lo escrito no está en el archivo
        let otra = db::abrir(&copia).unwrap();
        assert!(cerrar_copia(c, &copia).is_err());
        otra.close().unwrap();
        let c = db::abrir(&copia).unwrap();
        cerrar_copia(c, &copia).unwrap();
    }

    #[test]
    fn restaurar_rechaza_un_respaldo_con_objetos_ajenos_al_esquema() {
        for sql in [
            "CREATE TRIGGER t AFTER INSERT ON meta BEGIN DELETE FROM unidades; END;",
            "CREATE VIEW v AS SELECT * FROM meta;",
            "CREATE TABLE extra (x);",
        ] {
            let dir = tempfile::tempdir().unwrap();
            let (b, respaldos, mut conn) = base(dir.path());
            let nombre = respaldar(&conn, &respaldos, "20260101-0900").unwrap();
            Connection::open(respaldos.join(&nombre))
                .unwrap()
                .execute_batch(sql)
                .unwrap();
            escribir(&mut conn, 2);
            let mut slot = Some(conn);
            let err = restaurar(&mut slot, &b, &nombre, MIGRACIONES).unwrap_err();
            assert_eq!(err.codigo, "danado", "{sql}");
            assert_eq!(revision(slot.as_ref().unwrap()), 2);
        }
    }

    #[test]
    fn restaurar_acepta_un_respaldo_con_otros_fines_de_linea() {
        let dir = tempfile::tempdir().unwrap();
        let (b, respaldos, conn) = base(dir.path());
        let nombre = respaldar(&conn, &respaldos, "20260101-0900").unwrap();
        // el mismo respaldo visto por una app compilada con los fines de línea del otro sistema
        let otras: Vec<String> = MIGRACIONES
            .iter()
            .map(|m| {
                if m.contains("\r\n") {
                    m.replace("\r\n", "\n")
                } else {
                    m.replace('\n', "\r\n")
                }
            })
            .collect();
        let otras: Vec<&str> = otras.iter().map(String::as_str).collect();
        let mut slot = Some(conn);
        restaurar(&mut slot, &b, &nombre, &otras).unwrap();
    }

    #[test]
    fn restaurar_rechaza_respaldo_danado() {
        let dir = tempfile::tempdir().unwrap();
        let (b, respaldos, mut conn) = base(dir.path());
        escribir(&mut conn, 2);
        fs::write(respaldos.join("boldo-20250101-0000.db"), "no soy sqlite").unwrap();
        let mut slot = Some(conn);
        let err = restaurar(&mut slot, &b, "boldo-20250101-0000.db", MIGRACIONES).unwrap_err();
        assert_eq!(err.codigo, "danado");
        // un archivo vacío pasa quick_check (SQLite lo ve como base vacía) pero no es un respaldo
        fs::write(respaldos.join("boldo-20240101-0000.db"), "").unwrap();
        let err = restaurar(&mut slot, &b, "boldo-20240101-0000.db", MIGRACIONES).unwrap_err();
        assert_eq!(err.codigo, "danado");
        assert_eq!(revision(slot.as_ref().unwrap()), 2);
    }

    #[test]
    fn restaurar_con_otra_instancia_abierta_no_toca_la_base() {
        let dir = tempfile::tempdir().unwrap();
        let (b, respaldos, mut conn) = base(dir.path());
        let nombre = respaldar(&conn, &respaldos, "20260101-0900").unwrap();
        Connection::open(respaldos.join(&nombre))
            .unwrap()
            .execute(
                "UPDATE meta SET valor = '01900000-0000-7000-8000-000000000000' WHERE clave = 'db_id'",
                [],
            )
            .unwrap();
        escribir(&mut conn, 3);
        let otra = db::abrir(&b.bd).unwrap();
        assert_eq!(revision(&otra), 3);
        let mut slot = Some(conn);
        let err = restaurar(&mut slot, &b, &nombre, MIGRACIONES).unwrap_err();
        assert_eq!(err.codigo, "en_uso");
        assert_eq!(revision(slot.as_ref().unwrap()), 3);
        assert_eq!(id_de(slot.as_ref().unwrap()), b.id);
        assert_eq!(revision(&otra), 3);
        // un intento fallido no deja una copia «antes de restaurar» suelta
        assert!(listar(&respaldos).unwrap().iter().all(|r| !r.seguridad));
    }

    #[test]
    fn de_los_respaldos_de_optimizar_quedan_los_ultimos_3_y_los_demas_no_se_tocan() {
        let dir = tempfile::tempdir().unwrap();
        let conn = Connection::open(dir.path().join("boldo.db")).unwrap();
        conn.execute_batch("CREATE TABLE meta (clave TEXT, valor TEXT);")
            .unwrap();
        let carpeta = dir.path().join("respaldos");
        fs::create_dir(&carpeta).unwrap();
        let reemplazo = respaldar_antes_de_reemplazar(&conn, &carpeta, "20200101-0000").unwrap();
        let importar = respaldar_antes_de_importar(&conn, &carpeta, "20200101-0000").unwrap();
        let comun = respaldar(&conn, &carpeta, "20200101-0000").unwrap();
        let hechos: Vec<_> = (0..CONSERVAR_OPTIMIZAR + 2)
            .map(|n| {
                respaldar_antes_de_optimizar(&conn, &carpeta, &format!("20250101-{n:04}")).unwrap()
            })
            .collect();
        assert!(hechos[0].starts_with("boldo-antes-de-optimizar-"));
        assert!(!carpeta.join(&hechos[0]).exists());
        assert!(!carpeta.join(&hechos[1]).exists());
        for quedan in &hechos[2..] {
            assert!(carpeta.join(quedan).exists());
        }
        for otro in [&reemplazo, &importar, &comun] {
            assert!(carpeta.join(otro).exists(), "{otro}");
        }
        let lista = listar(&carpeta).unwrap();
        let r = lista.iter().find(|r| r.nombre == hechos[4]).unwrap();
        assert!(r.optimizacion && r.seguridad && !r.reemplazo && !r.importacion);
    }

    #[test]
    fn la_poda_de_optimizar_nunca_se_lleva_el_respaldo_recien_hecho() {
        let dir = tempfile::tempdir().unwrap();
        let conn = Connection::open(dir.path().join("boldo.db")).unwrap();
        conn.execute_batch("CREATE TABLE meta (clave TEXT, valor TEXT);")
            .unwrap();
        let carpeta = dir.path().join("respaldos");
        fs::create_dir(&carpeta).unwrap();
        for n in 0..CONSERVAR_OPTIMIZAR {
            respaldar_antes_de_optimizar(&conn, &carpeta, &format!("20300101-{n:04}")).unwrap();
        }
        // el reloj volvió atrás
        let nuevo = respaldar_antes_de_optimizar(&conn, &carpeta, "20200101-0000").unwrap();
        assert!(carpeta.join(&nuevo).exists());
        assert_eq!(
            entradas(&carpeta)
                .unwrap()
                .iter()
                .filter(|e| e.optimizacion)
                .count(),
            CONSERVAR_OPTIMIZAR
        );
    }

    #[test]
    fn la_poda_de_importar_nunca_se_lleva_el_respaldo_recien_hecho() {
        let dir = tempfile::tempdir().unwrap();
        let conn = Connection::open(dir.path().join("boldo.db")).unwrap();
        conn.execute_batch("CREATE TABLE meta (clave TEXT, valor TEXT);")
            .unwrap();
        let carpeta = dir.path().join("respaldos");
        fs::create_dir(&carpeta).unwrap();
        // 20 con sellos posteriores: el reloj volvió atrás
        let mut posteriores = Vec::new();
        for n in 0..CONSERVAR_IMPORTAR {
            posteriores.push(
                respaldar_antes_de_importar(&conn, &carpeta, &format!("20300101-{n:04}")).unwrap(),
            );
        }
        let nuevo = respaldar_antes_de_importar(&conn, &carpeta, "20200101-0000").unwrap();
        assert!(carpeta.join(&nuevo).exists(), "el recién hecho sigue");
        assert!(
            !carpeta.join(&posteriores[0]).exists(),
            "se va el más viejo de los demás"
        );
        assert_eq!(
            entradas(&carpeta)
                .unwrap()
                .iter()
                .filter(|e| e.importacion)
                .count(),
            CONSERVAR_IMPORTAR
        );
    }

    #[test]
    fn de_los_respaldos_de_importar_quedan_los_ultimos_20_y_los_demas_no_se_tocan() {
        let dir = tempfile::tempdir().unwrap();
        let bd = dir.path().join("boldo.db");
        let conn = Connection::open(&bd).unwrap();
        conn.execute_batch("CREATE TABLE meta (clave TEXT, valor TEXT);")
            .unwrap();
        let carpeta = dir.path().join("respaldos");
        fs::create_dir(&carpeta).unwrap();
        let reemplazo = respaldar_antes_de_reemplazar(&conn, &carpeta, "20200101-0000").unwrap();
        let comun = respaldar(&conn, &carpeta, "20200101-0001").unwrap();
        let mut hechos = Vec::new();
        for n in 0..CONSERVAR_IMPORTAR + 3 {
            hechos.push(
                respaldar_antes_de_importar(&conn, &carpeta, &format!("20200201-{n:04}")).unwrap(),
            );
        }
        let quedan = |nombre: &str| carpeta.join(nombre).exists();
        assert!(
            hechos[..3].iter().all(|n| !quedan(n)),
            "los tres más viejos se fueron"
        );
        assert!(
            hechos[3..].iter().all(|n| quedan(n)),
            "los últimos 20 siguen"
        );
        assert!(
            quedan(&reemplazo) && quedan(&comun),
            "los demás tipos no se tocan"
        );
    }
}
