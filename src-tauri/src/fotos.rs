//! Las fotos de las personas ya no se guardan en la app de escritorio: viven solo en la edición web. Aquí está lo que las
//! quita de una base (también de su historial) y la compactación que no deja sus bytes escondidos en el archivo.

use crate::comandos::Estado;
use crate::intercambio::Sesiones;
use crate::intercambio::validar::{abrir_no_confiable, solo_lectura_cerrada};
use crate::organizaciones::{Lista, base_de, bloquear};
use crate::respaldos::{self, Fallo};
use crate::rutas::Rutas;
use rusqlite::{Connection, OpenFlags, TransactionBehavior};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

/// Queda en `meta` si las fotos ya se quitaron pero la compactación no pudo terminar: sus bytes siguen en el archivo y el
/// arranque siguiente lo tiene que volver a intentar.
const POR_COMPACTAR: &str = "fotos_por_compactar";

/// Lo que el arranque encontró con fotos: los nombres de las organizaciones y cuántos respaldos.
#[derive(Debug, Serialize, PartialEq)]
pub struct Pendientes {
    pub organizaciones: Vec<String>,
    pub respaldos: u32,
}

/// Una base de antes del historial no tiene esas tablas: ahí solo se miran las personas.
fn tiene_historial(c: &Connection) -> rusqlite::Result<bool> {
    c.query_row(
        "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'historial_filas')",
        [],
        |f| f.get(0),
    )
}

/// Quita todas las fotos de las personas y de su historial, y compacta. Devuelve cuántas personas tenían foto.
/// Trabaja sin acción abierta: no anota nada en el historial. Si la compactación falla dos veces, el archivo queda marcado
/// (`POR_COMPACTAR`) y devuelve el error.
pub fn quitar(c: &mut Connection) -> Result<u64, Fallo> {
    let historial = tiene_historial(c)?;
    let tx = c.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let quitadas = tx.execute(
        "UPDATE trabajadores SET foto_png = NULL WHERE foto_png IS NOT NULL",
        [],
    )? as u64;
    if historial {
        // las filas con foto, anotadas antes de vaciarlas: solo lo que se vació aquí se puede borrar después
        tx.execute_batch(
            "CREATE TEMP TABLE foto_filas AS SELECT accion_id, orden FROM historial_filas
             WHERE tabla = 'trabajadores' AND (json_extract(antes, '$.foto_png') IS NOT NULL
                                                OR json_extract(despues, '$.foto_png') IS NOT NULL);
             UPDATE historial_filas SET antes = json_remove(antes, '$.foto_png'), despues = json_remove(despues, '$.foto_png')
             WHERE (accion_id, orden) IN (SELECT accion_id, orden FROM foto_filas);
             DELETE FROM historial_filas WHERE op = 'update' AND COALESCE(antes, '{}') = '{}' AND COALESCE(despues, '{}') = '{}'
               AND (accion_id, orden) IN (SELECT accion_id, orden FROM foto_filas);
             DELETE FROM historial_acciones WHERE id IN (SELECT accion_id FROM foto_filas)
               AND id NOT IN (SELECT accion_id FROM historial_filas);
             DROP TABLE foto_filas;",
        )?;
    }
    tx.commit()?;
    // la marca se quita antes de compactar: así no queda un valor suelto en el archivo ya compacto
    let _ = c.execute("DELETE FROM meta WHERE clave = ?1", [POR_COMPACTAR]);
    // una vez más: lo habitual es otra conexión leyendo un instante
    compactar(c).or_else(|_| compactar(c)).map_err(|e| {
        let _ = c.execute(
            "INSERT OR REPLACE INTO meta (clave, valor) VALUES (?1, '1')",
            [POR_COMPACTAR],
        );
        Fallo::from(e)
    })?;
    Ok(quitadas)
}

/// Si queda alguna foto en las personas o en su historial.
pub fn hay(c: &Connection) -> Result<bool, Fallo> {
    if c.query_row(
        "SELECT EXISTS (SELECT 1 FROM trabajadores WHERE foto_png IS NOT NULL)",
        [],
        |f| f.get(0),
    )? {
        return Ok(true);
    }
    if !tiene_historial(c)? {
        return Ok(false);
    }
    Ok(c.query_row(
        "SELECT EXISTS (SELECT 1 FROM historial_filas WHERE tabla = 'trabajadores'
                        AND (json_extract(antes, '$.foto_png') IS NOT NULL
                             OR json_extract(despues, '$.foto_png') IS NOT NULL))",
        [],
        |f| f.get(0),
    )?)
}

