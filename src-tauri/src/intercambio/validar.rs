//! La base descifrada no es confiable, aunque el código sea correcto: quien la envía puede ser cualquiera.
use crate::respaldos::Fallo;
use rusqlite::config::DbConfig;
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;

fn invalido(detalle: impl ToString) -> Fallo {
    Fallo::de("contenido_invalido", detalle)
}

/// `flags` de solo lectura para revisar y leer; de escritura solo para trabajar sobre la copia temporal.
pub fn abrir_no_confiable(ruta: &Path, flags: OpenFlags) -> Result<Connection, Fallo> {
    let c = Connection::open_with_flags(ruta, flags | OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .map_err(invalido)?;
    for (opcion, valor) in [
        (DbConfig::SQLITE_DBCONFIG_DEFENSIVE, true),
        (DbConfig::SQLITE_DBCONFIG_TRUSTED_SCHEMA, false),
        (DbConfig::SQLITE_DBCONFIG_ENABLE_TRIGGER, false),
        (DbConfig::SQLITE_DBCONFIG_ENABLE_VIEW, false),
    ] {
        c.set_db_config(opcion, valor).map_err(invalido)?;
    }
    Ok(c)
}

pub fn solo_lectura(ruta: &Path) -> Result<Connection, Fallo> {
    abrir_no_confiable(ruta, OpenFlags::SQLITE_OPEN_READ_ONLY)
}

type Objeto = (String, String, String, Option<String>);

fn objetos(c: &Connection) -> rusqlite::Result<Vec<Objeto>> {
    c.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name")?
        .query_map([], |f| Ok((f.get(0)?, f.get(1)?, f.get(2)?, f.get(3)?)))?
        .collect()
}

/// El esquema que esa versión debe tener, salido de las propias migraciones: cualquier trigger, vista, tabla, índice o
/// columna distinta lo hace no coincidir. Es obligatorio antes de reemplazar: esa base pasa a ser la local.
fn revisar_esquema(c: &Connection, migraciones: &[&str]) -> Result<(), Fallo> {
    let esperado = Connection::open_in_memory().map_err(invalido)?;
    for sql in migraciones {
        esperado.execute_batch(sql).map_err(invalido)?;
    }
    if objetos(c).map_err(invalido)? != objetos(&esperado).map_err(invalido)? {
        return Err(invalido("esquema"));
    }
    Ok(())
}

/// SQLite deja guardar cualquier tipo en cualquier columna; la app espera el declarado.
fn revisar_tipos(c: &Connection) -> rusqlite::Result<bool> {
    let tablas: Vec<String> = c
        .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        )?
        .query_map([], |f| f.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    for tabla in tablas {
        let columnas: Vec<(String, String)> = c
            .prepare("SELECT name, type FROM pragma_table_info(?1)")?
            .query_map([&tabla], |f| Ok((f.get(0)?, f.get(1)?)))?
            .collect::<rusqlite::Result<_>>()?;
        for (columna, tipo) in columnas {
            // los nombres ya coinciden con las migraciones: no vienen del archivo
            let sql = format!(
                "SELECT EXISTS (SELECT 1 FROM {tabla} WHERE typeof({columna}) NOT IN ('{}', 'null'))",
                tipo.to_lowercase()
            );
            if c.query_row(&sql, [], |f| f.get::<_, bool>(0))? {
                return Ok(false);
            }
        }
    }
    Ok(true)
}

/// Si la jerarquía de unidades (también las eliminadas) forma un círculo.
pub fn hay_ciclo(c: &Connection) -> rusqlite::Result<bool> {
    let padres: HashMap<String, String> = c
        .prepare("SELECT id, parent_id FROM unidades WHERE parent_id IS NOT NULL")?
        .query_map([], |f| Ok((f.get(0)?, f.get(1)?)))?
        .collect::<rusqlite::Result<_>>()?;
    // ya revisadas: desde ahí se llega a una raíz
    let mut revisadas: HashSet<&str> = HashSet::new();
    for inicio in padres.keys() {
        let mut camino = HashSet::new();
        let mut actual = inicio.as_str();
        while !revisadas.contains(actual) {
            if !camino.insert(actual) {
                return Ok(true);
            }
            match padres.get(actual) {
                Some(p) => actual = p,
                None => break,
            }
        }
        revisadas.extend(camino);
    }
    Ok(false)
}

/// Rama de una exportación parcial: su raíz y la unidad de la que colgaba en la base de origen.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RamaExportada {
    pub id: String,
    pub padre: Option<String>,
}

#[derive(Debug, Clone)]
pub struct MetaArchivo {
    pub parcial: bool,
    pub ramas: Vec<RamaExportada>,
    pub organizacion: String,
}

