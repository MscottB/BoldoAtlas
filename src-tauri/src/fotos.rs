//! Las fotos de las personas ya no se guardan en la app de escritorio: viven solo en la edición web. Aquí está lo que las
//! quita de una base (también de su historial) y la compactación que no deja sus bytes escondidos en el archivo.

use crate::comandos::Estado;
use crate::intercambio::Sesiones;
use crate::intercambio::validar::{abrir_no_confiable, para_leer, solo_lectura_cerrada};
use crate::organizaciones::{ELIMINADAS, Lista, base_de, bloquear, nombres_eliminadas};
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
/// Trabaja sin acción abierta: no anota nada en el historial. El archivo queda marcado (`POR_COMPACTAR`) hasta que la
/// compactación termina: si falla dos veces, devuelve el error y sigue marcado.
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
             DELETE FROM historial_filas WHERE op = 'update'
               AND COALESCE(json_remove(antes, '$.updated_at'), '{}') = '{}'
               AND COALESCE(json_remove(despues, '$.updated_at'), '{}') = '{}'
               AND (accion_id, orden) IN (SELECT accion_id, orden FROM foto_filas);
             DELETE FROM historial_acciones WHERE id IN (SELECT accion_id FROM foto_filas)
               AND id NOT IN (SELECT accion_id FROM historial_filas);
             DROP TABLE foto_filas;",
        )?;
    }
    // la marca va en la misma transacción que la limpieza: si la app muere compactando, o la compactación falla, ya está en el
    // archivo y el arranque siguiente lo vuelve a intentar
    tx.execute(
        "INSERT OR REPLACE INTO meta (clave, valor) VALUES (?1, '1')",
        [POR_COMPACTAR],
    )?;
    tx.commit()?;
    // una vez más: lo habitual es otra conexión leyendo un instante
    compactar(c).or_else(|_| compactar(c))?;
    c.execute("DELETE FROM meta WHERE clave = ?1", [POR_COMPACTAR])?;
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

/// Cada archivo que puede tener fotos y que la app abre sola: la base de cada organización de la lista que está en `datos`
/// (`Some(posición)`), y sus respaldos y las copias de organizaciones eliminadas (`None`). Una externa puede estar en una unidad
/// de red o quitada y colgar el arranque: su base se mira al abrirla (`fotos_hay`). Solo los que existen; los nombres, sin abrir
/// ningún archivo.
fn archivos(r: &Rutas, l: &Lista) -> Vec<(Option<usize>, PathBuf)> {
    let mut v = Vec::new();
    for (i, e) in l.organizaciones.iter().enumerate() {
        let base = base_de(r, e);
        if !e.externa && base.bd.is_file() {
            v.push((Some(i), base.bd));
        }
        for n in respaldos::nombres(&base.respaldos) {
            v.push((None, base.respaldos.join(n)));
        }
    }
    let carpeta = r.datos.join(ELIMINADAS);
    for n in nombres_eliminadas(r) {
        v.push((None, carpeta.join(n)));
    }
    v
}

/// Qué tiene fotos, sin escribir nada: las copias de organizaciones eliminadas cuentan con los respaldos. Un archivo que no se
/// puede leer cuenta: no se sabe que no las tenga.
pub fn pendientes(r: &Rutas, l: &Lista) -> Pendientes {
    let mut p = Pendientes {
        organizaciones: Vec::new(),
        respaldos: 0,
    };
    for (org, ruta) in archivos(r, l) {
        // `para_leer`: con `-wal` y sin `-shm`, SQLite crearía el `-shm` al lado
        let con = para_leer(&ruta, &r.datos)
            .and_then(|leida| solo_lectura_cerrada(leida.ruta()))
            .and_then(|c| pendiente(&c))
            .unwrap_or(true);
        if !con {
            continue;
        }
        match org {
            Some(i) => {
                let e = &l.organizaciones[i];
                p.organizaciones.push(if e.nombre.is_empty() {
                    e.id.clone()
                } else {
                    e.nombre.clone()
                });
            }
            None => p.respaldos += 1,
        }
    }
    p
}

/// El id de la organización abierta y cómo limpiarla.
pub type Abierta<'a> = (&'a str, &'a mut dyn FnMut() -> Result<u64, Fallo>);

/// Lo que hizo `quitar_todas`: cuántas personas tenían foto, y los archivos que fallaron (siguen en `pendientes`).
#[derive(Debug, Default)]
pub struct Limpieza {
    pub quitadas: u64,
    pub fallos: Vec<String>,
}

