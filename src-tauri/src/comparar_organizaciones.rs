//! La otra organización de una comparación, en un temporal: lo que se reescriba después nunca toca su archivo.
use crate::intercambio::{
    CANCELADOS_RECORDADOS, Temporal, ahora,
    comparar::{TipoCaso, comparable, comparar_con_locales, iguales, leer_fila, posicion, tablas},
    fusion::{Tabla, describir, normalizar_nombre},
    revision::{CampoDetalle, MAX_PAGINA, fecha_mostrable, nombre_en, valor_campo},
    validar::{
        MetaArchivo, abrir_no_confiable, migrar_temporal, solo_lectura, solo_lectura_cerrada,
        version_y_esquema,
    },
};
use crate::organizaciones::{Entrada, base_de, esta_su_archivo, id_del_archivo};
use crate::respaldos::Fallo;
use crate::rutas::Rutas;
use rusqlite::types::Value;
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap, HashSet, VecDeque};
use std::sync::{Mutex, MutexGuard};

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
            // con el mismo separador: `normalizar_nombre` deja la `/`, y una raíz «Gerencia/Finanzas» no es Gerencia → Finanzas
            f.b.as_deref().map(|r| {
                r.split('\u{1f}')
                    .map(normalizar_nombre)
                    .collect::<Vec<_>>()
                    .join("\u{1f}")
            })
        },
        &mut unidades,
    );
    // único entre todas las vivas de cada lado, no solo entre las que sobran: así nunca se cruzan gerencias por azar
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

