//! Compara dos bases fila por fila, sin escribir nada. Vive en Rust porque un archivo puede traer cientos de miles de filas:
//! se recorren las dos en orden de `id` sin cargarlas, y a la interfaz solo llega la página que se está viendo. Escenarios →
//! Comparar puede llamar a `comparar` con sus dos conexiones.
//!
//! «Mío» es la base local y «archivo» la otra. Nada de lo que trae el archivo es confiable: `updated_at` solo sirve para
//! preseleccionar, y una fecha futura o que no es una fecha nunca cuenta como la más reciente.
use super::fusion::{self, CATALOGOS, NEGOCIO, Tabla};
use super::validar::MetaArchivo;
use crate::respaldos::Fallo;
use rusqlite::types::Value;
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::hash::Hasher;

/// Lo que se ve como dato de la fila, y lo que no: las marcas de tiempo no son una diferencia, solo sirven para preseleccionar.
const NO_COMPARABLES: &[&str] = &["id", "created_at", "updated_at", "deleted_at"];

pub fn comparable(columna: &str) -> bool {
    !NO_COMPARABLES.contains(&columna)
}

pub fn tablas() -> impl Iterator<Item = &'static str> {
    CATALOGOS.iter().chain(NEGOCIO).copied()
}

pub fn estatica(tabla: &str) -> Option<&'static str> {
    tablas().find(|t| *t == tabla)
}

