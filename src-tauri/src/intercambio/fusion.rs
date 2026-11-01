//! «Agregar lo nuevo»: lo que no existe entra, lo que existe (mismo id) no se toca. La misma pasada, deshecha al final,
//! es la vista previa: lo que se muestra antes de aplicar es exactamente lo que se aplicaría.
use super::validar::{self, MetaArchivo};
use crate::respaldos::Fallo;
use rusqlite::types::Value;
use rusqlite::{Connection, OptionalExtension, params_from_iter};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

/// Valores de mantenedor: si no está su id, uno con el mismo nombre se une al que ya existe. Una fila viva puede apuntar a
/// uno desactivado (la ficha conserva su id).
const CATALOGOS: &[&str] = &[
    "tipos_unidad",
    "cargos",
    "tipos_contrato",
    "sedes",
    "jornadas",
    "leyendas",
    "etiquetas",
];

/// Toda tabla de negocio, cada una después de las que usa. La excepción es `unidades.jefe_puesto_id`, que se resuelve al
/// final porque los puestos necesitan sus unidades.
pub const NEGOCIO: &[&str] = &[
    "unidades",
    "trabajadores",
    "puestos",
    "asignaciones",
    "conexiones",
    "unidad_etiquetas",
    "procesos",
    "actividades",
    "actividad_roles",
    "subarboles_guardados",
    "vistas",
];

/// shortcut: la lista de detalle se corta aquí (los conteos siguen completos); paginar si alguien necesita verla entera.
const MAX_DETALLE: usize = 1000;

#[derive(Debug, Default, Serialize, Clone)]
pub struct PorTabla {
    pub tabla: &'static str,
    /// Filas vivas que trae el archivo, y qué pasa con ellas.
    pub trae: i64,
    pub nuevas: i64,
    pub existentes: i64,
    pub unidas: i64,
    pub omitidas: i64,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct Detalle {
    pub tabla: &'static str,
    pub nombre: String,
    /// `existe`, `union`, `correo`, `choque`, `referencia` (no entra) o `vaciada` (entra sin esa referencia).
    pub motivo: &'static str,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RamaImportada {
    pub id: String,
    pub nombre: String,
    /// Ya está en esta base (mismo id): no entra.
    pub existe: bool,
    /// Nombre de la unidad local de la que vuelve a colgar.
    pub dentro_de: Option<String>,
    /// Su unidad superior no está en esta base: hay que decidir dónde va.
    pub pide_lugar: bool,
}

#[derive(Debug, Default, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Informe {
    pub tablas: Vec<PorTabla>,
    pub detalle: Vec<Detalle>,
    pub total_detalle: i64,
    /// Filas eliminadas que entran para conservar el historial de lo que entra.
    pub historial: i64,
    pub vaciadas: i64,
    pub ramas: Vec<RamaImportada>,
}

impl Informe {
    fn anotar(&mut self, tabla: &'static str, nombre: String, motivo: &'static str) {
        self.total_detalle += 1;
        if self.detalle.len() < MAX_DETALLE {
            self.detalle.push(Detalle {
                tabla,
                nombre,
                motivo,
            });
        }
    }
}

type Lugares = HashMap<String, Option<String>>;

fn estado_fila(dst: &Connection, tabla: &str, id: &str) -> Result<Option<Option<String>>, Fallo> {
    Ok(dst
        .prepare_cached(&format!("SELECT deleted_at FROM {tabla} WHERE id = ?1"))?
        .query_row([id], |f| f.get(0))
        .optional()?)
}

fn viva(dst: &Connection, tabla: &str, id: &str) -> Result<bool, Fallo> {
    Ok(matches!(estado_fila(dst, tabla, id)?, Some(None)))
}

fn nombre_unidad(c: &Connection, id: &str) -> Result<Option<String>, Fallo> {
    Ok(
        c.query_row("SELECT nombre FROM unidades WHERE id = ?1", [id], |f| {
            f.get(0)
        })
        .optional()?,
    )
}

