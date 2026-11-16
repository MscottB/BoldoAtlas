//! Borrado definitivo de una persona: la fila queda vacía (decisión 3) y su id se anota en `meta.suprimidas`.
//! Así los respaldos viejos y los `.boldo` no la traen de vuelta (decisiones 5 a 7).

use crate::respaldos::Fallo;
use rusqlite::{Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};

const CLAVE: &str = "suprimidas";
/// El nombre que queda si no hay otra suprimida de donde tomar el que puso la app.
pub const RELLENO: &str = "Persona suprimida";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Suprimida {
    pub id: String,
    pub fecha: String,
}

/// Lista vacía si no hay clave o el JSON no se entiende; un error de SQL sí se propaga.
pub fn leer(conn: &Connection) -> Result<Vec<Suprimida>, Fallo> {
    let texto: Option<String> = conn
        .query_row("SELECT valor FROM meta WHERE clave = ?1", [CLAVE], |f| {
            f.get(0)
        })
        .optional()?;
    Ok(texto
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default())
}

/// Suma a `meta.suprimidas` las que aún no estén. Se llama dentro de una transacción.
fn anotar(conn: &Connection, nuevas: &[Suprimida]) -> Result<(), Fallo> {
    let mut lista = leer(conn)?;
    let antes = lista.len();
    for n in nuevas {
        if !lista.iter().any(|s| s.id == n.id) {
            lista.push(n.clone());
        }
    }
    if lista.len() == antes {
        return Ok(());
    }
    let json = serde_json::to_string(&lista).map_err(|e| Fallo::de("fallo", e))?;
    conn.execute(
        "INSERT INTO meta (clave, valor) VALUES (?1, ?2)
         ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
        (CLAVE, json),
    )?;
    Ok(())
}

/// Todo en una transacción. Repetirla no falla ni duplica: conserva la fecha de la primera vez.
/// Si el id no tiene fila en `trabajadores`, no hace nada.
pub fn suprimir(conn: &mut Connection, id: &str, relleno: &str, fecha: &str) -> Result<(), Fallo> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let existe: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM trabajadores WHERE id = ?1)",
        [id],
        |f| f.get(0),
    )?;
    if !existe {
        return Ok(());
    }
    tx.execute(
        "UPDATE trabajadores SET nombre = ?2, correo = NULL, telefono = NULL, tipo_contrato_id = NULL,
             sede_id = NULL, jornada_id = NULL, foto_png = NULL, notas = NULL,
             deleted_at = COALESCE(deleted_at, ?3), updated_at = ?3
         WHERE id = ?1",
        (id, relleno, fecha),
    )?;
    tx.execute(
        "UPDATE asignaciones SET motivo = NULL, deleted_at = COALESCE(deleted_at, ?2), updated_at = ?2
         WHERE trabajador_id = ?1",
        (id, fecha),
    )?;
    anotar(
        &tx,
        &[Suprimida {
            id: id.to_string(),
            fecha: fecha.to_string(),
        }],
    )?;
    tx.execute(
        "UPDATE meta SET valor = CAST(CAST(valor AS INTEGER) + 1 AS TEXT) WHERE clave = 'data_revision'",
        [],
    )?;
    Ok(tx.commit()?)
}

/// Lo que se puso en lugar del nombre de la primera suprimida que tenga fila; `None` si no hay ninguna.
pub fn relleno_de(conn: &Connection, previas: &[Suprimida]) -> Result<Option<String>, Fallo> {
    for p in previas {
        let nombre = conn
            .query_row(
                "SELECT nombre FROM trabajadores WHERE id = ?1",
                [&p.id],
                |f| f.get(0),
            )
            .optional()?;
        if nombre.is_some() {
            return Ok(nombre);
        }
    }
    Ok(None)
}

