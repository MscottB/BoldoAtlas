//! Lo que lee la vista Historial: las frases breves, las páginas y el detalle. Nada de aquí cambia la base.

use super::{Fila, Sentido, clave_de, columnas_de, objeto, puntero};
use crate::intercambio::fusion::normalizar_nombre;
use crate::respaldos::Fallo;
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{BTreeSet, HashMap};

#[derive(Debug, Serialize)]
pub struct Punteros {
    pub deshacer: Option<AccionBreve>,
    pub rehacer: Option<AccionBreve>,
}

#[derive(Debug, Serialize)]
pub struct AccionBreve {
    pub id: String,
    pub fecha: String,
    pub origen: String,
    pub datos: Value,
    pub estado: String,
    pub bloqueada: bool,
    pub filas: u32,
    /// Las 3 primeras filas, para la frase.
    pub muestra: Vec<FilaBreve>,
}

#[derive(Debug, Serialize)]
pub struct FilaBreve {
    pub tabla: String,
    pub fila_id: String,
    pub op: String,
    pub campos: Vec<String>,
    pub nombre: Option<String>,
    pub nombre_antes: Option<String>,
    pub nombre_despues: Option<String>,
    /// Un `update` que deja `deleted_at` con fecha: eliminar, y no restaurar.
    pub elimina: bool,
}

pub fn punteros(c: &Connection) -> Result<Punteros, Fallo> {
    let buscar = |sentido| -> Result<Option<AccionBreve>, Fallo> {
        match c
            .query_row(puntero(sentido), [], |f| f.get::<_, String>(0))
            .optional()?
        {
            Some(id) => Ok(Some(breve(c, &id)?)),
            None => Ok(None),
        }
    };
    Ok(Punteros {
        deshacer: buscar(Sentido::Deshacer)?,
        rehacer: buscar(Sentido::Rehacer)?,
    })
}

/// El último `nombre` anotado en una acción hecha; si no hay, el de antes de un borrado definitivo; si no, el de su tabla.
/// Un puesto se nombra por su cargo y una asignación por su persona.
pub fn nombre_de(c: &Connection, tabla: &str, fila_id: &str) -> Result<Option<String>, Fallo> {
    let (tabla, fila_id, columna) = match tabla {
        "puestos" | "asignaciones" => {
            let (destino, columna) = if tabla == "puestos" {
                ("cargos", "cargo_id")
            } else {
                ("trabajadores", "trabajador_id")
            };
            match ultimo(c, tabla, fila_id, columna)? {
                Some(id) => (destino, id, "nombre"),
                None => return Ok(None),
            }
        }
        _ => (tabla, fila_id.to_string(), "nombre"),
    };
    ultimo(c, tabla, &fila_id, columna)
}

/// El valor más nuevo de `columna` en las acciones hechas de esa fila; si no hay, el `antes` de una acción `suprimir` (su
/// después es el relleno); si no, el actual. Lo deshecho no cuenta: ya no es lo que hay.
fn ultimo(
    c: &Connection,
    tabla: &str,
    fila_id: &str,
    columna: &str,
) -> Result<Option<String>, Fallo> {
    let ruta = format!("$.\"{columna}\"");
    let anotado: Option<String> = c
        .query_row(
            "SELECT v FROM (
               SELECT CASE WHEN a.origen = 'suprimir' THEN json_extract(f.antes, ?3)
                      ELSE coalesce(json_extract(f.despues, ?3), json_extract(f.antes, ?3)) END AS v,
                      a.origen = 'suprimir' AS suprimir, f.accion_id, f.orden
               FROM historial_filas f JOIN historial_acciones a ON a.id = f.accion_id
               WHERE f.tabla = ?1 AND f.fila_id = ?2 AND (a.estado = 'hecha' OR a.origen = 'suprimir'))
             WHERE v IS NOT NULL ORDER BY suprimir, accion_id DESC, orden DESC LIMIT 1",
            params![tabla, fila_id, ruta],
            |f| f.get(0),
        )
        .optional()?;
    if anotado.is_some() {
        return Ok(anotado);
    }
    let Some(columnas) = columnas_de(c, tabla)? else {
        return Ok(None);
    };
    if !columnas.iter().any(|x| x == columna) {
        return Ok(None);
    }
    let sql = format!(
        "SELECT \"{columna}\" FROM \"{tabla}\" WHERE \"{}\" = ?1",
        clave_de(tabla)
    );
    Ok(
        c.query_row(&sql, [fila_id], |f| f.get::<_, Option<String>>(0))
            .optional()?
            .flatten(),
    )
}

