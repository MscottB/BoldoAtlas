//! Lo que lleva cada exportación: la copia de toda la base, o la misma copia sin lo que queda fuera de las ramas elegidas.
use super::Temporal;
use super::validar::RamaExportada;
use crate::respaldos::Fallo;
use rusqlite::Connection;
use serde::Serialize;
use std::path::Path;

/// Cada tabla de negocio con lo que se conserva en una copia parcial, en orden: cada regla ve la tabla anterior ya
/// recortada. `alc` son las unidades vivas de las ramas elegidas. En una copia parcial no van filas eliminadas: quien
/// exporta no las ve, salvo los valores de mantenedor desactivados que una fila viva sigue usando.
pub const PODA: &[(&str, &str)] = &[
    ("unidades", "id IN alc"),
    ("puestos", "deleted_at IS NULL AND unidad_id IN alc"),
    (
        "asignaciones",
        "deleted_at IS NULL AND puesto_id IN (SELECT id FROM puestos)
         AND trabajador_id IN (SELECT id FROM trabajadores WHERE deleted_at IS NULL)",
    ),
    (
        "trabajadores",
        "id IN (SELECT trabajador_id FROM asignaciones)",
    ),
    (
        "conexiones",
        "deleted_at IS NULL AND origen_id IN alc AND destino_id IN alc",
    ),
    (
        "unidad_etiquetas",
        "deleted_at IS NULL AND unidad_id IN alc",
    ),
    (
        "etiquetas",
        "id IN (SELECT etiqueta_id FROM unidad_etiquetas)",
    ),
    ("procesos", "deleted_at IS NULL AND unidad_id IN alc"),
    (
        "actividades",
        "deleted_at IS NULL AND proceso_id IN (SELECT id FROM procesos)",
    ),
    (
        "actividad_roles",
        "deleted_at IS NULL AND actividad_id IN (SELECT id FROM actividades)",
    ),
    (
        "subarboles_guardados",
        "deleted_at IS NULL AND unidad_id IN alc",
    ),
    (
        "vistas",
        "deleted_at IS NULL AND arbol_id IN (SELECT id FROM subarboles_guardados)",
    ),
    ("tipos_unidad", "id IN (SELECT tipo_id FROM unidades)"),
    ("cargos", "id IN (SELECT cargo_id FROM puestos)"),
    ("leyendas", "id IN (SELECT leyenda_id FROM puestos)"),
    (
        "tipos_contrato",
        "id IN (SELECT tipo_contrato_id FROM trabajadores)",
    ),
    ("sedes", "id IN (SELECT sede_id FROM trabajadores)"),
    ("jornadas", "id IN (SELECT jornada_id FROM trabajadores)"),
];

#[derive(Debug, Default, Serialize, PartialEq)]
pub struct Cortes {
    pub conexiones: i64,
    pub jefaturas: i64,
    pub roles: i64,
    pub vistas: i64,
}

#[derive(Debug, Serialize)]
pub struct Cuenta {
    pub tabla: &'static str,
    pub filas: i64,
}

#[derive(Debug, Serialize)]
pub struct ResumenExportacion {
    pub parcial: bool,
    pub filas: Vec<Cuenta>,
    pub cortes: Cortes,
}

fn volcar(conn: &Connection, datos: &Path, etiqueta: &str) -> Result<Temporal, Fallo> {
    // nada de archivos temporales de SQLite fuera de datos/
    conn.pragma_update(None, "temp_store", "MEMORY")?;
    let t = Temporal::nuevo(datos, etiqueta);
    conn.execute("VACUUM INTO ?1", [t.ruta().to_string_lossy()])?;
    Ok(t)
}

/// La copia de toda la base. Con la conexión de la app: el resto se hace sobre la copia, sin bloquear la base.
pub fn copiar(conn: &Connection, datos: &Path) -> Result<Temporal, Fallo> {
    volcar(conn, datos, "exportando")
}

fn poner_meta(c: &Connection, alcance: &str, ramas: &[RamaExportada]) -> Result<(), Fallo> {
    let raices = serde_json::to_string(ramas).map_err(|e| e.to_string())?;
    c.execute(
        "INSERT OR REPLACE INTO meta (clave, valor) VALUES
           ('alcance', ?1), ('raices', ?2),
           ('origen_db_id', (SELECT valor FROM meta WHERE clave = 'db_id'))",
        [alcance, &raices],
    )?;
    Ok(())
}

fn contar(c: &Connection, sql: &str) -> Result<i64, Fallo> {
    Ok(c.query_row(sql, [], |f| f.get(0))?)
}

fn cuentas(c: &Connection) -> Result<Vec<Cuenta>, Fallo> {
    PODA.iter()
        .map(|(tabla, _)| {
            let sql = format!("SELECT count(*) FROM {tabla} WHERE deleted_at IS NULL");
            Ok(Cuenta {
                tabla,
                filas: contar(c, &sql)?,
            })
        })
        .collect()
}