/// Después de restaurar o reemplazar: vuelve a suprimir a las de la base que se fue si su fila existe en la nueva, y une
/// las listas (también los ids sin fila: si llegan después por otra vía, siguen reconocidos).
pub fn reaplicar(conn: &mut Connection, previas: &[Suprimida], relleno: &str) -> Result<(), Fallo> {
    for p in previas {
        suprimir(conn, &p.id, relleno, &p.fecha)?;
    }
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    anotar(&tx, previas)?;
    Ok(tx.commit()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    const RELLENO: &str = "Persona suprimida";
    const FECHA: &str = "2026-11-15T12:00:00.000Z";

    fn base() -> (tempfile::TempDir, std::path::PathBuf, Connection) {
        let dir = tempfile::tempdir().unwrap();
        let ruta = dir.path().join("boldo.db");
        let mut c = db::abrir(&ruta).unwrap();
        db::migrar(&mut c, dir.path()).unwrap();
        db::asegurar_meta(&c).unwrap();
        (dir, ruta, c)
    }

    /// Una persona completa con una asignación que trae motivo.
    fn persona(c: &Connection, id: &str, nombre: &str, correo: &str, notas: &str) {
        c.execute(
            "INSERT INTO trabajadores (id, nombre, correo, telefono, foto_png, notas, created_at, updated_at)
             VALUES (?1, ?2, ?3, '+56 9 1111 2222', 'Zm90bw==', ?4, 'x', 'x')",
            (id, nombre, correo, notas),
        )
        .unwrap();
        c.execute_batch(
            "INSERT OR IGNORE INTO unidades (id, tipo_id, nombre, created_at, updated_at)
               VALUES ('u1', '00000000-0000-7000-8000-000000000001', 'U', 'x', 'x');
             INSERT OR IGNORE INTO cargos (id, nombre, created_at, updated_at) VALUES ('c1', 'C', 'x', 'x');
             INSERT OR IGNORE INTO puestos (id, unidad_id, cargo_id, created_at, updated_at)
               VALUES ('p1', 'u1', 'c1', 'x', 'x');",
        )
        .unwrap();
        c.execute(
            "INSERT INTO asignaciones (id, trabajador_id, puesto_id, tipo, desde, motivo, created_at, updated_at)
             VALUES (?1, ?2, 'p1', 'titular', '2026-01-01', 'motivo privado', 'x', 'x')",
            (format!("a-{id}"), id),
        )
        .unwrap();
    }

    #[test]
    fn suprimir_vacia_la_fila_y_conserva_asignaciones() {
        let (_d, _r, mut c) = base();
        persona(&c, "t1", "Ana Pérez", "ana@x.cl", "notas");
        suprimir(&mut c, "t1", RELLENO, FECHA).unwrap();
        let (nombre, nulos, borrada): (String, i64, Option<String>) = c
            .query_row(
                "SELECT nombre, (correo IS NULL) + (telefono IS NULL) + (tipo_contrato_id IS NULL) + (sede_id IS NULL)
                        + (jornada_id IS NULL) + (foto_png IS NULL) + (notas IS NULL), deleted_at
                 FROM trabajadores WHERE id = 't1'",
                [],
                |f| Ok((f.get(0)?, f.get(1)?, f.get(2)?)),
            )
            .unwrap();
        assert_eq!(nombre, RELLENO);
        assert_eq!(nulos, 7);
        assert!(borrada.is_some());
        let (motivo, borrada): (Option<String>, Option<String>) = c
            .query_row(
                "SELECT motivo, deleted_at FROM asignaciones WHERE trabajador_id = 't1'",
                [],
                |f| Ok((f.get(0)?, f.get(1)?)),
            )
            .unwrap();
        assert!(motivo.is_none());
        assert!(borrada.is_some());
    }

    #[test]
    fn suprimir_anota_en_meta() {
        let (_d, _r, mut c) = base();
        persona(&c, "t1", "Ana", "a@x.cl", "n");
        suprimir(&mut c, "t1", RELLENO, FECHA).unwrap();
        assert_eq!(
            leer(&c).unwrap(),
            vec![Suprimida {
                id: "t1".into(),
                fecha: FECHA.into()
            }]
        );
    }

    #[test]
    fn suprimir_dos_veces_no_duplica() {
        let (_d, _r, mut c) = base();
        persona(&c, "t1", "Ana", "a@x.cl", "n");
        suprimir(&mut c, "t1", RELLENO, FECHA).unwrap();
        suprimir(&mut c, "t1", RELLENO, "2027-01-01T00:00:00.000Z").unwrap();
        let l = leer(&c).unwrap();
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].fecha, FECHA);
    }

    #[test]
    fn el_archivo_no_guarda_los_datos() {
        let (_d, ruta, mut c) = base();
        persona(
            &c,
            "t1",
            "Zacarías Únicoapellido",
            "zz-unico@ejemplo.cl",
            "nota-secreta-123",
        );
        suprimir(&mut c, "t1", RELLENO, FECHA).unwrap();
        crate::fotos::compactar(&c).unwrap();
        let archivos = [ruta.clone(), ruta.with_file_name("boldo.db-wal")];
        for a in archivos.iter().filter(|a| a.exists()) {
            let bytes = std::fs::read(a).unwrap();
            for texto in [
                "Zacarías Únicoapellido",
                "zz-unico@ejemplo.cl",
                "nota-secreta-123",
            ] {
                assert!(
                    !bytes.windows(texto.len()).any(|w| w == texto.as_bytes()),
                    "{texto} sigue en {a:?}"
                );
            }
        }
    }

    #[test]
    fn reaplicar_vuelve_a_suprimir() {
        let (_d, _r, mut c) = base();
        persona(&c, "t1", "Ana", "a@x.cl", "n");
        let previas = vec![
            Suprimida {
                id: "t1".into(),
                fecha: FECHA.into(),
            },
            Suprimida {
                id: "no-existe".into(),
                fecha: FECHA.into(),
            },
        ];
        reaplicar(&mut c, &previas, RELLENO).unwrap();
        let nombre: String = c
            .query_row("SELECT nombre FROM trabajadores WHERE id = 't1'", [], |f| {
                f.get(0)
            })
            .unwrap();
        assert_eq!(nombre, RELLENO);
        // también el id sin fila: si llega después por otra vía, sigue reconocido como suprimido
        assert_eq!(leer(&c).unwrap(), previas);
    }

    #[test]
    fn reaplicar_une_con_lo_que_ya_tenia_la_base_nueva() {
        let (_d, _r, mut c) = base();
        persona(&c, "t1", "Ana", "a@x.cl", "n");
        c.execute("INSERT INTO trabajadores (id, nombre, created_at, updated_at) VALUES ('t2', 'Beto', 'x', 'x')", [])
            .unwrap();
        suprimir(&mut c, "t2", RELLENO, FECHA).unwrap();
        let previas = vec![Suprimida {
            id: "t1".into(),
            fecha: "2026-10-01T00:00:00.000Z".into(),
        }];
        reaplicar(&mut c, &previas, RELLENO).unwrap();
        let ids: Vec<String> = leer(&c).unwrap().into_iter().map(|s| s.id).collect();
        assert_eq!(ids, ["t2", "t1"]);
    }

    #[test]
    fn leer_propaga_un_error_de_sql_en_vez_de_dar_lista_vacia() {
        let (_d, _r, c) = base();
        c.execute_batch("DROP TABLE meta; CREATE TABLE meta (clave TEXT);")
            .unwrap();
        assert!(leer(&c).is_err());
    }

    #[test]
    fn leer_da_lista_vacia_sin_clave_o_con_json_ilegible() {
        let (_d, _r, c) = base();
        assert!(leer(&c).unwrap().is_empty());
        c.execute(
            "INSERT INTO meta (clave, valor) VALUES ('suprimidas', 'no es json')",
            [],
        )
        .unwrap();
        assert!(leer(&c).unwrap().is_empty());
    }

    #[test]
    fn suprimir_un_id_que_no_existe_no_anota_ni_sube_la_revision() {
        let (_d, _r, mut c) = base();
        let rev = |c: &Connection| -> String {
            c.query_row(
                "SELECT valor FROM meta WHERE clave = 'data_revision'",
                [],
                |f| f.get(0),
            )
            .unwrap()
        };
        let antes = rev(&c);
        suprimir(&mut c, "fantasma", RELLENO, FECHA).unwrap();
        assert!(leer(&c).unwrap().is_empty());
        assert_eq!(rev(&c), antes);
    }

    fn revision(c: &Connection) -> i64 {
        c.query_row(
            "SELECT CAST(valor AS INTEGER) FROM meta WHERE clave = 'data_revision'",
            [],
            |f| f.get(0),
        )
        .unwrap()
    }

    #[test]
    fn suprimir_a_alguien_ya_eliminado_conserva_su_fecha_de_eliminacion() {
        let (_d, _r, mut c) = base();
        persona(&c, "t1", "Ana", "a@x.cl", "n");
        let antes = "2026-10-01T00:00:00.000Z";
        c.execute_batch(&format!(
            "UPDATE trabajadores SET deleted_at = '{antes}' WHERE id = 't1';
             UPDATE asignaciones SET deleted_at = '{antes}' WHERE trabajador_id = 't1';"
        ))
        .unwrap();
        let rev = revision(&c);
        suprimir(&mut c, "t1", RELLENO, FECHA).unwrap();
        let (borrada, actualizada): (String, String) = c
            .query_row(
                "SELECT deleted_at, updated_at FROM trabajadores WHERE id = 't1'",
                [],
                |f| Ok((f.get(0)?, f.get(1)?)),
            )
            .unwrap();
        assert_eq!(borrada, antes);
        assert_eq!(actualizada, FECHA);
        let (motivo, borrada): (Option<String>, String) = c
            .query_row(
                "SELECT motivo, deleted_at FROM asignaciones WHERE trabajador_id = 't1'",
                [],
                |f| Ok((f.get(0)?, f.get(1)?)),
            )
            .unwrap();
        assert!(motivo.is_none());
        assert_eq!(borrada, antes);
        assert_eq!(leer(&c).unwrap()[0].fecha, FECHA);
        assert_eq!(revision(&c), rev + 1);
    }

    #[test]
    fn suprimir_trata_todas_las_asignaciones_de_la_persona() {
        let (_d, _r, mut c) = base();
        persona(&c, "t1", "Ana", "a@x.cl", "n");
        c.execute_batch(
            "INSERT INTO trabajadores (id, nombre, created_at, updated_at) VALUES ('t2', 'Beto', 'x', 'x');
             INSERT INTO puestos (id, unidad_id, cargo_id, created_at, updated_at) VALUES ('p2', 'u1', 'c1', 'x', 'x');
             INSERT INTO asignaciones (id, trabajador_id, puesto_id, tipo, desde, motivo, created_at, updated_at)
               VALUES ('a-t2', 't2', 'p2', 'titular', '2026-01-01', 'motivo de Beto', 'x', 'x');",
        )
        .unwrap();
        let antes = "2026-10-01T00:00:00.000Z";
        c.execute_batch(&format!(
            "INSERT INTO asignaciones (id, trabajador_id, puesto_id, tipo, desde, hasta, motivo, created_at, updated_at)
               VALUES ('a-fin', 't1', 'p1', 'titular', '2020-01-01', '2020-12-31', 'motivo fin', 'x', 'x');
             INSERT INTO asignaciones (id, trabajador_id, puesto_id, tipo, desde, motivo, deleted_at, created_at, updated_at)
               VALUES ('a-borrada', 't1', 'p1', 'titular', '2019-01-01', 'motivo borrada', '{antes}', 'x', 'x');"
        ))
        .unwrap();
        suprimir(&mut c, "t1", RELLENO, FECHA).unwrap();
        let filas = |id: &str| -> Vec<(String, Option<String>, Option<String>)> {
            c.prepare(
                "SELECT id, motivo, deleted_at FROM asignaciones WHERE trabajador_id = ?1 ORDER BY id",
            )
            .unwrap()
            .query_map([id], |f| Ok((f.get(0)?, f.get(1)?, f.get(2)?)))
            .unwrap()
            .map(Result::unwrap)
            .collect()
        };
        let de_t1 = filas("t1");
        assert_eq!(de_t1.len(), 3);
        assert!(de_t1.iter().all(|(_, motivo, _)| motivo.is_none()));
        let borrada = |id: &str| de_t1.iter().find(|f| f.0 == id).unwrap().2.clone();
        // vigente y terminada quedan eliminadas ahora; la que ya estaba eliminada conserva su fecha
        assert_eq!(borrada("a-t1").as_deref(), Some(FECHA));
        assert_eq!(borrada("a-fin").as_deref(), Some(FECHA));
        assert_eq!(borrada("a-borrada").as_deref(), Some(antes));
        // otra persona: intacta
        let de_t2 = filas("t2");
        assert_eq!(de_t2.len(), 1);
        assert!(de_t2[0].1.is_some() && de_t2[0].2.is_none());
    }
}