fn meta(c: &Connection, clave: &str) -> rusqlite::Result<Option<String>> {
    match c.query_row("SELECT valor FROM meta WHERE clave = ?1", [clave], |f| {
        f.get(0)
    }) {
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        otro => otro,
    }
}

/// Lo que la exportación agregó a `meta`, ya revisado.
pub fn leer_meta(c: &Connection) -> Result<MetaArchivo, Fallo> {
    let m = |clave| meta(c, clave).map_err(invalido);
    if m("db_id")?.is_none() || m("data_revision")?.is_none() {
        return Err(invalido("meta"));
    }
    let parcial = match m("alcance")?.as_deref() {
        Some("completo") => false,
        Some("parcial") => true,
        _ => return Err(invalido("alcance")),
    };
    let ramas: Vec<RamaExportada> =
        serde_json::from_str(&m("raices")?.unwrap_or_else(|| "[]".into())).map_err(invalido)?;
    if parcial && ramas.is_empty() {
        return Err(invalido("raices"));
    }
    for r in &ramas {
        // una raíz exportada no cuelga de nadie en la copia
        let es_raiz: Option<bool> = c
            .query_row(
                "SELECT parent_id IS NULL FROM unidades WHERE id = ?1",
                [&r.id],
                |f| f.get(0),
            )
            .ok();
        if es_raiz != Some(true) {
            return Err(invalido("raices"));
        }
    }
    Ok(MetaArchivo {
        parcial,
        ramas,
        organizacion: m("org_nombre")?.unwrap_or_default(),
    })
}

/// Toda la revisión, de solo lectura. Devuelve la versión de esquema del archivo.
pub fn revisar(ruta: &Path, migraciones: &[&str]) -> Result<usize, Fallo> {
    let c = solo_lectura(ruta)?;
    let version: i64 = c
        .pragma_query_value(None, "user_version", |f| f.get(0))
        .map_err(invalido)?;
    if version > migraciones.len() as i64 {
        return Err(Fallo::de("esquema_nuevo", version));
    }
    if version < 1 {
        return Err(invalido("version"));
    }
    let version = version as usize;
    revisar_esquema(&c, &migraciones[..version])?;
    let texto = |sql: &str| {
        c.query_row(sql, [], |f| f.get::<_, String>(0))
            .map_err(invalido)
    };
    if texto("PRAGMA encoding")? != "UTF-8" || texto("PRAGMA integrity_check(1)")? != "ok" {
        return Err(invalido("integridad"));
    }
    let hay_rotas = c
        .query_row(
            "SELECT EXISTS (SELECT 1 FROM pragma_foreign_key_check)",
            [],
            |f| f.get::<_, bool>(0),
        )
        .map_err(invalido)?;
    if hay_rotas || hay_ciclo(&c).map_err(invalido)? || !revisar_tipos(&c).map_err(invalido)? {
        return Err(invalido("datos"));
    }
    leer_meta(&c)?;
    Ok(version)
}