/// Limpia todo lo de `pendientes`. `abierta` es el id de la organización abierta y cómo limpiarla, con su conexión: quien llama
/// la toma solo mientras dura ese paso. La de `lado` no se toca. Un archivo que falla no detiene a los demás.
/// `avance(hechos, total)` devuelve si seguir.
pub fn quitar_todas(
    r: &Rutas,
    l: &Lista,
    mut abierta: Option<Abierta<'_>>,
    lado: Option<&str>,
    mut avance: impl FnMut(u32, u32) -> bool,
) -> Result<Limpieza, Fallo> {
    let todos = archivos(r, l);
    let total = todos.len() as u32;
    let mut resultado = Limpieza::default();
    for (hecho, (org, ruta)) in todos.into_iter().enumerate() {
        if !avance(hecho as u32, total) {
            return Err(Fallo::de("cancelado", ""));
        }
        let id = org.map(|i| l.organizaciones[i].id.as_str());
        if id.is_some() && lado == id {
            continue;
        }
        let limpia = match (abierta.as_mut(), id) {
            (Some((abierta_id, limpiar_abierta)), Some(id)) if *abierta_id == id => {
                limpiar_abierta()
            }
            _ => limpiar_archivo(&ruta, org.is_some()),
        };
        match limpia {
            Ok(n) => resultado.quitadas += n,
            Err(f) => {
                resultado
                    .fallos
                    .push(format!("{}: {} {}", ruta.display(), f.codigo, f.detalle))
            }
        }
    }
    avance(total, total);
    Ok(resultado)
}