/// Lugar de la tabla en `tablas()`: cada una va después de las que usa.
pub fn posicion(tabla: &str) -> usize {
    tablas().position(|t| t == tabla).unwrap_or(usize::MAX)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TipoCaso {
    /// Solo en el archivo.
    Nuevo,
    /// Mismo `id`, campos distintos.
    Diferente,
    /// Un lado eliminado y el otro editado después (o una fecha en la que no se puede confiar).
    BorradoVsEditado,
    /// Un lado eliminado y el otro sin cambios posteriores.
    BorradoSinConflicto,
    /// Persona nueva con el correo de una persona de esta base.
    DuplicadoPersona,
    /// Valor de mantenedor nuevo con el nombre de uno de esta base: se usa el de aquí.
    Union,
    /// Valor desactivado que una fila viva del archivo usa: entra con ella, sin nada que decidir.
    Desactivado,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Lado {
    Mio,
    Archivo,
    Igual,
}

#[derive(Debug, Clone)]
pub struct Caso {
    pub tabla: &'static str,
    pub id: String,
    pub tipo: TipoCaso,
    /// `Diferente`: máscara de las columnas distintas, por su lugar en la tabla.
    pub columnas: u64,
    pub mas_reciente: Lado,
    /// Alguna fecha es futura o no es una fecha: se avisa y nunca gana sola.
    pub dudosa: bool,
    /// De los casos de borrado: el lado eliminado es esta base.
    pub borrado_aqui: bool,
    /// Cómo estaba la fila de esta base al comparar (0 si no existía): para saber si cambió antes de aplicar. De una unión o
    /// un duplicado, la fila de aquí con la que se junta.
    pub huella: u64,
}

#[derive(Debug, Default)]
pub struct Comparacion {
    /// En el orden de `tablas()` y por `id`.
    pub casos: Vec<Caso>,
    /// Id de un valor de mantenedor en el archivo → el que le corresponde aquí.
    pub unidos: HashMap<(&'static str, String), String>,
    /// Id de una persona en el archivo → la persona de aquí con su mismo correo.
    pub rivales: HashMap<String, String>,
    /// Filas iguales en los dos lados.
    pub iguales: u64,
    /// Personas de una copia parcial que viajan resumidas: ver `resumidas_de`.
    pub resumidas: HashSet<String>,
    /// Filas vivas de esta base, para saber qué parte de ella se borraría.
    pub vivas_locales: u64,
}

/// Fecha que la app pudo haber escrito: `AAAA-MM-DDTHH:MM:SS[.mmm]Z`, en valores posibles.
pub fn fecha_valida(s: &str) -> bool {
    let b = s.as_bytes();
    if !matches!(b.len(), 20 | 24) || b[b.len() - 1] != b'Z' {
        return false;
    }
    let digitos = |r: std::ops::Range<usize>| b[r].iter().all(u8::is_ascii_digit);
    let num = |d: usize, u: usize| i32::from(b[d] - b'0') * 10 + i32::from(b[u] - b'0');
    if !(digitos(0..4) && digitos(5..7) && digitos(8..10) && digitos(11..13)) {
        return false;
    }
    if !(digitos(14..16) && digitos(17..19) && (b.len() == 20 || digitos(20..23))) {
        return false;
    }
    b[4] == b'-'
        && b[7] == b'-'
        && b[10] == b'T'
        && b[13] == b':'
        && b[16] == b':'
        && (b.len() == 20 || b[19] == b'.')
        && (1..=12).contains(&num(5, 6))
        && (1..=31).contains(&num(8, 9))
        && num(11, 12) < 24
        && num(14, 15) < 60
        && num(17, 18) < 60
}

/// Una fecha en la que no se puede confiar. Mismo formato en UTC: se comparan como texto.
pub fn fecha_dudosa(s: &str, ahora: &str) -> bool {
    !fecha_valida(s) || s > ahora
}

/// `a` es posterior a `b`. Una fecha que no es una fecha nunca es posterior a nada.
fn posterior(a: &str, b: &str) -> bool {
    fecha_valida(a) && (!fecha_valida(b) || a > b)
}

#[derive(Debug, Clone, Copy)]
pub struct Fechas<'a> {
    pub actualizada: &'a str,
    pub borrada: Option<&'a str>,
}

#[derive(Debug, PartialEq)]
pub struct Clasificacion {
    pub tipo: TipoCaso,
    pub mas_reciente: Lado,
    pub dudosa: bool,
    pub borrado_aqui: bool,
}

/// Qué caso es una fila que está en los dos lados. None: nada que decidir. Es la tabla de la spec §9, sin tocar una base.
pub fn clasificar(
    mia: Fechas,
    archivo: Fechas,
    distintas: bool,
    ahora: &str,
) -> Option<Clasificacion> {
    let duda = |s: &str| fecha_dudosa(s, ahora);
    let con = |tipo, mas_reciente, dudosa, borrado_aqui| {
        Some(Clasificacion {
            tipo,
            mas_reciente,
            dudosa,
            borrado_aqui,
        })
    };
    match (mia.borrada, archivo.borrada) {
        // para las dos ya no existe: lo que tengan distinto nadie lo ve
        (Some(_), Some(_)) => None,
        (None, None) if !distintas => None,
        (None, None) => {
            let dudosa = duda(mia.actualizada) || duda(archivo.actualizada);
            let reciente =
                if !duda(archivo.actualizada) && posterior(archivo.actualizada, mia.actualizada) {
                    Lado::Archivo
                } else if mia.actualizada == archivo.actualizada {
                    Lado::Igual
                } else {
                    Lado::Mio
                };
            con(TipoCaso::Diferente, reciente, dudosa, false)
        }
        // borrada en el archivo: una fecha dudosa no borra nada sin que alguien lo decida
        (None, Some(borrada)) => {
            let dudosa = duda(borrada);
            let editada = posterior(mia.actualizada, borrada);
            let tipo = if dudosa || editada {
                TipoCaso::BorradoVsEditado
            } else {
                TipoCaso::BorradoSinConflicto
            };
            con(tipo, Lado::Mio, dudosa, false)
        }
        // borrada aquí: una fecha dudosa no revive nada
        (Some(borrada), None) => {
            let dudosa = duda(archivo.actualizada);
            let editada = posterior(archivo.actualizada, borrada);
            let tipo = if dudosa || editada {
                TipoCaso::BorradoVsEditado
            } else {
                TipoCaso::BorradoSinConflicto
            };
            let reciente = if editada && !dudosa {
                Lado::Archivo
            } else {
                Lado::Mio
            };
            con(tipo, reciente, dudosa, true)
        }
    }
}

/// NULL y vacío se ven igual en la ficha: no son una diferencia.
pub fn iguales(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Null, Value::Text(t)) | (Value::Text(t), Value::Null) => t.is_empty(),
        _ => a == b,
    }
}

