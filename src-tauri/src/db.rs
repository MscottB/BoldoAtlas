use rusqlite::types::{Value as Sql, ValueRef};
use rusqlite::{Connection, ErrorCode, TransactionBehavior, params_from_iter};
use serde::Deserialize;
use serde_json::{Map, Value};
use std::path::Path;
use std::time::{Duration, Instant};

pub const MIGRACIONES: &[&str] = &[include_str!("../migrations/0001_inicial.sql")];

#[derive(Debug, Deserialize)]
pub struct Sentencia {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<Value>,
}

fn texto(e: rusqlite::Error) -> String {
    match e.sqlite_error_code() {
        Some(ErrorCode::ReadOnly) => "La base de datos está en modo solo lectura: revisa que el archivo boldo.db y su carpeta tengan permiso de escritura.".into(),
        _ => e.to_string(),
    }
}

/// JSON del frontend → valor SQLite. Arreglos y objetos se guardan como texto JSON.
fn a_sql(v: &Value) -> Sql {
    match v {
        Value::Null => Sql::Null,
        Value::Bool(b) => Sql::Integer(i64::from(*b)),
        Value::Number(n) => n
            .as_i64()
            .map(Sql::Integer)
            .unwrap_or_else(|| Sql::Real(n.as_f64().unwrap_or(0.0))),
        Value::String(s) => Sql::Text(s.clone()),
        otro => Sql::Text(otro.to_string()),
    }
}

fn a_json(v: ValueRef) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(f) => Value::from(f),
        ValueRef::Text(t) | ValueRef::Blob(t) => {
            Value::from(String::from_utf8_lossy(t).into_owned())
        }
    }
}

pub fn abrir(ruta: &Path) -> Result<Connection, String> {
    let conn = Connection::open(ruta).map_err(texto)?;
    conn.busy_timeout(Duration::from_secs(5)).map_err(texto)?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(texto)?;
    // Cambiar a WAL no pasa por busy_timeout: con varias instancias abriendo a la vez se reintenta hasta 5 s.
    let inicio = Instant::now();
    loop {
        match conn.query_row("PRAGMA journal_mode = WAL", [], |_| Ok(())) {
            Ok(()) => return Ok(conn),
            Err(e)
                if e.sqlite_error_code() == Some(ErrorCode::DatabaseBusy)
                    && inicio.elapsed() < Duration::from_secs(5) =>
            {
                std::thread::sleep(Duration::from_millis(25));
            }
            Err(e) => return Err(texto(e)),
        }
    }
}

pub fn migrar(conn: &mut Connection, dir_respaldos: &Path) -> Result<i64, String> {
    migrar_con(conn, MIGRACIONES, dir_respaldos)
}

pub fn migrar_con(
    conn: &mut Connection,
    migraciones: &[&str],
    dir_respaldos: &Path,
) -> Result<i64, String> {
    let conocida = migraciones.len() as i64;
    let mut respaldada = false;
    loop {
        // IMMEDIATE: si dos instancias arrancan a la vez, la segunda espera y luego ve la versión ya migrada
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(texto)?;
        let actual: i64 = tx
            .pragma_query_value(None, "user_version", |f| f.get(0))
            .map_err(texto)?;
        if actual > conocida {
            return Err(format!(
                "Esta base fue creada con una versión más nueva de BoldoAtlas (esquema {actual}; esta app conoce hasta el {conocida}). Actualiza BoldoAtlas para abrirla."
            ));
        }
        if actual == conocida {
            return Ok(actual);
        }
        if actual > 0 && !respaldada {
            // VACUUM INTO no puede ir dentro de una transacción: se respalda y se vuelve a comprobar
            drop(tx);
            respaldar(conn, dir_respaldos, actual)?;
            respaldada = true;
            continue;
        }
        for sql in &migraciones[actual as usize..] {
            tx.execute_batch(sql).map_err(texto)?;
        }
        tx.pragma_update(None, "user_version", conocida)
            .map_err(texto)?;
        tx.commit().map_err(texto)?;
        return Ok(conocida);
    }
}

fn respaldar(conn: &Connection, dir_respaldos: &Path, version: i64) -> Result<(), String> {
    let sello: String = conn
        .query_row("SELECT strftime('%Y%m%d%H%M%S', 'now')", [], |f| f.get(0))
        .map_err(texto)?;
    // sufijo aleatorio: dos instancias en el mismo segundo no chocan
    let azar = uuid::Uuid::now_v7().simple().to_string();
    let destino = dir_respaldos.join(format!(
        "antes-migracion-{version}-{sello}-{}.boldo",
        &azar[azar.len() - 8..]
    ));
    conn.execute("VACUUM INTO ?1", [destino.to_string_lossy()])
        .map_err(texto)?;
    Ok(())
}