/// Cómo mostrar una fila en la lista de omitidos. Lo que no tiene nombre propio se cuenta sin listarse.
fn etiqueta(
    imp: &Connection,
    tabla: &str,
    columnas: &[String],
    fila: &[Value],
) -> Result<String, Fallo> {
    let de = |col: &str| {
        columnas
            .iter()
            .position(|c| c == col)
            .and_then(|i| match &fila[i] {
                Value::Text(t) => Some(t.clone()),
                _ => None,
            })
    };
    let buscar = |sql: &str, id: Option<String>| -> Result<String, Fallo> {
        Ok(imp
            .query_row(sql, [id.unwrap_or_default()], |f| f.get(0))
            .optional()?
            .unwrap_or_default())
    };
    match tabla {
        "puestos" => buscar("SELECT nombre FROM cargos WHERE id = ?1", de("cargo_id")),
        "asignaciones" | "actividad_roles" => buscar(
            "SELECT nombre FROM trabajadores WHERE id = ?1",
            de("trabajador_id"),
        ),
        _ => Ok(de("nombre").unwrap_or_default()),
    }
}

/// Lo que dice el archivo de cada rama frente a esta base: la pregunta de la interfaz.
pub fn ramas(
    dst: &Connection,
    imp: &Connection,
    meta: &MetaArchivo,
) -> Result<Vec<RamaImportada>, Fallo> {
    meta.ramas
        .iter()
        .map(|r| {
            let local = match &r.padre {
                Some(p) if viva(dst, "unidades", p)? => nombre_unidad(dst, p)?,
                _ => None,
            };
            let existe = estado_fila(dst, "unidades", &r.id)?.is_some();
            Ok(RamaImportada {
                id: r.id.clone(),
                nombre: nombre_unidad(imp, &r.id)?.unwrap_or_default(),
                existe,
                pide_lugar: !existe && r.padre.is_some() && local.is_none(),
                dentro_de: local,
            })
        })
        .collect()
}

