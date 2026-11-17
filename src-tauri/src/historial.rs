//! Historial de cambios: los triggers de la migración 0003 anotan antes/después mientras hay una acción abierta.

#[cfg(test)]
mod tests {
    use crate::db;
    use rusqlite::Connection;

    const TIPO: &str = "00000000-0000-7000-8000-000000000001";

    fn base() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.pragma_update(None, "foreign_keys", "ON").unwrap();
        c.pragma_update(None, "recursive_triggers", "ON").unwrap();
        c.execute_batch(&db::MIGRACIONES.join("\n")).unwrap();
        c.execute(
            "INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES ('u1', ?, 'Ventas', 'x', 'x')",
            [TIPO],
        )
        .unwrap();
        c
    }

    fn abrir_accion(c: &Connection) {
        c.execute(
            "INSERT INTO historial_acciones (id, fecha, origen) VALUES ('a1', 'x', 'app')",
            [],
        )
        .unwrap();
        c.execute("UPDATE historial_en_curso SET accion_id = 'a1'", [])
            .unwrap();
    }

    fn filas(c: &Connection) -> Vec<(String, String, Option<String>, Option<String>)> {
        c.prepare("SELECT tabla, op, antes, despues FROM historial_filas ORDER BY orden")
            .unwrap()
            .query_map([], |f| Ok((f.get(0)?, f.get(1)?, f.get(2)?, f.get(3)?)))
            .unwrap()
            .map(Result::unwrap)
            .collect()
    }

    #[test]
    fn toda_tabla_de_negocio_tiene_sus_tres_triggers() {
        let c = base();
        let tablas: Vec<String> = c
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'historial_%'")
            .unwrap()
            .query_map([], |f| f.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert!(tablas.len() > 10);
        for t in tablas {
            let columnas: Vec<String> = c
                .prepare("SELECT name FROM pragma_table_info(?)")
                .unwrap()
                .query_map([&t], |f| f.get(0))
                .unwrap()
                .map(Result::unwrap)
                .collect();
            for op in ["insert", "update", "delete"] {
                let sql: String = c
                    .query_row(
                        "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?",
                        [format!("historial_{t}_{op}")],
                        |f| f.get(0),
                    )
                    .unwrap_or_else(|_| panic!("falta historial_{t}_{op}"));
                for col in &columnas {
                    assert!(sql.contains(col.as_str()), "historial_{t}_{op} no nombra {col}");
                }
            }
        }
    }

    #[test]
    fn sin_accion_abierta_no_anota() {
        let c = base();
        c.execute("UPDATE unidades SET nombre = 'Otro'", []).unwrap();
        assert!(filas(&c).is_empty());
    }

    #[test]
    fn un_update_guarda_solo_lo_que_cambio() {
        let c = base();
        abrir_accion(&c);
        c.execute("UPDATE unidades SET nombre = 'Ventas Norte' WHERE id = 'u1'", [])
            .unwrap();
        let f = filas(&c);
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].1, "update");
        assert_eq!(f[0].2.as_deref(), Some(r#"{"nombre":"Ventas"}"#));
        assert_eq!(f[0].3.as_deref(), Some(r#"{"nombre":"Ventas Norte"}"#));
        c.execute("UPDATE unidades SET nombre = 'V', updated_at = 'y'", [])
            .unwrap();
        assert_eq!(
            filas(&c)[1].3.as_deref(),
            Some(r#"{"nombre":"V","updated_at":"y"}"#)
        );
    }

    #[test]
    fn un_update_sin_cambios_no_anota() {
        let c = base();
        abrir_accion(&c);
        c.execute("UPDATE unidades SET nombre = 'Ventas'", []).unwrap();
        assert!(filas(&c).is_empty());
    }

    #[test]
    fn replace_en_meta_anota_borrado_e_insercion() {
        let c = base();
        c.execute("INSERT INTO meta (clave, valor) VALUES ('org_nombre', 'A')", [])
            .unwrap();
        abrir_accion(&c);
        c.execute("INSERT OR REPLACE INTO meta (clave, valor) VALUES ('org_nombre', 'B')", [])
            .unwrap();
        let f = filas(&c);
        let ops: Vec<&str> = f.iter().map(|x| x.1.as_str()).collect();
        assert_eq!(ops, ["delete", "insert"]);
        assert_eq!(f[0].2.as_deref(), Some(r#"{"clave":"org_nombre","valor":"A"}"#));
        assert_eq!(f[1].3.as_deref(), Some(r#"{"clave":"org_nombre","valor":"B"}"#));
    }

    #[test]
    fn meta_solo_anota_sus_claves() {
        let c = base();
        abrir_accion(&c);
        c.execute("INSERT INTO meta (clave, valor) VALUES ('data_revision', '1')", [])
            .unwrap();
        c.execute("UPDATE meta SET valor = '2' WHERE clave = 'data_revision'", [])
            .unwrap();
        assert!(filas(&c).is_empty());
    }
}