pub fn asegurar_meta(conn: &Connection) -> Result<(), String> {
    let id = uuid::Uuid::now_v7().to_string();
    let tx = rusqlite::Transaction::new_unchecked(conn, TransactionBehavior::Immediate)
        .map_err(texto)?;
    tx.execute(
        "INSERT OR IGNORE INTO meta (clave, valor) VALUES ('db_id', ?1)",
        [&id],
    )
    .map_err(texto)?;
    tx.execute(
        "INSERT OR IGNORE INTO meta (clave, valor) VALUES ('db_creada', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        [],
    )
    .map_err(texto)?;
    tx.execute(
        "INSERT OR IGNORE INTO meta (clave, valor) VALUES ('data_revision', '0')",
        [],
    )
    .map_err(texto)?;
    tx.commit().map_err(texto)
}

pub fn consultar(
    conn: &Connection,
    sql: &str,
    params: &[Value],
) -> Result<Vec<Map<String, Value>>, String> {
    let mut stmt = conn.prepare(sql).map_err(texto)?;
    if !stmt.readonly() {
        return Err("db_consultar es solo lectura; las escrituras van por db_lote.".into());
    }
    let columnas: Vec<String> = stmt.column_names().map(String::from).collect();
    let mut filas = stmt
        .query(params_from_iter(params.iter().map(a_sql)))
        .map_err(texto)?;
    let mut salida = Vec::new();
    while let Some(fila) = filas.next().map_err(texto)? {
        let mut obj = Map::new();
        for (i, col) in columnas.iter().enumerate() {
            obj.insert(col.clone(), a_json(fila.get_ref(i).map_err(texto)?));
        }
        salida.push(obj);
    }
    Ok(salida)
}