/// Quita las fotos si hay, o una compactación pendiente. Sin nada, no escribe ni compacta.
pub(crate) fn limpiar(c: &mut Connection) -> Result<u64, Fallo> {
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

/// Lo que `fotos_quitar_todas` le dice a la ventana: cuántas personas tenían foto y cuántos archivos no se pudieron limpiar.
#[derive(Serialize)]
pub struct Resultado {
    quitadas: u64,
    fallos: u32,
}

/// `empezar` reemplaza el trabajo en curso: esta limpieza no puede cancelar una importación ni su revisión, así que espera.
/// shortcut: entre `ocupada` y `empezar` otro trabajo puede colarse; la ventana no lanza dos a la vez, subir a un solo paso atómico si cambia.
fn reservar(sesiones: &Sesiones, trabajo: &str) -> Result<(), Fallo> {
    if sesiones.ocupada() {
        return Err(Fallo::de("trabajo_en_curso", ""));
    }
    sesiones.empezar(trabajo)
}

/// Quita las fotos de todas las organizaciones y respaldos. Sigue el trabajo `trabajo`: si se cancela, se detiene.
#[tauri::command]
pub async fn fotos_quitar_todas(app: AppHandle, trabajo: String) -> Result<Resultado, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let (estado, sesiones) = (app.state::<Estado>(), app.state::<Sesiones>());
        // antes de empezar: si falla, la sesión no queda ocupada
        let (r, lista) = (estado.rutas()?, estado.lista_leida()?);
        reservar(&sesiones, &trabajo)?;
        let lado = app.state::<crate::lado::Lado>().id();
        let avance = |hechos, total| {
            let _ = app.emit("fotos-avance", Avance { hechos, total });
            sesiones.sigue(&trabajo)
        };
        // la conexión se toma solo mientras se limpia la organización abierta, no todo el trabajo
        let id = estado.base_abierta().map(|b| b.id);
        let mut abierta = || {
            let id = id.as_deref().unwrap_or_default();
            estado.con_conexion(id, limpiar)
        };
        let resultado = quitar_todas(
            r,
            &lista,
            id.as_deref()
                .map(|i| (i, &mut abierta as &mut dyn FnMut() -> _)),
            lado.as_deref(),
            avance,
        );
        sesiones.cancelar(&trabajo);
        let l = resultado?;
        for f in &l.fallos {
            eprintln!("fotos: no se pudo limpiar {f}");
        }
        Ok(Resultado {
            quitadas: l.quitadas,
            fallos: l.fallos.len() as u32,
        })
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
    estado.con_conexion(&base_id, limpiar)
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
        // como el formulario real: `actualizar()` siempre añade updated_at
        for sql in [
            "UPDATE trabajadores SET nombre = 'Ana B', foto_png = 'f2', updated_at = 'y' WHERE id = 'ana'",
            "UPDATE trabajadores SET foto_png = 'f3', updated_at = 'y' WHERE id = 'ana'",
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
        // la acción que solo cambió la foto (y updated_at) se borró; la mixta conserva nombre y updated_at
        assert_eq!(antes, r#"{"nombre":"Ana","updated_at":"x"}"#);
        assert_eq!(despues, r#"{"nombre":"Ana B","updated_at":"y"}"#);
    }

    #[test]
    fn reservar_no_pisa_un_trabajo_en_curso() {
        let s = Sesiones::default();
        s.empezar("importar").unwrap();
        assert_eq!(
            reservar(&s, "fotos").unwrap_err().codigo,
            "trabajo_en_curso"
        );
        assert!(s.sigue("importar"));
        s.cancelar("importar");
        reservar(&s, "fotos").unwrap();
        assert!(s.sigue("fotos"));
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
        let l_ = quitar_todas(&r, &l, None, None, |h, t| {
            avances.push((h, t));
            true
        })
        .unwrap();
        assert_eq!(l_.quitadas, 3);
        assert_eq!(l_.fallos.len(), 1);
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
        let e = quitar_todas(
            &r,
            &l,
            Some((&id, &mut || limpiar(&mut c))),
            None,
            |h, _| h == 0,
        )
        .unwrap_err();
        assert_eq!(e.codigo, "cancelado");
        quitar_todas(
            &r,
            &l,
            Some((&id, &mut || limpiar(&mut c))),
            None,
            |_, _| true,
        )
        .unwrap();
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
        // la marca ya estaba en el archivo antes de compactar
        let marca: i64 = c
            .query_row(
                "SELECT count(*) FROM meta WHERE clave = ?1",
                [POR_COMPACTAR],
                |f| f.get(0),
            )
            .unwrap();
        assert_eq!(marca, 1);
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

    #[test]
    fn una_externa_no_se_cuenta_ni_se_escribe() {
        let (_exe, r, mut l) = dos_organizaciones();
        let afuera = tempfile::tempdir().unwrap();
        let ruta = afuera.path().join("externa.db");
        base_con_foto(&ruta, "Externa");
        let mut e = crate::organizaciones::prueba::entrada(
            &l.organizaciones[1].id,
            &ruta.to_string_lossy(),
            true,
            "2026",
        );
        e.nombre = "Externa".into();
        // la segunda entrada pasa a ser externa
        l.organizaciones[1] = e;
        let antes = estampas(afuera.path());
        let p = pendientes(&r, &l);
        assert_eq!(p.organizaciones, [l.organizaciones[0].nombre.clone()]);
        quitar_todas(&r, &l, None, None, |_, _| true).unwrap();
        assert_eq!(estampas(afuera.path()), antes);
        assert!(hay(&Connection::open(&ruta).unwrap()).unwrap());
    }

    #[test]
    fn las_copias_de_organizaciones_eliminadas_se_cuentan_y_se_limpian() {
        let (_exe, r, l) = dos_organizaciones();
        let c = db::abrir(&base_de(&r, &l.organizaciones[0]).bd).unwrap();
        crate::organizaciones::guardar_eliminada(&r, &l.organizaciones[0], &c).unwrap();
        drop(c);
        assert_eq!(pendientes(&r, &l).respaldos, 3);
        quitar_todas(&r, &l, None, None, |_, _| true).unwrap();
        assert_eq!(pendientes(&r, &l).respaldos, 0);
    }

    #[test]
    fn pendientes_no_deja_un_shm_al_lado_de_un_wal_sin_shm() {
        let (_exe, r, l) = dos_organizaciones();
        let bd = base_de(&r, &l.organizaciones[0]).bd;
        crate::organizaciones::prueba::wal_sin_shm(
            &bd,
            "UPDATE trabajadores SET nombre = 'Ana B' WHERE id = 'ana'",
        );
        let shm = crate::respaldos::con_sufijo(&bd, "-shm");
        assert_eq!(pendientes(&r, &l).organizaciones.len(), 1);
        assert!(!shm.exists());
    }

    #[test]
    fn copiar_a_carpeta_deja_la_organizacion_nueva_sin_fotos() {
        let (_exe, r, l) = dos_organizaciones();
        let origen = base_de(&r, &l.organizaciones[0]).bd;
        assert!(hay(&Connection::open(&origen).unwrap()).unwrap());
        let id =
            crate::organizaciones::copiar_a_carpeta(&r, &origen, None, db::MIGRACIONES).unwrap();
        let c = Connection::open(r.datos.join(crate::organizaciones::ruta_interna(&id))).unwrap();
        assert!(!pendiente(&c).unwrap());
        assert_eq!(
            c.query_row("SELECT count(*) FROM trabajadores", [], |f| f
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
    }

    /// Medición (a mano): cuánto baja el archivo al quitar las fotos de la grande. Trabaja EN SITIO sobre la base que diga
    /// BOLDO_MEDIR_BD: sembrarla antes en una carpeta de prueba, nunca en los datos de la app.
    ///   node scripts/sembrar-grande.mjs <carpeta>/boldo.db --fotos 1000
    ///   BOLDO_MEDIR_BD=<carpeta>/boldo.db cargo test medir_quitar_en_la_grande -- --ignored --nocapture
    #[test]
    #[ignore]
    fn medir_quitar_en_la_grande() {
        let ruta = std::path::PathBuf::from(
            std::env::var("BOLDO_MEDIR_BD").expect("falta BOLDO_MEDIR_BD"),
        );
        let tam = |c: &Connection| {
            let _ = c.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |f| {
                f.get::<_, i64>(0)
            });
            std::fs::metadata(&ruta).unwrap().len()
        };
        let mut c = Connection::open(&ruta).unwrap();
        c.pragma_update(None, "journal_mode", "WAL").unwrap();
        let antes = tam(&c);
        let n = quitar(&mut c).unwrap();
        let despues = tam(&c);
        println!("MEDICION fotos={n} antes={antes} bytes despues={despues} bytes");
    }
}