/// Los nombres ya buscados por `nombre_de`, para no repetirlos en una misma página.
type Nombres = HashMap<(String, String), Option<String>>;

fn nombre_en(
    c: &Connection,
    nombres: &mut Nombres,
    tabla: &str,
    fila_id: &str,
) -> Result<Option<String>, Fallo> {
    let clave = (tabla.to_string(), fila_id.to_string());
    if let Some(n) = nombres.get(&clave) {
        return Ok(n.clone());
    }
    let n = nombre_de(c, tabla, fila_id)?;
    nombres.insert(clave, n.clone());
    Ok(n)
}

pub(super) fn breve(c: &Connection, id: &str) -> Result<AccionBreve, Fallo> {
    breve_con(c, id, &mut Nombres::new())
}

fn breve_con(c: &Connection, id: &str, nombres: &mut Nombres) -> Result<AccionBreve, Fallo> {
    let (fecha, origen, datos, estado, bloqueada, filas): (String, String, String, String, bool, u32) = c.query_row(
        "SELECT fecha, origen, datos, estado, bloqueada, (SELECT count(*) FROM historial_filas WHERE accion_id = ?1)
         FROM historial_acciones WHERE id = ?1",
        [id],
        |f| Ok((f.get(0)?, f.get(1)?, f.get(2)?, f.get(3)?, f.get(4)?, f.get(5)?)),
    )?;
    let crudas: Vec<Fila> = c
        // primero lo que crea, elimina o restaura (eliminar una unidad mueve antes su contenido), y de eso las tablas
        // principales antes que las de unión (restaurar una unidad devuelve antes sus zonas): es lo que nombra la acción
        .prepare(
            "SELECT tabla, fila_id, op, antes, despues FROM historial_filas WHERE accion_id = ?1
             ORDER BY json_type(despues, '$.deleted_at') IS NULL,
                      tabla IN ('zona_unidades', 'unidad_etiquetas', 'asignaciones', 'actividad_roles'), orden
             LIMIT 3",
        )?
        .query_map([id], |f| {
            Ok((f.get(0)?, f.get(1)?, f.get(2)?, f.get(3)?, f.get(4)?))
        })?
        .collect::<rusqlite::Result<_>>()?;
    let mut muestra = Vec::new();
    for (tabla, fila_id, op, antes, despues) in crudas {
        let antes = objeto(antes.as_deref())?;
        let despues = objeto(despues.as_deref())?;
        let es_update = op == "update";
        let campos = if es_update {
            despues.keys().cloned().collect()
        } else {
            Vec::new()
        };
        let nombre = |m: &Map<String, Value>| match (es_update, m.get("nombre")) {
            (true, Some(Value::String(n))) => Some(n.clone()),
            _ => None,
        };
        // sin otro nombre (crear algo deshecho: la fila ya no está), el que trae la fila misma
        let propio = nombre_propio(&antes, &despues);
        muestra.push(FilaBreve {
            nombre: nombre_en(c, nombres, &tabla, &fila_id)?.or(propio),
            nombre_antes: nombre(&antes),
            nombre_despues: nombre(&despues),
            elimina: es_update && despues.get("deleted_at").is_some_and(|v| !v.is_null()),
            tabla,
            fila_id,
            op,
            campos,
        });
    }
    Ok(AccionBreve {
        id: id.to_string(),
        fecha,
        origen,
        datos: serde_json::from_str(&datos).map_err(|e| Fallo::de("fallo", e))?,
        estado,
        bloqueada,
        filas,
        muestra,
    })
}