/// `hay`, o una compactación que quedó a medias.
pub fn pendiente(c: &Connection) -> Result<bool, Fallo> {
    if hay(c)? {
        return Ok(true);
    }
    Ok(c.query_row(
        "SELECT EXISTS (SELECT 1 FROM meta WHERE clave = ?1)",
        [POR_COMPACTAR],
        |f| f.get(0),
    )
    .unwrap_or(false))
}

/// Cada archivo que puede tener fotos: la base de cada organización de la lista y sus respaldos. `(organización, es el
/// archivo de la organización, ruta)`; solo los que existen.
fn archivos(r: &Rutas, l: &Lista) -> Vec<(usize, bool, PathBuf)> {
    let mut v = Vec::new();
    for (i, e) in l.organizaciones.iter().enumerate() {
        let base = base_de(r, e);
        if base.bd.is_file() {
            v.push((i, true, base.bd));
        }
        for b in respaldos::listar(&base.respaldos).unwrap_or_default() {
            v.push((i, false, base.respaldos.join(b.nombre)));
        }
    }
    v
}

/// Qué tiene fotos, sin escribir nada. Un archivo que no se puede leer cuenta: no se sabe que no las tenga.
pub fn pendientes(r: &Rutas, l: &Lista) -> Pendientes {
    let mut p = Pendientes {
        organizaciones: Vec::new(),
        respaldos: 0,
    };
    for (i, es_base, ruta) in archivos(r, l) {
        let con = solo_lectura_cerrada(&ruta)
            .and_then(|c| pendiente(&c))
            .unwrap_or(true);
        if !con {
            continue;
        }
        if es_base {
            let e = &l.organizaciones[i];
            p.organizaciones.push(if e.nombre.is_empty() {
                e.id.clone()
            } else {
                e.nombre.clone()
            });
        } else {
            p.respaldos += 1;
        }
    }
    p
}

/// Limpia todo lo de `pendientes`. `abierta` es la organización con su conexión, que se usa tal cual; la de `lado` no se toca.
/// Un archivo que falla no detiene a los demás: sigue contando en `pendientes`. `avance(hechos, total)` devuelve si seguir.
pub fn quitar_todas(
    r: &Rutas,
    l: &Lista,
    mut abierta: Option<(&str, &mut Connection)>,
    lado: Option<&str>,
    mut avance: impl FnMut(u32, u32) -> bool,
) -> Result<u64, Fallo> {
    let todos = archivos(r, l);
    let total = todos.len() as u32;
    let mut quitadas = 0;
    for (hecho, (i, es_base, ruta)) in todos.into_iter().enumerate() {
        if !avance(hecho as u32, total) {
            return Err(Fallo::de("cancelado", ""));
        }
        let id = l.organizaciones[i].id.as_str();
        if es_base && lado == Some(id) {
            continue;
        }
        let limpia = match abierta.as_mut() {
            Some((abierta_id, c)) if es_base && *abierta_id == id => limpiar(c),
            _ => limpiar_archivo(&ruta, es_base),
        };
        quitadas += limpia.unwrap_or(0);
    }
    avance(total, total);
    Ok(quitadas)
}

fn limpiar(c: &mut Connection) -> Result<u64, Fallo> {
    if pendiente(c)? { quitar(c) } else { Ok(0) }
}

/// Abre el archivo para escribir. El de una organización, con su bloqueo: si otra copia de la app lo tiene, no se toca.
fn limpiar_archivo(ruta: &Path, es_base: bool) -> Result<u64, Fallo> {
    let _bloqueo = if es_base {
        Some(bloquear(ruta, Duration::ZERO)?)
    } else {
        None
    };
    let mut c = abrir_no_confiable(ruta, OpenFlags::SQLITE_OPEN_READ_WRITE)?;
    limpiar(&mut c)
}

/// Fuera del hilo de la ventana: abre muchos archivos.
#[tauri::command(async)]
pub fn fotos_pendientes(estado: State<Estado>) -> Result<Pendientes, Fallo> {
    Ok(pendientes(estado.rutas()?, &estado.lista_leida()?))
}

