//! La otra organización de una comparación, en un temporal: lo que se reescriba después nunca toca su archivo.
// Lo usa el comando de comparar (tarea 4 del plan).
#![cfg_attr(not(test), expect(dead_code))]
use crate::intercambio::{
    Temporal,
    comparar::tablas,
    fusion::{describir, normalizar_nombre},
    validar::{
        abrir_no_confiable, migrar_temporal, solo_lectura, solo_lectura_cerrada, version_y_esquema,
    },
};
use crate::organizaciones::{Entrada, base_de, esta_su_archivo, id_del_archivo};
use crate::respaldos::Fallo;
use crate::rutas::Rutas;
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use std::collections::{HashMap, HashSet};

#[derive(Debug)]
pub struct Copia {
    pub temporal: Temporal,
    pub id: String,
    /// `origen_db_id` de la otra: si es una importación, de quién vino.
    pub origen: Option<String>,
}

pub fn copiar_otra(
    r: &Rutas,
    e: &Entrada,
    abierta: &str,
    migraciones: &[&str],
) -> Result<Copia, Fallo> {
    if e.id == abierta {
        return Err(Fallo::de("misma", &e.id));
    }
    let bd = base_de(r, e).bd;
    if !esta_su_archivo(e, &bd) {
        return Err(Fallo::de("no_encontrado", bd.display()));
    }
    let version = version_y_esquema(&bd, migraciones)?;
    let temporal = Temporal::nuevo(&r.datos, "comparar");
    // sin bloqueo ni escritura: `solo_lectura_cerrada` no deja `-wal` al lado y, si lo hay, lee lo que tiene sin volcar
    let origen = {
        let c = solo_lectura_cerrada(&bd)?;
        // sin `query_only`: SQLite rechaza `VACUUM INTO` con él. La conexión es `READ_ONLY` y escribe solo en el temporal
        if id_del_archivo(&c)?.as_deref() != Some(e.id.as_str()) {
            return Err(Fallo::de("otro_id", bd.display()));
        }
        let origen = c
            .query_row(
                "SELECT valor FROM meta WHERE clave = 'origen_db_id'",
                [],
                |f| f.get(0),
            )
            .optional()?;
        c.execute("VACUUM INTO ?1", [temporal.ruta().to_string_lossy()])?;
        origen
    };
    migrar_temporal(temporal.ruta(), version, migraciones)?;
    Ok(Copia {
        temporal,
        id: e.id.clone(),
        origen,
    })
}

/// Solo para mirar: aunque el temporal se abra para escribir más adelante, esta conexión no puede.
pub fn leer(copia: &Copia) -> Result<Connection, Fallo> {
    let c = solo_lectura(copia.temporal.ruta())?;
    c.pragma_update(None, "query_only", true)?;
    Ok(c)
}

/// Vienen de la misma base y comparten ids: se comparan por `id`, sin emparejar. Decisión 3 del plan.
pub fn relacionadas(abierta: &Connection, copia: &Copia) -> Result<bool, Fallo> {
    let meta = |clave: &str| -> rusqlite::Result<Option<String>> {
        abierta
            .query_row("SELECT valor FROM meta WHERE clave = ?1", [clave], |f| {
                f.get(0)
            })
            .optional()
    };
    let (id, origen) = (meta("db_id")?, meta("origen_db_id")?);
    let suyo = copia.origen.as_deref();
    Ok(
        suyo.is_some_and(|o| Some(o) == id.as_deref() || Some(o) == origen.as_deref())
            || origen.as_deref() == Some(copia.id.as_str()),
    )
}

/// Lo que se empareja sin compartir `id`; el resto se compara por `id`, y los mantenedores ya se unen por nombre al comparar.
const EMPAREJABLES: &[&str] = &["unidades", "trabajadores", "puestos"];

#[derive(Debug, Default)]
pub struct Emparejadas {
    /// De la abierta: las filas que se emparejaron por nombre o correo, no por `id`.
    pub ids: HashSet<String>,
    /// Personas vivas sin correo, de las dos: nunca se emparejan.
    pub sin_correo: u64,
}

/// Una fila por emparejar, con las dos columnas de las que sale su clave.
struct Fila {
    id: String,
    viva: bool,
    a: Option<String>,
    b: Option<String>,
}