/// shortcut: 64 bits sin clave, para notar un cambio local, no contra alguien que lo busque; la fila es de esta misma base.
pub fn huella(fila: &[Value]) -> u64 {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    for v in fila {
        match v {
            Value::Null => h.write_u8(0),
            Value::Integer(n) => {
                h.write_u8(1);
                h.write_i64(*n);
            }
            Value::Real(n) => {
                h.write_u8(2);
                h.write_u64(n.to_bits());
            }
            Value::Text(t) => {
                h.write_u8(3);
                h.write(t.as_bytes());
                h.write_u8(0xff);
            }
            Value::Blob(b) => {
                h.write_u8(4);
                h.write_usize(b.len());
                h.write(b);
            }
        }
    }
    h.finish()
}

pub fn leer_fila(
    c: &Connection,
    tabla: &str,
    d: &Tabla,
    id: &str,
) -> Result<Option<Vec<Value>>, Fallo> {
    let sql = format!(
        "SELECT {} FROM {tabla} WHERE id = ?1",
        d.columnas.join(", ")
    );
    let mut consulta = c.prepare_cached(&sql)?;
    Ok(consulta
        .query_row([id], |f| {
            (0..d.columnas.len())
                .map(|i| f.get(i))
                .collect::<rusqlite::Result<Vec<Value>>>()
        })
        .optional()?)
}

pub fn remapear(fila: &mut [Value], d: &Tabla, unidos: &HashMap<(&'static str, String), String>) {
    for (i, destino, _) in &d.referencias {
        if let Value::Text(v) = &fila[*i]
            && let Some(t) = estatica(destino)
            && let Some(local) = unidos.get(&(t, v.clone()))
        {
            fila[*i] = Value::Text(local.clone());
        }
    }
}

/// De quien ya no está, una copia parcial solo lleva nombre y correo: lo demás viaja vacío.
const CAMPOS_RESUMIDOS: &[&str] = &[
    "telefono",
    "tipo_contrato_id",
    "sede_id",
    "jornada_id",
    "foto_png",
    "notas",
];

/// Las personas de una copia parcial sin asignación vigente en ella. Vigente como en `alcance.rs`: ya empezó, y sin fin o con
/// un fin que aún no llega. Se calcula hoy, y la copia se recortó con la fecha de la exportación: una asignación que empezó
/// entre medio engañaría, así que quien trae vacíos los seis campos también cuenta. Da igual si el archivo lo hace a propósito:
/// lo único que consigue es no vaciar nada. Un archivo completo no tiene este caso.
pub fn resumidas_de(imp: &Connection, meta: &MetaArchivo) -> Result<HashSet<String>, Fallo> {
    if !meta.parcial {
        return Ok(HashSet::new());
    }
    Ok(imp
        .prepare(
            "SELECT t.id FROM trabajadores t WHERE NOT EXISTS (
               SELECT 1 FROM asignaciones a JOIN puestos p ON p.id = a.puesto_id AND p.deleted_at IS NULL
               WHERE a.trabajador_id = t.id AND a.deleted_at IS NULL AND a.desde <= date('now', 'localtime')
                 AND (a.hasta IS NULL OR a.hasta > date('now', 'localtime')))
             OR (COALESCE(t.telefono, '') = '' AND COALESCE(t.tipo_contrato_id, '') = ''
                 AND COALESCE(t.sede_id, '') = '' AND COALESCE(t.jornada_id, '') = ''
                 AND COALESCE(t.foto_png, '') = '' AND COALESCE(t.notas, '') = '')",
        )?
        .query_map([], |f| f.get(0))?
        .collect::<rusqlite::Result<_>>()?)
}

/// Lo que una persona resumida trae vacío no es una diferencia: sus datos de aquí se quedan, y nunca se ofrece vaciarlos.
pub fn completar_resumida(
    resumidas: &HashSet<String>,
    d: &Tabla,
    archivo: &mut [Value],
    mia: &[Value],
) {
    let pos = |c: &str| d.columnas.iter().position(|x| x == c);
    let Some(Value::Text(id)) = pos("id").map(|i| &archivo[i]) else {
        return;
    };
    if !resumidas.contains(id) {
        return;
    }
    for i in CAMPOS_RESUMIDOS.iter().filter_map(|c| pos(c)) {
        if iguales(&archivo[i], &Value::Null) {
            archivo[i] = mia[i].clone();
        }
    }
}