#[derive(Clone, Serialize)]
struct Avance {
    hechos: u32,
    total: u32,
}

/// Quita las fotos de todas las organizaciones y respaldos. Sigue el trabajo `trabajo`: si se cancela, se detiene.
#[tauri::command]
pub async fn fotos_quitar_todas(app: AppHandle, trabajo: String) -> Result<u64, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let (estado, sesiones) = (app.state::<Estado>(), app.state::<Sesiones>());
        sesiones.empezar(&trabajo)?;
        let (r, lista) = (estado.rutas()?, estado.lista_leida()?);
        let lado = app.state::<crate::lado::Lado>().id();
        let avance = |hechos, total| {
            let _ = app.emit("fotos-avance", Avance { hechos, total });
            sesiones.sigue(&trabajo)
        };
        let resultado = match estado.base_abierta() {
            Some(b) => estado.con_conexion(&b.id, |c| {
                quitar_todas(r, &lista, Some((&b.id, c)), lado.as_deref(), avance)
            }),
            None => quitar_todas(r, &lista, None, lado.as_deref(), avance),
        };
        sesiones.cancelar(&trabajo);
        resultado
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Si la organización abierta tiene fotos: un archivo externo se mira al abrirlo.
#[tauri::command(async)]
pub fn fotos_hay(estado: State<Estado>, base_id: String) -> Result<bool, Fallo> {
    estado.con_conexion(&base_id, |c| pendiente(c))
}

/// Quita las fotos de la organización abierta. Devuelve cuántas personas tenían.
#[tauri::command(async)]
pub fn fotos_quitar(estado: State<Estado>, base_id: String) -> Result<u64, Fallo> {
    estado.con_conexion(&base_id, quitar)
}