fn filas(c: &Connection, sql: &str) -> Result<Vec<Fila>, Fallo> {
    Ok(c.prepare(sql)?
        .query_map([], |f| {
            Ok(Fila {
                id: f.get(0)?,
                viva: f.get(1)?,
                a: f.get(2)?,
                b: f.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<_>>()?)
}

/// Clave → id, entre las vivas; `None` si la clave se repite.
fn unicas<'a>(
    filas: &'a [Fila],
    clave: &impl Fn(&Fila) -> Option<String>,
) -> HashMap<String, Option<&'a str>> {
    let mut m = HashMap::new();
    for f in filas.iter().filter(|f| f.viva) {
        if let Some(k) = clave(f) {
            m.entry(k)
                .and_modify(|v| *v = None)
                .or_insert(Some(f.id.as_str()));
        }
    }
    m
}

fn ids(filas: &[Fila]) -> HashSet<&str> {
    filas.iter().map(|f| f.id.as_str()).collect()
}

/// Agrega a `pares` (otra → abierta) las filas cuya clave no se repite en ninguno de los dos lados. Una fila con su mismo
/// `id` en el otro lado ya tiene par, y una ya emparejada no se vuelve a usar.
fn por_clave(
    aqui: &[Fila],
    alla: &[Fila],
    clave: impl Fn(&Fila) -> Option<String>,
    pares: &mut HashMap<String, String>,
) {
    let (de_aqui, ids_aqui, ids_alla) = (unicas(aqui, &clave), ids(aqui), ids(alla));
    let mut tomadas: HashSet<String> = pares.values().cloned().collect();
    for (k, b) in unicas(alla, &clave) {
        if let (Some(b), Some(Some(a))) = (b, de_aqui.get(&k))
            && !ids_aqui.contains(b)
            && !ids_alla.contains(a)
            && !pares.contains_key(b)
            && tomadas.insert(a.to_string())
        {
            pares.insert(b.to_string(), a.to_string());
        }
    }
}

/// Correo comparable: sin mayúsculas ni espacios a los lados. Vacío no es un correo.
fn correo(f: &Fila) -> Option<String> {
    let c = f.a.as_deref()?.trim().to_lowercase();
    (!c.is_empty()).then_some(c)
}

/// Decide los pares (decisión 4 del plan) y, en el temporal, pone a cada fila emparejada el `id` de la abierta, también en
/// las columnas que la referencian.
pub fn emparejar(abierta: &Connection, copia: &Copia) -> Result<Emparejadas, Fallo> {
    let mut c = abrir_no_confiable(copia.temporal.ruta(), OpenFlags::SQLITE_OPEN_READ_WRITE)?;
    let leer_las_dos =
        |sql: &str| -> Result<_, Fallo> { Ok((filas(abierta, sql)?, filas(&c, sql)?)) };

    // desde las raíces: una unidad en un ciclo no tiene ruta, y la consulta termina igual
    let (aqui, alla) = leer_las_dos(
        "WITH RECURSIVE ruta(id, ruta) AS (
           SELECT id, nombre FROM unidades WHERE parent_id IS NULL
           UNION ALL
           SELECT u.id, r.ruta || char(31) || u.nombre FROM unidades u JOIN ruta r ON u.parent_id = r.id)
         SELECT u.id, u.deleted_at IS NULL, u.nombre, r.ruta FROM unidades u LEFT JOIN ruta r ON r.id = u.id",
    )?;
    let mut unidades = HashMap::new();
    por_clave(
        &aqui,
        &alla,
        |f| {
            f.b.as_deref().map(|r| {
                r.split('\u{1f}')
                    .map(normalizar_nombre)
                    .collect::<Vec<_>>()
                    .join("/")
            })
        },
        &mut unidades,
    );
    por_clave(
        &aqui,
        &alla,
        |f| f.a.as_deref().map(normalizar_nombre),
        &mut unidades,
    );

    let (aqui, alla) =
        leer_las_dos("SELECT id, deleted_at IS NULL, correo, NULL FROM trabajadores")?;
    let sin_correo = aqui
        .iter()
        .chain(&alla)
        .filter(|f| f.viva && correo(f).is_none())
        .count() as u64;
    let mut personas = HashMap::new();
    por_clave(&aqui, &alla, correo, &mut personas);

    // varios iguales en una unidad se emparejan en orden de `id`
    let (aqui, alla) = leer_las_dos(
        "SELECT p.id, p.deleted_at IS NULL, p.unidad_id, c.nombre FROM puestos p
         LEFT JOIN cargos c ON c.id = p.cargo_id ORDER BY p.id",
    )?;
    let clave = |f: &Fila, unidad: &str| {
        let cargo = normalizar_nombre(f.b.as_deref().unwrap_or_default());
        format!("{unidad}\u{1f}{cargo}")
    };
    let (ids_aqui, ids_alla) = (ids(&aqui), ids(&alla));
    let mut libres: HashMap<String, Vec<&str>> = HashMap::new();
    for f in aqui
        .iter()
        .rev()
        .filter(|f| f.viva && !ids_alla.contains(f.id.as_str()))
    {
        let k = clave(f, f.a.as_deref().unwrap_or_default());
        libres.entry(k).or_default().push(&f.id);
    }
    let mut puestos = HashMap::new();
    for f in alla
        .iter()
        .filter(|f| f.viva && !ids_aqui.contains(f.id.as_str()))
    {
        let unidad = f.a.as_deref().unwrap_or_default();
        let k = clave(f, unidades.get(unidad).map_or(unidad, String::as_str));
        if let Some(a) = libres.get_mut(&k).and_then(Vec::pop) {
            puestos.insert(f.id.clone(), a.to_string());
        }
    }

    let mapa: Vec<(&str, String, String)> = [
        ("unidades", unidades),
        ("trabajadores", personas),
        ("puestos", puestos),
    ]
    .into_iter()
    .flat_map(|(t, pares)| {
        pares
            .into_iter()
            .map(move |(viejo, nuevo)| (t, viejo, nuevo))
    })
    .collect();
    reescribir(&mut c, &mapa)?;
    Ok(Emparejadas {
        ids: mapa.into_iter().map(|(_, _, nuevo)| nuevo).collect(),
        sin_correo,
    })
}

/// En una transacción: el `id` de cada fila emparejada y cada columna que la referencia, una sentencia por columna.
fn reescribir(c: &mut Connection, mapa: &[(&str, String, String)]) -> Result<(), Fallo> {
    let tx = c.transaction()?;
    tx.execute_batch(
        "CREATE TEMP TABLE mapa (tabla TEXT NOT NULL, viejo TEXT NOT NULL, nuevo TEXT NOT NULL,
           PRIMARY KEY (tabla, viejo)) WITHOUT ROWID",
    )?;
    {
        let mut poner = tx.prepare("INSERT INTO mapa (tabla, viejo, nuevo) VALUES (?1, ?2, ?3)")?;
        for (tabla, viejo, nuevo) in mapa {
            poner.execute((tabla, viejo, nuevo))?;
        }
    }
    for tabla in tablas() {
        let d = describir(&tx, tabla)?;
        let propia = EMPAREJABLES.contains(&tabla).then_some(("id", tabla));
        let columnas = d
            .referencias
            .iter()
            .map(|(i, destino, _)| (d.columnas[*i].as_str(), destino.as_str()))
            .chain(propia)
            .filter(|(_, destino)| EMPAREJABLES.contains(destino));
        for (col, destino) in columnas {
            tx.execute(
                &format!(
                    "UPDATE {tabla} SET {col} = (SELECT nuevo FROM mapa WHERE tabla = ?1 AND viejo = {tabla}.{col})
                     WHERE {col} IN (SELECT viejo FROM mapa WHERE tabla = ?1)"
                ),
                [destino],
            )?;
        }
    }
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{self, MIGRACIONES};
    use crate::intercambio::{comparar::comparar_con_locales, validar::MetaArchivo};
    use crate::organizaciones::{
        ESPERA_CAMBIO, bloquear,
        prueba::{crear, entrada, escribir, rutas, sin_rastros},
    };
    use crate::respaldos::con_sufijo;
    use std::path::PathBuf;

    /// Otra organización en una carpeta externa del temporal, con ese esquema.
    fn otra(r: &Rutas, migraciones: &[&str]) -> (Entrada, PathBuf) {
        let bd = r.datos.join("afuera").join("otra.db");
        let id = crear(&bd, "Otra", migraciones);
        (entrada(&id, &bd.to_string_lossy(), true, ""), bd)
    }

    fn copiar(r: &Rutas, e: &Entrada) -> Result<Copia, Fallo> {
        copiar_otra(r, e, "la-abierta", MIGRACIONES)
    }

    #[test]
    fn copiar_otra_no_toca_el_original() {
        let (_exe, r) = rutas();
        let (e, bd) = otra(&r, MIGRACIONES);
        escribir(&r, vec![e.clone()]);
        let antes = std::fs::read(&bd).unwrap();
        let fecha = std::fs::metadata(&bd).unwrap().modified().unwrap();
        let copia = copiar(&r, &e).unwrap();
        assert_eq!(copia.id, e.id);
        drop(copia);
        assert_eq!(std::fs::read(&bd).unwrap(), antes);
        assert_eq!(std::fs::metadata(&bd).unwrap().modified().unwrap(), fecha);
        sin_rastros(&bd);
        assert!(!con_sufijo(&bd, ".bloqueo").exists());
    }

    #[test]
    fn con_otra_copia_escribiendo_ve_lo_del_wal() {
        let (_exe, r) = rutas();
        let (e, bd) = otra(&r, MIGRACIONES);
        let c = db::abrir(&bd).unwrap();
        c.pragma_update(None, "wal_autocheckpoint", 0).unwrap();
        c.execute(
            "INSERT INTO meta (clave, valor) VALUES ('sin_volcar', 'si')",
            [],
        )
        .unwrap();
        let _bloqueo = bloquear(&bd, ESPERA_CAMBIO).unwrap();
        assert!(con_sufijo(&bd, "-wal").exists());
        let copia = copiar(&r, &e).unwrap();
        let visto: String = leer(&copia)
            .unwrap()
            .query_row(
                "SELECT valor FROM meta WHERE clave = 'sin_volcar'",
                [],
                |f| f.get(0),
            )
            .unwrap();
        assert_eq!(visto, "si");
    }

    #[test]
    fn esquema_antiguo_se_migra_solo_en_el_temporal() {
        let (_exe, r) = rutas();
        let anterior = MIGRACIONES.len() - 1;
        let (e, bd) = otra(&r, &MIGRACIONES[..anterior]);
        let copia = copiar(&r, &e).unwrap();
        let temporal = copia.temporal.ruta().to_path_buf();
        let version = |ruta: &std::path::Path| -> i64 {
            crate::intercambio::validar::solo_lectura(ruta)
                .unwrap()
                .pragma_query_value(None, "user_version", |f| f.get(0))
                .unwrap()
        };
        assert_eq!(version(&temporal), MIGRACIONES.len() as i64);
        assert_eq!(version(&bd), anterior as i64);
        drop(copia);
        assert!(!temporal.exists());
    }

    #[test]
    fn esquema_nuevo_no_se_compara() {
        let (_exe, r) = rutas();
        let (e, bd) = otra(&r, MIGRACIONES);
        rusqlite::Connection::open(&bd)
            .unwrap()
            .pragma_update(None, "user_version", 99)
            .unwrap();
        assert_eq!(copiar(&r, &e).unwrap_err().codigo, "esquema_nuevo");
    }

    #[test]
    fn archivo_ausente_da_no_encontrado() {
        let (_exe, r) = rutas();
        let (e, bd) = otra(&r, MIGRACIONES);
        std::fs::remove_file(&bd).unwrap();
        assert_eq!(copiar(&r, &e).unwrap_err().codigo, "no_encontrado");
    }

    #[test]
    fn otro_db_id_da_otro_id() {
        let (_exe, r) = rutas();
        let (mut e, _) = otra(&r, MIGRACIONES);
        e.id = "no-es-el-del-archivo".into();
        assert_eq!(copiar(&r, &e).unwrap_err().codigo, "otro_id");
    }

    #[test]
    fn consigo_misma_da_misma() {
        let (_exe, r) = rutas();
        let (e, _) = otra(&r, MIGRACIONES);
        assert_eq!(
            copiar_otra(&r, &e, &e.id, MIGRACIONES).unwrap_err().codigo,
            "misma"
        );
    }

    #[test]
    fn leer_no_deja_escribir() {
        let (_exe, r) = rutas();
        let (e, _) = otra(&r, MIGRACIONES);
        let copia = copiar(&r, &e).unwrap();
        let c = leer(&copia).unwrap();
        assert!(
            c.execute("INSERT INTO meta (clave, valor) VALUES ('x', 'y')", [])
                .is_err()
        );
    }

    // Fechas fijas: dos organizaciones con el mismo contenido tampoco difieren en ellas.
    const FECHA: &str = "2026-11-01T12:00:00.000Z";
    const GERENCIA: &str = "00000000-0000-7000-8000-000000000001";

    fn texto_o_null(v: Option<&str>) -> String {
        v.map_or("NULL".into(), |t| format!("'{t}'"))
    }

    fn unidad(id: &str, nombre: &str, padre: Option<&str>) -> String {
        format!(
            "INSERT INTO unidades (id, tipo_id, nombre, parent_id, created_at, updated_at)
             VALUES ('{id}', '{GERENCIA}', '{nombre}', {}, '{FECHA}', '{FECHA}');",
            texto_o_null(padre)
        )
    }

    fn persona(id: &str, nombre: &str, correo: Option<&str>) -> String {
        format!(
            "INSERT INTO trabajadores (id, nombre, correo, created_at, updated_at)
             VALUES ('{id}', '{nombre}', {}, '{FECHA}', '{FECHA}');",
            texto_o_null(correo)
        )
    }

    fn cargo(id: &str, nombre: &str) -> String {
        format!(
            "INSERT INTO cargos (id, nombre, created_at, updated_at) VALUES ('{id}', '{nombre}', '{FECHA}', '{FECHA}');"
        )
    }

    fn puesto(id: &str, unidad: &str, cargo: &str) -> String {
        format!(
            "INSERT INTO puestos (id, unidad_id, cargo_id, created_at, updated_at)
             VALUES ('{id}', '{unidad}', '{cargo}', '{FECHA}', '{FECHA}');"
        )
    }

    fn asignacion(id: &str, puesto: &str, persona: &str) -> String {
        format!(
            "INSERT INTO asignaciones (id, puesto_id, trabajador_id, tipo, desde, created_at, updated_at)
             VALUES ('{id}', '{puesto}', '{persona}', 'titular', '2020-01-01', '{FECHA}', '{FECHA}');"
        )
    }

    fn conexion(id: &str, origen: &str, destino: &str) -> String {
        format!(
            "INSERT INTO conexiones (id, origen_id, destino_id, created_at, updated_at)
             VALUES ('{id}', '{origen}', '{destino}', '{FECHA}', '{FECHA}');"
        )
    }

    /// La abierta, con las filas de `aqui`, y la copia de otra con las de `alla`.
    fn par(r: &Rutas, aqui: &str, alla: &str) -> (Connection, Copia) {
        let bd = r.datos.join("abierta.db");
        crear(&bd, "Abierta", MIGRACIONES);
        let abierta = db::abrir(&bd).unwrap();
        abierta.execute_batch(aqui).unwrap();
        let (e, bd_otra) = otra(r, MIGRACIONES);
        db::abrir(&bd_otra).unwrap().execute_batch(alla).unwrap();
        (abierta, copiar(r, &e).unwrap())
    }

    fn lista(c: &Connection, sql: &str) -> Vec<String> {
        c.prepare(sql)
            .unwrap()
            .query_map([], |f| f.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap()
    }

    fn conjunto(ids: &[&str]) -> HashSet<String> {
        ids.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn relacionadas_por_origen() {
        let (_exe, r) = rutas();
        let (abierta, mut copia) = par(&r, "", "");
        let db_id = id_del_archivo(&abierta).unwrap().unwrap();
        assert!(!relacionadas(&abierta, &copia).unwrap());
        // la otra es una importación de la abierta
        copia.origen = Some(db_id);
        assert!(relacionadas(&abierta, &copia).unwrap());
        copia.origen = Some("comun".into());
        assert!(!relacionadas(&abierta, &copia).unwrap());
        // las dos vienen de la misma
        abierta
            .execute(
                "INSERT INTO meta (clave, valor) VALUES ('origen_db_id', 'comun')",
                [],
            )
            .unwrap();
        assert!(relacionadas(&abierta, &copia).unwrap());
        // la abierta es una importación de la otra
        copia.origen = None;
        abierta
            .execute(
                "UPDATE meta SET valor = ?1 WHERE clave = 'origen_db_id'",
                [&copia.id],
            )
            .unwrap();
        assert!(relacionadas(&abierta, &copia).unwrap());
    }

    #[test]
    fn finanzas_en_dos_gerencias_no_se_cruzan() {
        let aqui = [
            unidad("a-ope", "Operaciones", None),
            unidad("a-com", "Comercial", None),
            unidad("a-fin-ope", "Finanzas", Some("a-ope")),
            unidad("a-fin-com", "Finanzas", Some("a-com")),
        ]
        .concat();
        // en la otra, la Finanzas de Comercial va primero por id
        let alla = [
            unidad("b-com", "Comercial", None),
            unidad("b-ope", "  operaciones ", None),
            unidad("b-fin-1", "Finanzas", Some("b-com")),
            unidad("b-fin-2", "Finanzas", Some("b-ope")),
        ]
        .concat();
        let (_exe, r) = rutas();
        let (abierta, copia) = par(&r, &aqui, &alla);
        let e = emparejar(&abierta, &copia).unwrap();
        assert_eq!(
            e.ids,
            conjunto(&["a-ope", "a-com", "a-fin-ope", "a-fin-com"])
        );
        let pares = lista(
            &leer(&copia).unwrap(),
            "SELECT id || ' en ' || parent_id FROM unidades WHERE nombre = 'Finanzas' ORDER BY id",
        );
        assert_eq!(pares, ["a-fin-com en a-com", "a-fin-ope en a-ope"]);
    }

    #[test]
    fn nombre_repetido_sin_ruta_no_se_empareja() {
        let aqui = [
            unidad("a-ope", "Operaciones", None),
            unidad("a-ven", "Ventas", None),
            unidad("a-fin-1", "Finanzas", Some("a-ope")),
            unidad("a-fin-2", "Finanzas", Some("a-ven")),
            unidad("a-aud", "Auditoría", Some("a-ope")),
        ]
        .concat();
        let alla = [
            unidad("b-log", "Logística", None),
            unidad("b-mar", "Marketing", None),
            unidad("b-fin-1", "Finanzas", Some("b-log")),
            unidad("b-fin-2", "Finanzas", Some("b-mar")),
            // otra ruta, pero un nombre que no se repite en ninguna de las dos
            unidad("b-aud", "AUDITORIA", Some("b-log")),
        ]
        .concat();
        let (_exe, r) = rutas();
        let (abierta, copia) = par(&r, &aqui, &alla);
        let e = emparejar(&abierta, &copia).unwrap();
        assert_eq!(e.ids, conjunto(&["a-aud"]));
        let ids = lista(
            &leer(&copia).unwrap(),
            "SELECT id FROM unidades ORDER BY id",
        );
        assert_eq!(ids, ["a-aud", "b-fin-1", "b-fin-2", "b-log", "b-mar"]);
    }

    #[test]
    fn correo_sin_mayusculas_ni_espacios() {
        let aqui = [
            persona("a-ana", "Ana", Some("ana@x.cl")),
            persona("a-beto", "Beto", Some("beto@x.cl")),
            persona("a-caro", "Caro", None),
        ]
        .concat();
        let alla = [
            persona("b-ana", "Ana", Some(" Ana@X.cl")),
            // SQLite solo recorta espacios: el tabulador pasa su índice único, y aquí es el mismo correo repetido
            persona("b-beto", "Beto", Some("beto@x.cl")),
            persona("b-beto-2", "Beto bis", Some("\tbeto@x.cl")),
            persona("b-caro", "Caro", Some("  ")),
            persona("b-dani", "Dani", None),
        ]
        .concat();
        let (_exe, r) = rutas();
        let (abierta, copia) = par(&r, &aqui, &alla);
        let e = emparejar(&abierta, &copia).unwrap();
        assert_eq!(e.ids, conjunto(&["a-ana"]));
        assert_eq!(e.sin_correo, 3);
        let ids = lista(
            &leer(&copia).unwrap(),
            "SELECT id FROM trabajadores ORDER BY id",
        );
        assert_eq!(ids, ["a-ana", "b-beto", "b-beto-2", "b-caro", "b-dani"]);
    }

    #[test]
    fn puestos_por_unidad_y_cargo_en_orden() {
        let aqui = [
            unidad("a-fin", "Finanzas", None),
            cargo("a-ana", "Analista"),
            puesto("a-p1", "a-fin", "a-ana"),
            puesto("a-p2", "a-fin", "a-ana"),
            puesto("a-p3", "a-fin", "a-ana"),
        ]
        .concat();
        let alla = [
            unidad("b-fin", "Finanzas", None),
            cargo("b-ana", "analista"),
            puesto("b-p1", "b-fin", "b-ana"),
            puesto("b-p2", "b-fin", "b-ana"),
        ]
        .concat();
        let (_exe, r) = rutas();
        let (abierta, copia) = par(&r, &aqui, &alla);
        let e = emparejar(&abierta, &copia).unwrap();
        assert_eq!(e.ids, conjunto(&["a-fin", "a-p1", "a-p2"]));
        let otra = leer(&copia).unwrap();
        assert_eq!(
            lista(&otra, "SELECT id FROM puestos ORDER BY id"),
            ["a-p1", "a-p2"]
        );
        let c = comparar_con_locales(&abierta, &otra, &sin_meta(), FECHA, |_, _| true).unwrap();
        let solo: Vec<_> = c
            .solo_aqui
            .iter()
            .filter(|(t, _)| *t == "puestos")
            .collect();
        assert_eq!(solo, [&("puestos", "a-p3".to_string())]);
    }

    #[test]
    fn mismo_id_en_las_dos_no_se_reescribe() {
        // por ruta, la `comun` de la otra iría con `a-con`; su mismo id va primero
        let aqui = [
            unidad("comun", "Finanzas", None),
            unidad("a-con", "Contabilidad", None),
        ]
        .concat();
        let alla = unidad("comun", "Contabilidad", None);
        let (_exe, r) = rutas();
        let (abierta, copia) = par(&r, &aqui, &alla);
        let tipos = |c: &Connection| lista(c, "SELECT id FROM tipos_unidad ORDER BY id");
        let antes = tipos(&leer(&copia).unwrap());
        let e = emparejar(&abierta, &copia).unwrap();
        assert!(e.ids.is_empty());
        let otra = leer(&copia).unwrap();
        assert_eq!(lista(&otra, "SELECT id FROM unidades"), ["comun"]);
        assert_eq!(tipos(&otra), antes);
        assert_eq!(tipos(&otra), tipos(&abierta));
    }

    #[test]
    fn referencias_siguen_al_nuevo_id() {
        let arbol = |p: &str| {
            let id = |s: &str| format!("{p}-{s}");
            [
                unidad(&id("ger"), "Gerencia", None),
                unidad(&id("fin"), "Finanzas", Some(&id("ger"))),
                unidad(&id("leg"), "Legal", Some(&id("ger"))),
                cargo(&id("car"), "Jefe"),
                puesto(&id("pue"), &id("fin"), &id("car")),
                persona(&id("ana"), "Ana", Some("ana@x.cl")),
                asignacion(&id("asi"), &id("pue"), &id("ana")),
                conexion(&id("con"), &id("fin"), &id("leg")),
                format!(
                    "UPDATE unidades SET jefe_puesto_id = '{}' WHERE id = '{}';",
                    id("pue"),
                    id("fin")
                ),
            ]
            .concat()
        };
        let (_exe, r) = rutas();
        let (abierta, copia) = par(&r, &arbol("a"), &arbol("b"));
        emparejar(&abierta, &copia).unwrap();
        let otra = leer(&copia).unwrap();
        assert_eq!(
            lista(
                &otra,
                "SELECT puesto_id || ' ' || trabajador_id FROM asignaciones"
            ),
            ["a-pue a-ana"]
        );
        assert_eq!(
            lista(
                &otra,
                "SELECT parent_id || ' ' || coalesce(jefe_puesto_id, '-') FROM unidades WHERE id = 'a-fin'"
            ),
            ["a-ger a-pue"]
        );
        assert_eq!(
            lista(
                &otra,
                "SELECT origen_id || ' ' || destino_id FROM conexiones"
            ),
            ["a-fin a-leg"]
        );
        let rotas: Vec<String> = otra
            .prepare("PRAGMA foreign_key_check")
            .unwrap()
            .query_map([], |f| f.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert!(rotas.is_empty(), "{rotas:?}");
    }

    /// Una versión corta de «Explorar el ejemplo» (la siembra real está en la interfaz), con ids nuevos cada vez.
    fn ejemplo() -> String {
        let nuevo = || uuid::Uuid::now_v7().to_string();
        let (gerente, jefe, tecnico) = (nuevo(), nuevo(), nuevo());
        let mut s = [
            cargo(&gerente, "Gerente"),
            cargo(&jefe, "Jefe de área"),
            cargo(&tecnico, "Técnico"),
        ]
        .concat();
        let mut u: HashMap<&str, String> = HashMap::new();
        for (clave, nombre, padre) in [
            ("gg", "Gerencia General", None),
            ("op", "Operaciones", Some("gg")),
            ("ma", "Mantención", Some("op")),
            ("me", "Mecánica", Some("ma")),
            ("fi", "Finanzas", Some("gg")),
            ("co", "Contabilidad", Some("fi")),
            ("cm", "Compras", Some("fi")),
        ] {
            let id = nuevo();
            s += &unidad(&id, nombre, padre.map(|p| u[p].as_str()));
            u.insert(clave, id);
        }
        for (clave, nombre, cargo_id, es_jefe) in [
            ("gg", "Camila Rojas", &gerente, true),
            ("op", "Andrés Soto", &gerente, true),
            ("ma", "Patricio Muñoz", &jefe, true),
            ("me", "Luis Fuentes", &tecnico, true),
            ("me", "Marta Díaz", &tecnico, false),
            ("fi", "Paula Araya", &gerente, true),
            ("co", "Tomás Bravo", &jefe, true),
            ("cm", "Sofía Contreras", &jefe, true),
        ] {
            let (p, t) = (nuevo(), nuevo());
            let correo = format!("{}@ejemplo.test", nombre.to_lowercase().replace(' ', "."));
            s += &persona(&t, nombre, Some(&correo));
            s += &puesto(&p, &u[clave], cargo_id);
            s += &asignacion(&nuevo(), &p, &t);
            if es_jefe {
                s += &format!(
                    "UPDATE unidades SET jefe_puesto_id = '{p}' WHERE id = '{}';",
                    u[clave]
                );
            }
        }
        // la vacante: el tercer Técnico de Mecánica
        s += &puesto(&nuevo(), &u["me"], &tecnico);
        s += &conexion(&nuevo(), &u["ma"], &u["cm"]);
        s
    }

    fn sin_meta() -> MetaArchivo {
        MetaArchivo {
            parcial: false,
            ramas: Vec::new(),
            organizacion: String::new(),
            origen: None,
        }
    }

    #[test]
    fn dos_ejemplos_sin_cambios_no_difieren() {
        let (_exe, r) = rutas();
        let (abierta, copia) = par(&r, &ejemplo(), &ejemplo());
        assert!(!relacionadas(&abierta, &copia).unwrap());
        emparejar(&abierta, &copia).unwrap();
        let c = comparar_con_locales(
            &abierta,
            &leer(&copia).unwrap(),
            &sin_meta(),
            FECHA,
            |_, _| true,
        )
        .unwrap();
        let resumidas = ["unidades", "trabajadores", "puestos"];
        let casos: Vec<_> = c
            .casos
            .iter()
            .filter(|k| resumidas.contains(&k.tabla))
            .map(|k| (k.tabla, k.id.clone(), k.tipo))
            .collect();
        assert!(casos.is_empty(), "{casos:?}");
        let solo: Vec<_> = c
            .solo_aqui
            .iter()
            .filter(|(t, _)| resumidas.contains(t))
            .collect();
        assert!(solo.is_empty(), "{solo:?}");
        assert!(c.iguales >= 7 + 8 + 9, "{}", c.iguales);
    }
}