/// El `nombre` que trae la fila misma, el de después y si no el de antes.
fn nombre_propio(antes: &Map<String, Value>, despues: &Map<String, Value>) -> Option<String> {
    [despues, antes]
        .into_iter()
        .find_map(|m| m.get("nombre")?.as_str().map(String::from))
}

#[derive(Debug, Default, Deserialize)]
pub struct Filtro {
    /// Se busca, sin distinguir mayúsculas ni tildes, en los nombres de lo que tocó cada acción.
    pub texto: Option<String>,
    /// Instante UTC como se guarda `fecha` (`AAAA-MM-DDTHH:MM:SS.mmmZ`), incluido.
    pub desde: Option<String>,
    /// Instante UTC como `desde`, excluido.
    pub hasta: Option<String>,
    /// `(tabla, fila_id)`, para «Ver historial» desde una ficha.
    pub fila: Option<(String, String)>,
}

/// Lo más que devuelve una página.
const MAX_PAGINA: u32 = 200;

/// Hasta `cuantas` (como mucho 200) acciones, de la más nueva a la más antigua, las que siguen a `antes_de` (una página tras otra, sin repetir).
pub fn pagina(
    c: &Connection,
    f: &Filtro,
    antes_de: Option<&str>,
    cuantas: u32,
) -> Result<Vec<AccionBreve>, Fallo> {
    let buscado = f
        .texto
        .as_deref()
        .map(|t| normalizar_nombre(t).trim().to_string())
        .filter(|t| !t.is_empty());
    let instante = |d: &Option<String>| d.as_deref().filter(|d| !d.is_empty()).map(String::from);
    let (tabla, fila_id) = match &f.fila {
        Some((t, i)) => (Some(t.as_str()), Some(i.as_str())),
        None => (None, None),
    };
    let mut st = c.prepare(
        "SELECT a.id FROM historial_acciones a
         WHERE (?1 IS NULL OR a.id < ?1)
           AND (?2 IS NULL OR a.fecha >= ?2)
           AND (?3 IS NULL OR a.fecha < ?3)
           AND (?4 IS NULL OR EXISTS (SELECT 1 FROM historial_filas g
                                      WHERE g.accion_id = a.id AND g.tabla = ?4 AND g.fila_id = ?5))
         ORDER BY a.id DESC",
    )?;
    let mut ids = st.query(params![
        antes_de,
        instante(&f.desde),
        instante(&f.hasta),
        tabla,
        fila_id
    ])?;
    let mut nombres = Nombres::new();
    let mut pagina = Vec::new();
    while pagina.len() < cuantas.min(MAX_PAGINA) as usize
        && let Some(fila) = ids.next()?
    {
        let id: String = fila.get(0)?;
        if let Some(t) = &buscado
            && !toca(c, &id, t, &mut nombres)?
        {
            continue;
        }
        pagina.push(breve_con(c, &id, &mut nombres)?);
    }
    Ok(pagina)
}