/// Lo único que se muestra (decisión 6): los catálogos se comparan para unir por nombre, y el resto conserva ids al azar
/// en modo aproximado, así que dos organizaciones iguales se verían distintas.
const RESUMIDAS: [&str; 3] = ["unidades", "trabajadores", "puestos"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Presencia {
    SoloAqui,
    SoloAlla,
    Difieren,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Grupo {
    pub tabla: &'static str,
    pub solo_aqui: u64,
    pub solo_alla: u64,
    pub difieren: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumenComparacion {
    /// El id de la otra organización.
    pub otra: String,
    pub aproximada: bool,
    pub sin_correo: u64,
    pub grupos: Vec<Grupo>,
    pub iguales: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FiltroComparacion {
    pub tabla: Option<String>,
    pub presencia: Option<Presencia>,
    pub desde: usize,
    pub cuantos: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilaComparada {
    pub tabla: &'static str,
    pub id: String,
    /// Se calcula solo para la página que se pide.
    pub nombre: String,
    pub presencia: Presencia,
    pub columnas: Vec<String>,
    /// Emparejada por nombre o correo, no por `id`.
    pub aproximada: bool,
}

#[derive(Debug, Serialize)]
pub struct PaginaComparada {
    pub filas: Vec<FilaComparada>,
    pub total: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetalleComparado {
    /// `mio` es la abierta y `archivo` la otra.
    pub campos: Vec<CampoDetalle>,
    pub puestos_aqui: Vec<String>,
    pub puestos_alla: Vec<String>,
    pub actualizada_aqui: Option<String>,
    pub actualizada_alla: Option<String>,
}

/// Una comparación lista: su temporal vive lo que vive ella.
pub struct Activa {
    base: String,
    copia: Copia,
    filas: Vec<FilaComparada>,
    resumen: ResumenComparacion,
}

/// Los puestos vigentes de cada persona viva. Vigente como en `comparar::resumidas_de`: ya empezó, y sin fin o con un fin que
/// aún no llega.
fn vigentes(
    c: &Connection,
    persona: Option<&str>,
) -> Result<HashMap<String, BTreeSet<String>>, Fallo> {
    let mut consulta = c.prepare(
        "SELECT t.id, a.puesto_id FROM trabajadores t
         LEFT JOIN asignaciones a ON a.trabajador_id = t.id AND a.deleted_at IS NULL
           AND a.desde <= date('now', 'localtime') AND (a.hasta IS NULL OR a.hasta > date('now', 'localtime'))
           AND a.puesto_id IN (SELECT id FROM puestos WHERE deleted_at IS NULL)
         WHERE t.deleted_at IS NULL AND (?1 IS NULL OR t.id = ?1)",
    )?;
    let mut filas = consulta.query([persona])?;
    let mut m: HashMap<String, BTreeSet<String>> = HashMap::new();
    while let Some(f) = filas.next()? {
        let puestos = m.entry(f.get(0)?).or_default();
        puestos.extend(f.get::<_, Option<String>>(1)?);
    }
    Ok(m)
}

/// Compara la abierta con la copia, por `id` o, si no se relacionan, tras emparejar. No escribe en la abierta.
pub fn comparar(
    abierta: &Connection,
    base: &str,
    copia: Copia,
    seguir: impl FnMut(u64, u64) -> bool,
) -> Result<Activa, Fallo> {
    let aproximada = !relacionadas(abierta, &copia)?;
    let emparejadas = if aproximada {
        emparejar(abierta, &copia)?
    } else {
        Emparejadas::default()
    };
    let otra = leer(&copia)?;
    let meta = MetaArchivo {
        parcial: false,
        ramas: vec![],
        organizacion: String::new(),
        origen: copia.origen.clone(),
    };
    let c = comparar_con_locales(abierta, &otra, &meta, &ahora(abierta)?, seguir)?;
    let mut esquema = HashMap::new();
    for tabla in RESUMIDAS {
        esquema.insert(tabla, describir(&otra, tabla)?);
    }

    // decisión 5: quien está en los dos con otros puestos vigentes también difiere
    let alla = vigentes(&otra, None)?;
    let mut en_otro_puesto: HashSet<String> = vigentes(abierta, None)?
        .into_iter()
        .filter(|(id, p)| alla.get(id).is_some_and(|q| q != p))
        .map(|(id, _)| id)
        .collect();

    let mut filas = Vec::new();
    let mut fila = |tabla, id: String, presencia, columnas| {
        filas.push(FilaComparada {
            tabla,
            aproximada: emparejadas.ids.contains(&id),
            id,
            nombre: String::new(),
            presencia,
            columnas,
        })
    };
    for (tabla, id) in c.solo_aqui {
        if RESUMIDAS.contains(&tabla) {
            fila(tabla, id, Presencia::SoloAqui, Vec::new());
        }
    }
    for k in c.casos.into_iter().filter(|k| RESUMIDAS.contains(&k.tabla)) {
        // borrada en un lado y viva en el otro es «solo en» la que la tiene viva (decisión 6)
        let presencia = match k.tipo {
            TipoCaso::Diferente => Presencia::Difieren,
            TipoCaso::BorradoVsEditado | TipoCaso::BorradoSinConflicto if !k.borrado_aqui => {
                Presencia::SoloAqui
            }
            TipoCaso::Nuevo
            | TipoCaso::DuplicadoPersona
            | TipoCaso::BorradoVsEditado
            | TipoCaso::BorradoSinConflicto => Presencia::SoloAlla,
            TipoCaso::Union | TipoCaso::Desactivado => continue,
        };
        let mut columnas = Vec::new();
        if presencia == Presencia::Difieren {
            let d = esquema.get(k.tabla).ok_or("tabla")?;
            columnas = d
                .columnas
                .iter()
                .enumerate()
                .filter(|(i, _)| k.columnas & (1 << i) != 0)
                .map(|(_, c)| c.clone())
                .collect();
            if k.tabla == "trabajadores" && en_otro_puesto.remove(&k.id) {
                columnas.push("puestos".into());
            }
        }
        fila(k.tabla, k.id, presencia, columnas);
    }
    // el resto tenía los mismos datos: `comparar` las contó como iguales
    let solo_de_puesto = en_otro_puesto.len() as u64;
    for id in en_otro_puesto {
        fila(
            "trabajadores",
            id,
            Presencia::Difieren,
            vec!["puestos".into()],
        );
    }
    filas.sort_by(|a, b| (posicion(a.tabla), &a.id).cmp(&(posicion(b.tabla), &b.id)));

    let grupos = RESUMIDAS
        .into_iter()
        .map(|tabla| {
            let n = |p| {
                filas
                    .iter()
                    .filter(|f| f.tabla == tabla && f.presencia == p)
                    .count() as u64
            };
            Grupo {
                tabla,
                solo_aqui: n(Presencia::SoloAqui),
                solo_alla: n(Presencia::SoloAlla),
                difieren: n(Presencia::Difieren),
            }
        })
        .collect();
    let iguales = RESUMIDAS
        .iter()
        .filter_map(|t| c.iguales_vivas.get(t))
        .sum::<u64>()
        .saturating_sub(solo_de_puesto);
    let resumen = ResumenComparacion {
        otra: copia.id.clone(),
        aproximada,
        sin_correo: emparejadas.sin_correo,
        grupos,
        iguales,
    };
    Ok(Activa {
        base: base.to_string(),
        copia,
        filas,
        resumen,
    })
}

/// Una comparación a la vez (decisión 7), aparte de `Sesiones`: empezar una no suelta una importación en curso.
#[derive(Default)]
pub struct Comparaciones {
    activa: Mutex<Option<Activa>>,
    /// Como en `Sesiones`: el cancelar puede llegar antes que su comando, y gana.
    cancelados: Mutex<VecDeque<String>>,
}

fn vencida() -> Fallo {
    Fallo::de("comparacion_vencida", "")
}

impl Comparaciones {
    fn activa(&self) -> MutexGuard<'_, Option<Activa>> {
        self.activa.lock().unwrap_or_else(|p| p.into_inner())
    }

    fn cancelados(&self) -> MutexGuard<'_, VecDeque<String>> {
        self.cancelados.lock().unwrap_or_else(|p| p.into_inner())
    }

    pub fn sigue(&self, trabajo: &str) -> bool {
        !self.cancelados().iter().any(|c| c == trabajo)
    }

    pub fn cancelar(&self, trabajo: &str) {
        let mut c = self.cancelados();
        if c.len() == CANCELADOS_RECORDADOS {
            c.pop_front();
        }
        c.push_back(trabajo.to_string());
    }

    /// Suelta la comparación y borra su temporal.
    pub fn cerrar(&self) {
        *self.activa() = None;
    }

    /// La suelta si su base ya no es la abierta o si `eliminada` es la otra.
    pub fn soltar_vencida(&self, abierta: Option<&str>, eliminada: Option<&str>) {
        let mut g = self.activa();
        if g.as_ref().is_some_and(|a| {
            abierta != Some(a.base.as_str()) || eliminada == Some(a.copia.id.as_str())
        }) {
            *g = None;
        }
    }

    /// Reemplaza la anterior, salvo que este trabajo se haya cancelado.
    pub fn guardar(&self, trabajo: &str, a: Activa) -> Result<ResumenComparacion, Fallo> {
        if !self.sigue(trabajo) {
            return Err(Fallo::de("cancelado", ""));
        }
        let resumen = a.resumen.clone();
        *self.activa() = Some(a);
        Ok(resumen)
    }

    pub fn pagina(
        &self,
        abierta: &Connection,
        base: &str,
        f: &FiltroComparacion,
    ) -> Result<PaginaComparada, Fallo> {
        let g = self.activa();
        let a = g.as_ref().filter(|a| a.base == base).ok_or_else(vencida)?;
        let otra = leer(&a.copia)?;
        let vale = |x: &&FilaComparada| {
            f.tabla.as_deref().is_none_or(|t| t == x.tabla)
                && f.presencia.is_none_or(|p| p == x.presencia)
        };
        let total = a.filas.iter().filter(vale).count();
        let filas = a
            .filas
            .iter()
            .filter(vale)
            .skip(f.desde)
            .take(f.cuantos.min(MAX_PAGINA))
            .map(|x| {
                let (primero, si_no) = if x.presencia == Presencia::SoloAlla {
                    (&otra, abierta)
                } else {
                    (abierta, &otra)
                };
                let nombre = match nombre_en(primero, x.tabla, &x.id)? {
                    Some(n) => n,
                    None => nombre_en(si_no, x.tabla, &x.id)?.unwrap_or_default(),
                };
                Ok(FilaComparada {
                    nombre,
                    ..x.clone()
                })
            })
            .collect::<Result<_, Fallo>>()?;
        Ok(PaginaComparada { filas, total })
    }

    pub fn detalle(
        &self,
        abierta: &Connection,
        base: &str,
        tabla: &str,
        id: &str,
    ) -> Result<DetalleComparado, Fallo> {
        let g = self.activa();
        let a = g.as_ref().filter(|a| a.base == base).ok_or_else(vencida)?;
        let x = a
            .filas
            .iter()
            .find(|x| x.tabla == tabla && x.id == id)
            .ok_or_else(|| Fallo::de("desconocido", ""))?;
        let otra = leer(&a.copia)?;
        let d: Tabla = describir(&otra, x.tabla)?;
        let i_baja = d
            .columnas
            .iter()
            .position(|c| c == "deleted_at")
            .ok_or("deleted_at")?;
        // lo borrado en un lado no está ahí
        let viva = |c: &Connection| -> Result<Option<Vec<Value>>, Fallo> {
            Ok(leer_fila(c, x.tabla, &d, id)?.filter(|f| f[i_baja] == Value::Null))
        };
        let (aqui, alla) = (viva(abierta)?, viva(&otra)?);
        let vacia = vec![Value::Null; d.columnas.len()];
        let (m, o) = (
            aqui.as_deref().unwrap_or(&vacia),
            alla.as_deref().unwrap_or(&vacia),
        );
        let mut campos = Vec::new();
        for (i, col) in d.columnas.iter().enumerate() {
            // de una que difiere, lo que vio `comparar`: un catálogo con otro id y el mismo nombre no es una diferencia
            let distinto = if x.presencia == Presencia::Difieren {
                x.columnas.contains(col)
            } else {
                comparable(col) && !iguales(&m[i], &o[i])
            };
            if distinto {
                campos.push(CampoDetalle {
                    columna: col.clone(),
                    mio: valor_campo(abierta, &otra, &d, i, m)?,
                    archivo: valor_campo(&otra, abierta, &d, i, o)?,
                    distinto,
                    del_archivo: false,
                });
            }
        }
        let puestos = |c: &Connection| -> Result<Vec<String>, Fallo> {
            if x.tabla != "trabajadores" {
                return Ok(Vec::new());
            }
            let mut nombres = vigentes(c, Some(id))?
                .into_values()
                .flatten()
                .map(|p| Ok(nombre_en(c, "puestos", &p)?.unwrap_or_default()))
                .collect::<Result<Vec<_>, Fallo>>()?;
            nombres.sort();
            Ok(nombres)
        };
        Ok(DetalleComparado {
            campos,
            puestos_aqui: puestos(abierta)?,
            puestos_alla: puestos(&otra)?,
            actualizada_aqui: fecha_mostrable(&d, aqui.as_deref(), "updated_at"),
            actualizada_alla: fecha_mostrable(&d, alla.as_deref(), "updated_at"),
        })
    }
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
        par_con(r, aqui, alla, false)
    }

    /// Como `par`; `por_id`: la otra es una importación de la abierta, y se comparan por `id`.
    fn par_con(r: &Rutas, aqui: &str, alla: &str, por_id: bool) -> (Connection, Copia) {
        let bd = r.datos.join("abierta.db");
        crear(&bd, "Abierta", MIGRACIONES);
        let abierta = db::abrir(&bd).unwrap();
        abierta.execute_batch(aqui).unwrap();
        let (e, bd_otra) = otra(r, MIGRACIONES);
        let c = db::abrir(&bd_otra).unwrap();
        c.execute_batch(alla).unwrap();
        if por_id {
            c.execute(
                "INSERT OR REPLACE INTO meta (clave, valor) VALUES ('origen_db_id', ?1)",
                [id_del_archivo(&abierta).unwrap().unwrap()],
            )
            .unwrap();
        }
        drop(c);
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

    #[test]
    fn una_barra_en_el_nombre_no_es_una_ruta() {
        let aqui = unidad("a-gf", "Gerencia/Finanzas", None);
        let alla = [
            unidad("b-ger", "Gerencia", None),
            unidad("b-fin", "Finanzas", Some("b-ger")),
        ]
        .concat();
        let (_exe, r) = rutas();
        let (abierta, copia) = par(&r, &aqui, &alla);
        assert!(emparejar(&abierta, &copia).unwrap().ids.is_empty());
    }

    const BASE: &str = "la-abierta";

    fn todo() -> FiltroComparacion {
        FiltroComparacion {
            tabla: None,
            presencia: None,
            desde: 0,
            cuantos: MAX_PAGINA,
        }
    }

    /// Compara el par y deja el resultado guardado, como el comando.
    fn comparada(abierta: &Connection, copia: Copia) -> (Comparaciones, ResumenComparacion) {
        let k = Comparaciones::default();
        let resumen = k
            .guardar("t", comparar(abierta, BASE, copia, |_, _| true).unwrap())
            .unwrap();
        (k, resumen)
    }

    fn filas_de(k: &Comparaciones, abierta: &Connection) -> Vec<FilaComparada> {
        k.pagina(abierta, BASE, &todo()).unwrap().filas
    }

    #[test]
    fn resumen_cuenta_por_tabla_y_estado() {
        let comun = [
            unidad("u-fin", "Finanzas", None),
            cargo("c-ana", "Analista"),
        ]
        .concat();
        let aqui = [
            comun.clone(),
            unidad("u-sola", "Legal", None),
            puesto("p1", "u-fin", "c-ana"),
        ]
        .concat();
        let alla = [
            comun,
            persona("t-1", "Ana", None),
            persona("t-2", "Beto", None),
            puesto("p1", "u-fin", "c-ana"),
            "UPDATE puestos SET descripcion = 'otra' WHERE id = 'p1';".into(),
        ]
        .concat();
        let (_exe, r) = rutas();
        let (abierta, copia) = par_con(&r, &aqui, &alla, true);
        let (k, resumen) = comparada(&abierta, copia);
        assert!(!resumen.aproximada);
        assert_eq!(resumen.sin_correo, 0);
        let grupo = |tabla, solo_aqui, solo_alla, difieren| Grupo {
            tabla,
            solo_aqui,
            solo_alla,
            difieren,
        };
        assert_eq!(
            resumen.grupos,
            [
                grupo("unidades", 1, 0, 0),
                grupo("trabajadores", 0, 2, 0),
                grupo("puestos", 0, 0, 1),
            ]
        );
        // solo `u-fin`: el cargo y los tipos sembrados también son iguales, pero son catálogos
        assert_eq!(resumen.iguales, 1);
        let filas = filas_de(&k, &abierta);
        let p = filas.iter().find(|f| f.tabla == "puestos").unwrap();
        assert_eq!(
            (p.presencia, p.columnas.as_slice(), p.nombre.as_str()),
            (
                Presencia::Difieren,
                ["descripcion".to_string()].as_slice(),
                "Analista · Finanzas"
            )
        );
    }

    #[test]
    fn borrada_en_un_lado_cuenta_solo_en_el_otro() {
        let borrar = |id: &str| {
            format!(
                "UPDATE unidades SET deleted_at = '2026-11-02T12:00:00.000Z' WHERE id = '{id}';"
            )
        };
        let aqui = [
            unidad("u-a", "Legal", None),
            borrar("u-a"),
            unidad("u-b", "Ventas", None),
        ]
        .concat();
        let alla = [
            unidad("u-a", "Legal", None),
            unidad("u-b", "Ventas", None),
            borrar("u-b"),
        ]
        .concat();
        let (_exe, r) = rutas();
        let (abierta, copia) = par_con(&r, &aqui, &alla, true);
        let (k, _) = comparada(&abierta, copia);
        let presencias: Vec<_> = filas_de(&k, &abierta)
            .into_iter()
            .map(|f| (f.id, f.presencia))
            .collect();
        assert_eq!(
            presencias,
            [
                ("u-a".to_string(), Presencia::SoloAlla),
                ("u-b".to_string(), Presencia::SoloAqui)
            ]
        );
    }

    #[test]
    fn persona_en_otro_puesto_difiere() {
        let comun = [
            unidad("u-fin", "Finanzas", None),
            cargo("c-ana", "Analista"),
            cargo("c-jef", "Jefe"),
            puesto("p-ana", "u-fin", "c-ana"),
            puesto("p-jef", "u-fin", "c-jef"),
            puesto("p-beto", "u-fin", "c-ana"),
            persona("t-ana", "Ana", Some("ana@x.cl")),
            persona("t-beto", "Beto", Some("beto@x.cl")),
        ]
        .concat();
        // Beto difiere en un campo y también de puesto: es una sola fila
        let aqui = [
            comun.clone(),
            asignacion("s-1", "p-ana", "t-ana"),
            asignacion("s-3", "p-beto", "t-beto"),
        ]
        .concat();
        let alla = [
            comun,
            asignacion("s-2", "p-jef", "t-ana"),
            "UPDATE trabajadores SET telefono = '123' WHERE id = 't-beto';".into(),
        ]
        .concat();
        let (_exe, r) = rutas();
        let (abierta, copia) = par_con(&r, &aqui, &alla, true);
        let (k, resumen) = comparada(&abierta, copia);
        let personas: Vec<_> = filas_de(&k, &abierta)
            .into_iter()
            .filter(|f| f.tabla == "trabajadores")
            .map(|f| (f.id, f.presencia, f.columnas))
            .collect();
        let s = |v: &[&str]| v.iter().map(|c| c.to_string()).collect::<Vec<_>>();
        assert_eq!(
            personas,
            [
                ("t-ana".to_string(), Presencia::Difieren, s(&["puestos"])),
                (
                    "t-beto".to_string(),
                    Presencia::Difieren,
                    s(&["telefono", "puestos"])
                ),
            ]
        );
        // la unidad y los tres puestos; ninguna persona
        assert_eq!(resumen.iguales, 4);
        let d = k.detalle(&abierta, BASE, "trabajadores", "t-ana").unwrap();
        assert!(d.campos.is_empty());
        assert_eq!(d.puestos_aqui, ["Analista · Finanzas"]);
        assert_eq!(d.puestos_alla, ["Jefe · Finanzas"]);
    }

    #[test]
    fn detalle_muestra_referencias_por_nombre() {
        let aqui = unidad("u-fin", "Finanzas", None);
        let alla = [
            unidad("u-fin", "Finanzas", None),
            "UPDATE unidades SET tipo_id = '00000000-0000-7000-8000-000000000002' WHERE id = 'u-fin';"
                .into(),
        ]
        .concat();
        let (_exe, r) = rutas();
        let (abierta, copia) = par_con(&r, &aqui, &alla, true);
        let (k, _) = comparada(&abierta, copia);
        let d = k.detalle(&abierta, BASE, "unidades", "u-fin").unwrap();
        let campos: Vec<_> = d
            .campos
            .iter()
            .map(|c| {
                (
                    c.columna.as_str(),
                    c.mio.texto.as_deref(),
                    c.archivo.texto.as_deref(),
                )
            })
            .collect();
        assert_eq!(campos, [("tipo_id", Some("Gerencia"), Some("Área"))]);
        assert_eq!(d.actualizada_aqui.as_deref(), Some(FECHA));
        assert_eq!(d.actualizada_alla.as_deref(), Some(FECHA));
        assert!(d.puestos_aqui.is_empty() && d.puestos_alla.is_empty());
    }

    #[test]
    fn filas_aproximadas_se_marcan() {
        let aqui = [
            unidad("a-fin", "Finanzas", None),
            unidad("comun", "Legal", None),
            unidad("a-sola", "Ventas", None),
        ]
        .concat();
        let alla = [
            unidad("b-fin", "Finanzas", None),
            unidad("comun", "Legal", None),
            "UPDATE unidades SET descripcion = 'otra';".into(),
        ]
        .concat();
        let (_exe, r) = rutas();
        let (abierta, copia) = par(&r, &aqui, &alla);
        let (k, resumen) = comparada(&abierta, copia);
        assert!(resumen.aproximada);
        let marcas: Vec<_> = filas_de(&k, &abierta)
            .into_iter()
            .map(|f| (f.id, f.presencia, f.aproximada))
            .collect();
        assert_eq!(
            marcas,
            [
                ("a-fin".to_string(), Presencia::Difieren, true),
                ("a-sola".to_string(), Presencia::SoloAqui, false),
                ("comun".to_string(), Presencia::Difieren, false),
            ]
        );
    }

    #[test]
    fn pagina_respeta_el_tope() {
        let aqui: String = (0..250)
            .map(|i| unidad(&format!("u-{i:03}"), &format!("U{i}"), None))
            .collect();
        let (_exe, r) = rutas();
        let (abierta, copia) = par_con(&r, &aqui, "", true);
        let (k, _) = comparada(&abierta, copia);
        let pedir = |desde, presencia| {
            k.pagina(
                &abierta,
                BASE,
                &FiltroComparacion {
                    tabla: Some("unidades".into()),
                    presencia: Some(presencia),
                    desde,
                    cuantos: 10_000,
                },
            )
            .unwrap()
        };
        let p = pedir(0, Presencia::SoloAqui);
        assert_eq!((p.filas.len(), p.total), (MAX_PAGINA, 250));
        assert_eq!(p.filas[0].nombre, "U0");
        assert_eq!(pedir(200, Presencia::SoloAqui).filas.len(), 50);
        assert_eq!(pedir(0, Presencia::SoloAlla).total, 0);
    }

    #[test]
    fn deja_de_valer_con_otra_base_o_sin_la_otra() {
        let (_exe, r) = rutas();
        let (abierta, copia) = par(&r, &unidad("u", "Legal", None), "");
        let (otra_id, temporal) = (copia.id.clone(), copia.temporal.ruta().to_path_buf());
        let (k, _) = comparada(&abierta, copia);
        let vencida = |base| k.pagina(&abierta, base, &todo()).unwrap_err().codigo;
        assert_eq!(vencida("otra"), "comparacion_vencida");
        k.soltar_vencida(Some(BASE), Some("una-cualquiera"));
        assert_eq!(filas_de(&k, &abierta).len(), 1);
        k.soltar_vencida(Some(BASE), Some(&otra_id));
        assert_eq!(vencida(BASE), "comparacion_vencida");
        assert!(!temporal.exists());
    }
}
