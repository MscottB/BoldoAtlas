//! Historial de cambios: los triggers de la migración 0003 anotan antes/después mientras hay una acción abierta.

use crate::db;
use crate::intercambio::validar;
use crate::respaldos::Fallo;
use rusqlite::{
    Connection, ErrorCode, OptionalExtension, Transaction, TransactionBehavior, params,
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{BTreeSet, HashMap};

mod lectura;
use lectura::breve;
#[cfg(test)]
pub use lectura::nombre_de;
pub use lectura::{
    AccionBreve, FilaDetalle, Filtro, Posteriores, Punteros, breves, detalle, pagina, posteriores,
    punteros,
};

/// `(tabla, fila_id, op, antes, despues)` de `historial_filas`.
type Fila = (String, String, String, Option<String>, Option<String>);
/// El motivo (`referencias` o `ciclo`) y las filas `(tabla, fila_id)` en juego.
type Choque = (&'static str, Vec<(String, String)>);
/// Las filas `(tabla, fila_id)` que dejó rotas una prueba, si dejó alguna.
type EnJuego = Option<Vec<(String, String)>>;

#[derive(Clone, Copy, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Sentido {
    Deshacer,
    Rehacer,
}

/// Cuántos días se guarda el historial si `meta.historial_plazo_dias` no dice otra cosa.
pub const PLAZO_POR_DEFECTO_DIAS: i64 = 365;

/// Borra las acciones más viejas que el plazo, con sus filas (cascada). `"0"` es sin límite. Devuelve cuántas.
pub fn podar(c: &Connection) -> Result<u64, Fallo> {
    let dias = c
        .query_row(
            "SELECT valor FROM meta WHERE clave = 'historial_plazo_dias'",
            [],
            |f| f.get::<_, String>(0),
        )
        .optional()?
        .and_then(|v| v.trim().parse::<i64>().ok())
        .filter(|d| *d >= 0)
        .unwrap_or(PLAZO_POR_DEFECTO_DIAS);
    if dias == 0 {
        return Ok(0);
    }
    Ok(c.execute(
        "DELETE FROM historial_acciones WHERE fecha < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?1)",
        [format!("-{dias} days")],
    )? as u64)
}

/// Lo que dejó esa persona en el historial tras borrarla definitivamente: de `trabajadores` solo el nombre, de `asignaciones`
/// sin el motivo, y bloquea las acciones que la tocaron (también sus roles en actividades). Una fila `update` solo trae lo
/// que cambió, por eso asignaciones y roles también se buscan por su fila actual.
pub fn limpiar_persona(c: &Connection, id: &str) -> Result<(), Fallo> {
    let de = |tabla: &str| {
        format!(
            "tabla = '{tabla}' AND (json_extract(antes, '$.trabajador_id') = ?1
             OR json_extract(despues, '$.trabajador_id') = ?1
             OR fila_id IN (SELECT id FROM {tabla} WHERE trabajador_id = ?1))"
        )
    };
    c.execute(
        &format!(
            "UPDATE historial_acciones SET bloqueada = 1 WHERE id IN (
               SELECT accion_id FROM historial_filas
               WHERE (tabla = 'trabajadores' AND fila_id = ?1) OR ({}) OR ({}))",
            de("asignaciones"),
            de("actividad_roles")
        ),
        [id],
    )?;
    c.execute(
        "UPDATE historial_filas SET
           antes = CASE WHEN antes IS NULL THEN NULL WHEN json_extract(antes, '$.nombre') IS NULL THEN '{}'
                        ELSE json_object('nombre', json_extract(antes, '$.nombre')) END,
           despues = CASE WHEN despues IS NULL THEN NULL WHEN json_extract(despues, '$.nombre') IS NULL THEN '{}'
                          ELSE json_object('nombre', json_extract(despues, '$.nombre')) END
         WHERE tabla = 'trabajadores' AND fila_id = ?1",
        [id],
    )?;
    c.execute(
        &format!(
            "UPDATE historial_filas SET antes = json_remove(antes, '$.motivo'), despues = json_remove(despues, '$.motivo')
             WHERE {}",
            de("asignaciones")
        ),
        [id],
    )?;
    Ok(())
}

/// Abre una acción en la transacción de quien llama: desde aquí los triggers anotan en ella.
pub fn abrir_accion(c: &Connection, origen: &str, datos: &Value) -> Result<String, String> {
    let id = uuid::Uuid::now_v7().to_string();
    c.execute(
        "INSERT INTO historial_acciones (id, fecha, origen, datos) VALUES (?1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?2, ?3)",
        params![id, origen, datos.to_string()],
    )
    .map_err(db::texto)?;
    // con REPLACE y no UPDATE: una base sin la fila de `historial_en_curso` también anota
    c.execute(
        "INSERT OR REPLACE INTO historial_en_curso (uno, accion_id) VALUES (1, ?1)",
        [&id],
    )
    .map_err(db::texto)?;
    Ok(id)
}

/// false: no tenía filas y se borró. Si tenía, la pila de Ctrl+Y se vacía (como en Word); un lote sin cambios no la toca.
pub fn cerrar_accion(c: &Connection, id: &str) -> Result<bool, String> {
    c.execute(
        "INSERT OR REPLACE INTO historial_en_curso (uno, accion_id) VALUES (1, NULL)",
        [],
    )
    .map_err(db::texto)?;
    let hay: bool = c
        .query_row(
            "SELECT EXISTS (SELECT 1 FROM historial_filas WHERE accion_id = ?1)",
            [id],
            |f| f.get(0),
        )
        .map_err(db::texto)?;
    let sql = if hay {
        "UPDATE historial_acciones SET rehacible = NULL WHERE rehacible IS NOT NULL
           AND (SELECT origen FROM historial_acciones WHERE id = ?1) <> 'suprimir'"
    } else {
        "DELETE FROM historial_acciones WHERE id = ?1"
    };
    c.execute(sql, [id]).map_err(db::texto)?;
    Ok(hay)
}

pub fn deshacer(c: &mut Connection, ids: &[String], version_app: &str) -> Result<(), Fallo> {
    mover(c, ids, Sentido::Deshacer, version_app).map_err(propio)
}

pub fn rehacer(c: &mut Connection, ids: &[String], version_app: &str) -> Result<(), Fallo> {
    mover(c, ids, Sentido::Rehacer, version_app).map_err(propio)
}

/// Un fallo sin motivo del historial (texto de SQLite, un id) no se muestra tal cual: la interfaz dice uno genérico.
fn propio(f: Fallo) -> Fallo {
    if f.codigo == "fallo" {
        Fallo {
            codigo: "historial_fallo",
            ..f
        }
    } else {
        f
    }
}

/// Las acciones que hay que deshacer (o rehacer) junto con `id`, sin ella. No cambia nada: la transacción no se confirma.
/// Al rehacer también avisa, como `mover`, si pisaría una posterior hecha.
pub fn conflictos(c: &mut Connection, id: &str, sentido: Sentido) -> Result<Vec<String>, Fallo> {
    let mut revisadas = || -> Result<Vec<String>, Fallo> {
        let mut tx = c.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let (todas, filas) = revisar(&mut tx, BTreeSet::from([id.to_string()]), sentido)?;
        // las filas en juego salen de la última prueba de `conjunto`: un fallo al aplicar (un correo repetido) no es un
        // conflicto, lo dice el rehacer de verdad
        if sentido == Sentido::Rehacer
            && let Some(filas) = filas
        {
            pisadas(culpables(&tx, &todas, &filas, &POSTERIORES)?)?;
        }
        Ok(todas.into_iter().filter(|x| x != id).collect())
    };
    revisadas().map_err(propio)
}