/// Aplica el archivo sobre `dst`, que debe estar en una transacción: quien llama confirma o deshace.
pub fn fusionar(
    dst: &Connection,
    imp: &Connection,
    meta: &MetaArchivo,
    lugares: &Lugares,
    ahora: &str,
) -> Result<Informe, Fallo> {
    for destino in lugares.values().flatten() {
        if !viva(dst, "unidades", destino)? {
            return Err(Fallo::de("desconocido", ""));
        }
    }
    let mut inf = Informe {
        ramas: ramas(dst, imp, meta)?,
        ..Default::default()
    };
    let padres: HashMap<&str, &str> = meta
        .ramas
        .iter()
        .filter_map(|r| r.padre.as_deref().map(|p| (r.id.as_str(), p)))
        .collect();
    // id del archivo -> id local, para lo que se une a algo que ya existe
    let mut unidos: HashMap<(&str, String), String> = HashMap::new();
    // lo que no entró, para no dejar nada apuntándole
    let mut fuera: HashSet<(&str, String)> = HashSet::new();
    let mut jefes: Vec<(String, String)> = Vec::new();

    for &tabla in CATALOGOS.iter().chain(NEGOCIO) {
        let es_catalogo = CATALOGOS.contains(&tabla);
        let columnas: Vec<String> = imp
            .prepare("SELECT name FROM pragma_table_info(?1)")?
            .query_map([tabla], |f| f.get(0))?
            .collect::<rusqlite::Result<_>>()?;
        let referencias: Vec<(usize, String, bool)> = imp
            .prepare(
                "SELECT k.\"from\", k.\"table\", c.\"notnull\" FROM pragma_foreign_key_list(?1) k
                 JOIN pragma_table_info(?1) c ON c.name = k.\"from\"",
            )?
            .query_map([tabla], |f| {
                Ok((f.get::<_, String>(0)?, f.get(1)?, f.get(2)?))
            })?
            .map(|r| {
                r.map(|(col, destino, requerida)| {
                    (
                        columnas.iter().position(|c| *c == col).unwrap_or(0),
                        destino,
                        requerida,
                    )
                })
            })
            .collect::<rusqlite::Result<_>>()?;
        let pos = |col: &str| columnas.iter().position(|c| c == col);
        let (i_id, i_borrado, i_actualizado) = (
            pos("id").ok_or("id")?,
            pos("deleted_at").ok_or("deleted_at")?,
            pos("updated_at").ok_or("updated_at")?,
        );
        let lista = columnas.join(", ");
        let huecos = vec!["?"; columnas.len()].join(", ");
        let mut insertar = dst.prepare(&format!(
            "INSERT INTO {tabla} ({lista}) VALUES ({huecos}) ON CONFLICT DO NOTHING"
        ))?;
        let mut leer = imp.prepare(&format!("SELECT {lista} FROM {tabla}"))?;
        let mut filas = leer.query([])?;
        let mut cuenta = PorTabla {
            tabla,
            ..Default::default()
        };

        while let Some(f) = filas.next()? {
            let mut fila: Vec<Value> = (0..columnas.len())
                .map(|i| f.get(i))
                .collect::<rusqlite::Result<_>>()?;
            let Value::Text(id) = fila[i_id].clone() else {
                return Err(Fallo::de("contenido_invalido", "id"));
            };
            let es_viva = matches!(fila[i_borrado], Value::Null);
            let v = i64::from(es_viva);
            cuenta.trae += v;
            let nombre = etiqueta(imp, tabla, &columnas, &fila)?;

            if estado_fila(dst, tabla, &id)?.is_some() {
                cuenta.existentes += v;
                // los valores de mantenedor con el mismo id son lo normal (las semillas): no son una omisión
                if es_viva && !es_catalogo && !nombre.is_empty() {
                    inf.anotar(tabla, nombre, "existe");
                }
                continue;
            }
            if es_catalogo {
                let i = pos("nombre").ok_or("nombre")?;
                let igual: Option<String> = dst
                    .prepare_cached(&format!(
                        "SELECT id FROM {tabla} WHERE lower(trim(nombre)) = lower(trim(?1)) AND deleted_at IS NULL"
                    ))?
                    .query_row([&fila[i]], |f| f.get(0))
                    .optional()?;
                if let Some(local) = igual {
                    unidos.insert((tabla, id), local);
                    cuenta.unidas += v;
                    if es_viva {
                        inf.anotar(tabla, nombre, "union");
                    }
                    continue;
                }
            }
            if tabla == "trabajadores" && es_viva {
                let i = pos("correo").ok_or("correo")?;
                let igual: Option<String> = dst
                    .prepare_cached(
                        "SELECT id FROM trabajadores WHERE deleted_at IS NULL AND ?1 IS NOT NULL AND trim(?1) <> ''
                         AND lower(trim(correo)) = lower(trim(?1))",
                    )?
                    .query_row([&fila[i]], |f| f.get(0))
                    .optional()?;
                if let Some(local) = igual {
                    unidos.insert((tabla, id), local);
                    cuenta.omitidas += 1;
                    inf.anotar(tabla, nombre, "correo");
                    continue;
                }
            }

            let mut cambiada = false;
            let mut no_entra = false;
            for (i, destino, requerida) in &referencias {
                let Value::Text(valor) = fila[*i].clone() else {
                    continue;
                };
                let destino = CATALOGOS
                    .iter()
                    .chain(NEGOCIO)
                    .find(|t| **t == destino)
                    .copied()
                    .ok_or("tabla")?;
                let clave = (destino, valor);
                let valor = match unidos.get(&clave) {
                    Some(local) => {
                        fila[*i] = Value::Text(local.clone());
                        local.clone()
                    }
                    None => clave.1.clone(),
                };
                let rota = fuera.contains(&(destino, valor.clone()))
                    || (es_viva
                        && !CATALOGOS.contains(&destino)
                        && matches!(estado_fila(dst, destino, &valor)?, Some(Some(_))));
                if !rota {
                    if tabla == "unidades" && destino == "puestos" {
                        jefes.push((id.clone(), valor));
                    }
                } else if *requerida {
                    no_entra = true;
                } else {
                    fila[*i] = Value::Null;
                    cambiada = true;
                    inf.vaciadas += 1;
                    inf.anotar(tabla, nombre.clone(), "vaciada");
                }
            }
            if no_entra {
                fuera.insert((tabla, id));
                cuenta.omitidas += v;
                inf.anotar(tabla, nombre, "referencia");
                continue;
            }
            if tabla == "unidades"
                && let Some(padre) = padres.get(id.as_str())
            {
                let lugar = if viva(dst, "unidades", padre)? {
                    Some((*padre).to_string())
                } else {
                    lugares.get(&id).cloned().flatten()
                };
                fila[pos("parent_id").ok_or("parent_id")?] = lugar.map_or(Value::Null, Value::Text);
                cambiada = true;
            }
            if cambiada {
                fila[i_actualizado] = Value::Text(ahora.into());
            }
            if insertar.execute(params_from_iter(fila.iter()))? == 0 {
                // otra regla única de la base, p. ej. el puesto ya tiene titular vigente
                fuera.insert((tabla, id));
                cuenta.omitidas += v;
                inf.anotar(tabla, nombre, "choque");
                continue;
            }
            if es_viva {
                cuenta.nuevas += 1;
            } else {
                inf.historial += 1;
            }
        }
        inf.tablas.push(cuenta);
    }

    for (unidad, puesto) in jefes {
        if fuera.contains(&("puestos", puesto)) {
            dst.execute(
                "UPDATE unidades SET jefe_puesto_id = NULL, updated_at = ?2 WHERE id = ?1",
                [&unidad, ahora],
            )?;
            inf.vaciadas += 1;
            let nombre = nombre_unidad(dst, &unidad)?.unwrap_or_default();
            inf.anotar("unidades", nombre, "vaciada");
        }
    }

    // nunca se aplica con referencias rotas ni ciclos, aunque lo anterior tuviera un error
    let rotas: bool = dst.query_row(
        "SELECT EXISTS (SELECT 1 FROM pragma_foreign_key_check)",
        [],
        |f| f.get(0),
    )?;
    if rotas || validar::hay_ciclo(dst)? {
        return Err(Fallo::de("contenido_invalido", "resultado"));
    }
    Ok(inf)
}