/// Una copia parcial corta lo que apunta fuera de sus ramas. Eso no es un cambio: su raíz vuelve a colgar de donde colgaba, o
/// se queda donde está aquí, una jefatura vacía porque su puesto no viajó no borra la de aquí, y a una persona resumida no se
/// le vacía nada.
pub struct Parcial<'a> {
    pub padres: HashMap<&'a str, Option<&'a str>>,
    pub resumidas: &'a HashSet<String>,
}

impl Parcial<'_> {
    pub fn ajustar(
        &self,
        local: &Connection,
        imp: &Connection,
        tabla: &str,
        d: &Tabla,
        archivo: &mut [Value],
        mia: &[Value],
    ) -> Result<(), Fallo> {
        if tabla == "trabajadores" {
            completar_resumida(self.resumidas, d, archivo, mia);
        }
        if tabla != "unidades" {
            return Ok(());
        }
        let pos = |c: &str| d.columnas.iter().position(|x| x == c).ok_or("columna");
        let (i_id, i_padre, i_jefe) = (pos("id")?, pos("parent_id")?, pos("jefe_puesto_id")?);
        if let Value::Text(id) = &archivo[i_id]
            && let Some(padre) = self.padres.get(id.as_str())
        {
            archivo[i_padre] = match padre {
                Some(p) if fusion::viva(local, "unidades", p)? => Value::Text((*p).to_string()),
                _ => mia[i_padre].clone(),
            };
        }
        if archivo[i_jefe] == Value::Null
            && let Value::Text(p) = &mia[i_jefe]
            && fusion::estado_fila(imp, "puestos", p)?.is_none()
        {
            archivo[i_jefe] = mia[i_jefe].clone();
        }
        Ok(())
    }
}

pub fn padres_de(meta: &MetaArchivo) -> HashMap<&str, Option<&str>> {
    meta.ramas
        .iter()
        .map(|r| (r.id.as_str(), r.padre.as_deref()))
        .collect()
}

fn siguiente(filas: &mut rusqlite::Rows, n: usize) -> rusqlite::Result<Option<Vec<Value>>> {
    filas
        .next()?
        .map(|f| (0..n).map(|i| f.get(i)).collect())
        .transpose()
}

fn texto(v: &Value) -> Option<&str> {
    match v {
        Value::Text(t) => Some(t),
        _ => None,
    }
}

/// Cada cuántas filas se mira si se canceló.
const CADA: u64 = 4096;

struct Contexto<'a> {
    local: &'a Connection,
    imp: &'a Connection,
    es_parcial: bool,
    parcial: Parcial<'a>,
    en_uso: HashSet<(&'static str, String)>,
    ahora: &'a str,
}