/// Ctrl+Z: la última hecha que se puede deshacer (no se atasca tras un borrado definitivo). Ctrl+Y: la deshecha con `rehacible` mayor que no esté bloqueada.
fn puntero(sentido: Sentido) -> &'static str {
    match sentido {
        Sentido::Deshacer => {
            "SELECT id FROM historial_acciones WHERE estado = 'hecha' AND bloqueada = 0 ORDER BY id DESC LIMIT 1"
        }
        Sentido::Rehacer => {
            "SELECT id FROM historial_acciones WHERE estado = 'deshecha' AND rehacible IS NOT NULL AND bloqueada = 0 ORDER BY rehacible DESC LIMIT 1"
        }
    }
}

/// Deja la base como estaba justo después de `id` (que debe estar hecha): deshace, de la más nueva a la más antigua, todas las hechas posteriores,
/// en una sola transacción (si una no se puede, no cambia nada). Devuelve las que deshizo.
pub fn volver_a(c: &mut Connection, id: &str, version_app: &str) -> Result<Vec<String>, Fallo> {
    let mut volver = || -> Result<Vec<String>, Fallo> {
        let mut tx = c.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let estado: Option<String> = tx
            .query_row(
                "SELECT estado FROM historial_acciones WHERE id = ?1",
                [id],
                |f| f.get(0),
            )
            .optional()?;
        match estado.as_deref() {
            None => return Err(Fallo::de("fallo", format!("no existe la acción {id}"))),
            Some("hecha") => {}
            // lo que hay no es el estado justo después de una deshecha: no se sabe a dónde volver
            Some(_) => return Err(Fallo::de("historial_ya_aplicada", id)),
        }
        let ids: Vec<String> = tx
            .prepare("SELECT id FROM historial_acciones WHERE id > ?1 AND estado = 'hecha' ORDER BY id DESC")?
            .query_map([id], |f| f.get(0))?
            .collect::<rusqlite::Result<_>>()?;
        if !ids.is_empty() {
            mover_en(
                &mut tx,
                ids.iter().cloned().collect(),
                Sentido::Deshacer,
                version_app,
            )?;
            tx.commit()?;
        }
        Ok(ids)
    };
    volver().map_err(propio)
}

/// Ctrl+Z o Ctrl+Y: busca la acción y la mueve en la misma transacción, para que no se cuele un lote entre medio.
/// Devuelve la acción como era antes de moverla (para su frase), o `None` si no había nada.
pub fn mover_ultima(
    c: &mut Connection,
    sentido: Sentido,
    version_app: &str,
) -> Result<Option<AccionBreve>, Fallo> {
    let mut ultima = || -> Result<Option<AccionBreve>, Fallo> {
        let mut tx = c.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let Some(id) = tx
            .query_row(puntero(sentido), [], |f| f.get::<_, String>(0))
            .optional()?
        else {
            return Ok(None);
        };
        let a = breve(&tx, &id)?;
        mover_en(&mut tx, BTreeSet::from([id]), sentido, version_app)?;
        tx.commit()?;
        Ok(Some(a))
    };
    ultima().map_err(propio)
}

fn objeto(json: Option<&str>) -> Result<Map<String, Value>, Fallo> {
    match json {
        None => Ok(Map::new()),
        Some(t) => serde_json::from_str(t).map_err(|e| Fallo::de("fallo", e)),
    }
}

fn mover(
    c: &mut Connection,
    ids: &[String],
    sentido: Sentido,
    version_app: &str,
) -> Result<(), Fallo> {
    let pedidas: BTreeSet<String> = ids.iter().cloned().collect();
    if pedidas.is_empty() {
        return Ok(());
    }
    let mut tx = c.transaction_with_behavior(TransactionBehavior::Immediate)?;
    mover_en(&mut tx, pedidas, sentido, version_app)?;
    tx.commit()?;
    Ok(())
}

fn mover_en(
    tx: &mut Transaction,
    pedidas: BTreeSet<String>,
    sentido: Sentido,
    version_app: &str,
) -> Result<(), Fallo> {
    // lo que se deshace no se anota
    tx.execute("UPDATE historial_en_curso SET accion_id = NULL", [])?;
    let esperado = match sentido {
        Sentido::Deshacer => "hecha",
        Sentido::Rehacer => "deshecha",
    };
    for id in &pedidas {
        let (estado, bloqueada): (String, bool) = tx
            .query_row(
                "SELECT estado, bloqueada FROM historial_acciones WHERE id = ?1",
                [id],
                |f| Ok((f.get(0)?, f.get(1)?)),
            )
            .optional()?
            .ok_or_else(|| Fallo::de("fallo", format!("no existe la acción {id}")))?;
        if bloqueada {
            return Err(Fallo::de("historial_bloqueada", id));
        }
        if estado != esperado {
            return Err(Fallo::de("historial_ya_aplicada", id));
        }
    }
    let (todas, _) = revisar(tx, pedidas.clone(), sentido)?;
    let faltan: Vec<&str> = todas.difference(&pedidas).map(String::as_str).collect();
    if !faltan.is_empty() {
        return Err(Fallo::de("historial_conflicto", faltan.join(",")));
    }
    aplicar(tx, &pedidas, sentido)?;
    if let Some((motivo, filas)) = choques(tx, &pedidas)? {
        if sentido == Sentido::Rehacer {
            pisadas(culpables(tx, &pedidas, &filas, &POSTERIORES)?)?;
        }
        return Err(Fallo::de("historial_no_se_pudo", motivo));
    }
    db::marcar_cambio(tx, version_app)?;
    Ok(())
}

/// El conjunto que hay que mover junto, y las filas que dejaría rotas al aplicarlo de prueba. Ninguna puede estar
/// bloqueada, y al rehacer nada puede pisar una acción posterior que sigue hecha.
fn revisar(
    tx: &mut Transaction,
    ids: BTreeSet<String>,
    sentido: Sentido,
) -> Result<(BTreeSet<String>, EnJuego), Fallo> {
    let (todas, filas) = conjunto(tx, ids, sentido)?;
    let bloqueada: Option<String> = tx
        .query_row(
            "SELECT id FROM historial_acciones WHERE bloqueada = 1 AND id IN (SELECT value FROM json_each(?1))
             ORDER BY id LIMIT 1",
            [como_json(&todas)],
            |f| f.get(0),
        )
        .optional()?;
    if let Some(id) = bloqueada {
        return Err(Fallo::de("historial_bloqueada", id));
    }
    if sentido == Sentido::Rehacer {
        pisadas(mismas_filas(tx, &todas, &POSTERIORES)?)?;
    }
    Ok((todas, filas))
}

/// Rehacer sobre una acción posterior hecha la pisaría sin que quede anotado: no se hace.
fn pisadas(ids: Vec<String>) -> Result<(), Fallo> {
    if ids.is_empty() {
        return Ok(());
    }
    Err(Fallo::de(
        "historial_no_se_pudo",
        format!("posterior:{}", ids.join(",")),
    ))
}

/// Con qué acciones se choca: cuáles cuentan, cómo se ordena una fila compartida y cómo se ordena la acción misma.
struct Vecinas {
    estado: &'static str,
    comparte: &'static str,
    cerca: &'static str,
}

/// Las hechas que vinieron después: chocan al deshacer, y al rehacer no se pueden pisar.
const POSTERIORES: Vecinas = Vecinas {
    estado: "a.estado = 'hecha'",
    comparte: "g.accion_id < a.id",
    cerca: "a.id > (SELECT min(value) FROM json_each(?1))",
};
/// Las deshechas que vinieron antes y siguen en la pila de Ctrl+Y: hay que rehacerlas primero. Una que salió de la pila
/// (vino un cambio nuevo) no traba a las demás.
const ANTERIORES: Vecinas = Vecinas {
    estado: "a.estado = 'deshecha' AND a.rehacible IS NOT NULL",
    comparte: "g.accion_id > a.id",
    cerca: "a.id < (SELECT max(value) FROM json_each(?1))",
};