/// Deja en la copia solo las ramas de `raices` y devuelve lo que queda. El resultado es otro archivo: las filas borradas
/// de una base siguen legibles en sus páginas libres, y no deben viajar.
fn recortar(copia: Temporal, datos: &Path, raices: &[String]) -> Result<(Temporal, Cortes), Fallo> {
    let mut c = Connection::open(copia.ruta())?;
    c.pragma_update(None, "temp_store", "MEMORY")?;
    let tx = c.transaction()?;
    tx.execute_batch("CREATE TEMP TABLE elegidas (id TEXT PRIMARY KEY);")?;
    for r in raices {
        tx.execute("INSERT OR IGNORE INTO elegidas VALUES (?1)", [r])?;
    }
    let vivas = contar(
        &tx,
        "SELECT count(*) FROM unidades WHERE deleted_at IS NULL AND id IN elegidas",
    )?;
    if raices.is_empty() || vivas != contar(&tx, "SELECT count(*) FROM elegidas")? {
        return Err(Fallo::de("desconocido", ""));
    }
    tx.execute_batch(
        "CREATE TEMP TABLE alc AS
           WITH RECURSIVE r(id) AS (
             SELECT id FROM elegidas
             UNION SELECT u.id FROM unidades u JOIN r ON u.parent_id = r.id WHERE u.deleted_at IS NULL
           ) SELECT id FROM r;",
    )?;
    // marcar una unidad y también otra de su rama es una sola rama
    let ramas: Vec<RamaExportada> = tx
        .prepare(
            "SELECT id, parent_id FROM unidades
             WHERE id IN elegidas AND (parent_id IS NULL OR parent_id NOT IN alc)",
        )?
        .query_map([], |f| {
            Ok(RamaExportada {
                id: f.get(0)?,
                padre: f.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<_>>()?;

    let mut cortes = Cortes {
        conexiones: contar(
            &tx,
            "SELECT count(*) FROM conexiones WHERE deleted_at IS NULL
             AND (origen_id IN alc) <> (destino_id IN alc)",
        )?,
        vistas: contar(
            &tx,
            "SELECT count(*) FROM vistas WHERE deleted_at IS NULL AND arbol_id IS NULL",
        )?,
        ..Default::default()
    };
    for (tabla, conservar) in PODA {
        tx.execute(
            &format!(
                "DELETE FROM {tabla} WHERE id NOT IN (SELECT id FROM {tabla} WHERE {conservar})"
            ),
            [],
        )?;
    }
    cortes.jefaturas = tx.execute(
        "UPDATE unidades SET jefe_puesto_id = NULL
         WHERE jefe_puesto_id IS NOT NULL AND jefe_puesto_id NOT IN (SELECT id FROM puestos)",
        [],
    )? as i64;
    cortes.roles = tx.execute(
        "DELETE FROM actividad_roles WHERE trabajador_id NOT IN (SELECT id FROM trabajadores)",
        [],
    )? as i64;
    tx.execute(
        "UPDATE unidades SET parent_id = NULL WHERE parent_id IS NOT NULL AND parent_id NOT IN alc",
        [],
    )?;
    poner_meta(&tx, "parcial", &ramas)?;
    // si esto falla es un error de estas reglas: nunca se entrega una copia con referencias rotas
    if contar(&tx, "SELECT count(*) FROM pragma_foreign_key_check")? != 0 {
        return Err(Fallo::de("fallo", "referencias"));
    }
    tx.commit()?;
    let limpia = volcar(&c, datos, "exportando")?;
    c.close().map_err(|(_, e)| e)?;
    Ok((limpia, cortes))
}

/// Prepara lo que se va a cifrar: `raices` None es toda la base.
pub fn preparar(
    copia: Temporal,
    datos: &Path,
    raices: Option<&[String]>,
) -> Result<(Temporal, ResumenExportacion), Fallo> {
    let (temporal, cortes) = match raices {
        Some(r) => recortar(copia, datos, r)?,
        None => {
            poner_meta(&Connection::open(copia.ruta())?, "completo", &[])?;
            (copia, Cortes::default())
        }
    };
    let filas = cuentas(&Connection::open(temporal.ruta())?)?;
    Ok((
        temporal,
        ResumenExportacion {
            parcial: raices.is_some(),
            filas,
            cortes,
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::super::prueba::*;
    use super::*;
    use crate::db;
    use crate::intercambio::validar;
    use std::collections::BTreeSet;

    #[test]
    fn toda_tabla_de_negocio_tiene_regla_de_poda() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(db::MIGRACIONES.join("\n").as_str())
            .unwrap();
        let reales: BTreeSet<String> = c
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name <> 'meta'")
            .unwrap()
            .query_map([], |f| f.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        let con_regla: BTreeSet<String> = PODA.iter().map(|(t, _)| t.to_string()).collect();
        assert_eq!(
            reales, con_regla,
            "una tabla nueva debe decidir qué lleva una exportación parcial"
        );
    }

    #[test]
    fn una_rama_lleva_lo_suyo_y_corta_lo_que_apunta_afuera() {
        let (dir, conn) = base_con_datos();
        let datos = dir.path();
        let copia = copiar(&conn, datos).unwrap();
        let (t, resumen) = preparar(copia, datos, Some(&["rama".into()])).unwrap();
        validar::revisar(t.ruta(), db::MIGRACIONES).unwrap();
        let c = Connection::open(t.ruta()).unwrap();
        let ids = |tabla: &str| -> Vec<String> {
            c.prepare(&format!("SELECT id FROM {tabla} ORDER BY id"))
                .unwrap()
                .query_map([], |f| f.get(0))
                .unwrap()
                .map(Result::unwrap)
                .collect()
        };
        assert_eq!(ids("unidades"), ["hija", "rama"]);
        assert_eq!(ids("puestos"), ["p-hija", "p-rama"]);
        assert_eq!(ids("trabajadores"), ["ana", "bruno"]);
        assert_eq!(ids("cargos"), ["cargo-a"]);
        assert_eq!(ids("sedes"), ["sede-a"]);
        assert_eq!(ids("leyendas"), ["ley-a"]);
        assert_eq!(ids("etiquetas"), ["et-a"]);
        assert_eq!(ids("unidad_etiquetas"), ["ue-a"]);
        assert_eq!(ids("conexiones"), ["x-dentro"]);
        assert_eq!(ids("procesos"), ["pr-a"]);
        assert_eq!(ids("actividades"), ["ac-a"]);
        assert_eq!(ids("actividad_roles"), ["rol-dentro"]);
        assert_eq!(ids("subarboles_guardados"), ["sub-a"]);
        assert_eq!(ids("vistas"), ["vis-sub"]);
        assert_eq!(ids("tipos_unidad"), [TIPO]);
        assert_eq!(
            resumen.cortes,
            Cortes {
                conexiones: 1,
                jefaturas: 1,
                roles: 1,
                vistas: 1,
            }
        );
        let jefe: Option<String> = c
            .query_row(
                "SELECT jefe_puesto_id FROM unidades WHERE id = 'rama'",
                [],
                |f| f.get(0),
            )
            .unwrap();
        assert_eq!(jefe, None);
        let meta: Vec<String> = c
            .prepare(
                "SELECT valor FROM meta WHERE clave IN ('alcance', 'raices', 'origen_db_id') ORDER BY clave",
            )
            .unwrap()
            .query_map([], |f| f.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert_eq!(meta[0], "parcial");
        assert_eq!(meta[1].len(), 36, "db_id de origen");
        assert_eq!(meta[2], r#"[{"id":"rama","padre":"raiz"}]"#);
    }

    #[test]
    fn lo_que_queda_fuera_no_se_puede_recuperar_de_la_copia() {
        let (dir, conn) = base_con_datos();
        let copia = copiar(&conn, dir.path()).unwrap();
        let bytes_antes = std::fs::read(copia.ruta()).unwrap();
        assert!(contiene(&bytes_antes, b"PersonaFuera"));
        let (t, _) = preparar(copia, dir.path(), Some(&["rama".into()])).unwrap();
        let b = std::fs::read(t.ruta()).unwrap();
        for secreto in [
            &b"PersonaFuera"[..],
            b"fuera@x.cl",
            b"PersonaBorrada",
            b"UnidadFuera",
        ] {
            assert!(
                !contiene(&b, secreto),
                "{}",
                String::from_utf8_lossy(secreto)
            );
        }
        assert!(contiene(&b, b"Ana"));
    }

    #[test]
    fn marcar_una_unidad_y_otra_de_su_rama_es_una_sola_rama() {
        let (dir, conn) = base_con_datos();
        let copia = copiar(&conn, dir.path()).unwrap();
        let (t, _) = preparar(copia, dir.path(), Some(&["hija".into(), "rama".into()])).unwrap();
        let c = validar::solo_lectura(t.ruta()).unwrap();
        let m = validar::leer_meta(&c).unwrap();
        assert_eq!(m.ramas.len(), 1);
        assert_eq!(m.ramas[0].id, "rama");
    }

    #[test]
    fn rechaza_unidades_que_no_estan_o_estan_eliminadas() {
        let (dir, conn) = base_con_datos();
        for malas in [
            vec![],
            vec!["nadie".to_string()],
            vec!["borrada".to_string()],
        ] {
            let copia = copiar(&conn, dir.path()).unwrap();
            let e = preparar(copia, dir.path(), Some(&malas)).unwrap_err();
            assert_eq!(e.codigo, "desconocido", "{malas:?}");
        }
    }

    #[test]
    fn la_copia_completa_lo_lleva_todo_y_no_corta_nada() {
        let (dir, conn) = base_con_datos();
        let copia = copiar(&conn, dir.path()).unwrap();
        let (t, resumen) = preparar(copia, dir.path(), None).unwrap();
        validar::revisar(t.ruta(), db::MIGRACIONES).unwrap();
        assert!(!resumen.parcial);
        assert_eq!(resumen.cortes, Cortes::default());
        let b = std::fs::read(t.ruta()).unwrap();
        assert!(contiene(&b, b"PersonaFuera") && contiene(&b, b"PersonaBorrada"));
    }
}