/// Si alguna fila de la acción se llama así (con el nombre que da `nombre_de`; `nombres` recuerda los ya buscados).
fn toca(c: &Connection, id: &str, buscado: &str, nombres: &mut Nombres) -> Result<bool, Fallo> {
    let filas: Vec<(String, String, Option<String>)> = c
        .prepare_cached(
            "SELECT tabla, fila_id, coalesce(json_extract(despues, '$.nombre'), json_extract(antes, '$.nombre'))
             FROM historial_filas WHERE accion_id = ?1",
        )?
        .query_map([id], |f| Ok((f.get(0)?, f.get(1)?, f.get(2)?)))?
        .collect::<rusqlite::Result<_>>()?;
    for (tabla, fila_id, propio) in filas {
        let nombre = nombre_en(c, nombres, &tabla, &fila_id)?;
        if nombre
            .or(propio)
            .is_some_and(|n| normalizar_nombre(&n).contains(buscado))
        {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Las acciones pedidas, en ese orden: el diálogo de conflicto nombra las que van juntas.
pub fn breves(c: &Connection, ids: &[String]) -> Result<Vec<AccionBreve>, Fallo> {
    let mut nombres = Nombres::new();
    ids.iter()
        .map(|id| breve_con(c, id, &mut nombres))
        .collect()
}

/// Cuántas hechas hay después de `id`: las que «Volver a este punto» desharía.
pub fn posteriores(c: &Connection, id: &str) -> Result<u32, Fallo> {
    Ok(c.query_row(
        "SELECT count(*) FROM historial_acciones WHERE id > ?1 AND estado = 'hecha'",
        [id],
        |f| f.get(0),
    )?)
}

#[derive(Debug, Serialize)]
pub struct FilaDetalle {
    pub tabla: String,
    pub fila_id: String,
    pub op: String,
    pub nombre: Option<String>,
    /// `(campo, antes, después)`: lo que cambió en un `update`, o todo lo que tenía la fila al crearla o borrarla.
    pub campos: Vec<(String, Value, Value)>,
}

/// Todas las filas de una acción, campo por campo. Lo que `limpiar_persona` quitó no está: no hay de dónde sacarlo.
pub fn detalle(c: &Connection, id: &str) -> Result<Vec<FilaDetalle>, Fallo> {
    let crudas: Vec<Fila> = c
        .prepare(
            "SELECT tabla, fila_id, op, antes, despues FROM historial_filas WHERE accion_id = ?1 ORDER BY orden",
        )?
        .query_map([id], |f| {
            Ok((f.get(0)?, f.get(1)?, f.get(2)?, f.get(3)?, f.get(4)?))
        })?
        .collect::<rusqlite::Result<_>>()?;
    crudas
        .into_iter()
        .map(|(tabla, fila_id, op, antes, despues)| {
            let antes = objeto(antes.as_deref())?;
            let despues = objeto(despues.as_deref())?;
            let campos = antes
                .keys()
                .chain(despues.keys())
                .collect::<BTreeSet<_>>()
                .into_iter()
                .map(|k| {
                    let valor = |m: &Map<String, Value>| m.get(k).cloned().unwrap_or(Value::Null);
                    (k.clone(), valor(&antes), valor(&despues))
                })
                .collect();
            Ok(FilaDetalle {
                nombre: nombre_de(c, &tabla, &fila_id)?.or(nombre_propio(&antes, &despues)),
                tabla,
                fila_id,
                op,
                campos,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::super::tests::{base, lote, unidad};
    use super::super::{deshacer, limpiar_persona};
    use super::*;

    #[test]
    fn punteros_nombran_las_filas() {
        let mut c = base();
        c.execute_batch(
            "INSERT INTO cargos (id, nombre, created_at, updated_at) VALUES ('c1', 'Jefe', 'x', 'x');
             INSERT INTO puestos (id, unidad_id, cargo_id, created_at, updated_at) VALUES ('p1', 'u1', 'c1', 'x', 'x');",
        )
        .unwrap();
        lote(
            &mut c,
            &[
                "UPDATE unidades SET nombre = 'Norte' WHERE id = 'u1'",
                "UPDATE puestos SET orden = 3 WHERE id = 'p1'",
            ],
        )
        .unwrap();
        let a = punteros(&c).unwrap().deshacer.unwrap();
        assert_eq!(
            (a.origen.as_str(), a.estado.as_str(), a.filas, a.bloqueada),
            ("app", "hecha", 2, false)
        );
        let f = &a.muestra[0];
        assert_eq!(
            (f.tabla.as_str(), f.op.as_str(), f.campos.clone()),
            ("unidades", "update", vec!["nombre".to_string()])
        );
        assert_eq!(
            (f.nombre.as_deref(), f.nombre_antes.as_deref()),
            (Some("Norte"), Some("Ventas"))
        );
        assert_eq!(a.muestra[1].nombre.as_deref(), Some("Jefe"));
        assert_eq!(
            nombre_de(&c, "puestos", "p1").unwrap().as_deref(),
            Some("Jefe")
        );
        assert_eq!(nombre_de(&c, "no_existe", "p1").unwrap(), None);
    }

    #[test]
    fn la_muestra_pone_primero_la_baja_y_dice_el_nombre_nuevo() {
        let mut c = base();
        lote(&mut c, &[&unidad("u2", Some("u1"))]).unwrap();
        // como eliminar una unidad: primero se mueve su contenido y después se marca borrada
        let a = lote(
            &mut c,
            &[
                "UPDATE unidades SET parent_id = NULL WHERE id = 'u2'",
                "UPDATE unidades SET deleted_at = 'y' WHERE id = 'u1'",
            ],
        )
        .unwrap();
        let f = &breve(&c, &a).unwrap().muestra[0];
        assert_eq!((f.fila_id.as_str(), f.elimina), ("u1", true));
        deshacer(&mut c, std::slice::from_ref(&a), "t").unwrap();
        lote(
            &mut c,
            &["UPDATE unidades SET deleted_at = 'y' WHERE id = 'u2'"],
        )
        .unwrap();
        let a = lote(
            &mut c,
            &["UPDATE unidades SET deleted_at = NULL WHERE id = 'u2'"],
        )
        .unwrap();
        assert!(!breve(&c, &a).unwrap().muestra[0].elimina);
        // deshecho, el renombre dice igual a qué nombre fue
        let a = lote(
            &mut c,
            &["UPDATE unidades SET nombre = 'Norte' WHERE id = 'u1'"],
        )
        .unwrap();
        deshacer(&mut c, std::slice::from_ref(&a), "t").unwrap();
        let f = &breve(&c, &a).unwrap().muestra[0];
        assert_eq!(
            (f.nombre_antes.as_deref(), f.nombre_despues.as_deref()),
            (Some("Ventas"), Some("Norte"))
        );
    }

    #[test]
    fn la_muestra_nombra_la_unidad_restaurada_y_no_su_zona() {
        let mut c = base();
        c.execute_batch(
            "INSERT INTO zonas (id, nombre, color, created_at, updated_at) VALUES ('z1', 'Norte', '#000000', 'x', 'x');
             INSERT INTO zona_unidades (id, zona_id, unidad_id, created_at, updated_at, deleted_at)
               VALUES ('zu1', 'z1', 'u1', 'x', 'x', 'y');
             UPDATE unidades SET deleted_at = 'y' WHERE id = 'u1';",
        )
        .unwrap();
        // como restaurarUnidad: primero vuelven sus pertenencias, después la unidad
        let a = lote(
            &mut c,
            &[
                "UPDATE zona_unidades SET deleted_at = NULL WHERE id = 'zu1'",
                "UPDATE unidades SET deleted_at = NULL WHERE id = 'u1'",
            ],
        )
        .unwrap();
        let m = breve(&c, &a).unwrap().muestra;
        assert_eq!(
            m.iter().map(|f| f.tabla.as_str()).collect::<Vec<_>>(),
            ["unidades", "zona_unidades"]
        );
    }

    #[test]
    fn nombre_de_ignora_lo_deshecho_y_guarda_el_nombre_suprimido() {
        let mut c = base();
        let a = lote(
            &mut c,
            &["UPDATE unidades SET nombre = 'Norte' WHERE id = 'u1'"],
        )
        .unwrap();
        deshacer(&mut c, std::slice::from_ref(&a), "t").unwrap();
        assert_eq!(
            nombre_de(&c, "unidades", "u1").unwrap().as_deref(),
            Some("Ventas")
        );

        // como la acción que deja el borrado definitivo: en la tabla queda el relleno
        c.execute_batch(
            "INSERT INTO trabajadores (id, nombre, created_at, updated_at) VALUES ('x', 'Relleno', 'x', 'x');
             INSERT INTO historial_acciones (id, fecha, origen, bloqueada) VALUES ('ffffffff', 'x', 'suprimir', 1);
             INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
               VALUES ('ffffffff', 1, 'trabajadores', 'x', 'update', '{\"nombre\":\"Juan\"}', '{\"nombre\":\"Relleno\"}');",
        )
        .unwrap();
        assert_eq!(
            nombre_de(&c, "trabajadores", "x").unwrap().as_deref(),
            Some("Juan")
        );
    }

    const LIMITE_UNA_FILA: u64 = 200;
    const LIMITE_BUSCAR: u64 = 1000;

    fn nueva_unidad(c: &mut Connection, id: &str, nombre: &str) -> String {
        lote(
            c,
            &[&format!(
                "INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES ('{id}', '{{TIPO}}', '{nombre}', 'x', 'x')"
            )],
        )
        .unwrap()
    }

    fn ids(v: &[AccionBreve]) -> Vec<&str> {
        v.iter().map(|a| a.id.as_str()).collect()
    }

    #[test]
    fn pagina_de_a_50_sin_repetir() {
        let mut c = base();
        let todas: Vec<String> = (0..120)
            .map(|i| {
                lote(
                    &mut c,
                    &[&format!(
                        "UPDATE unidades SET nombre = 'N{i}' WHERE id = 'u1'"
                    )],
                )
                .unwrap()
            })
            .collect();
        let f = Filtro::default();
        let p1 = pagina(&c, &f, None, 50).unwrap();
        let p2 = pagina(&c, &f, Some(&p1[49].id), 50).unwrap();
        let p3 = pagina(&c, &f, Some(&p2[49].id), 50).unwrap();
        assert_eq!((p1.len(), p2.len(), p3.len()), (50, 50, 20));
        assert!(pagina(&c, &f, Some(&p3[19].id), 50).unwrap().is_empty());
        let vistas: Vec<&str> = [&p1, &p2, &p3].into_iter().flat_map(|p| ids(p)).collect();
        // de la más nueva a la más antigua, sin repetir ni faltar
        assert_eq!(
            vistas,
            todas.iter().rev().map(String::as_str).collect::<Vec<_>>()
        );
    }

    #[test]
    fn buscar_por_nombre_encuentra_las_acciones_de_esa_unidad() {
        let mut c = base();
        let dir = nueva_unidad(&mut c, "u2", "Dirección");
        nueva_unidad(&mut c, "u3", "Otra");
        let ventas = lote(
            &mut c,
            &["UPDATE unidades SET nombre = 'Ventas Norte' WHERE id = 'u1'"],
        )
        .unwrap();
        let buscar = |texto: &str| {
            let f = Filtro {
                texto: Some(texto.into()),
                ..Filtro::default()
            };
            pagina(&c, &f, None, 50).unwrap()
        };
        // sin mayúsculas ni tildes
        assert_eq!(ids(&buscar("DIRECCION")), [dir.as_str()]);
        assert_eq!(ids(&buscar("ventas")), [ventas.as_str()]);
        assert!(buscar("zzz").is_empty());
        // un texto en blanco no filtra
        assert_eq!(buscar("  ").len(), 3);
    }

    #[test]
    fn filtro_por_fila() {
        let mut c = base();
        let a2 = nueva_unidad(&mut c, "u2", "Dos");
        let a3 = nueva_unidad(&mut c, "u3", "Tres");
        let a4 = lote(
            &mut c,
            &["UPDATE unidades SET nombre = 'Dos B' WHERE id = 'u2'"],
        )
        .unwrap();
        let de = |tabla: &str, id: &str| Filtro {
            fila: Some((tabla.into(), id.into())),
            ..Filtro::default()
        };
        assert_eq!(
            ids(&pagina(&c, &de("unidades", "u2"), None, 50).unwrap()),
            [a4.as_str(), a2.as_str()]
        );
        assert_eq!(
            ids(&pagina(&c, &de("unidades", "u3"), None, 50).unwrap()),
            [a3.as_str()]
        );
        assert!(
            pagina(&c, &de("cargos", "u2"), None, 50)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn filtro_por_instante_incluye_desde_y_excluye_hasta() {
        let mut c = base();
        let fechas = [
            "2026-03-01T00:00:00.000Z",
            "2026-03-02T23:59:59.000Z",
            "2026-03-04T10:00:00.000Z",
        ];
        let a: Vec<String> = fechas
            .iter()
            .enumerate()
            .map(|(i, fecha)| {
                let id = nueva_unidad(&mut c, &format!("v{i}"), "V");
                c.execute(
                    "UPDATE historial_acciones SET fecha = ?1 WHERE id = ?2",
                    [fecha, &id.as_str()],
                )
                .unwrap();
                id
            })
            .collect();
        let t = |x: &str| Some(format!("{x}Z"));
        let entre = |desde: Option<String>, hasta: Option<String>| {
            let f = Filtro {
                desde,
                hasta,
                ..Filtro::default()
            };
            pagina(&c, &f, None, 50).unwrap()
        };
        // desde incluido, hasta excluido
        assert_eq!(
            ids(&entre(
                t("2026-03-01T00:00:00.000"),
                t("2026-03-03T00:00:00.000")
            )),
            [a[1].as_str(), a[0].as_str()]
        );
        assert_eq!(
            ids(&entre(t("2026-03-02T23:59:59.000"), None)),
            [a[2].as_str(), a[1].as_str()]
        );
        assert!(entre(None, t("2026-03-01T00:00:00.000")).is_empty());
        assert_eq!(
            ids(&entre(None, t("2026-03-01T00:00:00.001"))),
            [a[0].as_str()]
        );
        assert_eq!(entre(Some(String::new()), Some(String::new())).len(), 3);
    }

    #[test]
    fn detalle_no_muestra_campos_quitados_de_una_suprimida() {
        let mut c = base();
        let a1 = lote(
            &mut c,
            &["INSERT INTO trabajadores (id, nombre, correo, telefono, notas, created_at, updated_at) VALUES ('t1', 'Ana', 'ana@x.cl', '123', 'nota', 'x', 'x')"],
        )
        .unwrap();
        let a2 = lote(
            &mut c,
            &["UPDATE trabajadores SET correo = 'otro@x.cl', nombre = 'Ana Pérez' WHERE id = 't1'"],
        )
        .unwrap();
        // antes de suprimirla se ve todo
        assert!(detalle(&c, &a1).unwrap()[0].campos.len() > 3);
        limpiar_persona(&c, "t1").unwrap();
        let d = detalle(&c, &a1).unwrap();
        assert_eq!(d[0].nombre.as_deref(), Some("Ana Pérez"));
        assert_eq!(
            d[0].campos,
            [("nombre".to_string(), Value::Null, Value::from("Ana"))]
        );
        let d = detalle(&c, &a2).unwrap();
        assert_eq!(
            d[0].campos,
            [(
                "nombre".to_string(),
                Value::from("Ana"),
                Value::from("Ana Pérez")
            )]
        );
    }

    #[test]
    fn detalle_junta_antes_y_despues_de_cada_fila() {
        let mut c = base();
        let a = lote(
            &mut c,
            &[
                "UPDATE unidades SET nombre = 'Norte' WHERE id = 'u1'",
                "DELETE FROM unidades WHERE id = 'u1'",
            ],
        )
        .unwrap();
        let d = detalle(&c, &a).unwrap();
        assert_eq!(
            (d[0].op.as_str(), d[0].campos.clone()),
            (
                "update",
                vec![(
                    "nombre".to_string(),
                    Value::from("Ventas"),
                    Value::from("Norte")
                )]
            )
        );
        assert_eq!(d[1].op, "delete");
        assert!(d[1].campos.iter().any(|(k, antes, despues)| {
            (k.as_str(), antes, despues) == ("nombre", &Value::from("Norte"), &Value::Null)
        }));
        assert!(detalle(&c, "no-existe").unwrap().is_empty());
    }

    /// 5.000 acciones de una fila cada una (o todas de la misma). Los ids van de `00000000` a `00004999`.
    fn sembrar(c: &Connection, misma_fila: bool) {
        let tx = c.unchecked_transaction().unwrap();
        {
            let mut accion = tx
                .prepare(
                    "INSERT INTO historial_acciones (id, fecha, origen) VALUES (?1, ?2, 'app')",
                )
                .unwrap();
            let mut fila = tx
                .prepare("INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues) VALUES (?1, 1, 'unidades', ?2, 'update', '{\"nombre\":\"A\"}', json_object('nombre', ?3))")
                .unwrap();
            for i in 0..5000 {
                let id = format!("{i:08}");
                accion.execute([&id, "2026-03-01T10:00:00.000Z"]).unwrap();
                let fila_id = if misma_fila {
                    "u1".to_string()
                } else {
                    format!("f{i}")
                };
                // un nombre raro solo en la acción 17
                let nombre = if i == 17 {
                    "Quimera".to_string()
                } else {
                    format!("N{i}")
                };
                fila.execute([&id, &fila_id, &nombre]).unwrap();
            }
        }
        tx.commit().unwrap();
    }

    /// Con todas las pruebas corriendo a la vez la CPU se reparte y una pasada puede esperar turno: se repite, con pausas,
    /// hasta una que quepa en `limite`; si ninguna de 100 cabe, es lento de verdad. Devuelve la página y lo que tardó.
    fn medir(c: &Connection, f: &Filtro, limite_ms: u64, nombre: &str) -> Vec<AccionBreve> {
        let limite = std::time::Duration::from_millis(limite_ms);
        let mut mejor = std::time::Duration::MAX;
        let mut p = Vec::new();
        for _ in 0..100 {
            let ahora = std::time::Instant::now();
            p = pagina(c, f, None, 50).unwrap();
            mejor = mejor.min(ahora.elapsed());
            if mejor < limite {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        eprintln!("{nombre}: {mejor:?}");
        assert!(mejor < limite, "{nombre} tardó {mejor:?}");
        p
    }

    #[test]
    fn pagina_con_5000_acciones_bajo_50_ms() {
        let c = base();
        sembrar(&c, false);
        let p = medir(&c, &Filtro::default(), 50, "pagina de 50 entre 5000");
        assert_eq!((p.len(), p[0].id.as_str()), (50, "00004999"));
    }

    #[test]
    fn pagina_con_5000_acciones_en_una_fila() {
        let c = base();
        sembrar(&c, true);
        let p = medir(
            &c,
            &Filtro::default(),
            LIMITE_UNA_FILA,
            "pagina de 50 en una fila",
        );
        assert_eq!((p.len(), p[0].id.as_str()), (50, "00004999"));
    }

    #[test]
    fn buscar_un_nombre_raro_entre_5000_acciones() {
        let c = base();
        sembrar(&c, false);
        let f = Filtro {
            texto: Some("quimera".into()),
            ..Filtro::default()
        };
        let p = medir(&c, &f, LIMITE_BUSCAR, "busqueda rara entre 5000");
        assert_eq!(ids(&p), ["00000017"]);
    }

    #[test]
    fn breves_en_su_orden_y_posteriores_cuenta_las_hechas() {
        let mut c = base();
        let a: Vec<String> = ["A", "B", "C"]
            .iter()
            .map(|n| {
                lote(
                    &mut c,
                    &[&format!(
                        "UPDATE unidades SET nombre = '{n}' WHERE id = 'u1'"
                    )],
                )
                .unwrap()
            })
            .collect();
        let pedidas = [a[2].clone(), a[0].clone()];
        assert_eq!(ids(&breves(&c, &pedidas).unwrap()), [&a[2], &a[0]]);
        assert_eq!(posteriores(&c, &a[0]).unwrap(), 2);
        deshacer(&mut c, std::slice::from_ref(&a[2]), "t").unwrap();
        assert_eq!(posteriores(&c, &a[0]).unwrap(), 1);
        assert_eq!(posteriores(&c, &a[2]).unwrap(), 0);
    }

    #[test]
    fn cuantas_tiene_techo() {
        let c = base();
        sembrar(&c, false);
        assert_eq!(
            pagina(&c, &Filtro::default(), None, 100_000).unwrap().len(),
            200
        );
    }
}
