use crate::db;
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

const PREFIJO: &str = "boldo-";
/// Copia de la base actual que se hace antes de restaurar: se lista (para poder deshacer) pero nunca se poda.
const PREFIJO_SEGURIDAD: &str = "boldo-antes-de-restaurar-";
/// Copia que se hace antes de reemplazar los datos por una organización nueva o el ejemplo: tampoco se poda.
const PREFIJO_REEMPLAZO: &str = "boldo-antes-de-reemplazar-";
const SUFIJO_TEMPORAL: &str = ".tmp";
pub const CONSERVAR: usize = 10;

/// Error con un código estable que el frontend traduce (`respaldos.error.<codigo>`); `detalle` es técnico.
#[derive(Debug, Serialize)]
pub struct Fallo {
    pub codigo: &'static str,
    pub detalle: String,
}

impl Fallo {
    pub fn de(codigo: &'static str, detalle: impl ToString) -> Self {
        Fallo {
            codigo,
            detalle: detalle.to_string(),
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
        Fallo::de("fallo", e)
    }
}
impl From<rusqlite::Error> for Fallo {
    fn from(e: rusqlite::Error) -> Self {
        Fallo::de("fallo", e)
    }
}
impl From<std::io::Error> for Fallo {
    fn from(e: std::io::Error) -> Self {
        Fallo::de("fallo", e)
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
}

/// `boldo-[antes-de-restaurar-|antes-de-reemplazar-]AAAAMMDD-HHMM[-N].db`; cualquier otro nombre no es un respaldo.
fn entrada(nombre: &str) -> Option<Entrada> {
    let reemplazo = nombre.strip_prefix(PREFIJO_REEMPLAZO);
    let (seguridad, resto) = match (reemplazo, nombre.strip_prefix(PREFIJO_SEGURIDAD)) {
        (Some(r), _) | (_, Some(r)) => (true, r),
        _ => (false, nombre.strip_prefix(PREFIJO)?),
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

fn volcar(conn: &Connection, dir: &Path, prefijo: &str, sello: &str) -> Result<String, Fallo> {
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

/// Borra los temporales que dejó un respaldo o un `.boldo` interrumpido. Se llama al iniciar, cuando ninguno está en curso.
pub fn limpiar_parciales(dir: &Path) {
    let temporal = format!(".db{SUFIJO_TEMPORAL}");
    for e in fs::read_dir(dir).into_iter().flatten().flatten() {
        let nombre = e.file_name().to_string_lossy().into_owned();
        // solo los temporales propios (`boldo-….db.tmp`, con su diario de SQLite), nunca otro .tmp de la carpeta
        let base = ["-journal", "-wal", "-shm"]
            .iter()
            .find_map(|s| nombre.strip_suffix(s))
            .unwrap_or(&nombre);
        if nombre.starts_with(PREFIJO) && base.ends_with(&temporal) {
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

fn revision(ruta: &Path) -> Option<i64> {
    let c = Connection::open_with_flags(ruta, OpenFlags::SQLITE_OPEN_READ_ONLY).ok()?;
    c.query_row(
        "SELECT CAST(valor AS INTEGER) FROM meta WHERE clave = 'data_revision'",
        [],
        |f| f.get(0),
    )
    .ok()
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
            let s = &e.sello;
            Some(Respaldo {
                fecha: format!(
                    "{}-{}-{}T{}:{}",
                    &s[..4],
                    &s[4..6],
                    &s[6..8],
                    &s[9..11],
                    &s[11..]
                ),
                bytes,
                legible: revision.is_some(),
                revision,
                seguridad: e.seguridad,
                reemplazo: e.reemplazo,
                nombre: e.nombre,
            })
        })
        .collect())
}

fn con_sufijo(ruta: &Path, sufijo: &str) -> PathBuf {
    let mut s = ruta.as_os_str().to_owned();
    s.push(sufijo);
    s.into()
}

/// Borra el archivo y sus -wal/-shm/-journal, si existen.
pub fn borrar_bd(ruta: &Path) -> std::io::Result<()> {
    for p in [
        con_sufijo(ruta, "-wal"),
        con_sufijo(ruta, "-shm"),
        con_sufijo(ruta, "-journal"),
        ruta.into(),
    ] {
        match fs::remove_file(p) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e),
            _ => {}
        }
    }
    Ok(())
}

/// Reemplaza la base por el respaldo `nombre` (uno de `listar`). Si algo falla, la base actual queda como estaba.
pub fn restaurar(
    conexion: &mut Option<Connection>,
    bd: &Path,
    dir: &Path,
    nombre: &str,
    migraciones: &[&str],
) -> Result<(), Fallo> {
    // solo nombres de la lista: nunca una ruta que venga de la interfaz
    if !entradas(dir)?.iter().any(|e| e.nombre == nombre) {
        return Err(Fallo::de("desconocido", nombre));
    }
    let origen = dir.join(nombre);
    let danado = |e: rusqlite::Error| Fallo::de("danado", e);
    {
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
        let version: i64 = c
            .pragma_query_value(None, "user_version", |f| f.get(0))
            .map_err(danado)?;
        if version > migraciones.len() as i64 {
            return Err(Fallo::de("esquema_nuevo", version));
        }
    }
    cambiar_base(conexion, bd, dir, &origen, migraciones, PREFIJO_SEGURIDAD)
}

/// Reemplaza la base por `origen`, ya revisado, con el respaldo previo a reemplazar: lo usa «Reemplazar todo» al importar.
pub fn reemplazar_antes_respaldando(
    conexion: &mut Option<Connection>,
    bd: &Path,
    dir: &Path,
    origen: &Path,
    migraciones: &[&str],
) -> Result<(), Fallo> {
    cambiar_base(conexion, bd, dir, origen, migraciones, PREFIJO_REEMPLAZO)
}

fn cambiar_base(
    conexion: &mut Option<Connection>,
    bd: &Path,
    dir: &Path,
    origen: &Path,
    migraciones: &[&str],
    prefijo_seguridad: &str,
) -> Result<(), Fallo> {
    // Se prepara (y migra) una copia aparte: la base actual no se toca hasta el reemplazo final.
    let copia = bd.with_extension("restaurando");
    let mut reemplazar = || -> Result<(), Fallo> {
        borrar_bd(&copia)?;
        fs::copy(origen, &copia)?;
        let mut c = db::abrir(&copia)?;
        db::migrar_con(&mut c, migraciones, dir)?;
        db::asegurar_meta(&c)?;
        c.close().map_err(|(_, e)| e)?;

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
    use db::MIGRACIONES;

    fn base(dir: &Path) -> (PathBuf, PathBuf, Connection) {
        let respaldos = dir.join("respaldos");
        fs::create_dir_all(&respaldos).unwrap();
        let bd = dir.join("boldo.db");
        let mut conn = db::abrir(&bd).unwrap();
        db::migrar(&mut conn, &respaldos).unwrap();
        db::asegurar_meta(&conn).unwrap();
        (bd, respaldos, conn)
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
        limpiar_parciales(&respaldos);
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

    #[test]
    fn poda_solo_los_respaldos_propios() {
        let dir = tempfile::tempdir().unwrap();
        let (_, respaldos, conn) = base(dir.path());
        let ajenos = [
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
        let (bd, respaldos, conn) = base(dir.path());
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
            let err = restaurar(&mut slot, &bd, &respaldos, malo, MIGRACIONES).unwrap_err();
            assert_eq!(err.codigo, "desconocido", "{malo}");
        }
        assert_eq!(revision(slot.as_ref().unwrap()), 0);
    }

    #[test]
    fn restaurar_vuelve_al_respaldo_sin_reaplicar_el_wal_viejo() {
        let dir = tempfile::tempdir().unwrap();
        let (bd, respaldos, mut conn) = base(dir.path());
        escribir(&mut conn, 1);
        let nombre = respaldar(&conn, &respaldos, "20260101-0900").unwrap();
        escribir(&mut conn, 3);
        // los cambios posteriores al respaldo viven en el WAL de la base actual
        let wal = dir.path().join("boldo.db-wal");
        assert!(fs::metadata(&wal).unwrap().len() > 0);
        let mut slot = Some(conn);
        restaurar(&mut slot, &bd, &respaldos, &nombre, MIGRACIONES).unwrap();
        // tras el éxito la conexión queda cerrada: nada escribe en la base restaurada antes del reinicio
        assert!(slot.is_none());
        assert_eq!(revision(&db::abrir(&bd).unwrap()), 1);
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
        let (bd, respaldos, conn) = base(dir.path());
        let nombre = respaldar(&conn, &respaldos, "20260101-0900").unwrap();
        let dos = [MIGRACIONES[0], "CREATE TABLE extra (x INTEGER);"];
        let mut slot = Some(conn);
        restaurar(&mut slot, &bd, &respaldos, &nombre, &dos).unwrap();
        assert!(slot.is_none());
        let c = db::abrir(&bd).unwrap();
        let v: i64 = c
            .pragma_query_value(None, "user_version", |f| f.get(0))
            .unwrap();
        assert_eq!(v, 2);
        c.execute("INSERT INTO extra VALUES (1)", []).unwrap();
    }

    #[test]
    fn restaurar_que_falla_al_migrar_deja_la_base_intacta() {
        let dir = tempfile::tempdir().unwrap();
        let (bd, respaldos, mut conn) = base(dir.path());
        let nombre = respaldar(&conn, &respaldos, "20260101-0900").unwrap();
        escribir(&mut conn, 2);
        let rota = [MIGRACIONES[0], "ESTO NO ES SQL;"];
        let mut slot = Some(conn);
        let err = restaurar(&mut slot, &bd, &respaldos, &nombre, &rota).unwrap_err();
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
        let (bd, respaldos, mut conn) = base(dir.path());
        let nombre = respaldar(&conn, &respaldos, "20260101-0900").unwrap();
        Connection::open(respaldos.join(&nombre))
            .unwrap()
            .pragma_update(None, "user_version", 99)
            .unwrap();
        escribir(&mut conn, 2);
        let mut slot = Some(conn);
        let err = restaurar(&mut slot, &bd, &respaldos, &nombre, MIGRACIONES).unwrap_err();
        assert_eq!(err.codigo, "esquema_nuevo");
        assert_eq!(revision(slot.as_ref().unwrap()), 2);
        assert!(listar(&respaldos).unwrap().iter().all(|r| !r.seguridad));
    }

    #[test]
    fn restaurar_rechaza_respaldo_danado() {
        let dir = tempfile::tempdir().unwrap();
        let (bd, respaldos, mut conn) = base(dir.path());
        escribir(&mut conn, 2);
        fs::write(respaldos.join("boldo-20250101-0000.db"), "no soy sqlite").unwrap();
        let mut slot = Some(conn);
        let err = restaurar(
            &mut slot,
            &bd,
            &respaldos,
            "boldo-20250101-0000.db",
            MIGRACIONES,
        )
        .unwrap_err();
        assert_eq!(err.codigo, "danado");
        // un archivo vacío pasa quick_check (SQLite lo ve como base vacía) pero no es un respaldo
        fs::write(respaldos.join("boldo-20240101-0000.db"), "").unwrap();
        let err = restaurar(
            &mut slot,
            &bd,
            &respaldos,
            "boldo-20240101-0000.db",
            MIGRACIONES,
        )
        .unwrap_err();
        assert_eq!(err.codigo, "danado");
        assert_eq!(revision(slot.as_ref().unwrap()), 2);
    }

    #[test]
    fn restaurar_con_otra_instancia_abierta_no_toca_la_base() {
        let dir = tempfile::tempdir().unwrap();
        let (bd, respaldos, mut conn) = base(dir.path());
        let nombre = respaldar(&conn, &respaldos, "20260101-0900").unwrap();
        escribir(&mut conn, 3);
        let otra = db::abrir(&bd).unwrap();
        assert_eq!(revision(&otra), 3);
        let mut slot = Some(conn);
        let err = restaurar(&mut slot, &bd, &respaldos, &nombre, MIGRACIONES).unwrap_err();
        assert_eq!(err.codigo, "en_uso");
        assert_eq!(revision(slot.as_ref().unwrap()), 3);
        assert_eq!(revision(&otra), 3);
        // un intento fallido no deja una copia «antes de restaurar» suelta
        assert!(listar(&respaldos).unwrap().iter().all(|r| !r.seguridad));
    }
}