/// Todo o nada; IMMEDIATE toma el bloqueo de escritura al inicio para que busy_timeout espere en vez de fallar.
pub fn lote(
    conn: &mut Connection,
    sentencias: &[Sentencia],
    version_app: &str,
) -> Result<(), String> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(texto)?;
    for s in sentencias {
        tx.execute(&s.sql, params_from_iter(s.params.iter().map(a_sql)))
            .map_err(texto)?;
    }
    tx.execute(
        "UPDATE meta SET valor = CAST(CAST(valor AS INTEGER) + 1 AS TEXT) WHERE clave = 'data_revision'",
        [],
    )
    .map_err(texto)?;
    tx.execute(
        "INSERT INTO meta (clave, valor) VALUES ('app_version_ultima', ?1)
         ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
        [version_app],
    )
    .map_err(texto)?;
    tx.commit().map_err(texto)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::path::PathBuf;

    fn base_nueva() -> (tempfile::TempDir, PathBuf, Connection) {
        let dir = tempfile::tempdir().unwrap();
        let ruta = dir.path().join("boldo.db");
        let mut conn = abrir(&ruta).unwrap();
        migrar(&mut conn, dir.path()).unwrap();
        asegurar_meta(&conn).unwrap();
        (dir, ruta, conn)
    }

    fn meta(conn: &Connection, clave: &str) -> String {
        conn.query_row("SELECT valor FROM meta WHERE clave = ?1", [clave], |f| {
            f.get(0)
        })
        .unwrap()
    }

    fn version(conn: &Connection) -> i64 {
        conn.pragma_query_value(None, "user_version", |f| f.get(0))
            .unwrap()
    }

    fn insertar_unidad(nombre: &str) -> Sentencia {
        Sentencia {
            sql: "INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES (?, '00000000-0000-7000-8000-000000000001', ?, 'x', 'x')"
                .into(),
            params: vec![json!(uuid::Uuid::now_v7().to_string()), json!(nombre)],
        }
    }

    #[test]
    fn dos_instancias_migran_a_la_vez() {
        let dir = tempfile::tempdir().unwrap();
        let ruta = dir.path().join("boldo.db");
        let salida = std::sync::Arc::new(std::sync::Barrier::new(4));
        let hilos: Vec<_> = (0..4)
            .map(|_| {
                let (ruta, carpeta, salida) =
                    (ruta.clone(), dir.path().to_path_buf(), salida.clone());
                std::thread::spawn(move || {
                    salida.wait();
                    let mut c = abrir(&ruta).map_err(|e| format!("abrir: {e}"))?;
                    migrar(&mut c, &carpeta).map_err(|e| format!("migrar: {e}"))?;
                    asegurar_meta(&c).map_err(|e| format!("meta: {e}"))
                })
            })
            .collect();
        for h in hilos {
            h.join().unwrap().unwrap();
        }
        assert_eq!(version(&abrir(&ruta).unwrap()), 1);
    }

    #[test]
    fn consultar_rechaza_escrituras() {
        let (_dir, _, conn) = base_nueva();
        let err = consultar(
            &conn,
            "UPDATE meta SET valor = '9' WHERE clave = 'data_revision'",
            &[],
        )
        .unwrap_err();
        assert!(err.contains("solo lectura"), "{err}");
        assert_eq!(meta(&conn, "data_revision"), "0");
    }

    #[test]
    fn migrar_base_nueva_deja_version_1() {
        let (dir, _, mut conn) = base_nueva();
        assert_eq!(version(&conn), 1);
        assert_eq!(migrar(&mut conn, dir.path()).unwrap(), 1);
        assert_eq!(version(&conn), 1);
    }

    #[test]
    fn migrar_rechaza_esquema_futuro() {
        let (dir, _, mut conn) = base_nueva();
        conn.pragma_update(None, "user_version", 99).unwrap();
        let err = migrar(&mut conn, dir.path()).unwrap_err();
        assert!(err.contains("versión más nueva de BoldoAtlas"), "{err}");
        assert_eq!(version(&conn), 99);
    }

    #[test]
    fn migrar_respalda_antes_de_actualizar() {
        let (dir, _, mut conn) = base_nueva();
        let respaldos = dir.path().join("respaldos");
        std::fs::create_dir(&respaldos).unwrap();
        let dos = [MIGRACIONES[0], "CREATE TABLE extra (x INTEGER);"];
        assert_eq!(migrar_con(&mut conn, &dos, &respaldos).unwrap(), 2);
        let archivos: Vec<_> = std::fs::read_dir(&respaldos).unwrap().collect();
        assert_eq!(archivos.len(), 1);
        let nombre = archivos[0]
            .as_ref()
            .unwrap()
            .file_name()
            .into_string()
            .unwrap();
        assert!(
            nombre.starts_with("antes-migracion-1-") && nombre.ends_with(".boldo"),
            "{nombre}"
        );
    }

    #[test]
    fn lote_es_atomico() {
        let (_dir, _, mut conn) = base_nueva();
        let malo = Sentencia {
            sql: "INSERT INTO no_existe VALUES (1)".into(),
            params: vec![],
        };
        assert!(lote(&mut conn, &[insertar_unidad("A"), malo], "1.0.0").is_err());
        let n: i64 = conn
            .query_row("SELECT count(*) FROM unidades", [], |f| f.get(0))
            .unwrap();
        assert_eq!(n, 0);
        assert_eq!(meta(&conn, "data_revision"), "0");
    }

    #[test]
    fn lote_suma_una_revision_por_transaccion() {
        let (_dir, _, mut conn) = base_nueva();
        let sentencias = [
            insertar_unidad("A"),
            insertar_unidad("B"),
            insertar_unidad("C"),
        ];
        lote(&mut conn, &sentencias, "1.2.0+28102026").unwrap();
        assert_eq!(meta(&conn, "data_revision"), "1");
        assert_eq!(meta(&conn, "app_version_ultima"), "1.2.0+28102026");
    }

    #[test]
    fn consultar_devuelve_filas_como_objetos() {
        let (_dir, _, conn) = base_nueva();
        let filas = consultar(
            &conn,
            "SELECT 1 AS a, 'x' AS b, NULL AS c, ? AS d",
            &[json!(2.5)],
        )
        .unwrap();
        assert_eq!(
            Value::Object(filas[0].clone()),
            json!({ "a": 1, "b": "x", "c": null, "d": 2.5 })
        );
    }

    #[test]
    fn asegurar_meta_crea_identidad_una_sola_vez() {
        let (_dir, _, conn) = base_nueva();
        let id = meta(&conn, "db_id");
        assert_eq!(id.len(), 36);
        asegurar_meta(&conn).unwrap();
        assert_eq!(meta(&conn, "db_id"), id);
        assert!(meta(&conn, "db_creada").ends_with('Z'));
    }

    #[test]
    fn abre_en_ruta_con_espacios_y_tildes() {
        let dir = tempfile::tempdir().unwrap();
        let carpeta = dir.path().join("José Pérez").join("datos con espacio");
        std::fs::create_dir_all(&carpeta).unwrap();
        let mut conn = abrir(&carpeta.join("boldo.db")).unwrap();
        assert_eq!(migrar(&mut conn, &carpeta).unwrap(), 1);
    }

    #[test]
    fn base_de_solo_lectura_explica_el_problema() {
        let (_dir, ruta, conn) = base_nueva();
        drop(conn);
        let mut permisos = std::fs::metadata(&ruta).unwrap().permissions();
        permisos.set_readonly(true);
        std::fs::set_permissions(&ruta, permisos.clone()).unwrap();
        let err = abrir(&ruta)
            .and_then(|mut c| lote(&mut c, &[insertar_unidad("A")], "1.0.0"))
            .unwrap_err();
        #[allow(clippy::permissions_set_readonly_false)]
        permisos.set_readonly(false);
        std::fs::set_permissions(&ruta, permisos).unwrap();
        assert!(err.contains("solo lectura"), "{err}");
    }

    #[test]
    fn dos_conexiones_escriben_sin_bloqueo() {
        let (_dir, ruta, conn) = base_nueva();
        let hilos: Vec<_> = (0..2)
            .map(|_| {
                let ruta = ruta.clone();
                std::thread::spawn(move || {
                    let mut c = abrir(&ruta).unwrap();
                    for i in 0..50 {
                        lote(&mut c, &[insertar_unidad(&format!("U{i}"))], "1.0.0").unwrap();
                    }
                })
            })
            .collect();
        for h in hilos {
            h.join().unwrap();
        }
        assert_eq!(meta(&conn, "data_revision"), "100");
    }
}