impl Contexto<'_> {
    /// Una fila que solo está en el archivo.
    fn solo_en_archivo(
        &self,
        tabla: &'static str,
        d: &Tabla,
        fila: &[Value],
        por_nombre: &mut HashMap<String, String>,
        s: &mut Comparacion,
    ) -> Result<(), Fallo> {
        let pos = |c: &str| d.columnas.iter().position(|x| x == c).ok_or("columna");
        let id = texto(&fila[pos("id")?]).ok_or("id")?.to_string();
        let viva = fila[pos("deleted_at")?] == Value::Null;
        if !viva && !self.en_uso.contains(&(tabla, id.clone())) {
            // lo eliminado del archivo no entra: es invisible y no se podría purgar
            return Ok(());
        }
        let mut tipo = if viva {
            TipoCaso::Nuevo
        } else {
            TipoCaso::Desactivado
        };
        let mut con_quien = None;
        if CATALOGOS.contains(&tabla) {
            let nombre =
                fusion::normalizar_nombre(texto(&fila[pos("nombre")?]).unwrap_or_default());
            if let Some(local) = por_nombre.get(&nombre) {
                s.unidos.insert((tabla, id.clone()), local.clone());
                con_quien = Some(local.clone());
                tipo = TipoCaso::Union;
            } else if viva {
                por_nombre.insert(nombre, id.clone());
            }
        } else if tabla == "trabajadores"
            && let Some(local) = fusion::persona_con_correo(self.local, &fila[pos("correo")?])?
        {
            s.rivales.insert(id.clone(), local.clone());
            con_quien = Some(local);
            tipo = TipoCaso::DuplicadoPersona;
        }
        s.casos.push(Caso {
            tabla,
            id,
            tipo,
            columnas: 0,
            mas_reciente: Lado::Archivo,
            dudosa: false,
            borrado_aqui: false,
            huella: match con_quien {
                Some(local) => leer_fila(self.local, tabla, d, &local)?.map_or(0, |f| huella(&f)),
                None => 0,
            },
        });
        Ok(())
    }

    /// Una fila que está en los dos lados.
    fn en_los_dos(
        &self,
        tabla: &'static str,
        d: &Tabla,
        mia: &[Value],
        archivo: &mut [Value],
        s: &mut Comparacion,
    ) -> Result<(), Fallo> {
        let pos = |c: &str| d.columnas.iter().position(|x| x == c).ok_or("columna");
        let (i_act, i_borr) = (pos("updated_at")?, pos("deleted_at")?);
        remapear(archivo, d, &s.unidos);
        if self.es_parcial {
            self.parcial
                .ajustar(self.local, self.imp, tabla, d, archivo, mia)?;
        }
        let mut columnas = 0u64;
        for (i, c) in d.columnas.iter().enumerate() {
            if comparable(c) && !iguales(&mia[i], &archivo[i]) {
                columnas |= 1 << i;
            }
        }
        let fechas = |f: &[Value]| -> (String, Option<String>) {
            (
                texto(&f[i_act]).unwrap_or_default().to_string(),
                texto(&f[i_borr]).map(str::to_string),
            )
        };
        let (m, a) = (fechas(mia), fechas(archivo));
        let clase = clasificar(
            Fechas {
                actualizada: &m.0,
                borrada: m.1.as_deref(),
            },
            Fechas {
                actualizada: &a.0,
                borrada: a.1.as_deref(),
            },
            columnas != 0,
            self.ahora,
        );
        let Some(clase) = clase else {
            s.iguales += 1;
            return Ok(());
        };
        s.casos.push(Caso {
            tabla,
            id: texto(&archivo[pos("id")?]).ok_or("id")?.to_string(),
            tipo: clase.tipo,
            columnas,
            mas_reciente: clase.mas_reciente,
            dudosa: clase.dudosa,
            borrado_aqui: clase.borrado_aqui,
            huella: huella(mia),
        });
        Ok(())
    }
}