fn vecinas(sentido: Sentido) -> &'static Vecinas {
    match sentido {
        Sentido::Deshacer => &POSTERIORES,
        Sentido::Rehacer => &ANTERIORES,
    }
}

/// `ids` más las acciones con las que chocan, hasta que no aparecen más: las que comparten filas y, aplicando de prueba,
/// las que tocaron una fila que queda con una referencia rota o en un ciclo. Devuelve también las filas en juego de la
/// última prueba, si dejó alguna.
fn conjunto(
    tx: &mut Transaction,
    mut ids: BTreeSet<String>,
    sentido: Sentido,
) -> Result<(BTreeSet<String>, EnJuego), Fallo> {
    loop {
        let mut nuevas = mismas_filas(tx, &ids, vecinas(sentido))?;
        let mut en_juego = None;
        if nuevas.is_empty() {
            let prueba = tx.savepoint()?;
            // un fallo aquí (un correo repetido) no es un choque: lo dice el deshacer de verdad
            if aplicar(&prueba, &ids, sentido).is_ok()
                && let Some((_, filas)) = choques(&prueba, &ids)?
            {
                nuevas = culpables(&prueba, &ids, &filas, vecinas(sentido))?;
                en_juego = Some(filas);
            }
        }
        if nuevas.is_empty() {
            return Ok((ids, en_juego));
        }
        ids.extend(nuevas);
    }
}

fn como_json(ids: &BTreeSet<String>) -> String {
    Value::from(
        ids.iter()
            .map(|x| Value::from(x.as_str()))
            .collect::<Vec<_>>(),
    )
    .to_string()
}

/// Las `vecinas` fuera de `ids` que comparten una fila con alguna de `ids`, del lado que toca (antes o después de ella).
fn mismas_filas(c: &Connection, ids: &BTreeSet<String>, v: &Vecinas) -> Result<Vec<String>, Fallo> {
    let (estado, orden) = (v.estado, v.comparte);
    let sql = format!(
        "SELECT DISTINCT a.id FROM historial_acciones a JOIN historial_filas f ON f.accion_id = a.id
         WHERE {estado} AND a.id NOT IN (SELECT value FROM json_each(?1))
           AND EXISTS (SELECT 1 FROM historial_filas g WHERE g.accion_id IN (SELECT value FROM json_each(?1))
                       AND {orden} AND g.tabla = f.tabla AND g.fila_id = f.fila_id)"
    );
    Ok(c.prepare(&sql)?
        .query_map([como_json(ids)], |f| f.get(0))?
        .collect::<rusqlite::Result<_>>()?)
}

/// Las `vecinas` fuera de `ids` que tocaron alguna de `filas`.
fn culpables(
    c: &Connection,
    ids: &BTreeSet<String>,
    filas: &[(String, String)],
    v: &Vecinas,
) -> Result<Vec<String>, Fallo> {
    let (estado, orden) = (v.estado, v.cerca);
    let filas = Value::from(
        filas
            .iter()
            .map(|(t, id)| Value::from(vec![t.as_str(), id.as_str()]))
            .collect::<Vec<_>>(),
    );
    let sql = format!(
        "SELECT DISTINCT a.id FROM historial_acciones a JOIN historial_filas f ON f.accion_id = a.id
         WHERE {estado} AND {orden} AND a.id NOT IN (SELECT value FROM json_each(?1))
           AND EXISTS (SELECT 1 FROM json_each(?2) j
                       WHERE f.tabla = j.value ->> 0 AND f.fila_id = j.value ->> 1)"
    );
    Ok(c.prepare(&sql)?
        .query_map(params![como_json(ids), filas.to_string()], |f| f.get(0))?
        .collect::<rusqlite::Result<_>>()?)
}

/// Aplica el revés (o el derecho) de las filas de `ids`: al deshacer, de la más nueva a la más antigua.
fn aplicar(c: &Connection, ids: &BTreeSet<String>, sentido: Sentido) -> Result<(), Fallo> {
    let mut columnas: HashMap<String, Vec<String>> = HashMap::new();
    let lista: Vec<&String> = match sentido {
        Sentido::Deshacer => ids.iter().rev().collect(),
        Sentido::Rehacer => ids.iter().collect(),
    };
    let orden = if sentido == Sentido::Deshacer {
        "DESC"
    } else {
        "ASC"
    };
    for id in lista {
        let filas: Vec<Fila> = c
            .prepare(&format!(
                "SELECT tabla, fila_id, op, antes, despues FROM historial_filas WHERE accion_id = ?1 ORDER BY orden {orden}"
            ))?
            .query_map([id], |f| Ok((f.get(0)?, f.get(1)?, f.get(2)?, f.get(3)?, f.get(4)?)))?
            .collect::<rusqlite::Result<_>>()?;
        for (tabla, fila_id, op, antes, despues) in filas {
            if !columnas.contains_key(&tabla) {
                let lista = columnas_de(c, &tabla)?
                    .ok_or_else(|| Fallo::de("fallo", format!("tabla desconocida: {tabla}")))?;
                columnas.insert(tabla.clone(), lista);
            }
            let validas = &columnas[&tabla];
            let (sql, valores) = match (sentido, op.as_str()) {
                (Sentido::Deshacer, "insert") | (Sentido::Rehacer, "delete") => (None, Map::new()),
                (Sentido::Deshacer, "update") => (Some("update"), objeto(antes.as_deref())?),
                (Sentido::Rehacer, "update") => (Some("update"), objeto(despues.as_deref())?),
                (Sentido::Deshacer, _) => (Some("insert"), objeto(antes.as_deref())?),
                (Sentido::Rehacer, _) => (Some("insert"), objeto(despues.as_deref())?),
            };
            if let Some(k) = valores.keys().find(|k| !validas.contains(k)) {
                return Err(Fallo::de(
                    "fallo",
                    format!("columna desconocida: {tabla}.{k}"),
                ));
            }
            let nombres: Vec<String> = valores.keys().map(|k| format!("\"{k}\"")).collect();
            let mut parametros: Vec<rusqlite::types::Value> =
                valores.values().map(db::a_sql).collect();
            let clave = clave_de(&tabla);
            let sentencia = match sql {
                None => format!("DELETE FROM \"{tabla}\" WHERE \"{clave}\" = ?"),
                Some("update") => format!(
                    "UPDATE \"{tabla}\" SET {} WHERE \"{clave}\" = ?",
                    nombres
                        .iter()
                        .map(|n| format!("{n} = ?"))
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
                Some(_) => format!(
                    "INSERT INTO \"{tabla}\" ({}) VALUES ({})",
                    nombres.join(", "),
                    vec!["?"; nombres.len()].join(", ")
                ),
            };
            if sql != Some("insert") {
                parametros.push(rusqlite::types::Value::Text(fila_id));
            }
            // en caché: deshacer una importación repite las mismas pocas sentencias miles de veces
            c.prepare_cached(&sentencia)?
                .execute(rusqlite::params_from_iter(parametros))
                .map_err(|e| match e.sqlite_error_code() {
                    Some(ErrorCode::ConstraintViolation) => Fallo::de("historial_no_se_pudo", e),
                    _ => Fallo::from(e),
                })?;
        }
        match sentido {
            Sentido::Deshacer => c.execute(
                "UPDATE historial_acciones SET estado = 'deshecha',
                   rehacible = (SELECT coalesce(max(rehacible), 0) + 1 FROM historial_acciones) WHERE id = ?1",
                [id],
            )?,
            Sentido::Rehacer => c.execute(
                "UPDATE historial_acciones SET estado = 'hecha', rehacible = NULL WHERE id = ?1",
                [id],
            )?,
        };
    }
    Ok(())
}

/// Si lo aplicado dejó una referencia rota o un ciclo: el motivo y las filas en juego. Solo cuenta lo que toca alguna fila
/// de `ids`, para que un problema que ya traía la base no lo bloquee todo.
fn choques(c: &Connection, ids: &BTreeSet<String>) -> Result<Option<Choque>, Fallo> {
    let tocadas: BTreeSet<(String, String)> = c
        .prepare("SELECT DISTINCT tabla, fila_id FROM historial_filas WHERE accion_id IN (SELECT value FROM json_each(?1))")?
        .query_map([como_json(ids)], |f| Ok((f.get(0)?, f.get(1)?)))?
        .collect::<rusqlite::Result<_>>()?;
    let rotas: Vec<(String, i64, String, i64)> = c
        .prepare("SELECT \"table\", rowid, parent, fkid FROM pragma_foreign_key_check")?
        .query_map([], |f| Ok((f.get(0)?, f.get(1)?, f.get(2)?, f.get(3)?)))?
        .collect::<rusqlite::Result<_>>()?;
    let mut filas = Vec::new();
    for (tabla, rowid, padre, fkid) in rotas {
        // una fila huérfana de historial_filas (de un respaldo) no es asunto de este deshacer
        if columnas_de(c, &tabla)?.is_none() {
            continue;
        }
        let desde: String = c.query_row(
            "SELECT \"from\" FROM pragma_foreign_key_list(?1) WHERE id = ?2",
            params![tabla, fkid],
            |f| f.get(0),
        )?;
        let (hija, apunta): (String, String) = c.query_row(
            &format!(
                "SELECT \"{}\", \"{desde}\" FROM \"{tabla}\" WHERE rowid = ?1",
                clave_de(&tabla)
            ),
            [rowid],
            |f| Ok((f.get(0)?, f.get(1)?)),
        )?;
        let par = [(tabla, hija), (padre, apunta)];
        if par.iter().any(|x| tocadas.contains(x)) {
            filas.extend(par);
        }
    }
    if !filas.is_empty() {
        return Ok(Some(("referencias", filas)));
    }
    let ciclo: Vec<(String, String)> = validar::en_ciclo(c)?
        .into_iter()
        .map(|u| ("unidades".to_string(), u))
        .collect();
    if ciclo.iter().any(|x| tocadas.contains(x)) {
        return Ok(Some(("ciclo", ciclo)));
    }
    Ok(None)
}

/// Las columnas de una tabla de negocio, o `None` si no lo es: el historial puede venir de un respaldo.
fn columnas_de(c: &Connection, tabla: &str) -> Result<Option<Vec<String>>, Fallo> {
    let existe: bool = c.query_row(
        "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1
           AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'historial_%')",
        [tabla],
        |f| f.get(0),
    )?;
    if !existe {
        return Ok(None);
    }
    Ok(Some(
        c.prepare("SELECT name FROM pragma_table_info(?1)")?
            .query_map([tabla], |f| f.get(0))?
            .collect::<rusqlite::Result<_>>()?,
    ))
}