/// Lleva la copia temporal al esquema de esta app y la vuelve a revisar.
pub fn migrar_copia(ruta: &Path, version: usize, migraciones: &[&str]) -> Result<(), Fallo> {
    if version < migraciones.len() {
        let mut c = abrir_no_confiable(ruta, OpenFlags::SQLITE_OPEN_READ_WRITE)?;
        let tx = c.transaction()?;
        for sql in &migraciones[version..] {
            tx.execute_batch(sql)?;
        }
        tx.pragma_update(None, "user_version", migraciones.len() as i64)?;
        tx.commit()?;
        c.close().map_err(|(_, e)| e)?;
        revisar(ruta, migraciones)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{self, MIGRACIONES};

    /// Una copia como la que produce la exportación completa.
    fn copia() -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let ruta = dir.path().join("copia.db");
        let mut c = Connection::open(&ruta).unwrap();
        db::migrar(&mut c, dir.path()).unwrap();
        db::asegurar_meta(&c).unwrap();
        c.execute_batch(
            "INSERT INTO meta (clave, valor) VALUES ('alcance', 'completo'), ('raices', '[]');",
        )
        .unwrap();
        (dir, ruta)
    }

    /// Lo que puede armar quien envía el archivo: sin claves foráneas que lo frenen.
    fn alterar(ruta: &Path, sql: &str) {
        let c = Connection::open(ruta).unwrap();
        c.pragma_update(None, "foreign_keys", "OFF").unwrap();
        c.execute_batch(sql).unwrap();
    }

    fn codigo(ruta: &Path) -> &'static str {
        revisar(ruta, MIGRACIONES).unwrap_err().codigo
    }

    #[test]
    fn una_copia_legitima_pasa() {
        let (_d, ruta) = copia();
        assert_eq!(revisar(&ruta, MIGRACIONES).unwrap(), 1);
    }

    #[test]
    fn rechaza_cualquier_objeto_que_no_sea_del_esquema() {
        for sql in [
            "CREATE TRIGGER t AFTER INSERT ON meta BEGIN DELETE FROM meta; END;",
            "CREATE VIEW v AS SELECT * FROM meta;",
            "CREATE TABLE extra (x);",
            "CREATE INDEX i ON meta(valor);",
            "DROP INDEX ux_cargos_nombre;",
            "ALTER TABLE cargos ADD COLUMN x TEXT;",
        ] {
            let (_d, ruta) = copia();
            alterar(&ruta, sql);
            assert_eq!(codigo(&ruta), "contenido_invalido", "{sql}");
        }
    }

    #[test]
    fn un_trigger_del_archivo_nunca_se_ejecuta() {
        let (_d, ruta) = copia();
        alterar(
            &ruta,
            "CREATE TABLE rastro (x);
             CREATE TRIGGER t AFTER INSERT ON meta BEGIN INSERT INTO rastro VALUES (1); END;",
        );
        // con triggers apagados aunque la conexión escribiera
        let c = abrir_no_confiable(&ruta, OpenFlags::SQLITE_OPEN_READ_WRITE).unwrap();
        c.execute("INSERT INTO meta (clave) VALUES ('x')", [])
            .unwrap();
        let n: i64 = c
            .query_row("SELECT count(*) FROM rastro", [], |f| f.get(0))
            .unwrap();
        assert_eq!(n, 0);
        // y la de revisar no puede escribir
        solo_lectura(&ruta)
            .unwrap()
            .execute("INSERT INTO meta (clave) VALUES ('y')", [])
            .unwrap_err();
    }

    #[test]
    fn rechaza_version_mas_nueva_con_mensaje_propio_y_version_cero() {
        let (_d, ruta) = copia();
        alterar(&ruta, "PRAGMA user_version = 99;");
        assert_eq!(codigo(&ruta), "esquema_nuevo");
        alterar(&ruta, "PRAGMA user_version = 0;");
        assert_eq!(codigo(&ruta), "contenido_invalido");
    }

    #[test]
    fn rechaza_lo_que_no_es_una_base_o_le_falta_meta() {
        let (d, ruta) = copia();
        alterar(&ruta, "DELETE FROM meta WHERE clave = 'alcance';");
        assert_eq!(codigo(&ruta), "contenido_invalido");
        let basura = d.path().join("basura");
        std::fs::write(&basura, "no soy sqlite, aunque descifre bien").unwrap();
        assert_eq!(codigo(&basura), "contenido_invalido");
        let vacia = d.path().join("vacia");
        std::fs::write(&vacia, "").unwrap();
        assert_eq!(codigo(&vacia), "contenido_invalido");
    }

    #[test]
    fn rechaza_referencias_rotas_ciclos_y_tipos_falsos() {
        const T: &str = "'00000000-0000-7000-8000-000000000001'";
        for sql in [
            // referencia rota
            format!("INSERT INTO unidades (id, tipo_id, nombre, parent_id, created_at, updated_at) VALUES ('a', {T}, 'A', 'nadie', 'x', 'x');"),
            // ciclo
            format!("INSERT INTO unidades (id, tipo_id, nombre, parent_id, created_at, updated_at) VALUES ('a', {T}, 'A', 'b', 'x', 'x'), ('b', {T}, 'B', 'a', 'x', 'x');"),
            // tipo que no es el declarado
            format!("INSERT INTO unidades (id, tipo_id, nombre, descripcion, created_at, updated_at) VALUES ('a', {T}, 'A', x'00ff', 'x', 'x');"),
            // raíz de una rama que no está
            "UPDATE meta SET valor = 'parcial' WHERE clave = 'alcance'; UPDATE meta SET valor = '[{\"id\":\"nadie\",\"padre\":null}]' WHERE clave = 'raices';".into(),
            // parcial sin ramas
            "UPDATE meta SET valor = 'parcial' WHERE clave = 'alcance';".into(),
            "UPDATE meta SET valor = 'no es json' WHERE clave = 'raices';".into(),
        ] {
            let (_d, ruta) = copia();
            alterar(&ruta, &sql);
            assert_eq!(codigo(&ruta), "contenido_invalido", "{sql}");
        }
    }

    #[test]
    fn un_archivo_de_esquema_anterior_se_migra_sobre_la_copia() {
        let (_d, ruta) = copia();
        let dos = [MIGRACIONES[0], "CREATE TABLE extra (x INTEGER);"];
        assert_eq!(revisar(&ruta, &dos).unwrap(), 1);
        migrar_copia(&ruta, 1, &dos).unwrap();
        assert_eq!(revisar(&ruta, &dos).unwrap(), 2);
        // con el esquema de la app no hace nada
        migrar_copia(&ruta, 2, &dos).unwrap();
    }
}