/// Sin esto, lo que ocupaban las fotos queda como páginas libres y el archivo de la base no baja de tamaño. Con WAL, el
/// VACUUM queda en el -wal: solo el checkpoint recorta el archivo.
pub(crate) fn compactar(c: &Connection) -> rusqlite::Result<()> {
    c.execute_batch("VACUUM")?;
    // `busy` = 1 si algo lo impidió (otra conexión leyendo): el WAL sigue con los datos y no se puede dar por compactado
    let ocupado: i64 = c.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |f| f.get(0))?;
    if ocupado != 0 {
        return Err(rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_BUSY),
            Some("wal_checkpoint no terminó".into()),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use base64::Engine;
    use base64::engine::general_purpose::STANDARD;

    const MARCA: &str = "FOTO-27C-MARCA";

    fn migrada() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.pragma_update(None, "recursive_triggers", "ON").unwrap();
        c.execute_batch(&db::MIGRACIONES.join("\n")).unwrap();
        c
    }

    fn cuenta(c: &Connection, sql: &str) -> i64 {
        c.query_row(sql, [], |f| f.get(0)).unwrap()
    }

    /// Ana con foto y dos acciones: una cambia nombre y foto, la otra solo la foto.
    fn con_historial(c: &Connection, foto: &str) {
        c.execute(
            "INSERT INTO trabajadores (id, nombre, foto_png, created_at, updated_at) VALUES ('ana', 'Ana', ?1, 'x', 'x')",
            [foto],
        )
        .unwrap();
        for sql in [
            "UPDATE trabajadores SET nombre = 'Ana B', foto_png = 'f2' WHERE id = 'ana'",
            "UPDATE trabajadores SET foto_png = 'f3' WHERE id = 'ana'",
        ] {
            let accion = crate::historial::abrir_accion(c, "app", &serde_json::json!({})).unwrap();
            c.execute(sql, []).unwrap();
            crate::historial::cerrar_accion(c, &accion).unwrap();
        }
    }

    #[test]
    fn quitar_vacia_personas_e_historial() {
        let mut c = migrada();
        con_historial(&c, "f1");
        assert!(hay(&c).unwrap());
        assert_eq!(quitar(&mut c).unwrap(), 1);
        assert_eq!(
            cuenta(
                &c,
                "SELECT count(*) FROM trabajadores WHERE foto_png IS NOT NULL"
            ),
            0
        );
        assert!(!hay(&c).unwrap());
        assert_eq!(cuenta(&c, "SELECT count(*) FROM historial_acciones"), 1);
        let (antes, despues): (String, String) = c
            .query_row(
                "SELECT antes, despues FROM historial_filas WHERE tabla = 'trabajadores'",
                [],
                |f| Ok((f.get(0)?, f.get(1)?)),
            )
            .unwrap();
        assert_eq!(antes, r#"{"nombre":"Ana"}"#);
        assert_eq!(despues, r#"{"nombre":"Ana B"}"#);
    }

    #[test]
    fn quitar_no_deja_los_bytes_en_el_archivo() {
        let dir = tempfile::tempdir().unwrap();
        let ruta = dir.path().join("b.db");
        let mut c = db::abrir(&ruta).unwrap();
        c.execute_batch(&db::MIGRACIONES.join("\n")).unwrap();
        let foto = STANDARD.encode(MARCA);
        con_historial(&c, &foto);
        // la prueba no vale si la foto nunca llegó al archivo
        c.query_row("PRAGMA wal_checkpoint(PASSIVE)", [], |_| Ok(()))
            .unwrap();
        let en = |archivo: &std::path::Path| std::fs::read(archivo).unwrap_or_default();
        let esta = |b: &[u8], x: &str| b.windows(x.len()).any(|w| w == x.as_bytes());
        let (db_, wal) = (en(&ruta), en(&dir.path().join("b.db-wal")));
        assert!(
            esta(&db_, &foto) || esta(&wal, &foto),
            "la foto no estaba antes"
        );
        quitar(&mut c).unwrap();
        for archivo in [ruta, dir.path().join("b.db-wal")] {
            let bytes = std::fs::read(&archivo).unwrap_or_default();
            for buscado in [MARCA, foto.as_str()] {
                assert!(
                    !bytes
                        .windows(buscado.len())
                        .any(|w| w == buscado.as_bytes()),
                    "{archivo:?} guarda {buscado}"
                );
            }
        }
    }

    #[test]
    fn quitar_no_borra_filas_que_ya_estaban_vacias() {
        let mut c = migrada();
        c.execute_batch(
            "INSERT INTO historial_acciones (id, fecha, origen) VALUES ('sup', 'x', 'suprimir');
             INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
               VALUES ('sup', 1, 'trabajadores', 'ana', 'update', '{}', '{}');",
        )
        .unwrap();
        con_historial(&c, "f1");
        quitar(&mut c).unwrap();
        assert_eq!(
            cuenta(
                &c,
                "SELECT count(*) FROM historial_filas WHERE accion_id = 'sup'"
            ),
            1
        );
        assert_eq!(cuenta(&c, "SELECT count(*) FROM historial_acciones"), 2);
    }

    #[test]
    fn quitar_sin_fotos_no_cambia_nada() {
        let mut c = migrada();
        c.execute(
            "INSERT INTO trabajadores (id, nombre, created_at, updated_at) VALUES ('ana', 'Ana', 'x', 'x')",
            [],
        )
        .unwrap();
        assert_eq!(quitar(&mut c).unwrap(), 0);
        assert_eq!(cuenta(&c, "SELECT count(*) FROM historial_acciones"), 0);
        assert!(!hay(&c).unwrap());
    }

    #[test]
    fn lote_rechaza_foto_png() {
        let mut c = migrada();
        c.execute(
            "INSERT INTO trabajadores (id, nombre, created_at, updated_at) VALUES ('ana', 'Ana', 'x', 'x')",
            [],
        )
        .unwrap();
        for sql in [
            "UPDATE trabajadores SET foto_png = 'x'",
            "UPDATE trabajadores SET FOTO_PNG = 'x'",
        ] {
            let s = [db::Sentencia {
                sql: sql.into(),
                params: vec![],
            }];
            assert_eq!(db::lote(&mut c, &s, "t").unwrap_err(), "foto_no_permitida");
        }
        assert_eq!(
            cuenta(
                &c,
                "SELECT count(*) FROM trabajadores WHERE foto_png IS NOT NULL"
            ),
            0
        );
        assert_eq!(cuenta(&c, "SELECT count(*) FROM historial_acciones"), 0);
    }

    #[test]
    fn compactar_baja_el_tamano_del_archivo_aun_con_wal() {
        let dir = tempfile::tempdir().unwrap();
        let ruta = dir.path().join("b.db");
        let c = db::abrir(&ruta).unwrap();
        c.execute_batch("CREATE TABLE trabajadores (id TEXT PRIMARY KEY, foto_png TEXT);")
            .unwrap();
        c.execute(
            "INSERT INTO trabajadores VALUES ('a', ?1)",
            ["x".repeat(4_000_000)],
        )
        .unwrap();
        c.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()))
            .unwrap();
        let antes = std::fs::metadata(&ruta).unwrap().len();
        c.execute("UPDATE trabajadores SET foto_png = 'y'", [])
            .unwrap();
        compactar(&c).unwrap();
        assert!(std::fs::metadata(&ruta).unwrap().len() < antes / 10);
    }

    #[test]
    fn compactar_falla_si_el_checkpoint_no_pudo_terminar() {
        let dir = tempfile::tempdir().unwrap();
        let ruta = dir.path().join("b.db");
        let c = db::abrir(&ruta).unwrap();
        c.execute_batch("CREATE TABLE t (x TEXT); INSERT INTO t VALUES ('a');")
            .unwrap();
        // un lector con la transacción abierta impide recortar el WAL
        let lector = db::abrir(&ruta).unwrap();
        lector.execute_batch("BEGIN; SELECT * FROM t;").unwrap();
        c.execute("INSERT INTO t VALUES ('b')", []).unwrap();
        c.busy_timeout(std::time::Duration::from_millis(50))
            .unwrap();
        assert!(compactar(&c).is_err());
        lector.execute_batch("COMMIT").unwrap();
        compactar(&c).unwrap();
    }

    /// Una base con foto en `ruta`, ya cerrada.
    fn base_con_foto(ruta: &std::path::Path, nombre: &str) {
        let carpeta = ruta.parent().unwrap();
        std::fs::create_dir_all(carpeta).unwrap();
        let mut c = db::abrir(ruta).unwrap();
        db::migrar_con(&mut c, db::MIGRACIONES, carpeta).unwrap();
        db::asegurar_meta(&c).unwrap();
        c.execute(
            "INSERT OR REPLACE INTO meta (clave, valor) VALUES ('org_nombre', ?1)",
            [nombre],
        )
        .unwrap();
        c.execute(
            "INSERT INTO trabajadores (id, nombre, foto_png, created_at, updated_at) VALUES ('ana', 'Ana', 'F', 'x', 'x')",
            [],
        )
        .unwrap();
        c.close().unwrap();
    }

    /// Dos organizaciones: la primera con foto y dos respaldos con foto, la segunda sin fotos.
    fn dos_organizaciones() -> (tempfile::TempDir, Rutas, Lista) {
        let (exe, r) = crate::organizaciones::prueba::rutas();
        let con = crate::organizaciones::prueba::interna(&r, "2026");
        let sin = crate::organizaciones::prueba::interna(&r, "2026");
        let b_con = base_de(&r, &con);
        // `interna` deja una base sin fotos: la primera se rehace con foto
        std::fs::remove_file(&b_con.bd).unwrap();
        base_con_foto(&b_con.bd, "Con fotos");
        std::fs::create_dir_all(&b_con.respaldos).unwrap();
        for sello in ["20260101-0900", "20260102-0900"] {
            let c = db::abrir(&b_con.bd).unwrap();
            respaldos::respaldar(&c, &b_con.respaldos, sello).unwrap();
        }
        crate::organizaciones::prueba::escribir(&r, vec![con, sin]);
        let l = crate::organizaciones::cargar_lista(&r);
        (exe, r, l)
    }

    #[test]
    fn pendientes_cuenta_organizaciones_y_respaldos() {
        let (_exe, r, l) = dos_organizaciones();
        let p = pendientes(&r, &l);
        assert_eq!(p.organizaciones, [l.organizaciones[0].nombre.clone()]);
        assert_eq!(p.respaldos, 2);
    }

    /// Nombre, tamaño y fecha de modificación de cada archivo bajo `dir`.
    fn estampas(dir: &std::path::Path) -> Vec<(PathBuf, u64, std::time::SystemTime)> {
        let mut v = Vec::new();
        let mut por_ver = vec![dir.to_path_buf()];
        while let Some(d) = por_ver.pop() {
            for e in std::fs::read_dir(d).unwrap() {
                let e = e.unwrap();
                let m = e.metadata().unwrap();
                if m.is_dir() {
                    por_ver.push(e.path());
                } else {
                    v.push((e.path(), m.len(), m.modified().unwrap()));
                }
            }
        }
        v.sort();
        v
    }

    #[test]
    fn pendientes_no_escribe_y_quitar_salta_la_de_al_lado() {
        let (_exe, r, l) = dos_organizaciones();
        let antes = estampas(&r.datos);
        assert_eq!(pendientes(&r, &l).respaldos, 2);
        assert_eq!(estampas(&r.datos), antes);
        // la de al lado no se escribe; sus respaldos sí
        let lado = l.organizaciones[0].id.clone();
        quitar_todas(&r, &l, None, Some(&lado), |_, _| true).unwrap();
        let base = base_de(&r, &l.organizaciones[0]);
        let de_la_base = |v: &[(PathBuf, u64, std::time::SystemTime)]| {
            v.iter().find(|(p, ..)| *p == base.bd).cloned().unwrap()
        };
        assert_eq!(de_la_base(&estampas(&r.datos)), de_la_base(&antes));
        let p = pendientes(&r, &l);
        assert_eq!((p.organizaciones.len(), p.respaldos), (1, 0));
    }

    #[test]
    fn quitar_todas_sigue_si_un_respaldo_falla() {
        let (_exe, r, l) = dos_organizaciones();
        let base = base_de(&r, &l.organizaciones[0]);
        let malo = base.respaldos.join("boldo-20250101-0000.db");
        std::fs::write(&malo, "no soy sqlite").unwrap();
        let mut avances = Vec::new();
        let n = quitar_todas(&r, &l, None, None, |h, t| {
            avances.push((h, t));
            true
        })
        .unwrap();
        assert_eq!(n, 3);
        assert_eq!(std::fs::read(&malo).unwrap(), b"no soy sqlite");
        let p = pendientes(&r, &l);
        assert_eq!((p.organizaciones.len(), p.respaldos), (0, 1));
        assert_eq!(avances.last(), Some(&(5, 5)));
    }

    #[test]
    fn quitar_todas_usa_la_conexion_abierta_y_se_puede_cancelar() {
        let (_exe, r, l) = dos_organizaciones();
        let base = base_de(&r, &l.organizaciones[0]);
        let mut c = db::abrir(&base.bd).unwrap();
        let id = l.organizaciones[0].id.clone();
        let e = quitar_todas(&r, &l, Some((&id, &mut c)), None, |h, _| h == 0).unwrap_err();
        assert_eq!(e.codigo, "cancelado");
        quitar_todas(&r, &l, Some((&id, &mut c)), None, |_, _| true).unwrap();
        assert!(!hay(&c).unwrap());
    }

    #[test]
    fn si_la_compactacion_falla_el_archivo_sigue_pendiente() {
        let dir = tempfile::tempdir().unwrap();
        let ruta = dir.path().join("b.db");
        base_con_foto(&ruta, "X");
        let mut c = db::abrir(&ruta).unwrap();
        // un lector con la transacción abierta impide recortar el WAL
        let lector = db::abrir(&ruta).unwrap();
        lector
            .execute_batch("BEGIN; SELECT * FROM trabajadores;")
            .unwrap();
        c.busy_timeout(std::time::Duration::from_millis(50))
            .unwrap();
        assert!(quitar(&mut c).is_err());
        // las fotos ya no están, pero el archivo no se da por limpio
        assert!(!hay(&c).unwrap());
        assert!(pendiente(&c).unwrap());
        lector.execute_batch("COMMIT").unwrap();
        assert_eq!(quitar(&mut c).unwrap(), 0);
        assert!(!pendiente(&c).unwrap());
    }

    #[test]
    fn una_base_de_antes_del_historial_se_limpia() {
        let mut c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE trabajadores (id TEXT PRIMARY KEY, foto_png TEXT);
             CREATE TABLE meta (clave TEXT PRIMARY KEY, valor TEXT);
             INSERT INTO trabajadores VALUES ('a', 'F');",
        )
        .unwrap();
        assert!(hay(&c).unwrap());
        assert_eq!(quitar(&mut c).unwrap(), 1);
        assert!(!pendiente(&c).unwrap());
    }
}