/// `seguir(hecho, total)` informa el avance por tabla; si devuelve false, se detiene con el fallo `cancelado`.
pub fn comparar(
    local: &Connection,
    imp: &Connection,
    meta: &MetaArchivo,
    ahora: &str,
    mut seguir: impl FnMut(u64, u64) -> bool,
) -> Result<Comparacion, Fallo> {
    let resumidas = resumidas_de(imp, meta)?;
    let contexto = Contexto {
        local,
        imp,
        es_parcial: meta.parcial,
        parcial: Parcial {
            padres: padres_de(meta),
            resumidas: &resumidas,
        },
        en_uso: fusion::desactivados_en_uso(imp)?,
        ahora,
    };
    let total = tablas().count() as u64;
    let mut s = Comparacion::default();
    for (n, tabla) in tablas().enumerate() {
        let d = fusion::describir(imp, tabla)?;
        let mut por_nombre = HashMap::new();
        if CATALOGOS.contains(&tabla) {
            let sql = format!("SELECT id, nombre FROM {tabla} WHERE deleted_at IS NULL");
            for fila in local
                .prepare(&sql)?
                .query_map([], |f| Ok((f.get::<_, String>(0)?, f.get::<_, String>(1)?)))?
            {
                let (id, nombre) = fila?;
                por_nombre.insert(fusion::normalizar_nombre(&nombre), id);
            }
        }
        let n_cols = d.columnas.len();
        let i_id = d.columnas.iter().position(|c| c == "id").ok_or("id")?;
        let i_baja = d
            .columnas
            .iter()
            .position(|c| c == "deleted_at")
            .ok_or("deleted_at")?;
        // las dos por `id`, con la misma regla de orden (BINARY): se avanza en paralelo sin cargar ninguna entera
        let sql = format!("SELECT {} FROM {tabla} ORDER BY id", d.columnas.join(", "));
        let (mut consulta_l, mut consulta_a) = (local.prepare(&sql)?, imp.prepare(&sql)?);
        let (mut filas_l, mut filas_a) = (consulta_l.query([])?, consulta_a.query([])?);
        let (mut mia, mut archivo) = (
            siguiente(&mut filas_l, n_cols)?,
            siguiente(&mut filas_a, n_cols)?,
        );
        let mut vistas = 0u64;
        loop {
            vistas += 1;
            if vistas.is_multiple_of(CADA) && !seguir(n as u64, total) {
                return Err(Fallo::de("cancelado", ""));
            }
            let orden = match (&mia, &archivo) {
                (None, None) => break,
                (Some(_), None) => Ordering::Less,
                (None, Some(_)) => Ordering::Greater,
                (Some(m), Some(a)) => texto(&m[i_id]).cmp(&texto(&a[i_id])),
            };
            if orden != Ordering::Greater
                && let Some(m) = &mia
            {
                s.vivas_locales += u64::from(m[i_baja] == Value::Null);
            }
            match orden {
                // solo aquí: nunca se borra por no venir en el archivo
                Ordering::Less => mia = siguiente(&mut filas_l, n_cols)?,
                Ordering::Greater => {
                    let a = archivo.as_ref().ok_or("fila")?;
                    contexto.solo_en_archivo(tabla, &d, a, &mut por_nombre, &mut s)?;
                    archivo = siguiente(&mut filas_a, n_cols)?;
                }
                Ordering::Equal => {
                    let (m, a) = (mia.as_ref().ok_or("fila")?, archivo.as_mut().ok_or("fila")?);
                    contexto.en_los_dos(tabla, &d, m, a, &mut s)?;
                    mia = siguiente(&mut filas_l, n_cols)?;
                    archivo = siguiente(&mut filas_a, n_cols)?;
                }
            }
        }
        if !seguir(n as u64 + 1, total) {
            return Err(Fallo::de("cancelado", ""));
        }
    }
    drop(contexto);
    s.resumidas = resumidas;
    Ok(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    const AHORA: &str = "2026-11-01T12:00:00.000Z";
    const ANTES: &str = "2026-10-01T12:00:00.000Z";
    const DESPUES: &str = "2026-10-15T12:00:00.000Z";
    const FUTURA: &str = "2999-01-01T00:00:00.000Z";

    fn viva(a: &str) -> Fechas<'_> {
        Fechas {
            actualizada: a,
            borrada: None,
        }
    }
    fn borrada<'a>(b: &'a str) -> Fechas<'a> {
        Fechas {
            actualizada: ANTES,
            borrada: Some(b),
        }
    }

    #[test]
    fn fechas_que_no_son_fechas() {
        for buena in [AHORA, "2026-11-01T12:00:00Z"] {
            assert!(fecha_valida(buena), "{buena}");
        }
        for mala in [
            "",
            "x",
            "ayer",
            "2026-13-01T12:00:00.000Z",
            "2026-00-01T12:00:00.000Z",
            "2026-11-32T12:00:00.000Z",
            "2026-11-01T25:00:00.000Z",
            "2026-11-01 12:00:00.000Z",
            "2026-11-01T12:00:00.000",
            "99999-11-01T12:00:00.000Z",
            "２０２６-11-01T12:00:00.000Z",
        ] {
            assert!(!fecha_valida(mala), "{mala}");
        }
        assert!(fecha_dudosa(FUTURA, AHORA));
        assert!(fecha_dudosa("x", AHORA));
        assert!(!fecha_dudosa(ANTES, AHORA));
    }

    #[test]
    fn identico_no_es_un_caso() {
        assert_eq!(clasificar(viva(ANTES), viva(DESPUES), false, AHORA), None);
        assert_eq!(
            clasificar(borrada(ANTES), borrada(DESPUES), true, AHORA),
            None
        );
    }

    #[test]
    fn diferente_preselecciona_el_mas_reciente() {
        let c = clasificar(viva(ANTES), viva(DESPUES), true, AHORA).unwrap();
        assert_eq!(
            (c.tipo, c.mas_reciente, c.dudosa),
            (TipoCaso::Diferente, Lado::Archivo, false)
        );
        let c = clasificar(viva(DESPUES), viva(ANTES), true, AHORA).unwrap();
        assert_eq!(
            (c.tipo, c.mas_reciente, c.dudosa),
            (TipoCaso::Diferente, Lado::Mio, false)
        );
        let c = clasificar(viva(ANTES), viva(ANTES), true, AHORA).unwrap();
        assert_eq!((c.tipo, c.mas_reciente), (TipoCaso::Diferente, Lado::Igual));
    }

    #[test]
    fn una_fecha_futura_o_absurda_nunca_gana_y_se_marca() {
        for mala in [FUTURA, "x", "", "9999-99-99T99:99:99.999Z"] {
            let c = clasificar(viva(ANTES), viva(mala), true, AHORA).unwrap();
            assert_eq!(
                (c.tipo, c.mas_reciente, c.dudosa),
                (TipoCaso::Diferente, Lado::Mio, true),
                "{mala}"
            );
        }
        // la mía también se marca, y tampoco sirve para ganarle a nadie
        let c = clasificar(viva(FUTURA), viva(ANTES), true, AHORA).unwrap();
        assert_eq!((c.mas_reciente, c.dudosa), (Lado::Mio, true));
    }

    #[test]
    fn borrado_en_el_archivo() {
        // sin cambios después: se aplica
        let c = clasificar(viva(ANTES), borrada(DESPUES), false, AHORA).unwrap();
        assert_eq!(
            (c.tipo, c.borrado_aqui),
            (TipoCaso::BorradoSinConflicto, false)
        );
        // editada aquí después: conflicto
        let c = clasificar(viva(DESPUES), borrada(ANTES), true, AHORA).unwrap();
        assert_eq!(
            (c.tipo, c.borrado_aqui),
            (TipoCaso::BorradoVsEditado, false)
        );
        // una fecha de borrado dudosa nunca es «sin conflicto»
        for mala in [FUTURA, "x"] {
            let c = clasificar(viva(ANTES), borrada(mala), false, AHORA).unwrap();
            assert_eq!(
                (c.tipo, c.dudosa),
                (TipoCaso::BorradoVsEditado, true),
                "{mala}"
            );
        }
    }

    #[test]
    fn borrado_aqui() {
        // el archivo no la editó después: sigue borrada
        let c = clasificar(borrada(DESPUES), viva(ANTES), true, AHORA).unwrap();
        assert_eq!(
            (c.tipo, c.borrado_aqui),
            (TipoCaso::BorradoSinConflicto, true)
        );
        // la editó después: conflicto, y el archivo es el más reciente
        let c = clasificar(borrada(ANTES), viva(DESPUES), true, AHORA).unwrap();
        assert_eq!(
            (c.tipo, c.borrado_aqui, c.mas_reciente),
            (TipoCaso::BorradoVsEditado, true, Lado::Archivo)
        );
        // con fecha futura: conflicto marcado, y no es «el más reciente»
        let c = clasificar(borrada(ANTES), viva(FUTURA), true, AHORA).unwrap();
        assert_eq!(
            (c.tipo, c.dudosa, c.mas_reciente),
            (TipoCaso::BorradoVsEditado, true, Lado::Mio)
        );
    }

    #[test]
    fn vacio_y_null_son_iguales() {
        assert!(iguales(&Value::Null, &Value::Text(String::new())));
        assert!(iguales(&Value::Text(String::new()), &Value::Null));
        assert!(!iguales(&Value::Null, &Value::Text("x".into())));
        assert!(!iguales(&Value::Integer(1), &Value::Integer(2)));
    }

    #[test]
    fn la_huella_nota_cualquier_cambio() {
        let a = [Value::Text("ab".into()), Value::Text("c".into())];
        let b = [Value::Text("a".into()), Value::Text("bc".into())];
        assert_ne!(huella(&a), huella(&b));
        assert_eq!(huella(&a), huella(&a.clone()));
        assert_ne!(huella(&[Value::Null]), huella(&[Value::Integer(0)]));
    }
}