#[cfg(test)]
mod tests {
    use super::super::prueba::*;
    use super::super::{alcance, validar};
    use super::*;
    use crate::db;
    use rusqlite::TransactionBehavior;
    use std::collections::BTreeSet;

    /// Una base de destino vacía o con lo que diga `sql`.
    fn destino(sql: &str) -> (tempfile::TempDir, Connection) {
        let dir = tempfile::tempdir().unwrap();
        let mut c = db::abrir(&dir.path().join("boldo.db")).unwrap();
        db::migrar(&mut c, dir.path()).unwrap();
        db::asegurar_meta(&c).unwrap();
        c.execute_batch(sql).unwrap();
        (dir, c)
    }

    fn fusion(
        dst: &mut Connection,
        origen: &Connection,
        dir: &std::path::Path,
        raices: Option<&[String]>,
        lugares: &Lugares,
    ) -> Result<Informe, Fallo> {
        let copia = alcance::copiar(origen, dir).unwrap();
        let (t, _) = alcance::preparar(copia, dir, raices).unwrap();
        validar::revisar(t.ruta(), db::MIGRACIONES).unwrap();
        let imp = validar::solo_lectura(t.ruta()).unwrap();
        let meta = validar::leer_meta(&imp).unwrap();
        let tx = dst
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .unwrap();
        let inf = fusionar(&tx, &imp, &meta, lugares, "2030-01-01T00:00:00.000Z")?;
        tx.commit().unwrap();
        Ok(inf)
    }

