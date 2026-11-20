//! Las fotos de las personas ya no se guardan en la app de escritorio: viven solo en la edición web. Aquí está lo que las
//! quita de una base (también de su historial) y la compactación que no deja sus bytes escondidos en el archivo.

use crate::respaldos::Fallo;
use rusqlite::{Connection, TransactionBehavior};

/// Quita todas las fotos de las personas y de su historial, y compacta. Devuelve cuántas personas tenían foto.
/// Trabaja sin acción abierta: no anota nada en el historial.
// sin quien la llame hasta la Task 2 (arranque, abrir, importar y restaurar)
#[allow(dead_code)]
pub fn quitar(c: &mut Connection) -> Result<u64, Fallo> {
    let tx = c.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let quitadas = tx.execute(
        "UPDATE trabajadores SET foto_png = NULL WHERE foto_png IS NOT NULL",
        [],
    )? as u64;
    tx.execute(
        "UPDATE historial_filas SET antes = json_remove(antes, '$.foto_png'), despues = json_remove(despues, '$.foto_png')
         WHERE tabla = 'trabajadores' AND (json_extract(antes, '$.foto_png') IS NOT NULL
                                            OR json_extract(despues, '$.foto_png') IS NOT NULL)",
        [],
    )?;
    // un cambio que solo tocó la foto ya no cambia nada
    tx.execute(
        "DELETE FROM historial_filas WHERE tabla = 'trabajadores' AND op = 'update'
           AND COALESCE(antes, '{}') = '{}' AND COALESCE(despues, '{}') = '{}'",
        [],
    )?;
    tx.execute(
        "DELETE FROM historial_acciones WHERE id NOT IN (SELECT accion_id FROM historial_filas)",
        [],
    )?;
    tx.commit()?;
    compactar(c)?;
    Ok(quitadas)
}

/// Si queda alguna foto en las personas o en su historial.
#[allow(dead_code)]
pub fn hay(c: &Connection) -> Result<bool, Fallo> {
    Ok(c.query_row(
        "SELECT EXISTS (SELECT 1 FROM trabajadores WHERE foto_png IS NOT NULL)
             OR EXISTS (SELECT 1 FROM historial_filas WHERE tabla = 'trabajadores'
                        AND (json_extract(antes, '$.foto_png') IS NOT NULL
                             OR json_extract(despues, '$.foto_png') IS NOT NULL))",
        [],
        |f| f.get(0),
    )?)
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
        quitar(&mut c).unwrap();
        for archivo in [ruta, dir.path().join("b.db-wal")] {
            let bytes = std::fs::read(&archivo).unwrap_or_default();
            for buscado in [MARCA, foto.as_str()] {
                assert!(
                    !bytes.windows(buscado.len()).any(|w| w == buscado.as_bytes()),
                    "{archivo:?} guarda {buscado}"
                );
            }
        }
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
}