fn clave_de(tabla: &str) -> &'static str {
    if tabla == "meta" { "clave" } else { "id" }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use rusqlite::types::Value as Valor;
    use rusqlite::{Connection, OptionalExtension};

    const TIPO: &str = "00000000-0000-7000-8000-000000000001";

    pub(super) fn base() -> Connection {
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

    fn accion_con_fecha(c: &Connection, id: &str, fecha: &str) {
        c.execute(
            "INSERT INTO historial_acciones (id, fecha, origen) VALUES (?1, ?2, 'app')",
            [id, fecha],
        )
        .unwrap();
        c.execute(
            "INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, despues) VALUES (?1, 1, 'unidades', 'u1', 'update', '{}')",
            [id],
        )
        .unwrap();
    }

    fn contar(c: &Connection, tabla: &str) -> i64 {
        c.query_row(&format!("SELECT count(*) FROM {tabla}"), [], |f| f.get(0))
            .unwrap()
    }

    fn hace(c: &Connection, dias: i64) -> String {
        c.query_row(
            "SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?1)",
            [format!("-{dias} days")],
            |f| f.get(0),
        )
        .unwrap()
    }

    #[test]
    fn podar_usa_365_dias_sin_clave() {
        let c = base();
        accion_con_fecha(&c, "vieja", &hace(&c, 366));
        accion_con_fecha(&c, "nueva", &hace(&c, 364));
        assert_eq!(podar(&c).unwrap(), 1);
        assert_eq!(contar(&c, "historial_acciones"), 1);
        assert_eq!(contar(&c, "historial_filas"), 1);
    }

    #[test]
    fn podar_con_cero_no_borra_nada() {
        let c = base();
        c.execute(
            "INSERT INTO meta (clave, valor) VALUES ('historial_plazo_dias', '0')",
            [],
        )
        .unwrap();
        accion_con_fecha(&c, "vieja", "2000-01-01T00:00:00.000Z");
        assert_eq!(podar(&c).unwrap(), 0);
        assert_eq!(contar(&c, "historial_acciones"), 1);
    }

    #[test]
    fn podar_con_30_borra_lo_anterior_con_sus_filas() {
        let c = base();
        c.execute(
            "INSERT INTO meta (clave, valor) VALUES ('historial_plazo_dias', '30')",
            [],
        )
        .unwrap();
        accion_con_fecha(&c, "a", &hace(&c, 31));
        accion_con_fecha(&c, "b", &hace(&c, 100));
        accion_con_fecha(&c, "c", &hace(&c, 29));
        assert_eq!(podar(&c).unwrap(), 2);
        assert_eq!(contar(&c, "historial_acciones"), 1);
        assert_eq!(contar(&c, "historial_filas"), 1);
    }

    #[test]
    fn podar_con_un_plazo_invalido_usa_365_dias() {
        for plazo in ["abc", "-5", ""] {
            let c = base();
            c.execute(
                "INSERT INTO meta (clave, valor) VALUES ('historial_plazo_dias', ?1)",
                [plazo],
            )
            .unwrap();
            accion_con_fecha(&c, "vieja", &hace(&c, 366));
            accion_con_fecha(&c, "nueva", &hace(&c, 364));
            assert_eq!(podar(&c).unwrap(), 1, "{plazo:?}");
            assert_eq!(contar(&c, "historial_acciones"), 1);
        }
    }

    #[test]
    fn limpiar_persona_bloquea_sus_roles_y_tolera_filas_sin_nombre() {
        let c = base();
        c.execute_batch(
            r#"INSERT INTO historial_acciones (id, fecha, origen) VALUES ('rol', 'x', 'app'), ('vacia', 'x', 'app'), ('otra', 'x', 'app');
             INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues) VALUES
               ('rol', 1, 'actividad_roles', 'r1', 'insert', NULL, '{"trabajador_id":"t1","rol":"R"}'),
               ('vacia', 1, 'trabajadores', 't1', 'update', '{}', '{"correo":"a@x.cl"}'),
               ('otra', 1, 'actividad_roles', 'r2', 'insert', NULL, '{"trabajador_id":"t2"}');"#,
        )
        .unwrap();
        limpiar_persona(&c, "t1").unwrap();
        let bloqueadas: Vec<String> = c
            .prepare("SELECT id FROM historial_acciones WHERE bloqueada = 1 ORDER BY id")
            .unwrap()
            .query_map([], |f| f.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert_eq!(bloqueadas, ["rol", "vacia"]);
        assert_eq!(
            filas(&c)
                .into_iter()
                .filter(|f| f.0 == "trabajadores")
                .map(|f| (f.2, f.3))
                .collect::<Vec<_>>(),
            [(Some("{}".to_string()), Some("{}".to_string()))]
        );
    }

    #[test]
    fn una_base_sin_la_fila_de_en_curso_igual_anota() {
        let mut c = base();
        c.execute("DELETE FROM historial_en_curso", []).unwrap();
        let a = lote(
            &mut c,
            &["UPDATE unidades SET nombre = 'Norte' WHERE id = 'u1'"],
        );
        assert!(a.is_some());
        assert_eq!(cuenta(&c, "SELECT count(*) FROM historial_en_curso"), 1);
        assert_eq!(uno(&c, "SELECT accion_id FROM historial_en_curso"), None);
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
                    // la clave y el valor de la columna: solo el nombre lo tendría cualquier trigger con `id`
                    let esperado = match op {
                        "insert" => format!("'{col}', NEW.{col}"),
                        "update" => format!("OLD.{col} IS NOT NEW.{col}"),
                        _ => format!("'{col}', OLD.{col}"),
                    };
                    assert!(sql.contains(&esperado), "historial_{t}_{op} no anota {col}");
                }
            }
        }
    }

    #[test]
    fn sin_accion_abierta_no_anota() {
        let c = base();
        c.execute("UPDATE unidades SET nombre = 'Otro'", [])
            .unwrap();
        assert!(filas(&c).is_empty());
    }

    #[test]
    fn un_update_guarda_solo_lo_que_cambio() {
        let c = base();
        abrir_accion(&c);
        c.execute(
            "UPDATE unidades SET nombre = 'Ventas Norte' WHERE id = 'u1'",
            [],
        )
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
        c.execute("UPDATE unidades SET nombre = 'Ventas'", [])
            .unwrap();
        assert!(filas(&c).is_empty());
    }

    #[test]
    fn replace_en_meta_anota_borrado_e_insercion() {
        let c = base();
        c.execute(
            "INSERT INTO meta (clave, valor) VALUES ('org_nombre', 'A')",
            [],
        )
        .unwrap();
        abrir_accion(&c);
        c.execute(
            "INSERT OR REPLACE INTO meta (clave, valor) VALUES ('org_nombre', 'B')",
            [],
        )
        .unwrap();
        let f = filas(&c);
        let ops: Vec<&str> = f.iter().map(|x| x.1.as_str()).collect();
        assert_eq!(ops, ["delete", "insert"]);
        assert_eq!(
            f[0].2.as_deref(),
            Some(r#"{"clave":"org_nombre","valor":"A"}"#)
        );
        assert_eq!(
            f[1].3.as_deref(),
            Some(r#"{"clave":"org_nombre","valor":"B"}"#)
        );
    }

    #[test]
    fn meta_solo_anota_sus_claves() {
        let c = base();
        abrir_accion(&c);
        c.execute(
            "INSERT INTO meta (clave, valor) VALUES ('data_revision', '1')",
            [],
        )
        .unwrap();
        c.execute(
            "UPDATE meta SET valor = '2' WHERE clave = 'data_revision'",
            [],
        )
        .unwrap();
        assert!(filas(&c).is_empty());
    }

    // --- anotar, deshacer y rehacer ---

    pub(super) fn lote(c: &mut Connection, sqls: &[&str]) -> Option<String> {
        let s: Vec<db::Sentencia> = sqls
            .iter()
            .map(|x| db::Sentencia {
                sql: x.replace("{TIPO}", TIPO),
                params: vec![],
            })
            .collect();
        db::lote(c, &s, "t").unwrap()
    }

    pub(super) fn uno(c: &Connection, sql: &str) -> Option<String> {
        c.query_row(sql, [], |f| f.get::<_, Option<String>>(0))
            .optional()
            .unwrap()
            .flatten()
    }

    pub(super) fn cuenta(c: &Connection, sql: &str) -> i64 {
        c.query_row(sql, [], |f| f.get(0)).unwrap()
    }

    /// Todas las tablas de negocio, sin el contador de cambios de `meta`.
    fn volcado(c: &Connection) -> Vec<String> {
        let tablas: Vec<String> = c
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'historial_%'")
            .unwrap()
            .query_map([], |f| f.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        let mut v = Vec::new();
        for t in tablas {
            let filtro = if t == "meta" {
                " WHERE clave NOT IN ('data_revision', 'app_version_ultima')"
            } else {
                ""
            };
            let mut st = c.prepare(&format!("SELECT * FROM {t}{filtro}")).unwrap();
            let n = st.column_count();
            let mut filas = st.query([]).unwrap();
            while let Some(f) = filas.next().unwrap() {
                let valores: Vec<Valor> = (0..n).map(|i| f.get(i).unwrap()).collect();
                v.push(format!("{t}: {valores:?}"));
            }
        }
        v.sort();
        v
    }

    #[test]
    fn lote_crea_una_accion_y_deshacer_devuelve_la_base_exacta() {
        let mut c = base();
        c.execute_batch(&format!(
            "INSERT INTO meta (clave, valor) VALUES ('org_nombre', 'A');
             INSERT INTO cargos (id, nombre, created_at, updated_at) VALUES ('c1', 'Jefe', 'x', 'x');
             INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES ('u2', '{TIPO}', 'Borrar', 'x', 'x');"
        ))
        .unwrap();
        let antes = volcado(&c);
        let id = lote(
            &mut c,
            &[
                "INSERT INTO unidades (id, tipo_id, nombre, parent_id, created_at, updated_at) VALUES ('u3', '{TIPO}', 'Nueva', 'u1', 'x', 'x')",
                "UPDATE unidades SET nombre = 'Ventas Norte', updated_at = 'y' WHERE id = 'u1'",
                "DELETE FROM unidades WHERE id = 'u2'",
                "INSERT OR REPLACE INTO meta (clave, valor) VALUES ('org_nombre', 'B')",
                "UPDATE cargos SET deleted_at = 'z' WHERE id = 'c1'",
            ],
        )
        .unwrap();
        let despues = volcado(&c);
        assert_ne!(antes, despues);
        assert_eq!(cuenta(&c, "SELECT count(*) FROM historial_acciones"), 1);
        deshacer(&mut c, std::slice::from_ref(&id), "t").unwrap();
        assert_eq!(volcado(&c), antes);
        rehacer(&mut c, std::slice::from_ref(&id), "t").unwrap();
        assert_eq!(volcado(&c), despues);
    }

    #[test]
    fn un_lote_que_no_toca_filas_no_deja_accion() {
        let mut c = base();
        assert_eq!(
            lote(
                &mut c,
                &["UPDATE unidades SET nombre = 'Ventas' WHERE id = 'u1'"]
            ),
            None
        );
        assert_eq!(cuenta(&c, "SELECT count(*) FROM historial_acciones"), 0);
        assert_eq!(uno(&c, "SELECT accion_id FROM historial_en_curso"), None);
    }

    #[test]
    fn deshacer_varias_va_de_la_mas_nueva_a_la_mas_antigua() {
        let mut c = base();
        c.execute(
            "INSERT INTO cargos (id, nombre, created_at, updated_at) VALUES ('c1', 'Jefe', 'x', 'x')",
            [],
        )
        .unwrap();
        // al revés, la primera devolvería «Jefe» con la otra «Jefe» todavía viva
        let a1 = lote(
            &mut c,
            &["UPDATE cargos SET nombre = 'Gerente' WHERE id = 'c1'"],
        )
        .unwrap();
        let a2 = lote(
            &mut c,
            &["INSERT INTO cargos (id, nombre, created_at, updated_at) VALUES ('c2', 'Jefe', 'x', 'x')"],
        )
        .unwrap();
        assert!(a1 < a2);
        deshacer(&mut c, &[a1.clone(), a2], "t").unwrap();
        assert_eq!(
            uno(&c, "SELECT nombre FROM cargos WHERE id = 'c1'").as_deref(),
            Some("Jefe")
        );
        assert_eq!(uno(&c, "SELECT nombre FROM cargos WHERE id = 'c2'"), None);
        let p = punteros(&c).unwrap();
        assert!(p.deshacer.is_none());
        // Ctrl+Y rehace primero la más antigua
        assert_eq!(p.rehacer.unwrap().id, a1);
    }

    #[test]
    fn una_accion_nueva_vacia_la_pila_de_rehacer() {
        let mut c = base();
        let a1 = lote(
            &mut c,
            &["UPDATE unidades SET nombre = 'Norte' WHERE id = 'u1'"],
        )
        .unwrap();
        deshacer(&mut c, std::slice::from_ref(&a1), "t").unwrap();
        assert_eq!(punteros(&c).unwrap().rehacer.unwrap().id, a1);
        // un lote que no cambia nada no cuenta
        lote(
            &mut c,
            &["UPDATE unidades SET nombre = 'Ventas' WHERE id = 'u1'"],
        );
        assert_eq!(punteros(&c).unwrap().rehacer.unwrap().id, a1);
        let a2 = lote(
            &mut c,
            &["UPDATE unidades SET nombre = 'Sur' WHERE id = 'u1'"],
        )
        .unwrap();
        let p = punteros(&c).unwrap();
        assert!(p.rehacer.is_none());
        assert_eq!(p.deshacer.unwrap().id, a2);
        assert_eq!(
            cuenta(
                &c,
                "SELECT count(*) FROM historial_acciones WHERE rehacible IS NOT NULL"
            ),
            0
        );
        // la primera, deshecha y fuera de la pila, no traba el Ctrl+Y de la segunda
        deshacer(&mut c, std::slice::from_ref(&a2), "t").unwrap();
        assert!(
            conflictos(&mut c, &a2, Sentido::Rehacer)
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            mover_ultima(&mut c, Sentido::Rehacer, "t")
                .unwrap()
                .unwrap()
                .id,
            a2
        );
        assert_eq!(
            uno(&c, "SELECT nombre FROM unidades WHERE id = 'u1'").as_deref(),
            Some("Sur")
        );
    }

    #[test]
    fn ctrl_z_y_ctrl_y_buscan_y_mueven_juntos() {
        let mut c = base();
        assert!(
            mover_ultima(&mut c, Sentido::Deshacer, "t")
                .unwrap()
                .is_none()
        );
        let a = lote(&mut c, &[&unidad("u2", None)]).unwrap();
        let z = mover_ultima(&mut c, Sentido::Deshacer, "t")
            .unwrap()
            .unwrap();
        // la frase se arma con la acción como era antes de moverla
        assert_eq!((z.id.as_str(), z.estado.as_str()), (a.as_str(), "hecha"));
        assert_eq!(uno(&c, "SELECT id FROM unidades WHERE id = 'u2'"), None);
        assert!(
            mover_ultima(&mut c, Sentido::Deshacer, "t")
                .unwrap()
                .is_none()
        );
        // deshecha, la unidad ya no está: el nombre sale de la fila misma
        let y = mover_ultima(&mut c, Sentido::Rehacer, "t")
            .unwrap()
            .unwrap();
        assert_eq!(y.muestra[0].nombre.as_deref(), Some("u2"));
        assert!(uno(&c, "SELECT id FROM unidades WHERE id = 'u2'").is_some());
        // un fallo sin motivo del historial no llega tal cual
        c.execute("UPDATE historial_filas SET tabla = 'no_existe'", [])
            .unwrap();
        let e = mover_ultima(&mut c, Sentido::Deshacer, "t").unwrap_err();
        assert_eq!(e.codigo, "historial_fallo");
    }

    #[test]
    fn conflicto_por_misma_fila() {
        let mut c = base();
        let a1 = lote(
            &mut c,
            &["INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES ('u2', '{TIPO}', 'Nueva', 'x', 'x')"],
        )
        .unwrap();
        let a2 = lote(
            &mut c,
            &["UPDATE unidades SET nombre = 'Otra' WHERE id = 'u2'"],
        )
        .unwrap();
        assert_eq!(
            conflictos(&mut c, &a1, Sentido::Deshacer).unwrap(),
            [a2.as_str()]
        );
        // la última nunca choca
        assert!(
            conflictos(&mut c, &a2, Sentido::Deshacer)
                .unwrap()
                .is_empty()
        );
        // al rehacer, la otra cara: lo anterior que sigue deshecho
        deshacer(&mut c, &[a1.clone(), a2.clone()], "t").unwrap();
        assert_eq!(conflictos(&mut c, &a2, Sentido::Rehacer).unwrap(), [a1]);
    }

    #[test]
    fn conflicto_por_dependencia() {
        let mut c = base();
        let a = lote(
            &mut c,
            &["INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES ('ua', '{TIPO}', 'A', 'x', 'x')"],
        )
        .unwrap();
        let b = lote(
            &mut c,
            &["INSERT INTO unidades (id, tipo_id, nombre, parent_id, created_at, updated_at) VALUES ('ub', '{TIPO}', 'B', 'ua', 'x', 'x')"],
        )
        .unwrap();
        assert_eq!(conflictos(&mut c, &a, Sentido::Deshacer).unwrap(), [b]);
    }

    #[test]
    fn deshacer_con_correo_repetido_no_cambia_nada() {
        let mut c = base();
        c.execute(
            "INSERT INTO trabajadores (id, nombre, correo, created_at, updated_at) VALUES ('x', 'X', 'c@x.cl', 'x', 'x')",
            [],
        )
        .unwrap();
        let a1 = lote(
            &mut c,
            &["UPDATE trabajadores SET correo = 'd@x.cl' WHERE id = 'x'"],
        )
        .unwrap();
        lote(
            &mut c,
            &["INSERT INTO trabajadores (id, nombre, correo, created_at, updated_at) VALUES ('y', 'Y', 'c@x.cl', 'x', 'x')"],
        )
        .unwrap();
        let antes = volcado(&c);
        let e = deshacer(&mut c, std::slice::from_ref(&a1), "t").unwrap_err();
        assert_eq!(e.codigo, "historial_no_se_pudo");
        assert!(e.detalle.contains("UNIQUE"), "{}", e.detalle);
        assert_eq!(volcado(&c), antes);
        assert_eq!(
            uno(
                &c,
                &format!("SELECT estado FROM historial_acciones WHERE id = '{a1}'")
            )
            .as_deref(),
            Some("hecha")
        );
    }

    #[test]
    fn deshacer_sin_los_conflictos_da_historial_conflicto() {
        let mut c = base();
        let a1 = lote(
            &mut c,
            &["INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES ('u2', '{TIPO}', 'Nueva', 'x', 'x')"],
        )
        .unwrap();
        let a2 = lote(
            &mut c,
            &["UPDATE unidades SET nombre = 'Otra' WHERE id = 'u2'"],
        )
        .unwrap();
        let e = deshacer(&mut c, std::slice::from_ref(&a1), "t").unwrap_err();
        assert_eq!(
            (e.codigo, e.detalle.as_str()),
            ("historial_conflicto", a2.as_str())
        );
        assert_eq!(
            uno(&c, "SELECT nombre FROM unidades WHERE id = 'u2'").as_deref(),
            Some("Otra")
        );
        deshacer(&mut c, &[a1, a2], "t").unwrap();
        assert_eq!(uno(&c, "SELECT nombre FROM unidades WHERE id = 'u2'"), None);
    }

    #[test]
    fn una_bloqueada_no_se_deshace() {
        let mut c = base();
        let a = lote(
            &mut c,
            &["UPDATE unidades SET nombre = 'Norte' WHERE id = 'u1'"],
        )
        .unwrap();
        assert_eq!(
            rehacer(&mut c, std::slice::from_ref(&a), "t")
                .unwrap_err()
                .codigo,
            "historial_ya_aplicada"
        );
        c.execute("UPDATE historial_acciones SET bloqueada = 1", [])
            .unwrap();
        assert_eq!(
            deshacer(&mut c, std::slice::from_ref(&a), "t")
                .unwrap_err()
                .codigo,
            "historial_bloqueada"
        );
        assert_eq!(
            uno(&c, "SELECT nombre FROM unidades WHERE id = 'u1'").as_deref(),
            Some("Norte")
        );
    }

    #[test]
    fn deshacer_no_anota_nada() {
        let mut c = base();
        let a = lote(
            &mut c,
            &[
                "UPDATE unidades SET nombre = 'Norte' WHERE id = 'u1'",
                "INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES ('u2', '{TIPO}', 'Nueva', 'x', 'x')",
            ],
        )
        .unwrap();
        let cuentas = |c: &Connection| {
            (
                cuenta(c, "SELECT count(*) FROM historial_acciones"),
                cuenta(c, "SELECT count(*) FROM historial_filas"),
            )
        };
        let antes = cuentas(&c);
        deshacer(&mut c, std::slice::from_ref(&a), "t").unwrap();
        assert_eq!(cuentas(&c), antes);
        rehacer(&mut c, std::slice::from_ref(&a), "t").unwrap();
        assert_eq!(cuentas(&c), antes);
        assert_eq!(uno(&c, "SELECT accion_id FROM historial_en_curso"), None);
    }

    pub(super) fn unidad(id: &str, padre: Option<&str>) -> String {
        let padre = padre.map_or("NULL".into(), |p| format!("'{p}'"));
        format!(
            "INSERT INTO unidades (id, tipo_id, nombre, parent_id, created_at, updated_at) VALUES ('{id}', '{{TIPO}}', '{id}', {padre}, 'x', 'x')"
        )
    }

    #[test]
    fn rehacer_con_una_posterior_hecha_sobre_la_misma_fila_no_cambia_nada() {
        // un cambio de nombre posterior
        let mut c = base();
        let a1 = lote(
            &mut c,
            &["UPDATE unidades SET nombre = 'Norte' WHERE id = 'u1'"],
        )
        .unwrap();
        deshacer(&mut c, std::slice::from_ref(&a1), "t").unwrap();
        let a2 = lote(
            &mut c,
            &["UPDATE unidades SET nombre = 'Sur' WHERE id = 'u1'"],
        )
        .unwrap();
        let antes = volcado(&c);
        let e = rehacer(&mut c, std::slice::from_ref(&a1), "t").unwrap_err();
        assert_eq!(
            (e.codigo, e.detalle),
            ("historial_no_se_pudo", format!("posterior:{a2}"))
        );
        assert_eq!(volcado(&c), antes);
        let e = conflictos(&mut c, &a1, Sentido::Rehacer).unwrap_err();
        assert_eq!(e.detalle, format!("posterior:{a2}"));

        // un borrado posterior
        let mut c = base();
        lote(&mut c, &[&unidad("u2", None)]).unwrap();
        let a1 = lote(
            &mut c,
            &["UPDATE unidades SET nombre = 'Otra' WHERE id = 'u2'"],
        )
        .unwrap();
        deshacer(&mut c, std::slice::from_ref(&a1), "t").unwrap();
        let a2 = lote(&mut c, &["DELETE FROM unidades WHERE id = 'u2'"]).unwrap();
        let antes = volcado(&c);
        let e = rehacer(&mut c, std::slice::from_ref(&a1), "t").unwrap_err();
        assert_eq!(e.detalle, format!("posterior:{a2}"));
        assert_eq!(volcado(&c), antes);

        // una posterior que cuelga de lo que rehacer borraría
        let mut c = base();
        c.execute_batch(&unidad("u3", None).replace("{TIPO}", TIPO))
            .unwrap();
        let a1 = lote(&mut c, &["DELETE FROM unidades WHERE id = 'u3'"]).unwrap();
        deshacer(&mut c, std::slice::from_ref(&a1), "t").unwrap();
        let a2 = lote(&mut c, &[&unidad("u4", Some("u3"))]).unwrap();
        let antes = volcado(&c);
        let e = rehacer(&mut c, std::slice::from_ref(&a1), "t").unwrap_err();
        assert_eq!(
            (e.codigo, e.detalle),
            ("historial_no_se_pudo", format!("posterior:{a2}"))
        );
        assert_eq!(volcado(&c), antes);
        // no comparten filas: solo aplicando de prueba se ve, y `conflictos` lo anticipa igual que `rehacer`
        let e = conflictos(&mut c, &a1, Sentido::Rehacer).unwrap_err();
        assert_eq!(
            (e.codigo, e.detalle),
            ("historial_no_se_pudo", format!("posterior:{a2}"))
        );
        assert_eq!(volcado(&c), antes);
    }

    #[test]
    fn conflicto_al_rehacer_por_dependencia() {
        let mut c = base();
        let a = lote(&mut c, &[&unidad("ua", None)]).unwrap();
        let b = lote(&mut c, &[&unidad("ub", Some("ua"))]).unwrap();
        deshacer(&mut c, &[a.clone(), b.clone()], "t").unwrap();
        assert_eq!(
            conflictos(&mut c, &b, Sentido::Rehacer).unwrap(),
            [a.as_str()]
        );
        let e = rehacer(&mut c, std::slice::from_ref(&b), "t").unwrap_err();
        assert_eq!(
            (e.codigo, e.detalle.as_str()),
            ("historial_conflicto", a.as_str())
        );
        rehacer(&mut c, &[a, b], "t").unwrap();
        assert_eq!(
            uno(&c, "SELECT parent_id FROM unidades WHERE id = 'ub'").as_deref(),
            Some("ua")
        );
    }

    #[test]
    fn deshacer_que_rompe_referencias_o_hace_un_ciclo_no_se_puede() {
        // la hija se creó sin pasar por el historial: no hay con quién deshacerla
        let mut c = base();
        let a = lote(&mut c, &[&unidad("ua", None)]).unwrap();
        c.execute_batch(&unidad("ub", Some("ua")).replace("{TIPO}", TIPO))
            .unwrap();
        let antes = volcado(&c);
        let e = deshacer(&mut c, std::slice::from_ref(&a), "t").unwrap_err();
        assert_eq!(
            (e.codigo, e.detalle.as_str()),
            ("historial_no_se_pudo", "referencias")
        );
        assert_eq!(volcado(&c), antes);

        // u1 vuelve a colgar de u2, que ahora cuelga de u1
        let mut c = base();
        c.execute_batch(&format!(
            "{}; UPDATE unidades SET parent_id = 'u2' WHERE id = 'u1';",
            unidad("u2", None).replace("{TIPO}", TIPO)
        ))
        .unwrap();
        let a = lote(
            &mut c,
            &["UPDATE unidades SET parent_id = NULL WHERE id = 'u1'"],
        )
        .unwrap();
        c.execute("UPDATE unidades SET parent_id = 'u1' WHERE id = 'u2'", [])
            .unwrap();
        let antes = volcado(&c);
        let e = deshacer(&mut c, std::slice::from_ref(&a), "t").unwrap_err();
        assert_eq!(
            (e.codigo, e.detalle.as_str()),
            ("historial_no_se_pudo", "ciclo")
        );
        assert_eq!(volcado(&c), antes);
    }

    #[test]
    fn una_fila_huerfana_del_historial_no_impide_deshacer() {
        let mut c = base();
        let a = lote(
            &mut c,
            &["UPDATE unidades SET nombre = 'Norte' WHERE id = 'u1'"],
        )
        .unwrap();
        // como desde un respaldo: una fila sin su acción
        c.pragma_update(None, "foreign_keys", "OFF").unwrap();
        c.execute(
            "INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op) VALUES ('nadie', 1, 'unidades', 'u1', 'insert')",
            [],
        )
        .unwrap();
        c.pragma_update(None, "foreign_keys", "ON").unwrap();
        deshacer(&mut c, std::slice::from_ref(&a), "t").unwrap();
        assert_eq!(
            uno(&c, "SELECT nombre FROM unidades WHERE id = 'u1'").as_deref(),
            Some("Ventas")
        );
    }

    #[test]
    fn ctrl_z_salta_las_bloqueadas_y_no_se_ofrecen_como_conflicto() {
        let mut c = base();
        let a1 = lote(&mut c, &[&unidad("u2", None)]).unwrap();
        let a2 = lote(
            &mut c,
            &["UPDATE unidades SET nombre = 'Otra' WHERE id = 'u2'"],
        )
        .unwrap();
        c.execute(
            "UPDATE historial_acciones SET bloqueada = 1 WHERE id = ?1",
            [&a2],
        )
        .unwrap();
        assert_eq!(punteros(&c).unwrap().deshacer.unwrap().id, a1);
        let e = conflictos(&mut c, &a1, Sentido::Deshacer).unwrap_err();
        assert_eq!(
            (e.codigo, e.detalle.as_str()),
            ("historial_bloqueada", a2.as_str())
        );
        let e = deshacer(&mut c, std::slice::from_ref(&a1), "t").unwrap_err();
        assert_eq!(e.codigo, "historial_bloqueada");
    }

    #[test]
    fn volver_a_deshace_todas_las_posteriores_hechas_y_deja_la_elegida() {
        let mut c = base();
        let a1 = lote(&mut c, &[&unidad("u2", None)]).unwrap();
        let a2 = lote(
            &mut c,
            &["UPDATE unidades SET nombre = 'Dos' WHERE id = 'u2'"],
        )
        .unwrap();
        let a3 = lote(&mut c, &[&unidad("u3", None)]).unwrap();
        let a4 = lote(&mut c, &[&unidad("u4", None)]).unwrap();
        // una deshecha de antes no se toca
        deshacer(&mut c, std::slice::from_ref(&a4), "t").unwrap();
        assert_eq!(
            volver_a(&mut c, &a1, "t").unwrap(),
            [a3.clone(), a2.clone()]
        );
        assert_eq!(
            uno(&c, "SELECT nombre FROM unidades WHERE id = 'u2'").as_deref(),
            Some("u2")
        );
        assert_eq!(
            cuenta(&c, "SELECT count(*) FROM unidades WHERE id IN ('u3', 'u4')"),
            0
        );
        let estado = |id: &String| {
            uno(
                &c,
                &format!("SELECT estado FROM historial_acciones WHERE id = '{id}'"),
            )
            .unwrap()
        };
        assert_eq!(
            [&a1, &a2, &a3, &a4].map(estado),
            ["hecha", "deshecha", "deshecha", "deshecha"]
        );
        // ya está ahí
        assert!(volver_a(&mut c, &a1, "t").unwrap().is_empty());
        let e = volver_a(&mut c, "no-existe", "t").unwrap_err();
        assert_eq!(e.codigo, "historial_fallo");
    }

    #[test]
    fn volver_a_con_una_bloqueada_en_medio_no_cambia_nada() {
        let mut c = base();
        let a1 = lote(&mut c, &[&unidad("u2", None)]).unwrap();
        let a2 = lote(&mut c, &[&unidad("u3", None)]).unwrap();
        let a3 = lote(&mut c, &[&unidad("u4", None)]).unwrap();
        c.execute(
            "UPDATE historial_acciones SET bloqueada = 1 WHERE id = ?1",
            [&a2],
        )
        .unwrap();
        let antes = volcado(&c);
        let e = volver_a(&mut c, &a1, "t").unwrap_err();
        assert_eq!(
            (e.codigo, e.detalle.as_str()),
            ("historial_bloqueada", a2.as_str())
        );
        assert_eq!(volcado(&c), antes);
        assert_eq!(
            uno(
                &c,
                &format!("SELECT estado FROM historial_acciones WHERE id = '{a3}'")
            )
            .as_deref(),
            Some("hecha")
        );
    }

    #[test]
    fn rehacer_por_id_sirve_con_la_pila_vaciada() {
        let mut c = base();
        let a1 = lote(
            &mut c,
            &["UPDATE unidades SET nombre = 'Norte' WHERE id = 'u1'"],
        )
        .unwrap();
        deshacer(&mut c, std::slice::from_ref(&a1), "t").unwrap();
        // un cambio nuevo saca a `a1` de la pila de Ctrl+Y
        lote(&mut c, &[&unidad("u2", None)]).unwrap();
        assert_eq!(
            cuenta(
                &c,
                "SELECT count(*) FROM historial_acciones WHERE rehacible IS NOT NULL"
            ),
            0
        );
        assert!(punteros(&c).unwrap().rehacer.is_none());
        assert!(
            mover_ultima(&mut c, Sentido::Rehacer, "t")
                .unwrap()
                .is_none()
        );
        assert!(
            conflictos(&mut c, &a1, Sentido::Rehacer)
                .unwrap()
                .is_empty()
        );
        rehacer(&mut c, std::slice::from_ref(&a1), "t").unwrap();
        assert_eq!(
            uno(&c, "SELECT nombre FROM unidades WHERE id = 'u1'").as_deref(),
            Some("Norte")
        );
    }

    #[test]
    fn ctrl_y_salta_las_bloqueadas() {
        let mut c = base();
        let a1 = lote(
            &mut c,
            &["UPDATE unidades SET nombre = 'Norte' WHERE id = 'u1'"],
        )
        .unwrap();
        let a2 = lote(&mut c, &[&unidad("u2", None)]).unwrap();
        deshacer(&mut c, &[a1.clone(), a2.clone()], "t").unwrap();
        // `a1` es la de rehacible mayor, pero está bloqueada
        c.execute(
            "UPDATE historial_acciones SET bloqueada = 1 WHERE id = ?1",
            [&a1],
        )
        .unwrap();
        assert_eq!(punteros(&c).unwrap().rehacer.unwrap().id, a2);
        assert_eq!(
            mover_ultima(&mut c, Sentido::Rehacer, "t")
                .unwrap()
                .unwrap()
                .id,
            a2
        );
        assert!(punteros(&c).unwrap().rehacer.is_none());
        assert!(
            mover_ultima(&mut c, Sentido::Rehacer, "t")
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn volver_a_a_una_deshecha_no_cambia_nada() {
        let mut c = base();
        let a1 = lote(&mut c, &[&unidad("u2", None)]).unwrap();
        lote(&mut c, &[&unidad("u3", None)]).unwrap();
        deshacer(&mut c, std::slice::from_ref(&a1), "t").unwrap();
        let antes = volcado(&c);
        let e = volver_a(&mut c, &a1, "t").unwrap_err();
        assert_eq!((e.codigo, e.detalle), ("historial_ya_aplicada", a1.clone()));
        assert_eq!(volcado(&c), antes);
    }
}