    fn tabla<'a>(inf: &'a Informe, t: &str) -> &'a PorTabla {
        inf.tablas.iter().find(|x| x.tabla == t).unwrap()
    }

    fn uno(c: &Connection, sql: &str) -> Option<String> {
        c.query_row(sql, [], |f| f.get(0)).unwrap()
    }

    fn rama() -> Vec<String> {
        vec!["rama".to_string()]
    }

    #[test]
    fn toda_tabla_de_negocio_esta_clasificada() {
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
        let clasificadas: BTreeSet<String> = CATALOGOS
            .iter()
            .chain(NEGOCIO)
            .map(|t| t.to_string())
            .collect();
        assert_eq!(
            reales, clasificadas,
            "una tabla nueva debe decidir cómo entra al importar"
        );
    }

    #[test]
    fn en_una_base_vacia_todo_entra_normal() {
        let (d, origen) = base_con_datos();
        let (_d2, mut dst) = destino("");
        let inf = fusion(&mut dst, &origen, d.path(), None, &Lugares::new()).unwrap();
        assert_eq!(tabla(&inf, "trabajadores").nuevas, 3);
        assert_eq!(tabla(&inf, "unidades").nuevas, 4);
        assert_eq!(tabla(&inf, "tipos_unidad").existentes, 4);
        // sin omisiones: las semillas con el mismo id no cuentan
        assert_eq!(inf.total_detalle, 0, "{:?}", inf.detalle);
        // lo eliminado entra como historial, sin contarse como nuevo
        assert_eq!(inf.historial, 3);
        for t in CATALOGOS.iter().chain(NEGOCIO) {
            let sql = format!("SELECT count(*) FROM {t}");
            let (a, b): (i64, i64) = (
                origen.query_row(&sql, [], |f| f.get(0)).unwrap(),
                dst.query_row(&sql, [], |f| f.get(0)).unwrap(),
            );
            assert_eq!(a, b, "{t}");
        }
    }

    #[test]
    fn lo_que_ya_existe_se_queda_como_esta_y_se_informa() {
        let (d, origen) = base_con_datos();
        let (_d2, mut dst) = destino("");
        fusion(&mut dst, &origen, d.path(), None, &Lugares::new()).unwrap();
        dst.execute_batch("UPDATE trabajadores SET nombre = 'Ana Local' WHERE id = 'ana';")
            .unwrap();
        let inf = fusion(&mut dst, &origen, d.path(), None, &Lugares::new()).unwrap();
        assert_eq!(tabla(&inf, "trabajadores").existentes, 3);
        assert_eq!(tabla(&inf, "trabajadores").nuevas, 0);
        assert_eq!(
            uno(&dst, "SELECT nombre FROM trabajadores WHERE id = 'ana'").unwrap(),
            "Ana Local"
        );
        assert!(inf.detalle.contains(&Detalle {
            tabla: "trabajadores",
            nombre: "Ana".into(),
            motivo: "existe"
        }));
    }

    #[test]
    fn mantenedores_con_otro_id_y_el_mismo_nombre_se_unen() {
        let (d, origen) = base_con_datos();
        let (_d2, mut dst) = destino(&format!(
            "INSERT INTO cargos (id, nombre, created_at, updated_at) VALUES ('cargo-local', '  JEFE  ', 'x', 'x');
             INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES ('raiz', '{TIPO}', 'Raíz local', 'x', 'x');"
        ));
        let inf = fusion(&mut dst, &origen, d.path(), Some(&rama()), &Lugares::new()).unwrap();
        assert_eq!(tabla(&inf, "cargos").unidas, 1);
        assert_eq!(
            uno(&dst, "SELECT cargo_id FROM puestos WHERE id = 'p-rama'").unwrap(),
            "cargo-local"
        );
        assert_eq!(
            uno(&dst, "SELECT count(*) || '' FROM cargos").unwrap(),
            "1",
            "no se duplica"
        );
        assert!(inf.detalle.iter().any(|x| x.motivo == "union"));
    }

    #[test]
    fn una_persona_con_el_mismo_correo_no_se_duplica() {
        let (d, origen) = base_con_datos();
        let (_d2, mut dst) = destino(&format!(
            "INSERT INTO trabajadores (id, nombre, correo, created_at, updated_at) VALUES ('ana-local', 'Ana Local', ' ANA@x.cl ', 'x', 'x');
             INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES ('raiz', '{TIPO}', 'Raíz local', 'x', 'x');"
        ));
        let inf = fusion(&mut dst, &origen, d.path(), Some(&rama()), &Lugares::new()).unwrap();
        assert_eq!(tabla(&inf, "trabajadores").omitidas, 1);
        assert!(inf.detalle.contains(&Detalle {
            tabla: "trabajadores",
            nombre: "Ana".into(),
            motivo: "correo"
        }));
        assert_eq!(
            uno(
                &dst,
                "SELECT count(*) || '' FROM trabajadores WHERE id = 'ana'"
            )
            .unwrap(),
            "0"
        );
        // el puesto que ocupaba queda con la persona que ya existía
        assert_eq!(
            uno(
                &dst,
                "SELECT trabajador_id FROM asignaciones WHERE id = 'as-rama'"
            )
            .unwrap(),
            "ana-local"
        );
    }

    #[test]
    fn una_referencia_a_algo_eliminado_aqui_se_resuelve_e_informa() {
        let (d, origen) = base_con_datos();
        // la unidad «hija» está eliminada en el destino (mismo id): no se revive
        let (_d2, mut dst) = destino(&format!(
            "INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at, deleted_at)
               VALUES ('hija', '{TIPO}', 'Hija borrada', 'x', 'x', 'y');
             INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES ('raiz', '{TIPO}', 'Raíz local', 'x', 'x');"
        ));
        let inf = fusion(&mut dst, &origen, d.path(), Some(&rama()), &Lugares::new()).unwrap();
        // el puesto (unidad obligatoria) no entra, ni lo que depende de él
        assert_eq!(tabla(&inf, "puestos").omitidas, 1);
        assert_eq!(tabla(&inf, "asignaciones").omitidas, 1);
        assert_eq!(
            uno(
                &dst,
                "SELECT count(*) || '' FROM puestos WHERE id = 'p-hija'"
            )
            .unwrap(),
            "0"
        );
        assert!(inf.detalle.iter().any(|x| x.motivo == "referencia"));
        let rotas: i64 = dst
            .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |f| {
                f.get(0)
            })
            .unwrap();
        assert_eq!(rotas, 0);
    }

    #[test]
    fn una_jefatura_cuyo_puesto_no_entra_queda_vacia() {
        let (d, origen) = base_con_datos();
        // la jefatura de «hija» es su propio puesto
        origen
            .execute_batch("UPDATE unidades SET jefe_puesto_id = 'p-hija' WHERE id = 'hija';")
            .unwrap();
        let (_d2, mut dst) = destino(&format!(
            "INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES ('raiz', '{TIPO}', 'R', 'x', 'x'), ('otra', '{TIPO}', 'O', 'x', 'x');
             INSERT INTO cargos (id, nombre, created_at, updated_at) VALUES ('c', 'C', 'x', 'x');
             INSERT INTO puestos (id, unidad_id, cargo_id, created_at, updated_at, deleted_at) VALUES ('p-hija', 'otra', 'c', 'x', 'x', 'y');"
        ));
        let inf = fusion(&mut dst, &origen, d.path(), Some(&rama()), &Lugares::new()).unwrap();
        assert_eq!(inf.vaciadas, 1);
        assert_eq!(
            uno(
                &dst,
                "SELECT jefe_puesto_id FROM unidades WHERE id = 'hija'"
            ),
            None
        );
        assert!(inf.detalle.iter().any(|x| x.motivo == "vaciada"));
    }

    #[test]
    fn otra_regla_unica_omite_la_fila_sin_fallar() {
        let (d, origen) = base_con_datos();
        // mismo puesto en ambas bases, ya con otro titular vigente en el destino
        let (_d2, mut dst) = destino(&format!(
            "INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES ('raiz', '{TIPO}', 'R', 'x', 'x'), ('rama', '{TIPO}', 'Rama', 'x', 'x');
             INSERT INTO cargos (id, nombre, created_at, updated_at) VALUES ('c', 'C', 'x', 'x');
             INSERT INTO puestos (id, unidad_id, cargo_id, created_at, updated_at) VALUES ('p-rama', 'rama', 'c', 'x', 'x');
             INSERT INTO trabajadores (id, nombre, created_at, updated_at) VALUES ('otro', 'Otro', 'x', 'x');
             INSERT INTO asignaciones (id, puesto_id, trabajador_id, tipo, desde, created_at, updated_at) VALUES ('as-local', 'p-rama', 'otro', 'titular', '2020-01-01', 'x', 'x');"
        ));
        let inf = fusion(&mut dst, &origen, d.path(), Some(&rama()), &Lugares::new()).unwrap();
        assert_eq!(tabla(&inf, "asignaciones").omitidas, 1);
        assert!(inf.detalle.contains(&Detalle {
            tabla: "asignaciones",
            nombre: "Ana".into(),
            motivo: "choque"
        }));
        assert_eq!(
            uno(
                &dst,
                "SELECT trabajador_id FROM asignaciones WHERE puesto_id = 'p-rama'"
            )
            .unwrap(),
            "otro"
        );
    }

    #[test]
    fn una_rama_sin_su_superior_pregunta_donde_va() {
        let (d, origen) = base_con_datos();
        // sin decidir: árbol independiente
        let (_d2, mut dst) = destino(&format!(
            "INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES ('aqui', '{TIPO}', 'Aquí', 'x', 'x');"
        ));
        let inf = fusion(&mut dst, &origen, d.path(), Some(&rama()), &Lugares::new()).unwrap();
        assert!(inf.ramas[0].pide_lugar && inf.ramas[0].dentro_de.is_none());
        assert_eq!(
            uno(&dst, "SELECT parent_id FROM unidades WHERE id = 'rama'"),
            None
        );

        // dentro de una unidad elegida
        let (_d3, mut dst) = destino(&format!(
            "INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES ('aqui', '{TIPO}', 'Aquí', 'x', 'x');"
        ));
        let lugares = Lugares::from([("rama".to_string(), Some("aqui".to_string()))]);
        fusion(&mut dst, &origen, d.path(), Some(&rama()), &lugares).unwrap();
        assert_eq!(
            uno(&dst, "SELECT parent_id FROM unidades WHERE id = 'rama'").unwrap(),
            "aqui"
        );

        // un lugar que no existe no se acepta
        let (_d4, mut dst) = destino("");
        let lugares = Lugares::from([("rama".to_string(), Some("nadie".to_string()))]);
        let e = fusion(&mut dst, &origen, d.path(), Some(&rama()), &lugares).unwrap_err();
        assert_eq!(e.codigo, "desconocido");
    }

    #[test]
    fn si_el_superior_existe_la_rama_vuelve_a_colgar_de_el() {
        let (d, origen) = base_con_datos();
        let (_d2, mut dst) = destino(&format!(
            "INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES ('raiz', '{TIPO}', 'Raíz local', 'x', 'x');"
        ));
        let inf = fusion(&mut dst, &origen, d.path(), Some(&rama()), &Lugares::new()).unwrap();
        assert!(!inf.ramas[0].pide_lugar);
        assert_eq!(inf.ramas[0].dentro_de.as_deref(), Some("Raíz local"));
        assert_eq!(
            uno(&dst, "SELECT parent_id FROM unidades WHERE id = 'rama'").unwrap(),
            "raiz"
        );
    }

    #[test]
    fn deshacer_la_transaccion_no_deja_nada() {
        let (d, origen) = base_con_datos();
        let (_d2, mut dst) = destino("");
        let copia = alcance::copiar(&origen, d.path()).unwrap();
        let (t, _) = alcance::preparar(copia, d.path(), None).unwrap();
        let imp = validar::solo_lectura(t.ruta()).unwrap();
        let meta = validar::leer_meta(&imp).unwrap();
        let tx = dst.transaction().unwrap();
        fusionar(&tx, &imp, &meta, &Lugares::new(), "z").unwrap();
        drop(tx);
        assert_eq!(
            uno(&dst, "SELECT count(*) || '' FROM unidades").unwrap(),
            "0"
        );
    }
}
