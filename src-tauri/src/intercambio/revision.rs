//! «Revisar y decidir»: lo que `comparar` encontró, lo que se decidió y cómo se aplica.
//!
//! Las decisiones viven aquí y no en la interfaz: una revisión puede tener cientos de miles de casos y a la ventana solo llega
//! la página que se ve. `pasada` es lo único que escribe, y es la misma al verificar (se deshace) y al aplicar: lo que se
//! muestra como bloqueo es exactamente lo que detendría «Aplicar». Si queda algo por resolver, no se escribe nada.
use super::Importacion;
use super::comparar::{
    self, Caso, Comparacion, Lado, TipoCaso, comparable, fecha_dudosa, fecha_valida, tablas,
};
use super::fusion::{self, CATALOGOS, Lugares, Tabla};
use super::validar::{self, MetaArchivo};
use crate::db;
use crate::respaldos::{self, Fallo};
use rusqlite::types::Value;
use rusqlite::{Connection, ErrorCode, OptionalExtension, TransactionBehavior, params_from_iter};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::Path;

/// Tope de lo que se muestra de un texto y de una página: un archivo puede traer campos enormes dentro de sus topes.
const MAX_TEXTO: usize = 1000;
const MAX_PAGINA: usize = 200;
const MAX_OPCIONES: usize = 50;
/// Se comparan sin mostrarlos.
const OPACAS: &[&str] = &["foto_png", "config"];

#[derive(Debug, Clone, PartialEq)]
pub enum Decision {
    Nada,
    Agregar,
    Omitir,
    /// Máscara de las columnas que se toman del archivo.
    Campos(u64),
    Borrar,
    Mantener,
    Pendiente,
    UnirMio,
    UnirArchivo,
    EditarCorreo(String),
}

/// Una decisión tal como la dice y la ve la interfaz.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "que",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum Eleccion {
    Nada,
    Agregar,
    Omitir,
    Campos {
        archivo: Vec<String>,
    },
    Borrar,
    Mantener,
    Pendiente,
    UnirMio,
    UnirArchivo,
    EditarCorreo {
        correo: String,
    },
    ConservarMio,
    ConservarArchivo,
    Reasignar {
        columna: String,
        a: String,
    },
    Vaciar {
        columna: String,
    },
    Descartar {
        columna: String,
    },
    /// Deshace una decisión sobre un bloqueo. Sin columna, la de una regla única.
    Quitar {
        columna: Option<String>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccionMasiva {
    Recientes,
    TodoMio,
    TodoArchivo,
    AgregarTodo,
    OmitirTodo,
    MantenerTodo,
    BorrarTodo,
    UnirTodoMio,
    ResolverRotas,
    NoResolverRotas,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Masivo {
    pub accion: AccionMasiva,
    /// Para los dos grupos de borrado.
    pub tipo: Option<TipoCaso>,
}

#[derive(Debug, Clone, PartialEq)]
enum Arreglo {
    Reasignar(String),
    Vaciar,
    Descartar,
}

#[derive(Debug, Clone)]
pub struct Decidido {
    pub caso: Caso,
    pub decision: Decision,
    tocado: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TipoBloqueo {
    /// Choca con una regla única; `rival` es la otra fila.
    Unica,
    /// Una combinación de campos que la base no acepta.
    Regla,
    Referencia,
    Ciclo,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Bloqueo {
    pub tipo: TipoBloqueo,
    pub tabla: &'static str,
    pub id: String,
    pub columna: Option<String>,
    pub destino: Option<&'static str>,
    /// El id al que apunta, o el de la fila con la que choca.
    pub otro: Option<String>,
    pub vaciable: bool,
}

pub struct Revision {
    pub casos: Vec<Decidido>,
    unidos: HashMap<(&'static str, String), String>,
    rivales: HashMap<String, String>,
    resumidas: HashSet<String>,
    iguales: u64,
    arreglos: HashMap<(&'static str, String, String), Arreglo>,
    choques: HashMap<(&'static str, String), Lado>,
    resolver_rotas: bool,
    lugares: Lugares,
    esquema: HashMap<&'static str, Tabla>,
    version: u64,
    verificada: Option<u64>,
    bloqueos: Vec<Bloqueo>,
    restablecidas: u64,
}

fn preseleccion(c: &Caso) -> Decision {
    match c.tipo {
        TipoCaso::Nuevo => Decision::Agregar,
        TipoCaso::Diferente => Decision::Campos(if c.mas_reciente == Lado::Archivo {
            c.columnas
        } else {
            0
        }),
        // sin una fecha confiable no cambia nada: ni se borra ni se revive
        TipoCaso::BorradoVsEditado if c.dudosa && c.borrado_aqui => Decision::Borrar,
        TipoCaso::BorradoVsEditado => Decision::Mantener,
        TipoCaso::BorradoSinConflicto => Decision::Borrar,
        TipoCaso::DuplicadoPersona => Decision::Pendiente,
        TipoCaso::Union | TipoCaso::Desactivado => Decision::Nada,
    }
}

/// Lugar de un caso en la lista: la que da `comparar`, por tabla y por `id`.
fn clave_orden<'a>(tabla: &str, id: &'a str) -> (usize, &'a str) {
    (comparar::posicion(tabla), id)
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PorTabla {
    pub tabla: &'static str,
    pub total: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Grupo {
    pub tipo: TipoCaso,
    pub total: u64,
    pub tablas: Vec<PorTabla>,
}

#[derive(Debug, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Aplicara {
    pub agregar: u64,
    pub cambiar: u64,
    pub borrar: u64,
    pub revivir: u64,
    pub omitir: u64,
    pub unir: u64,
}

#[derive(Debug, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Bloqueos {
    pub duplicado: u64,
    pub unica: u64,
    pub regla: u64,
    pub referencia: u64,
    pub ciclo: u64,
    pub total: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumenRevision {
    pub version: u64,
    pub verificada: bool,
    pub grupos: Vec<Grupo>,
    pub iguales: u64,
    pub dudosas: u64,
    /// Lo que se decidió a mano, para avisar antes de perderlo.
    pub decisiones: u64,
    pub aplicara: Aplicara,
    pub bloqueos: Bloqueos,
    pub resolver_rotas: bool,
    /// Decisiones que volvieron a su preselección al comparar de nuevo, porque esas filas cambiaron.
    pub restablecidas: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Filtro {
    pub tipo: Option<TipoCaso>,
    pub tabla: Option<String>,
    #[serde(default)]
    pub solo_dudosas: bool,
    pub desde: usize,
    pub cuantos: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilaPagina {
    pub tabla: &'static str,
    pub id: String,
    pub nombre: String,
    pub tipo: TipoCaso,
    pub columnas: Vec<String>,
    pub eleccion: Eleccion,
    pub preseleccionada: Eleccion,
    pub dudosa: bool,
    pub mas_reciente: Lado,
    pub borrado_aqui: bool,
}

#[derive(Debug, Serialize)]
pub struct Pagina {
    pub filas: Vec<FilaPagina>,
    pub total: usize,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValorCampo {
    pub texto: Option<String>,
    /// De lo que no se muestra: cuántos bytes tiene.
    pub oculto: Option<usize>,
    pub cortado: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CampoDetalle {
    pub columna: String,
    pub mio: ValorCampo,
    pub archivo: ValorCampo,
    pub distinto: bool,
    pub del_archivo: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetalleCaso {
    pub campos: Vec<CampoDetalle>,
    pub actualizada_mia: Option<String>,
    pub actualizada_archivo: Option<String>,
    pub borrada_mia: Option<String>,
    pub borrada_archivo: Option<String>,
    pub rival: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilaBloqueo {
    pub tipo: TipoBloqueo,
    pub tabla: &'static str,
    pub id: String,
    pub nombre: String,
    pub columna: Option<String>,
    pub destino: Option<&'static str>,
    pub otro: Option<String>,
    pub vaciable: bool,
    /// Lo que ya se decidió sobre él; None si sigue por resolver.
    pub eleccion: Option<Eleccion>,
    /// A quién se reasignó.
    pub reasignado_a: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginaBloqueos {
    pub filas: Vec<FilaBloqueo>,
    pub total: usize,
}

#[derive(Debug, Serialize)]
pub struct Opcion {
    pub id: String,
    pub nombre: String,
}

#[derive(Debug, Default, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Aplicado {
    pub tabla: &'static str,
    pub agregadas: u64,
    pub cambiadas: u64,
    pub borradas: u64,
    pub revividas: u64,
    pub unidas: u64,
    pub omitidas: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InformeRevision {
    pub tablas: Vec<Aplicado>,
    pub nombre_heredado: Option<String>,
}

fn tabla_conocida(tabla: &str) -> Result<&'static str, Fallo> {
    tablas()
        .find(|t| *t == tabla)
        .ok_or_else(|| Fallo::de("desconocido", ""))
}

/// Cómo se nombra una fila, en SQL sobre `t`. Lo que no tiene nombre propio se nombra por lo que une.
fn expresion_nombre(tabla: &str) -> &'static str {
    match tabla {
        "puestos" => {
            "COALESCE((SELECT nombre FROM cargos x WHERE x.id = t.cargo_id), '')
             || ' · ' || COALESCE((SELECT nombre FROM unidades x WHERE x.id = t.unidad_id), '')"
        }
        "asignaciones" => {
            "COALESCE((SELECT nombre FROM trabajadores x WHERE x.id = t.trabajador_id), '')
             || ' · ' || COALESCE((SELECT nombre FROM cargos x JOIN puestos p ON p.cargo_id = x.id WHERE p.id = t.puesto_id), '')"
        }
        "conexiones" => {
            "COALESCE((SELECT nombre FROM unidades x WHERE x.id = t.origen_id), '')
             || ' → ' || COALESCE((SELECT nombre FROM unidades x WHERE x.id = t.destino_id), '')"
        }
        "unidad_etiquetas" => {
            "COALESCE((SELECT nombre FROM unidades x WHERE x.id = t.unidad_id), '')
             || ' · ' || COALESCE((SELECT nombre FROM etiquetas x WHERE x.id = t.etiqueta_id), '')"
        }
        "actividad_roles" => {
            "COALESCE((SELECT nombre FROM trabajadores x WHERE x.id = t.trabajador_id), '') || ' · ' || t.rol"
        }
        "subarboles_guardados" => {
            "COALESCE(t.nombre, (SELECT nombre FROM unidades x WHERE x.id = t.unidad_id), '')"
        }
        _ => "t.nombre",
    }
}

fn nombre_en(c: &Connection, tabla: &str, id: &str) -> Result<Option<String>, Fallo> {
    let expresion = expresion_nombre(tabla);
    let sql = format!("SELECT substr({expresion}, 1, 200) FROM {tabla} t WHERE t.id = ?1");
    Ok(c.prepare_cached(&sql)?
        .query_row([id], |f| f.get::<_, Option<String>>(0))
        .optional()?
        .flatten())
}

/// Un nombre para mostrar: de esta base, y si ahí no está, del archivo.
fn nombre_de(local: &Connection, imp: &Connection, tabla: &str, id: &str) -> Result<String, Fallo> {
    Ok(match nombre_en(local, tabla, id)? {
        Some(n) => n,
        None => nombre_en(imp, tabla, id)?.unwrap_or_default(),
    })
}

fn valor_campo(
    c: &Connection,
    otra: &Connection,
    d: &Tabla,
    i: usize,
    fila: &[Value],
) -> Result<ValorCampo, Fallo> {
    let columna = d.columnas[i].as_str();
    let texto = match &fila[i] {
        Value::Null => return Ok(ValorCampo::default()),
        Value::Text(t) if t.is_empty() => return Ok(ValorCampo::default()),
        Value::Text(t) => t.clone(),
        Value::Integer(n) => n.to_string(),
        Value::Real(n) => n.to_string(),
        Value::Blob(b) => {
            return Ok(ValorCampo {
                oculto: Some(b.len()),
                ..Default::default()
            });
        }
    };
    if OPACAS.contains(&columna) {
        return Ok(ValorCampo {
            oculto: Some(texto.len()),
            ..Default::default()
        });
    }
    // una referencia se muestra por lo que nombra, nunca por su id
    if let Some((_, destino, _)) = d.referencias.iter().find(|(j, ..)| *j == i) {
        return Ok(ValorCampo {
            texto: Some(nombre_de(c, otra, destino, &texto)?),
            ..Default::default()
        });
    }
    let cortado = texto.chars().count() > MAX_TEXTO;
    Ok(ValorCampo {
        texto: Some(if cortado {
            texto.chars().take(MAX_TEXTO).collect()
        } else {
            texto
        }),
        cortado,
        ..Default::default()
    })
}

/// Fechas de una fila que se pueden mostrar: lo que no es una fecha no llega a la interfaz.
fn fecha_mostrable(d: &Tabla, fila: Option<&[Value]>, columna: &str) -> Option<String> {
    let i = d.columnas.iter().position(|c| c == columna)?;
    match fila?.get(i)? {
        Value::Text(t) if fecha_valida(t) => Some(t.clone()),
        _ => None,
    }
}

impl Revision {
    fn nueva(c: Comparacion, lugares: Lugares, esquema: HashMap<&'static str, Tabla>) -> Self {
        let casos = c
            .casos
            .into_iter()
            .map(|caso| Decidido {
                decision: preseleccion(&caso),
                caso,
                tocado: false,
            })
            .collect();
        Revision {
            casos,
            unidos: c.unidos,
            rivales: c.rivales,
            resumidas: c.resumidas,
            iguales: c.iguales,
            arreglos: HashMap::new(),
            choques: HashMap::new(),
            resolver_rotas: false,
            lugares,
            esquema,
            version: 1,
            verificada: None,
            bloqueos: Vec::new(),
            restablecidas: 0,
        }
    }

    /// Comparar de nuevo: lo decidido sigue en las filas que no cambiaron.
    fn heredar(&mut self, a: &Revision) {
        self.arreglos = a.arreglos.clone();
        self.choques = a.choques.clone();
        self.resolver_rotas = a.resolver_rotas;
        for viejo in a.casos.iter().filter(|c| c.tocado) {
            let ahora = self.indice(viejo.caso.tabla, &viejo.caso.id).ok();
            let sigue = ahora.is_some_and(|k| {
                let n = &self.casos[k].caso;
                n.tipo == viejo.caso.tipo
                    && n.huella == viejo.caso.huella
                    && n.columnas == viejo.caso.columnas
            });
            match ahora {
                Some(k) if sigue => {
                    self.casos[k].decision = viejo.decision.clone();
                    self.casos[k].tocado = true;
                }
                _ => self.restablecidas += 1,
            }
        }
    }

    fn indice(&self, tabla: &str, id: &str) -> Result<usize, Fallo> {
        self.casos
            .binary_search_by(|c| {
                clave_orden(c.caso.tabla, &c.caso.id).cmp(&clave_orden(tabla, id))
            })
            .map_err(|_| Fallo::de("desconocido", ""))
    }

    fn cambio(&mut self) {
        self.version += 1;
        self.verificada = None;
    }

    pub fn decidir(&mut self, tabla: &str, id: &str, e: Eleccion) -> Result<(), Fallo> {
        let tabla = tabla_conocida(tabla)?;
        let desconocido = || Fallo::de("desconocido", "");
        match e {
            Eleccion::ConservarMio | Eleccion::ConservarArchivo => {
                let lado = if e == Eleccion::ConservarMio {
                    Lado::Mio
                } else {
                    Lado::Archivo
                };
                self.choques.insert((tabla, id.to_string()), lado);
            }
            Eleccion::Reasignar { columna, a } => {
                self.columna_de_referencia(tabla, &columna)?;
                self.arreglos
                    .insert((tabla, id.to_string(), columna), Arreglo::Reasignar(a));
            }
            Eleccion::Vaciar { columna } => {
                self.columna_de_referencia(tabla, &columna)?;
                self.arreglos
                    .insert((tabla, id.to_string(), columna), Arreglo::Vaciar);
            }
            Eleccion::Descartar { columna } => {
                self.columna_de_referencia(tabla, &columna)?;
                self.arreglos
                    .insert((tabla, id.to_string(), columna), Arreglo::Descartar);
            }
            Eleccion::Quitar {
                columna: Some(columna),
            } => {
                self.arreglos.remove(&(tabla, id.to_string(), columna));
            }
            Eleccion::Quitar { columna: None } => {
                self.choques.remove(&(tabla, id.to_string()));
            }
            otra => {
                let k = self.indice(tabla, id)?;
                let tipo = self.casos[k].caso.tipo;
                let borrado = matches!(
                    tipo,
                    TipoCaso::BorradoVsEditado | TipoCaso::BorradoSinConflicto
                );
                let duplicado = tipo == TipoCaso::DuplicadoPersona;
                let decision = match otra {
                    Eleccion::Agregar if tipo == TipoCaso::Nuevo => Decision::Agregar,
                    Eleccion::Omitir if tipo == TipoCaso::Nuevo => Decision::Omitir,
                    Eleccion::Campos { archivo } if tipo == TipoCaso::Diferente => {
                        let d = self.esquema.get(tabla).ok_or_else(desconocido)?;
                        let mut mascara = 0u64;
                        for columna in &archivo {
                            let i = d
                                .columnas
                                .iter()
                                .position(|c| c == columna)
                                .ok_or_else(desconocido)?;
                            mascara |= 1 << i;
                        }
                        if mascara & !self.casos[k].caso.columnas != 0 {
                            return Err(desconocido());
                        }
                        Decision::Campos(mascara)
                    }
                    Eleccion::Borrar if borrado => Decision::Borrar,
                    Eleccion::Mantener if borrado => Decision::Mantener,
                    Eleccion::Pendiente if duplicado => Decision::Pendiente,
                    Eleccion::UnirMio if duplicado => Decision::UnirMio,
                    Eleccion::UnirArchivo if duplicado => Decision::UnirArchivo,
                    Eleccion::EditarCorreo { correo } if duplicado => {
                        let correo = correo.trim().to_string();
                        if correo.is_empty() || correo.len() > 1024 {
                            return Err(Fallo::de("correo_no_valido", ""));
                        }
                        Decision::EditarCorreo(correo)
                    }
                    _ => return Err(desconocido()),
                };
                self.casos[k].decision = decision;
                self.casos[k].tocado = true;
            }
        }
        self.cambio();
        Ok(())
    }

    fn columna_de_referencia(&self, tabla: &str, columna: &str) -> Result<(), Fallo> {
        let d = self
            .esquema
            .get(tabla)
            .ok_or_else(|| Fallo::de("desconocido", ""))?;
        if d.referencias
            .iter()
            .any(|(i, ..)| d.columnas[*i] == columna)
        {
            Ok(())
        } else {
            Err(Fallo::de("desconocido", ""))
        }
    }

    pub fn masivo(&mut self, m: Masivo) {
        use AccionMasiva as A;
        match m.accion {
            A::ResolverRotas => self.resolver_rotas = true,
            A::NoResolverRotas => self.resolver_rotas = false,
            accion => {
                for x in &mut self.casos {
                    let c = &x.caso;
                    if let Some(t) = m.tipo
                        && t != c.tipo
                    {
                        continue;
                    }
                    let nueva = match (accion, c.tipo) {
                        (A::Recientes, TipoCaso::Diferente) => preseleccion(c),
                        (A::TodoMio, TipoCaso::Diferente) => Decision::Campos(0),
                        (A::TodoArchivo, TipoCaso::Diferente) => Decision::Campos(c.columnas),
                        (A::AgregarTodo, TipoCaso::Nuevo) => Decision::Agregar,
                        (A::OmitirTodo, TipoCaso::Nuevo) => Decision::Omitir,
                        (
                            A::MantenerTodo,
                            TipoCaso::BorradoVsEditado | TipoCaso::BorradoSinConflicto,
                        ) => Decision::Mantener,
                        (
                            A::BorrarTodo,
                            TipoCaso::BorradoVsEditado | TipoCaso::BorradoSinConflicto,
                        ) => Decision::Borrar,
                        (A::UnirTodoMio, TipoCaso::DuplicadoPersona) => Decision::UnirMio,
                        _ => continue,
                    };
                    x.decision = nueva;
                    x.tocado = true;
                }
            }
        }
        self.cambio();
    }

    pub fn anotar_verificacion(&mut self, version: u64, bloqueos: Vec<Bloqueo>) {
        // si mientras tanto se decidió otra cosa, esto ya no dice nada
        if version == self.version {
            self.bloqueos = bloqueos;
            self.verificada = Some(version);
        }
    }

    pub fn resumen(&self) -> ResumenRevision {
        let mut por_tipo: BTreeMap<usize, (TipoCaso, u64, Vec<PorTabla>)> = BTreeMap::new();
        let mut a = Aplicara::default();
        let (mut dudosas, mut decisiones, mut duplicado) = (0u64, 0u64, 0u64);
        for x in &self.casos {
            let c = &x.caso;
            dudosas += u64::from(c.dudosa);
            decisiones += u64::from(x.tocado);
            match (&x.decision, c.borrado_aqui) {
                (Decision::Agregar | Decision::EditarCorreo(_), _) => a.agregar += 1,
                (Decision::Omitir, _) => a.omitir += 1,
                (Decision::Campos(m), _) if *m != 0 => a.cambiar += 1,
                (Decision::Borrar, false) => a.borrar += 1,
                (Decision::Mantener, true) => a.revivir += 1,
                (Decision::UnirArchivo, _) => {
                    a.cambiar += 1;
                    a.unir += 1;
                }
                (Decision::UnirMio, _) => a.unir += 1,
                (Decision::Pendiente, _) => duplicado += 1,
                _ => {}
            }
            if c.tipo == TipoCaso::Union {
                a.unir += 1;
            }
            let orden = match c.tipo {
                TipoCaso::DuplicadoPersona => 0,
                TipoCaso::Diferente => 1,
                TipoCaso::BorradoVsEditado => 2,
                TipoCaso::Nuevo => 3,
                TipoCaso::BorradoSinConflicto => 4,
                TipoCaso::Union => 5,
                TipoCaso::Desactivado => continue,
            };
            let g = por_tipo.entry(orden).or_insert((c.tipo, 0, Vec::new()));
            g.1 += 1;
            match g.2.last_mut() {
                Some(p) if p.tabla == c.tabla => p.total += 1,
                _ => g.2.push(PorTabla {
                    tabla: c.tabla,
                    total: 1,
                }),
            }
        }
        let mut b = Bloqueos {
            duplicado,
            total: duplicado + self.bloqueos.len() as u64,
            ..Default::default()
        };
        for x in &self.bloqueos {
            match x.tipo {
                TipoBloqueo::Unica => b.unica += 1,
                TipoBloqueo::Regla => b.regla += 1,
                TipoBloqueo::Referencia => b.referencia += 1,
                TipoBloqueo::Ciclo => b.ciclo += 1,
            }
        }
        ResumenRevision {
            version: self.version,
            verificada: self.verificada == Some(self.version),
            grupos: por_tipo
                .into_values()
                .map(|(tipo, total, tablas)| Grupo {
                    tipo,
                    total,
                    tablas,
                })
                .collect(),
            iguales: self.iguales,
            dudosas,
            decisiones: decisiones + (self.arreglos.len() + self.choques.len()) as u64,
            aplicara: a,
            bloqueos: b,
            resolver_rotas: self.resolver_rotas,
            restablecidas: self.restablecidas,
        }
    }

    fn eleccion(&self, x: &Decidido) -> Eleccion {
        match &x.decision {
            Decision::Nada => Eleccion::Nada,
            Decision::Agregar => Eleccion::Agregar,
            Decision::Omitir => Eleccion::Omitir,
            Decision::Campos(m) => Eleccion::Campos {
                archivo: self.nombres_mascara(x.caso.tabla, *m),
            },
            Decision::Borrar => Eleccion::Borrar,
            Decision::Mantener => Eleccion::Mantener,
            Decision::Pendiente => Eleccion::Pendiente,
            Decision::UnirMio => Eleccion::UnirMio,
            Decision::UnirArchivo => Eleccion::UnirArchivo,
            Decision::EditarCorreo(correo) => Eleccion::EditarCorreo {
                correo: correo.clone(),
            },
        }
    }

    fn nombres_mascara(&self, tabla: &str, m: u64) -> Vec<String> {
        let Some(d) = self.esquema.get(tabla) else {
            return Vec::new();
        };
        d.columnas
            .iter()
            .enumerate()
            .filter(|(i, _)| m & (1 << i) != 0)
            .map(|(_, c)| c.clone())
            .collect()
    }

    pub fn pagina(
        &self,
        local: &Connection,
        imp: &Connection,
        f: &Filtro,
    ) -> Result<Pagina, Fallo> {
        let vale = |x: &&Decidido| {
            x.caso.tipo != TipoCaso::Desactivado
                && f.tipo.is_none_or(|t| t == x.caso.tipo)
                && f.tabla.as_deref().is_none_or(|t| t == x.caso.tabla)
                && (!f.solo_dudosas || x.caso.dudosa)
        };
        let total = self.casos.iter().filter(vale).count();
        let filas = self
            .casos
            .iter()
            .filter(vale)
            .skip(f.desde)
            .take(f.cuantos.min(MAX_PAGINA))
            .map(|x| {
                let c = &x.caso;
                let nombre = if c.tipo == TipoCaso::Nuevo {
                    nombre_en(imp, c.tabla, &c.id)?.unwrap_or_default()
                } else {
                    nombre_de(local, imp, c.tabla, &c.id)?
                };
                Ok(FilaPagina {
                    tabla: c.tabla,
                    id: c.id.clone(),
                    nombre,
                    tipo: c.tipo,
                    columnas: self.nombres_mascara(c.tabla, c.columnas),
                    eleccion: self.eleccion(x),
                    preseleccionada: self.eleccion(&Decidido {
                        caso: c.clone(),
                        decision: preseleccion(c),
                        tocado: false,
                    }),
                    dudosa: c.dudosa,
                    mas_reciente: c.mas_reciente,
                    borrado_aqui: c.borrado_aqui,
                })
            })
            .collect::<Result<_, Fallo>>()?;
        Ok(Pagina { filas, total })
    }

    pub fn detalle(
        &self,
        local: &Connection,
        imp: &Connection,
        tabla: &str,
        id: &str,
    ) -> Result<DetalleCaso, Fallo> {
        let x = &self.casos[self.indice(tabla, id)?];
        let c = &x.caso;
        let d = self.esquema.get(c.tabla).ok_or("tabla")?;
        // de un duplicado se compara con la persona de aquí que tiene su mismo correo
        let rival = self
            .rivales
            .get(&c.id)
            .filter(|_| c.tipo == TipoCaso::DuplicadoPersona);
        let id_mio = rival.map_or(c.id.as_str(), String::as_str);
        let mia = comparar::leer_fila(local, c.tabla, d, id_mio)?;
        let mut archivo = comparar::leer_fila(imp, c.tabla, d, &c.id)?;
        if c.tabla == "trabajadores"
            && let (Some(a), Some(m)) = (archivo.as_mut(), mia.as_ref())
        {
            comparar::completar_resumida(&self.resumidas, d, a, m);
        }
        let elegidas = match x.decision {
            Decision::Campos(m) => m,
            _ => 0,
        };
        let vacia = vec![Value::Null; d.columnas.len()];
        let (m, a) = (
            mia.as_deref().unwrap_or(&vacia),
            archivo.as_deref().unwrap_or(&vacia),
        );
        let mut campos = Vec::new();
        for (i, col) in d.columnas.iter().enumerate() {
            if !comparable(col) {
                continue;
            }
            let distinto = if matches!(c.tipo, TipoCaso::Nuevo | TipoCaso::DuplicadoPersona) {
                !comparar::iguales(&m[i], &a[i])
            } else {
                c.columnas & (1 << i) != 0
            };
            if distinto {
                campos.push(CampoDetalle {
                    columna: col.clone(),
                    mio: valor_campo(local, imp, d, i, m)?,
                    archivo: valor_campo(imp, local, d, i, a)?,
                    distinto,
                    del_archivo: elegidas & (1 << i) != 0,
                });
            }
        }
        Ok(DetalleCaso {
            campos,
            actualizada_mia: fecha_mostrable(d, mia.as_deref(), "updated_at"),
            actualizada_archivo: fecha_mostrable(d, archivo.as_deref(), "updated_at"),
            borrada_mia: fecha_mostrable(d, mia.as_deref(), "deleted_at"),
            borrada_archivo: fecha_mostrable(d, archivo.as_deref(), "deleted_at"),
            rival: rival
                .map(|r| nombre_de(local, imp, c.tabla, r))
                .transpose()?,
        })
    }

    /// Lo que falta por resolver, y después lo ya resuelto, que se puede cambiar.
    pub fn pagina_bloqueos(
        &self,
        local: &Connection,
        imp: &Connection,
        desde: usize,
        cuantos: usize,
    ) -> Result<PaginaBloqueos, Fallo> {
        let mut resueltos: Vec<Bloqueo> = self
            .arreglos
            .keys()
            .map(|(tabla, id, columna)| {
                let tabla = *tabla;
                let d = self.esquema.get(tabla);
                let r = d.and_then(|d| {
                    d.referencias
                        .iter()
                        .find(|(i, ..)| d.columnas[*i] == *columna)
                });
                Bloqueo {
                    tipo: if tabla == "unidades" && columna == "parent_id" {
                        TipoBloqueo::Ciclo
                    } else {
                        TipoBloqueo::Referencia
                    },
                    tabla,
                    id: id.clone(),
                    columna: Some(columna.clone()),
                    destino: r.and_then(|(_, destino, _)| comparar::estatica(destino)),
                    otro: None,
                    vaciable: r.is_some_and(|(_, _, requerida)| !requerida) && tabla != "vistas",
                }
            })
            .chain(self.choques.keys().map(|&(tabla, ref id)| Bloqueo {
                tipo: TipoBloqueo::Unica,
                tabla,
                id: id.clone(),
                columna: None,
                destino: None,
                otro: None,
                vaciable: false,
            }))
            .collect();
        resueltos.sort_by(|a, b| (a.tabla, &a.id, &a.columna).cmp(&(b.tabla, &b.id, &b.columna)));
        let sin_resolver = self.bloqueos.iter().filter(|b| {
            !resueltos
                .iter()
                .any(|r| r.tabla == b.tabla && r.id == b.id && r.columna == b.columna)
        });
        let todos: Vec<&Bloqueo> = sin_resolver.chain(resueltos.iter()).collect();
        let filas = todos
            .iter()
            .skip(desde)
            .take(cuantos.min(MAX_PAGINA))
            .map(|b| {
                let (eleccion, reasignado_a) = self.eleccion_de_bloqueo(local, imp, b)?;
                let otro = match (
                    &b.otro,
                    b.destino.or(if b.tipo == TipoBloqueo::Unica {
                        Some(b.tabla)
                    } else {
                        None
                    }),
                ) {
                    (Some(o), Some(destino)) => Some(nombre_de(local, imp, destino, o)?),
                    _ => None,
                };
                Ok(FilaBloqueo {
                    tipo: b.tipo,
                    tabla: b.tabla,
                    id: b.id.clone(),
                    nombre: nombre_de(local, imp, b.tabla, &b.id)?,
                    columna: b.columna.clone(),
                    destino: b.destino,
                    otro,
                    vaciable: b.vaciable,
                    eleccion,
                    reasignado_a,
                })
            })
            .collect::<Result<_, Fallo>>()?;
        Ok(PaginaBloqueos {
            filas,
            total: todos.len(),
        })
    }

    fn eleccion_de_bloqueo(
        &self,
        local: &Connection,
        imp: &Connection,
        b: &Bloqueo,
    ) -> Result<(Option<Eleccion>, Option<String>), Fallo> {
        if let Some(columna) = &b.columna {
            return match self.arreglos.get(&(b.tabla, b.id.clone(), columna.clone())) {
                None => Ok((None, None)),
                Some(Arreglo::Vaciar) => Ok((
                    Some(Eleccion::Vaciar {
                        columna: columna.clone(),
                    }),
                    None,
                )),
                Some(Arreglo::Descartar) => Ok((
                    Some(Eleccion::Descartar {
                        columna: columna.clone(),
                    }),
                    None,
                )),
                Some(Arreglo::Reasignar(a)) => {
                    let nombre = match b.destino {
                        Some(destino) => Some(nombre_de(local, imp, destino, a)?),
                        None => None,
                    };
                    Ok((
                        Some(Eleccion::Reasignar {
                            columna: columna.clone(),
                            a: a.clone(),
                        }),
                        nombre,
                    ))
                }
            };
        }
        Ok((
            match self.choques.get(&(b.tabla, b.id.clone())) {
                Some(Lado::Mio) => Some(Eleccion::ConservarMio),
                Some(_) => Some(Eleccion::ConservarArchivo),
                None => None,
            },
            None,
        ))
    }

    /// Cuántas filas con algo por decidir ya no están como se compararon.
    fn cambiadas(&self, conn: &Connection) -> Result<u64, Fallo> {
        let mut n = 0;
        for x in &self.casos {
            let c = &x.caso;
            let d = self.esquema.get(c.tabla).ok_or("tabla")?;
            let id = match c.tipo {
                TipoCaso::DuplicadoPersona => self.rivales.get(&c.id).ok_or("rival")?,
                TipoCaso::Union => self.unidos.get(&(c.tabla, c.id.clone())).ok_or("unido")?,
                _ => &c.id,
            };
            let fila = comparar::leer_fila(conn, c.tabla, d, id)?;
            if fila.map_or(0, |f| comparar::huella(&f)) != c.huella {
                n += 1;
            }
        }
        Ok(n)
    }
}

/// Filas vivas que apuntan a algo que no está o está eliminado. Una fila viva puede apuntar a un valor de mantenedor
/// desactivado: la ficha conserva su id.
#[derive(Debug, Clone, PartialEq)]
struct Rota {
    tabla: &'static str,
    id: String,
    columna: String,
    destino: &'static str,
    valor: String,
    requerida: bool,
}

fn rotas(c: &Connection, esquema: &HashMap<&'static str, Tabla>) -> Result<Vec<Rota>, Fallo> {
    let mut salida = Vec::new();
    for tabla in tablas() {
        let d = esquema.get(tabla).ok_or("tabla")?;
        for (i, destino, requerida) in &d.referencias {
            let destino = comparar::estatica(destino).ok_or("tabla")?;
            let columna = &d.columnas[*i];
            let eliminada = if CATALOGOS.contains(&destino) {
                ""
            } else {
                " OR d.deleted_at IS NOT NULL"
            };
            let sql = format!(
                "SELECT t.id, t.{columna} FROM {tabla} t LEFT JOIN {destino} d ON d.id = t.{columna}
                 WHERE t.deleted_at IS NULL AND t.{columna} IS NOT NULL AND (d.id IS NULL{eliminada})"
            );
            // una vista sin su árbol no es una vista del árbol completo: no se puede dejar vacía
            let requerida = *requerida || tabla == "vistas";
            let mut consulta = c.prepare_cached(&sql)?;
            let filas =
                consulta.query_map([], |f| Ok((f.get::<_, String>(0)?, f.get::<_, String>(1)?)))?;
            for fila in filas {
                let (id, valor) = fila?;
                salida.push(Rota {
                    tabla,
                    id,
                    columna: columna.clone(),
                    destino,
                    valor,
                    requerida,
                });
            }
        }
    }
    Ok(salida)
}

/// La otra fila con la que choca una regla única. None si lo que falla es otra regla (una combinación de campos no válida).
fn rival(
    dst: &Connection,
    tabla: &str,
    d: &Tabla,
    fila: &[Value],
    id: &str,
) -> Result<Option<String>, Fallo> {
    let v = |c: &str| {
        d.columnas
            .iter()
            .position(|x| x == c)
            .map(|i| &fila[i])
            .ok_or("columna")
    };
    let sql_nombre = format!(
        "SELECT id FROM {tabla} WHERE deleted_at IS NULL AND id <> ?1 AND lower(trim(nombre)) = lower(trim(?2))"
    );
    let (sql, params): (&str, Vec<&Value>) = match tabla {
        t if CATALOGOS.contains(&t) => (&sql_nombre, vec![v("nombre")?]),
        "trabajadores" => (
            "SELECT id FROM trabajadores WHERE deleted_at IS NULL AND id <> ?1 AND ?2 IS NOT NULL AND trim(?2) <> ''
             AND lower(trim(correo)) = lower(trim(?2))",
            vec![v("correo")?],
        ),
        // cerrada no compite por el puesto: lo que falla es otra regla
        "asignaciones" if *v("hasta")? != Value::Null => return Ok(None),
        "asignaciones" => (
            "SELECT id FROM asignaciones WHERE deleted_at IS NULL AND hasta IS NULL AND id <> ?1
             AND puesto_id = ?2 AND tipo = ?3",
            vec![v("puesto_id")?, v("tipo")?],
        ),
        "unidad_etiquetas" => (
            "SELECT id FROM unidad_etiquetas WHERE deleted_at IS NULL AND id <> ?1 AND unidad_id = ?2 AND etiqueta_id = ?3",
            vec![v("unidad_id")?, v("etiqueta_id")?],
        ),
        "actividad_roles" => (
            "SELECT id FROM actividad_roles WHERE deleted_at IS NULL AND id <> ?1 AND actividad_id = ?2
             AND (trabajador_id = ?3 OR (rol = 'A' AND ?4 = 'A'))",
            vec![v("actividad_id")?, v("trabajador_id")?, v("rol")?],
        ),
        "subarboles_guardados" => (
            "SELECT id FROM subarboles_guardados WHERE deleted_at IS NULL AND id <> ?1 AND unidad_id = ?2",
            vec![v("unidad_id")?],
        ),
        "vistas" => (
            "SELECT id FROM vistas WHERE deleted_at IS NULL AND id <> ?1
             AND coalesce(arbol_id, '') = coalesce(?2, '') AND lower(trim(nombre)) = lower(trim(?3))",
            vec![v("arbol_id")?, v("nombre")?],
        ),
        _ => return Ok(None),
    };
    let propio = Value::Text(id.to_string());
    let todos = std::iter::once(&propio).chain(params);
    Ok(dst
        .prepare_cached(sql)?
        .query_row(params_from_iter(todos), |f| f.get(0))
        .optional()?)
}

struct Pasada<'a> {
    dst: &'a Connection,
    imp: &'a Connection,
    meta: &'a MetaArchivo,
    rev: &'a Revision,
    ahora: &'a str,
    parcial: comparar::Parcial<'a>,
    unidos: HashMap<(&'static str, String), String>,
    insertadas: HashSet<(&'static str, String)>,
    /// Filas detenidas por un bloqueo: lo que apunta a ellas no es otro bloqueo.
    sin_resolver: HashSet<(&'static str, String)>,
    bloqueos: Vec<Bloqueo>,
    cuentas: BTreeMap<usize, Aplicado>,
}

struct Salida {
    tablas: Vec<Aplicado>,
    bloqueos: Vec<Bloqueo>,
    nombre_heredado: Option<String>,
}

impl Pasada<'_> {
    fn cuenta(&mut self, tabla: &'static str) -> &mut Aplicado {
        self.cuentas
            .entry(comparar::posicion(tabla))
            .or_insert_with(|| Aplicado {
                tabla,
                ..Default::default()
            })
    }

    fn fila_archivo(&self, c: &Caso, d: &Tabla) -> Result<Vec<Value>, Fallo> {
        let mut fila = comparar::leer_fila(self.imp, c.tabla, d, &c.id)?.ok_or("fila")?;
        comparar::remapear(&mut fila, d, &self.unidos);
        if self.meta.parcial
            && let Some(mia) = comparar::leer_fila(self.dst, c.tabla, d, &c.id)?
        {
            self.parcial
                .ajustar(self.dst, self.imp, c.tabla, d, &mut fila, &mia)?;
        }
        Ok(fila)
    }

    /// Una fila del archivo no trae fechas en las que confiar: las que no sirven pasan a ser las de ahora.
    fn fechas_propias(&self, d: &Tabla, fila: &mut [Value]) {
        for (i, c) in d.columnas.iter().enumerate() {
            if matches!(c.as_str(), "created_at" | "updated_at" | "deleted_at")
                && let Value::Text(t) = &fila[i]
                && fecha_dudosa(t, self.ahora)
            {
                fila[i] = Value::Text(self.ahora.to_string());
            }
        }
    }

    /// true si se escribió; false si lo impide una regla de la base.
    fn ejecutar(&self, sql: &str, params: &[&Value]) -> Result<bool, Fallo> {
        match self
            .dst
            .prepare_cached(sql)?
            .execute(params_from_iter(params.iter()))
        {
            Ok(n) => Ok(n > 0),
            Err(e) if e.sqlite_error_code() == Some(ErrorCode::ConstraintViolation) => Ok(false),
            Err(e) => Err(e.into()),
        }
    }

    fn insertar(&mut self, c: &Caso, d: &Tabla, mut fila: Vec<Value>) -> Result<bool, Fallo> {
        self.fechas_propias(d, &mut fila);
        if c.tabla == "unidades"
            && let Some(padre) = self.parcial.padres.get(c.id.as_str())
        {
            fusion::colocar_rama(
                self.dst,
                *padre,
                &self.rev.lugares,
                &c.id,
                &d.columnas,
                &mut fila,
            )?;
        }
        let sql = format!(
            "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT DO NOTHING",
            c.tabla,
            d.columnas.join(", "),
            vec!["?"; d.columnas.len()].join(", ")
        );
        let refs: Vec<&Value> = fila.iter().collect();
        if !self.ejecutar(&sql, &refs)? {
            // la misma etiqueta en la misma unidad, o la misma rama guardada, es lo mismo con otro id
            if matches!(c.tabla, "unidad_etiquetas" | "subarboles_guardados")
                && let Some(r) = rival(self.dst, c.tabla, d, &fila, &c.id)?
            {
                self.unidos.insert((c.tabla, c.id.clone()), r);
                self.cuenta(c.tabla).unidas += 1;
                return Ok(true);
            }
            return Ok(false);
        }
        self.insertadas.insert((c.tabla, c.id.clone()));
        self.cuenta(c.tabla).agregadas += 1;
        Ok(true)
    }

    /// Escribe en la fila `id` las columnas de la máscara, con su `updated_at`. `extra`: `deleted_at = NULL` al revivir.
    fn actualizar(
        &self,
        tabla: &str,
        d: &Tabla,
        id: &str,
        mascara: u64,
        fila: &[Value],
        extra: &str,
    ) -> Result<bool, Fallo> {
        let mut sets = Vec::new();
        let mut params: Vec<&Value> = Vec::new();
        for (i, c) in d.columnas.iter().enumerate() {
            if mascara & (1 << i) != 0 {
                sets.push(format!("{c} = ?"));
                params.push(&fila[i]);
            }
        }
        let (marca, propio) = (
            Value::Text(self.ahora.to_string()),
            Value::Text(id.to_string()),
        );
        params.push(&marca);
        params.push(&propio);
        let sql = format!(
            "UPDATE {tabla} SET {}updated_at = ?{extra} WHERE id = ?",
            sets.iter().map(|s| format!("{s}, ")).collect::<String>()
        );
        self.ejecutar(&sql, &params)
    }

    /// Hace lo decidido en este caso. false si una regla de la base lo impide: se reintenta al final de la tabla, porque otra
    /// fila puede estar por dejar libre lo que esta necesita.
    fn procesar(&mut self, x: &Decidido, d: &Tabla) -> Result<bool, Fallo> {
        let c = &x.caso;
        let todas = d
            .columnas
            .iter()
            .enumerate()
            .filter(|(_, n)| comparable(n))
            .fold(0u64, |m, (i, _)| m | (1 << i));
        match (&x.decision, c.tipo) {
            (Decision::Nada, TipoCaso::Union) | (Decision::Omitir, _) => Ok(true),
            (Decision::Agregar | Decision::Nada, _) => {
                let fila = self.fila_archivo(c, d)?;
                self.insertar(c, d, fila)
            }
            (Decision::EditarCorreo(correo), _) => {
                let mut fila = self.fila_archivo(c, d)?;
                let i = d
                    .columnas
                    .iter()
                    .position(|n| n == "correo")
                    .ok_or("correo")?;
                fila[i] = Value::Text(correo.clone());
                self.insertar(c, d, fila)
            }
            // sin decidir: se cuenta aparte; mientras tanto, lo suyo no se marca como roto
            (Decision::Pendiente, _) => {
                let r = self.rev.rivales.get(&c.id).ok_or("rival")?;
                self.unidos.insert((c.tabla, c.id.clone()), r.clone());
                Ok(true)
            }
            (Decision::UnirMio, _) => {
                let r = self.rev.rivales.get(&c.id).ok_or("rival")?;
                self.unidos.insert((c.tabla, c.id.clone()), r.clone());
                self.cuenta(c.tabla).unidas += 1;
                Ok(true)
            }
            (Decision::UnirArchivo, _) => {
                let r = self.rev.rivales.get(&c.id).ok_or("rival")?;
                let mut fila = self.fila_archivo(c, d)?;
                if let Some(mia) = comparar::leer_fila(self.dst, c.tabla, d, r)? {
                    comparar::completar_resumida(&self.rev.resumidas, d, &mut fila, &mia);
                }
                if !self.actualizar(c.tabla, d, r, todas, &fila, "")? {
                    return Ok(false);
                }
                self.unidos.insert((c.tabla, c.id.clone()), r.clone());
                let cuenta = self.cuenta(c.tabla);
                cuenta.unidas += 1;
                cuenta.cambiadas += 1;
                Ok(true)
            }
            (Decision::Campos(0), _) => Ok(true),
            (Decision::Campos(m), _) => {
                let fila = self.fila_archivo(c, d)?;
                if !self.actualizar(c.tabla, d, &c.id, *m, &fila, "")? {
                    return Ok(false);
                }
                self.cuenta(c.tabla).cambiadas += 1;
                Ok(true)
            }
            (Decision::Borrar, _) if c.borrado_aqui => Ok(true),
            (Decision::Mantener, _) if !c.borrado_aqui => Ok(true),
            (Decision::Borrar, _) => {
                let fila = self.fila_archivo(c, d)?;
                let i = d
                    .columnas
                    .iter()
                    .position(|n| n == "deleted_at")
                    .ok_or("deleted_at")?;
                let cuando = match &fila[i] {
                    Value::Text(t) if !fecha_dudosa(t, self.ahora) => t.clone(),
                    _ => self.ahora.to_string(),
                };
                self.dst.execute(
                    &format!(
                        "UPDATE {} SET deleted_at = ?1, updated_at = ?2 WHERE id = ?3",
                        c.tabla
                    ),
                    [&cuando, self.ahora, &c.id],
                )?;
                self.cuenta(c.tabla).borradas += 1;
                Ok(true)
            }
            (Decision::Mantener, _) => {
                let fila = self.fila_archivo(c, d)?;
                if !self.actualizar(c.tabla, d, &c.id, todas, &fila, ", deleted_at = NULL")? {
                    return Ok(false);
                }
                self.cuenta(c.tabla).revividas += 1;
                Ok(true)
            }
        }
    }

    /// Cómo quedaría la fila de este caso: para saber con quién choca.
    fn fila_final(&self, x: &Decidido, d: &Tabla) -> Result<(String, Vec<Value>), Fallo> {
        let c = &x.caso;
        let mut a = self.fila_archivo(c, d)?;
        Ok(match &x.decision {
            Decision::Campos(m) => {
                let mut mia = comparar::leer_fila(self.dst, c.tabla, d, &c.id)?.ok_or("fila")?;
                for (i, v) in a.iter().enumerate() {
                    if m & (1 << i) != 0 {
                        mia[i] = v.clone();
                    }
                }
                (c.id.clone(), mia)
            }
            Decision::EditarCorreo(correo) => {
                let i = d
                    .columnas
                    .iter()
                    .position(|n| n == "correo")
                    .ok_or("correo")?;
                a[i] = Value::Text(correo.clone());
                (c.id.clone(), a)
            }
            Decision::UnirArchivo => (self.rev.rivales.get(&c.id).ok_or("rival")?.clone(), a),
            _ => (c.id.clone(), a),
        })
    }

    /// Da de baja la fila que pierde en una regla única. Una asignación vigente se cierra, nunca se borra: es el historial.
    fn retirar_rival(
        &mut self,
        tabla: &'static str,
        d: &Tabla,
        id: &str,
        fila: &[Value],
    ) -> Result<(), Fallo> {
        if tabla == "asignaciones" {
            let i = d
                .columnas
                .iter()
                .position(|n| n == "desde")
                .ok_or("desde")?;
            self.dst.execute(
                "UPDATE asignaciones SET hasta = max(desde, ?1), updated_at = ?2 WHERE id = ?3",
                rusqlite::params![&fila[i], self.ahora, id],
            )?;
            self.cuenta(tabla).cambiadas += 1;
        } else {
            self.dar_de_baja(tabla, id)?;
        }
        Ok(())
    }

    fn dar_de_baja(&mut self, tabla: &'static str, id: &str) -> Result<(), Fallo> {
        // lo que entró en esta misma pasada no se deja eliminado: es invisible y no se podría purgar
        if self.insertadas.remove(&(tabla, id.to_string())) {
            self.dst
                .execute(&format!("DELETE FROM {tabla} WHERE id = ?1"), [id])?;
            let cuenta = self.cuenta(tabla);
            cuenta.agregadas -= 1;
            cuenta.omitidas += 1;
        } else {
            self.dst.execute(
                &format!("UPDATE {tabla} SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NULL"),
                [self.ahora, id],
            )?;
            self.cuenta(tabla).borradas += 1;
        }
        Ok(())
    }

    fn resolver_choque(&mut self, x: &Decidido, d: &Tabla) -> Result<(), Fallo> {
        let c = &x.caso;
        let (propio, fila) = self.fila_final(x, d)?;
        let con_quien = rival(self.dst, c.tabla, d, &fila, &propio)?;
        match self.rev.choques.get(&(c.tabla, c.id.clone())) {
            Some(Lado::Mio) => {
                self.cuenta(c.tabla).omitidas += 1;
                return Ok(());
            }
            Some(_) => {
                if let Some(r) = &con_quien {
                    self.retirar_rival(c.tabla, d, r, &fila)?;
                    if self.procesar(x, d)? {
                        return Ok(());
                    }
                }
            }
            None => {}
        }
        self.sin_resolver.insert((c.tabla, c.id.clone()));
        self.bloqueos.push(Bloqueo {
            tipo: if con_quien.is_some() {
                TipoBloqueo::Unica
            } else {
                TipoBloqueo::Regla
            },
            tabla: c.tabla,
            id: c.id.clone(),
            columna: None,
            destino: None,
            otro: con_quien,
            vaciable: false,
        });
        Ok(())
    }

    fn aplicar_arreglos(&mut self) -> Result<(), Fallo> {
        let rev = self.rev;
        for ((tabla, id, columna), arreglo) in &rev.arreglos {
            let tabla = *tabla;
            // la fila ya no está: se omitió después de decidir esto
            if fusion::estado_fila(self.dst, tabla, id)?.is_none() {
                continue;
            }
            let valor = match arreglo {
                Arreglo::Descartar => {
                    self.dar_de_baja(tabla, id)?;
                    continue;
                }
                Arreglo::Reasignar(a) => Value::Text(a.clone()),
                Arreglo::Vaciar => Value::Null,
            };
            let (marca, propio) = (Value::Text(self.ahora.to_string()), Value::Text(id.clone()));
            let sql = format!("UPDATE {tabla} SET {columna} = ?, updated_at = ? WHERE id = ?");
            if !self.ejecutar(&sql, &[&valor, &marca, &propio])? {
                self.bloqueos.push(Bloqueo {
                    tipo: TipoBloqueo::Regla,
                    tabla,
                    id: id.clone(),
                    columna: Some(columna.clone()),
                    destino: None,
                    otro: None,
                    vaciable: false,
                });
            }
        }
        Ok(())
    }

    fn revisar_referencias(
        &mut self,
        antes: &HashSet<(String, String, String)>,
    ) -> Result<(), Fallo> {
        let rev = self.rev;
        loop {
            let nuevas: Vec<Rota> = rotas(self.dst, &rev.esquema)?
                .into_iter()
                .filter(|r| {
                    !antes.contains(&(r.tabla.to_string(), r.id.clone(), r.columna.clone()))
                })
                .filter(|r| !self.sin_resolver.contains(&(r.destino, r.valor.clone())))
                .collect();
            if !self.rev.resolver_rotas || nuevas.is_empty() {
                for r in nuevas {
                    self.bloqueos.push(Bloqueo {
                        tipo: TipoBloqueo::Referencia,
                        tabla: r.tabla,
                        id: r.id,
                        columna: Some(r.columna),
                        destino: Some(r.destino),
                        otro: Some(r.valor),
                        vaciable: !r.requerida,
                    });
                }
                return Ok(());
            }
            // «Resolver todas»: lo que se pueda queda vacío, y lo que no, fuera. Sacar una fila puede romper otra.
            for r in nuevas {
                if r.requerida {
                    self.dar_de_baja(r.tabla, &r.id)?;
                } else {
                    self.dst.execute(
                        &format!(
                            "UPDATE {} SET {} = NULL, updated_at = ?1 WHERE id = ?2",
                            r.tabla, r.columna
                        ),
                        [self.ahora, &r.id],
                    )?;
                }
            }
        }
    }
}

/// Aplica las decisiones sobre `dst`, que debe estar en una transacción: quien llama confirma o deshace.
fn pasada(
    dst: &Connection,
    imp: &Connection,
    meta: &MetaArchivo,
    rev: &Revision,
    ahora: &str,
) -> Result<Salida, Fallo> {
    for destino in rev.lugares.values().flatten() {
        if !fusion::viva(dst, "unidades", destino)? {
            return Err(Fallo::de("desconocido", ""));
        }
    }
    let antes: HashSet<(String, String, String)> = rotas(dst, &rev.esquema)?
        .into_iter()
        .map(|r| (r.tabla.to_string(), r.id, r.columna))
        .collect();
    let mut p = Pasada {
        dst,
        imp,
        meta,
        rev,
        ahora,
        parcial: comparar::Parcial {
            padres: comparar::padres_de(meta),
            resumidas: &rev.resumidas,
        },
        unidos: rev.unidos.clone(),
        insertadas: HashSet::new(),
        sin_resolver: HashSet::new(),
        bloqueos: Vec::new(),
        cuentas: BTreeMap::new(),
    };
    for tabla in tablas() {
        let d = rev.esquema.get(tabla).ok_or("tabla")?;
        let posicion = comparar::posicion(tabla);
        let inicio = rev
            .casos
            .partition_point(|c| comparar::posicion(c.caso.tabla) < posicion);
        let fin = rev
            .casos
            .partition_point(|c| comparar::posicion(c.caso.tabla) <= posicion);
        let mut cola: Vec<&Decidido> = rev.casos[inicio..fin].iter().collect();
        loop {
            let mut siguen = Vec::new();
            for x in &cola {
                if !p.procesar(x, d)? {
                    siguen.push(*x);
                }
            }
            // nadie avanzó: lo que queda choca de verdad
            let atascado = siguen.len() == cola.len();
            cola = siguen;
            if cola.is_empty() || atascado {
                break;
            }
        }
        for x in cola {
            p.resolver_choque(x, d)?;
        }
    }
    p.aplicar_arreglos()?;
    p.revisar_referencias(&antes)?;
    let ciclos = validar::en_ciclo(dst)?;
    for id in ciclos {
        p.bloqueos.push(Bloqueo {
            tipo: TipoBloqueo::Ciclo,
            tabla: "unidades",
            id,
            columna: Some("parent_id".into()),
            destino: Some("unidades"),
            otro: None,
            vaciable: true,
        });
    }
    let nombre_heredado = fusion::heredar_nombre(dst, meta)?;
    let (tablas, bloqueos) = (p.cuentas.into_values().collect(), p.bloqueos);
    // nunca se aplica con referencias rotas, aunque lo anterior tuviera un error
    let sin_bloqueos =
        bloqueos.is_empty() && rev.casos.iter().all(|x| x.decision != Decision::Pendiente);
    if sin_bloqueos
        && dst.query_row(
            "SELECT EXISTS (SELECT 1 FROM pragma_foreign_key_check)",
            [],
            |f| f.get::<_, bool>(0),
        )?
    {
        return Err(Fallo::de("contenido_invalido", "resultado"));
    }
    Ok(Salida {
        tablas,
        bloqueos,
        nombre_heredado,
    })
}

/// La base cambió desde que se comparó: lo decidido ya no corresponde a lo que hay.
fn avisar_cambios(conn: &Connection, r: &Revision) -> Result<(), Fallo> {
    match r.cambiadas(conn)? {
        0 => Ok(()),
        n => Err(Fallo::de("base_cambio", n)),
    }
}

/// La misma pasada que al aplicar, deshecha al final. Devuelve para qué versión de las decisiones vale.
pub fn verificar(
    conn: &mut Connection,
    i: &Importacion,
    r: &Revision,
) -> Result<(u64, Vec<Bloqueo>), Fallo> {
    avisar_cambios(conn, r)?;
    let imp = i.solo_lectura()?;
    let marca = super::ahora(conn)?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let s = pasada(&tx, &imp, &i.meta, r, &marca)?;
    Ok((r.version, s.bloqueos))
}

/// Compara y deja la revisión lista, ya verificada con lo preseleccionado. Con `anterior`, conserva lo decidido.
pub fn abrir(
    conn: &mut Connection,
    i: &Importacion,
    lugares: Lugares,
    anterior: Option<&Revision>,
    seguir: impl FnMut(u64, u64) -> bool,
) -> Result<Revision, Fallo> {
    let imp = i.solo_lectura()?;
    let marca = super::ahora(conn)?;
    let c = comparar::comparar(conn, &imp, &i.meta, &marca, seguir)?;
    let mut esquema = HashMap::new();
    for tabla in tablas() {
        esquema.insert(tabla, fusion::describir(&imp, tabla)?);
    }
    let mut r = Revision::nueva(c, lugares, esquema);
    if let Some(a) = anterior {
        r.heredar(a);
    }
    let (version, bloqueos) = verificar(conn, i, &r)?;
    r.anotar_verificacion(version, bloqueos);
    Ok(r)
}

/// Aplica lo decidido en esta revisión: un respaldo y una sola transacción. Si las decisiones no son las que se vieron, si
/// una fila cambió desde que se comparó o si queda algo por resolver, no se escribe nada.
pub fn aplicar(
    conn: &mut Connection,
    dir_respaldos: &Path,
    i: &Importacion,
    r: &Revision,
    version: u64,
    version_app: &str,
) -> Result<InformeRevision, Fallo> {
    if r.version != version || r.verificada != Some(version) {
        return Err(Fallo::de("sin_verificar", ""));
    }
    avisar_cambios(conn, r)?;
    if r.casos.iter().any(|x| x.decision == Decision::Pendiente) || !r.bloqueos.is_empty() {
        return Err(Fallo::de("bloqueada", ""));
    }
    let imp = i.solo_lectura()?;
    respaldos::respaldar_antes_de_reemplazar(conn, dir_respaldos, &respaldos::sello_local(conn)?)?;
    let marca = super::ahora(conn)?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let s = pasada(&tx, &imp, &i.meta, r, &marca)?;
    if !s.bloqueos.is_empty() {
        return Err(Fallo::de("bloqueada", ""));
    }
    db::marcar_cambio(&tx, version_app)?;
    tx.commit()?;
    Ok(InformeRevision {
        tablas: s.tablas,
        nombre_heredado: s.nombre_heredado,
    })
}

/// A qué se puede reasignar una referencia: filas vivas de esta base, filtradas con el mismo comparador de nombres.
pub fn opciones(local: &Connection, destino: &str, texto: &str) -> Result<Vec<Opcion>, Fallo> {
    let tabla = tabla_conocida(destino)?;
    let buscado = fusion::normalizar_nombre(texto);
    let expresion = expresion_nombre(tabla);
    let sql = format!(
        "SELECT t.id, substr({expresion}, 1, 200) FROM {tabla} t WHERE t.deleted_at IS NULL ORDER BY 2"
    );
    let mut consulta = local.prepare(&sql)?;
    let mut filas = consulta.query([])?;
    let mut salida = Vec::new();
    while let Some(f) = filas.next()? {
        let nombre: String = f.get::<_, Option<String>>(1)?.unwrap_or_default();
        if fusion::normalizar_nombre(&nombre).contains(&buscado) {
            salida.push(Opcion {
                id: f.get(0)?,
                nombre,
            });
            if salida.len() == MAX_OPCIONES {
                break;
            }
        }
    }
    Ok(salida)
}

#[cfg(test)]
mod tests {
    use super::super::prueba::{TIPO, base_con_datos};
    use super::super::{Sesiones, Temporal, alcance, guardar, nombre_sugerido};
    use super::*;
    use db::MIGRACIONES;
    use std::path::PathBuf;

    const F0: &str = "2026-01-01T00:00:00.000Z";
    const F1: &str = "2026-02-01T00:00:00.000Z";
    const F2: &str = "2026-03-01T00:00:00.000Z";
    const FUTURA: &str = "2999-01-01T00:00:00.000Z";

    /// Una base local y un archivo sacado de ella: al empezar son iguales, y cada prueba les hace sus cambios.
    struct Banco {
        dir: tempfile::TempDir,
        local: Connection,
        i: Importacion,
        lugares: Lugares,
    }

    fn banco_con(raices: Option<&[String]>) -> Banco {
        let (dir, local) = base_con_datos();
        for t in tablas() {
            local
                .execute(
                    &format!("UPDATE {t} SET created_at = ?1, updated_at = ?1"),
                    [F0],
                )
                .unwrap();
            local
                .execute(
                    &format!("UPDATE {t} SET deleted_at = ?1 WHERE deleted_at IS NOT NULL"),
                    [F0],
                )
                .unwrap();
        }
        let copia = alcance::copiar(&local, dir.path()).unwrap();
        let (temporal, _) = alcance::preparar(copia, dir.path(), raices).unwrap();
        let meta = validar::leer_meta(&validar::solo_lectura(temporal.ruta()).unwrap()).unwrap();
        Banco {
            dir,
            local,
            i: Importacion { temporal, meta },
            lugares: Lugares::new(),
        }
    }

    fn banco() -> Banco {
        banco_con(None)
    }

    impl Banco {
        fn archivo(&mut self, sql: &str) {
            let c = Connection::open(self.i.temporal.ruta()).unwrap();
            c.pragma_update(None, "foreign_keys", "OFF").unwrap();
            c.execute_batch(sql).unwrap();
            drop(c);
            self.i.meta = validar::leer_meta(&self.i.solo_lectura().unwrap()).unwrap();
        }

        fn mia(&self, sql: &str) {
            self.local
                .pragma_update(None, "foreign_keys", "OFF")
                .unwrap();
            self.local.execute_batch(sql).unwrap();
            self.local
                .pragma_update(None, "foreign_keys", "ON")
                .unwrap();
        }

        fn abrir(&mut self) -> Revision {
            abrir(
                &mut self.local,
                &self.i,
                self.lugares.clone(),
                None,
                |_, _| true,
            )
            .unwrap()
        }

        fn verificar(&mut self, r: &mut Revision) {
            let (v, b) = verificar(&mut self.local, &self.i, r).unwrap();
            r.anotar_verificacion(v, b);
        }

        fn intentar(&mut self, r: &mut Revision) -> Result<InformeRevision, Fallo> {
            let (v, b) = verificar(&mut self.local, &self.i, r)?;
            r.anotar_verificacion(v, b);
            let dir = self.dir.path().join("respaldos");
            std::fs::create_dir_all(&dir).unwrap();
            let v = r.version;
            aplicar(&mut self.local, &dir, &self.i, r, v, "1.2.3")
        }

        fn aplicar(&mut self, r: &mut Revision) -> InformeRevision {
            self.intentar(r).unwrap()
        }

        fn uno(&self, sql: &str) -> Option<String> {
            self.local.query_row(sql, [], |f| f.get(0)).unwrap()
        }

        fn hay(&self, tabla: &str, id: &str) -> bool {
            fusion::estado_fila(&self.local, tabla, id)
                .unwrap()
                .is_some()
        }

        fn viva(&self, tabla: &str, id: &str) -> bool {
            fusion::viva(&self.local, tabla, id).unwrap()
        }

        fn respaldos(&self) -> usize {
            let dir = self.dir.path().join("respaldos");
            std::fs::read_dir(dir).map_or(0, |d| d.count())
        }

        fn revision_datos(&self) -> String {
            self.uno("SELECT valor FROM meta WHERE clave = 'data_revision'")
                .unwrap()
        }
    }

    fn caso<'a>(r: &'a Revision, tabla: &str, id: &str) -> &'a Decidido {
        &r.casos[r.indice(tabla, id).unwrap()]
    }

    fn eleccion_campos(c: &[&str]) -> Eleccion {
        Eleccion::Campos {
            archivo: c.iter().map(|x| x.to_string()).collect(),
        }
    }

    // --- Tabla de la spec §9, caso por caso ---

    #[test]
    fn identico_no_es_un_caso_y_no_hay_nada_que_aplicar() {
        let mut b = banco();
        // solo cambian las marcas de tiempo
        b.archivo(&format!(
            "UPDATE trabajadores SET updated_at = '{F2}' WHERE id = 'ana';"
        ));
        let r = b.abrir();
        assert!(r.casos.is_empty(), "{:?}", r.casos.first().map(|c| &c.caso));
        assert!(r.iguales > 0);
        assert_eq!(r.resumen().aplicara, Aplicara::default());
    }

    #[test]
    fn nuevo_se_agrega_y_se_puede_desmarcar() {
        let mut b = banco();
        b.archivo(&format!(
            "INSERT INTO trabajadores (id, nombre, created_at, updated_at) VALUES ('nueva', 'Nueva', '{F1}', '{F1}');"
        ));
        let mut r = b.abrir();
        let c = caso(&r, "trabajadores", "nueva");
        assert_eq!(
            (c.caso.tipo, &c.decision),
            (TipoCaso::Nuevo, &Decision::Agregar)
        );
        assert_eq!(r.resumen().aplicara.agregar, 1);
        r.decidir("trabajadores", "nueva", Eleccion::Omitir)
            .unwrap();
        let hecho = b.aplicar(&mut r);
        assert!(!b.hay("trabajadores", "nueva"));
        assert!(hecho.tablas.iter().all(|t| t.agregadas == 0));

        let mut b = banco();
        b.archivo(&format!(
            "INSERT INTO trabajadores (id, nombre, created_at, updated_at) VALUES ('nueva', 'Nueva', '{F1}', '{F1}');"
        ));
        let mut r = b.abrir();
        let hecho = b.aplicar(&mut r);
        assert!(b.viva("trabajadores", "nueva"));
        assert_eq!(hecho.tablas[0].agregadas, 1);
    }

    #[test]
    fn lo_que_solo_esta_aqui_nunca_se_borra() {
        let mut b = banco();
        b.mia(&format!(
            "INSERT INTO trabajadores (id, nombre, created_at, updated_at) VALUES ('solo-aqui', 'X', '{F0}', '{F0}');"
        ));
        let mut r = b.abrir();
        assert!(r.casos.is_empty());
        b.aplicar(&mut r);
        assert!(b.viva("trabajadores", "solo-aqui"));
    }

    #[test]
    fn diferente_preselecciona_el_mas_reciente_y_se_decide_campo_a_campo() {
        let cambios = format!(
            "UPDATE trabajadores SET nombre = 'Ana Archivo', notas = 'nota archivo', updated_at = '{F2}' WHERE id = 'ana';"
        );
        // el archivo es más reciente: viene preseleccionado
        let mut b = banco();
        b.archivo(&cambios);
        b.mia(&format!(
            "UPDATE trabajadores SET telefono = '123', updated_at = '{F1}' WHERE id = 'ana';"
        ));
        let mut r = b.abrir();
        let c = caso(&r, "trabajadores", "ana");
        assert_eq!(c.caso.tipo, TipoCaso::Diferente);
        assert_eq!(c.caso.mas_reciente, Lado::Archivo);
        assert_eq!(
            r.nombres_mascara("trabajadores", c.caso.columnas),
            ["nombre", "telefono", "notas"]
        );
        assert_eq!(
            r.eleccion(c),
            eleccion_campos(&["nombre", "telefono", "notas"])
        );

        // solo un campo del archivo; los demás, los míos
        r.decidir("trabajadores", "ana", eleccion_campos(&["notas"]))
            .unwrap();
        b.aplicar(&mut r);
        assert_eq!(
            b.uno("SELECT nombre FROM trabajadores WHERE id = 'ana'")
                .unwrap(),
            "Ana"
        );
        assert_eq!(
            b.uno("SELECT notas FROM trabajadores WHERE id = 'ana'")
                .unwrap(),
            "nota archivo"
        );
        assert_eq!(
            b.uno("SELECT telefono FROM trabajadores WHERE id = 'ana'")
                .unwrap(),
            "123"
        );

        // la mía es más reciente: nada del archivo
        let mut b = banco();
        b.archivo(&format!(
            "UPDATE trabajadores SET nombre = 'Ana Archivo', updated_at = '{F1}' WHERE id = 'ana';"
        ));
        b.mia(&format!(
            "UPDATE trabajadores SET nombre = 'Ana Mía', updated_at = '{F2}' WHERE id = 'ana';"
        ));
        let mut r = b.abrir();
        assert_eq!(
            caso(&r, "trabajadores", "ana").decision,
            Decision::Campos(0)
        );
        assert_eq!(r.resumen().aplicara.cambiar, 0);
        b.aplicar(&mut r);
        assert_eq!(
            b.uno("SELECT nombre FROM trabajadores WHERE id = 'ana'")
                .unwrap(),
            "Ana Mía"
        );
    }

    #[test]
    fn aceptar_los_mas_recientes_y_las_decisiones_en_bloque() {
        let mut b = banco();
        b.archivo(&format!(
            "UPDATE trabajadores SET nombre = 'A2', updated_at = '{F2}' WHERE id = 'ana';
             UPDATE trabajadores SET nombre = 'B2', updated_at = '{FUTURA}' WHERE id = 'bruno';"
        ));
        let mut r = b.abrir();
        r.decidir("trabajadores", "ana", eleccion_campos(&[]))
            .unwrap();
        r.masivo(Masivo {
            accion: AccionMasiva::Recientes,
            tipo: None,
        });
        assert_ne!(
            caso(&r, "trabajadores", "ana").decision,
            Decision::Campos(0)
        );
        assert_eq!(
            caso(&r, "trabajadores", "bruno").decision,
            Decision::Campos(0),
            "una fecha futura no es «la más reciente»"
        );
        assert!(r.resumen().decisiones >= 2);
        r.masivo(Masivo {
            accion: AccionMasiva::TodoMio,
            tipo: None,
        });
        assert_eq!(r.resumen().aplicara.cambiar, 0);
        r.masivo(Masivo {
            accion: AccionMasiva::TodoArchivo,
            tipo: None,
        });
        assert_eq!(r.resumen().aplicara.cambiar, 2);
    }

    #[test]
    fn una_fecha_futura_se_marca_no_se_preselecciona_y_no_se_guarda() {
        let mut b = banco();
        b.archivo(&format!(
            "UPDATE trabajadores SET nombre = 'Futuro', updated_at = '{FUTURA}' WHERE id = 'ana';"
        ));
        let mut r = b.abrir();
        let c = caso(&r, "trabajadores", "ana");
        assert!(c.caso.dudosa);
        assert_eq!(c.decision, Decision::Campos(0));
        assert_eq!(r.resumen().dudosas, 1);
        // el usuario decide: lo toma, y la fecha que queda es la de ahora
        r.decidir("trabajadores", "ana", eleccion_campos(&["nombre"]))
            .unwrap();
        b.aplicar(&mut r);
        assert_eq!(
            b.uno("SELECT nombre FROM trabajadores WHERE id = 'ana'")
                .unwrap(),
            "Futuro"
        );
        assert!(
            b.uno("SELECT updated_at FROM trabajadores WHERE id = 'ana'")
                .unwrap()
                .as_str()
                < "2100"
        );
    }

    #[test]
    fn borrado_en_el_archivo_y_editado_aqui_se_mantiene() {
        let cambios = format!(
            "UPDATE trabajadores SET deleted_at = '{F1}', updated_at = '{F1}' WHERE id = 'ana';"
        );
        let editada = format!(
            "UPDATE trabajadores SET nombre = 'Ana editada', updated_at = '{F2}' WHERE id = 'ana';"
        );
        let mut b = banco();
        b.archivo(&cambios);
        b.mia(&editada);
        let mut r = b.abrir();
        let c = caso(&r, "trabajadores", "ana");
        assert_eq!(
            (c.caso.tipo, &c.decision),
            (TipoCaso::BorradoVsEditado, &Decision::Mantener)
        );
        b.aplicar(&mut r);
        assert!(b.viva("trabajadores", "ana"));
        assert_eq!(
            b.uno("SELECT nombre FROM trabajadores WHERE id = 'ana'")
                .unwrap(),
            "Ana editada"
        );

        // la opción: borrar
        let mut b = banco();
        b.archivo(&cambios);
        b.mia(&editada);
        // lo que la apunta se resuelve aparte
        b.mia(&format!("UPDATE asignaciones SET deleted_at = '{F1}' WHERE trabajador_id = 'ana';
                        UPDATE actividad_roles SET deleted_at = '{F1}' WHERE trabajador_id = 'ana';"));
        let mut r = b.abrir();
        r.decidir("trabajadores", "ana", Eleccion::Borrar).unwrap();
        b.aplicar(&mut r);
        assert!(!b.viva("trabajadores", "ana"));
    }

    #[test]
    fn borrado_aqui_y_editado_en_el_archivo_revive_con_los_datos_del_archivo() {
        let mut b = banco();
        b.mia(&format!(
            "UPDATE conexiones SET deleted_at = '{F1}', updated_at = '{F1}' WHERE id = 'x-dentro';"
        ));
        b.archivo(&format!("UPDATE conexiones SET etiqueta = 'del archivo', updated_at = '{F2}' WHERE id = 'x-dentro';"));
        let mut r = b.abrir();
        let c = caso(&r, "conexiones", "x-dentro");
        assert_eq!(
            (c.caso.tipo, c.caso.borrado_aqui),
            (TipoCaso::BorradoVsEditado, true)
        );
        assert_eq!(c.decision, Decision::Mantener);
        assert_eq!(r.resumen().aplicara.revivir, 1);
        let hecho = b.aplicar(&mut r);
        assert!(b.viva("conexiones", "x-dentro"));
        assert_eq!(
            b.uno("SELECT etiqueta FROM conexiones WHERE id = 'x-dentro'")
                .unwrap(),
            "del archivo"
        );
        assert!(
            hecho
                .tablas
                .iter()
                .any(|t| t.tabla == "conexiones" && t.revividas == 1)
        );

        // la opción: que siga borrada
        let mut b = banco();
        b.mia(&format!(
            "UPDATE conexiones SET deleted_at = '{F1}', updated_at = '{F1}' WHERE id = 'x-dentro';"
        ));
        b.archivo(&format!("UPDATE conexiones SET etiqueta = 'del archivo', updated_at = '{F2}' WHERE id = 'x-dentro';"));
        let mut r = b.abrir();
        r.decidir("conexiones", "x-dentro", Eleccion::Borrar)
            .unwrap();
        b.aplicar(&mut r);
        assert!(!b.viva("conexiones", "x-dentro"));
    }

    #[test]
    fn una_fecha_futura_no_revive_nada_sola() {
        let mut b = banco();
        b.mia(&format!(
            "UPDATE conexiones SET deleted_at = '{F1}', updated_at = '{F1}' WHERE id = 'x-dentro';"
        ));
        b.archivo(&format!(
            "UPDATE conexiones SET updated_at = '{FUTURA}' WHERE id = 'x-dentro';"
        ));
        let mut r = b.abrir();
        let c = caso(&r, "conexiones", "x-dentro");
        assert!(c.caso.dudosa);
        assert_eq!(
            (c.caso.tipo, &c.decision),
            (TipoCaso::BorradoVsEditado, &Decision::Borrar)
        );
        b.aplicar(&mut r);
        assert!(!b.viva("conexiones", "x-dentro"));
    }

    #[test]
    fn borrado_sin_conflicto_se_aplica_y_se_puede_revertir() {
        // borrada en el archivo, sin cambios aquí
        let cambios = format!(
            "UPDATE conexiones SET deleted_at = '{F1}', updated_at = '{F1}' WHERE id = 'x-dentro';"
        );
        let mut b = banco();
        b.archivo(&cambios);
        let mut r = b.abrir();
        let c = caso(&r, "conexiones", "x-dentro");
        assert_eq!(
            (c.caso.tipo, &c.decision),
            (TipoCaso::BorradoSinConflicto, &Decision::Borrar)
        );
        assert_eq!(r.resumen().aplicara.borrar, 1);
        b.aplicar(&mut r);
        assert!(!b.viva("conexiones", "x-dentro"));
        assert_eq!(
            b.uno("SELECT deleted_at FROM conexiones WHERE id = 'x-dentro'")
                .unwrap(),
            F1
        );

        let mut b = banco();
        b.archivo(&cambios);
        let mut r = b.abrir();
        r.decidir("conexiones", "x-dentro", Eleccion::Mantener)
            .unwrap();
        b.aplicar(&mut r);
        assert!(b.viva("conexiones", "x-dentro"));

        // borrada aquí, sin cambios en el archivo: sigue borrada, y revertir la revive
        let aqui = format!(
            "UPDATE conexiones SET deleted_at = '{F1}', updated_at = '{F1}' WHERE id = 'x-dentro';"
        );
        let mut b = banco();
        b.mia(&aqui);
        let mut r = b.abrir();
        let c = caso(&r, "conexiones", "x-dentro");
        assert_eq!(
            (c.caso.tipo, c.caso.borrado_aqui),
            (TipoCaso::BorradoSinConflicto, true)
        );
        assert_eq!(c.decision, Decision::Borrar);
        assert_eq!(r.resumen().aplicara.borrar, 0);
        b.aplicar(&mut r);
        assert!(!b.viva("conexiones", "x-dentro"));

        let mut b = banco();
        b.mia(&aqui);
        let mut r = b.abrir();
        r.decidir("conexiones", "x-dentro", Eleccion::Mantener)
            .unwrap();
        b.aplicar(&mut r);
        assert!(b.viva("conexiones", "x-dentro"));
    }

    #[test]
    fn un_archivo_que_borra_todo_con_fechas_absurdas_no_borra_nada_por_defecto() {
        for fecha in [FUTURA, "x", ""] {
            let mut b = banco();
            b.archivo(&format!(
                "UPDATE trabajadores SET deleted_at = '{fecha}' WHERE deleted_at IS NULL;"
            ));
            let mut r = b.abrir();
            let resumen = r.resumen();
            assert_eq!(resumen.aplicara.borrar, 0, "{fecha}");
            assert!(resumen.dudosas >= 3, "{fecha}");
            b.aplicar(&mut r);
            assert!(b.viva("trabajadores", "ana"), "{fecha}");
        }
    }

    fn con_duplicado(b: &mut Banco) {
        b.mia(&format!(
            "INSERT INTO trabajadores (id, nombre, correo, created_at, updated_at)
               VALUES ('de-aqui', 'Eva de aquí', 'eva@x.cl', '{F0}', '{F0}');"
        ));
        b.archivo(&format!(
            "INSERT INTO trabajadores (id, nombre, correo, telefono, created_at, updated_at)
               VALUES ('otra-eva', 'Eva del archivo', ' EVA@x.cl ', '999', '{F1}', '{F1}');
             UPDATE asignaciones SET trabajador_id = 'otra-eva', updated_at = '{F1}' WHERE id = 'as-ana-antes';"
        ));
    }

    #[test]
    fn un_duplicado_de_persona_bloquea_hasta_decidir() {
        let mut b = banco();
        con_duplicado(&mut b);
        let mut r = b.abrir();
        assert_eq!(
            caso(&r, "trabajadores", "otra-eva").caso.tipo,
            TipoCaso::DuplicadoPersona
        );
        let resumen = r.resumen();
        assert_eq!(resumen.bloqueos.duplicado, 1);
        assert_eq!(resumen.bloqueos.total, 1);
        let antes = b.revision_datos();
        assert_eq!(b.intentar(&mut r).unwrap_err().codigo, "bloqueada");
        assert_eq!(b.revision_datos(), antes);
        assert!(!b.hay("trabajadores", "otra-eva"));
        assert_eq!(b.respaldos(), 0, "lo que no se aplica no deja respaldo");
    }

    #[test]
    fn unir_con_mis_datos_reasigna_lo_suyo() {
        let mut b = banco();
        con_duplicado(&mut b);
        let mut r = b.abrir();
        r.decidir("trabajadores", "otra-eva", Eleccion::UnirMio)
            .unwrap();
        b.aplicar(&mut r);
        assert!(!b.hay("trabajadores", "otra-eva"));
        assert_eq!(
            b.uno("SELECT nombre FROM trabajadores WHERE id = 'de-aqui'")
                .unwrap(),
            "Eva de aquí"
        );
        assert_eq!(
            b.uno("SELECT trabajador_id FROM asignaciones WHERE id = 'as-ana-antes'")
                .unwrap(),
            "de-aqui"
        );
    }

    #[test]
    fn unir_con_los_datos_del_archivo_conserva_la_ficha_de_aqui() {
        let mut b = banco();
        con_duplicado(&mut b);
        let mut r = b.abrir();
        r.decidir("trabajadores", "otra-eva", Eleccion::UnirArchivo)
            .unwrap();
        b.aplicar(&mut r);
        assert!(!b.hay("trabajadores", "otra-eva"));
        assert_eq!(
            b.uno("SELECT nombre FROM trabajadores WHERE id = 'de-aqui'")
                .unwrap(),
            "Eva del archivo"
        );
        assert_eq!(
            b.uno("SELECT telefono FROM trabajadores WHERE id = 'de-aqui'")
                .unwrap(),
            "999"
        );
        assert_eq!(
            b.uno("SELECT trabajador_id FROM asignaciones WHERE id = 'as-ana-antes'")
                .unwrap(),
            "de-aqui"
        );
    }

    #[test]
    fn editar_el_correo_la_deja_entrar_como_otra_persona() {
        let mut b = banco();
        con_duplicado(&mut b);
        let mut r = b.abrir();
        r.decidir(
            "trabajadores",
            "otra-eva",
            Eleccion::EditarCorreo {
                correo: "  eva2@x.cl ".into(),
            },
        )
        .unwrap();
        b.aplicar(&mut r);
        assert_eq!(
            b.uno("SELECT correo FROM trabajadores WHERE id = 'otra-eva'")
                .unwrap(),
            "eva2@x.cl"
        );
        assert_eq!(
            b.uno("SELECT correo FROM trabajadores WHERE id = 'de-aqui'")
                .unwrap(),
            "eva@x.cl"
        );
    }

    #[test]
    fn editar_el_correo_por_otro_repetido_sigue_bloqueado() {
        let mut b = banco();
        con_duplicado(&mut b);
        let mut r = b.abrir();
        r.decidir(
            "trabajadores",
            "otra-eva",
            Eleccion::EditarCorreo {
                correo: "BRUNO@x.cl".into(),
            },
        )
        .unwrap();
        b.verificar(&mut r);
        let resumen = r.resumen();
        assert_eq!(resumen.bloqueos.duplicado, 0);
        assert_eq!(resumen.bloqueos.unica, 1);
        // lo que apunta a ella no suma otro bloqueo
        assert_eq!(resumen.bloqueos.referencia, 0);
        assert_eq!(b.intentar(&mut r).unwrap_err().codigo, "bloqueada");
        assert_eq!(
            r.decidir(
                "trabajadores",
                "otra-eva",
                Eleccion::EditarCorreo {
                    correo: "   ".into()
                }
            )
            .unwrap_err()
            .codigo,
            "correo_no_valido"
        );
    }

    fn con_otro_titular(b: &mut Banco) {
        // otro titular vigente para el mismo puesto, con otro id
        b.archivo(&format!(
            "UPDATE asignaciones SET deleted_at = '{F1}', updated_at = '{F1}' WHERE id = 'as-rama';
             INSERT INTO asignaciones (id, puesto_id, trabajador_id, tipo, desde, created_at, updated_at)
               VALUES ('as-nueva', 'p-rama', 'bruno', 'titular', '2024-01-01', '{F1}', '{F1}');"
        ));
    }

    #[test]
    fn otra_regla_unica_bloquea_y_se_elige_cual_conservar() {
        let mut b = banco();
        con_otro_titular(&mut b);
        let mut r = b.abrir();
        // sin conflicto en su borrado: quedaría libre el puesto. Se mantiene la mía para que choque.
        r.decidir("asignaciones", "as-rama", Eleccion::Mantener)
            .unwrap();
        b.verificar(&mut r);
        assert_eq!(r.resumen().bloqueos.unica, 1);
        let bloqueo = r.bloqueos[0].clone();
        assert_eq!(
            (bloqueo.tabla, bloqueo.id.as_str()),
            ("asignaciones", "as-nueva")
        );
        assert_eq!(bloqueo.otro.as_deref(), Some("as-rama"));
        assert_eq!(b.intentar(&mut r).unwrap_err().codigo, "bloqueada");

        // conservar la mía: la del archivo no entra
        r.decidir("asignaciones", "as-nueva", Eleccion::ConservarMio)
            .unwrap();
        b.aplicar(&mut r);
        assert!(!b.hay("asignaciones", "as-nueva"));
        assert_eq!(
            b.uno("SELECT trabajador_id FROM asignaciones WHERE id = 'as-rama' AND hasta IS NULL")
                .unwrap(),
            "ana"
        );
    }

    #[test]
    fn conservar_la_del_archivo_cierra_la_asignacion_de_aqui_sin_borrarla() {
        let mut b = banco();
        con_otro_titular(&mut b);
        let mut r = b.abrir();
        r.decidir("asignaciones", "as-rama", Eleccion::Mantener)
            .unwrap();
        r.decidir("asignaciones", "as-nueva", Eleccion::ConservarArchivo)
            .unwrap();
        b.aplicar(&mut r);
        assert_eq!(b.uno("SELECT trabajador_id FROM asignaciones WHERE puesto_id = 'p-rama' AND hasta IS NULL AND deleted_at IS NULL AND tipo = 'titular'").unwrap(), "bruno");
        assert_eq!(
            b.uno("SELECT hasta FROM asignaciones WHERE id = 'as-rama'")
                .unwrap(),
            "2024-01-01"
        );
        assert!(b.viva("asignaciones", "as-rama"));
    }

    #[test]
    fn si_el_borrado_deja_libre_el_puesto_no_hay_choque() {
        let mut b = banco();
        con_otro_titular(&mut b);
        // la preselección borra la mía, y el reintento deja entrar la nueva aunque fueran en otro orden
        let mut r = b.abrir();
        assert_eq!(r.resumen().bloqueos.unica, 0);
        b.aplicar(&mut r);
        assert!(b.viva("asignaciones", "as-nueva"));
        assert!(!b.viva("asignaciones", "as-rama"));
    }

    #[test]
    fn dos_aprobadores_en_una_actividad_bloquean() {
        let mut b = banco();
        b.mia(&format!(
            "INSERT INTO actividad_roles (id, actividad_id, trabajador_id, rol, created_at, updated_at)
               VALUES ('rol-a-mio', 'ac-a', 'bruno', 'A', '{F0}', '{F0}');"
        ));
        b.archivo(&format!(
            "INSERT INTO actividad_roles (id, actividad_id, trabajador_id, rol, created_at, updated_at)
               VALUES ('rol-a-arch', 'ac-a', 'yanoesta', 'A', '{F1}', '{F1}');"
        ));
        let mut r = b.abrir();
        assert_eq!(r.resumen().bloqueos.unica, 1);
        assert_eq!(r.bloqueos[0].otro.as_deref(), Some("rol-a-mio"));
        r.decidir("actividad_roles", "rol-a-arch", Eleccion::ConservarArchivo)
            .unwrap();
        b.aplicar(&mut r);
        assert!(!b.viva("actividad_roles", "rol-a-mio"));
        assert!(b.viva("actividad_roles", "rol-a-arch"));
    }

    #[test]
    fn un_valor_renombrado_al_nombre_de_otro_bloquea() {
        let mut b = banco();
        b.mia(&format!("INSERT INTO cargos (id, nombre, created_at, updated_at) VALUES ('cargo-c', 'Especial', '{F0}', '{F0}');"));
        b.archivo(&format!(
            "UPDATE cargos SET nombre = 'ESPECIAL ', updated_at = '{F1}' WHERE id = 'cargo-a';"
        ));
        let mut r = b.abrir();
        assert_eq!(r.resumen().bloqueos.unica, 1);
        assert_eq!(r.bloqueos[0].otro.as_deref(), Some("cargo-c"));
        // quedarse con el nombre de aquí lo resuelve
        r.decidir("cargos", "cargo-a", eleccion_campos(&[]))
            .unwrap();
        b.verificar(&mut r);
        assert_eq!(r.resumen().bloqueos.total, 0);
    }

    #[test]
    fn una_cadena_de_renombres_entra_aunque_llegue_en_otro_orden() {
        let mut b = banco();
        // A toma el nombre que B deja libre; `cargo-a` se procesa antes que `cargo-b`
        b.archivo(&format!(
            "UPDATE cargos SET nombre = 'Otro nombre', updated_at = '{F1}' WHERE id = 'cargo-b';
             UPDATE cargos SET nombre = 'CargoFuera', updated_at = '{F1}' WHERE id = 'cargo-a';"
        ));
        let mut r = b.abrir();
        assert_eq!(r.resumen().bloqueos.total, 0);
        b.aplicar(&mut r);
        assert_eq!(
            b.uno("SELECT nombre FROM cargos WHERE id = 'cargo-a'")
                .unwrap(),
            "CargoFuera"
        );
    }

    #[test]
    fn dos_valores_que_se_cambian_el_nombre_quedan_como_bloqueo() {
        let mut b = banco();
        b.archivo(&format!(
            "UPDATE cargos SET nombre = 'Temporal' WHERE id = 'cargo-b';
             UPDATE cargos SET nombre = 'CargoFuera', updated_at = '{F1}' WHERE id = 'cargo-a';
             UPDATE cargos SET nombre = 'Jefe', updated_at = '{F1}' WHERE id = 'cargo-b';"
        ));
        let mut r = b.abrir();
        // shortcut conocido: la regla única se revisa al escribir, y no hay orden que los deje pasar
        assert_eq!(r.resumen().bloqueos.unica, 2);
        r.decidir("cargos", "cargo-a", eleccion_campos(&[]))
            .unwrap();
        r.decidir("cargos", "cargo-b", eleccion_campos(&[]))
            .unwrap();
        b.aplicar(&mut r);
        assert_eq!(
            b.uno("SELECT nombre FROM cargos WHERE id = 'cargo-a'")
                .unwrap(),
            "Jefe"
        );
    }

    #[test]
    fn una_mezcla_de_campos_que_la_base_no_acepta_bloquea() {
        let mut b = banco();
        // en el archivo: desde 2021, hasta 2022. Aquí: desde 2023, hasta 2024. Mezcladas, el fin queda antes del inicio.
        b.mia(&format!("UPDATE asignaciones SET desde = '2023-01-01', hasta = '2024-01-01', updated_at = '{F0}' WHERE id = 'as-ana-antes';"));
        b.archivo(&format!("UPDATE asignaciones SET desde = '2021-01-01', hasta = '2022-01-01', updated_at = '{F1}' WHERE id = 'as-ana-antes';"));
        let mut r = b.abrir();
        assert_eq!(r.resumen().bloqueos.total, 0);
        r.decidir("asignaciones", "as-ana-antes", eleccion_campos(&["hasta"]))
            .unwrap();
        b.verificar(&mut r);
        assert_eq!(r.resumen().bloqueos.regla, 1);
        assert_eq!(b.intentar(&mut r).unwrap_err().codigo, "bloqueada");
        r.decidir(
            "asignaciones",
            "as-ana-antes",
            eleccion_campos(&["desde", "hasta"]),
        )
        .unwrap();
        b.aplicar(&mut r);
        assert_eq!(
            b.uno("SELECT hasta FROM asignaciones WHERE id = 'as-ana-antes'")
                .unwrap(),
            "2022-01-01"
        );
    }

    fn con_rama_nueva(b: &mut Banco) {
        b.archivo(&format!(
            "INSERT INTO unidades (id, tipo_id, nombre, parent_id, created_at, updated_at) VALUES
               ('u-nueva', '{TIPO}', 'Nueva', 'raiz', '{F1}', '{F1}'),
               ('u-hija', '{TIPO}', 'Hija nueva', 'u-nueva', '{F1}', '{F1}');
             INSERT INTO puestos (id, unidad_id, cargo_id, created_at, updated_at)
               VALUES ('p-nuevo', 'u-nueva', 'cargo-a', '{F1}', '{F1}');
             INSERT INTO asignaciones (id, puesto_id, trabajador_id, tipo, desde, created_at, updated_at)
               VALUES ('as-nueva', 'p-nuevo', 'bruno', 'titular', '2024-01-01', '{F1}', '{F1}');"
        ));
    }

    #[test]
    fn referencia_rota_bloquea_y_se_reasigna() {
        let mut b = banco();
        con_rama_nueva(&mut b);
        let mut r = b.abrir();
        assert_eq!(r.resumen().bloqueos.total, 0);
        r.decidir("unidades", "u-nueva", Eleccion::Omitir).unwrap();
        b.verificar(&mut r);
        let resumen = r.resumen();
        assert_eq!(resumen.bloqueos.referencia, 2, "{:?}", r.bloqueos);
        let del_puesto = r.bloqueos.iter().find(|x| x.tabla == "puestos").unwrap();
        assert!(!del_puesto.vaciable);
        assert!(
            r.bloqueos
                .iter()
                .find(|x| x.tabla == "unidades")
                .unwrap()
                .vaciable
        );
        assert_eq!(b.intentar(&mut r).unwrap_err().codigo, "bloqueada");

        // el puesto a otra unidad y la hija como raíz
        r.decidir(
            "puestos",
            "p-nuevo",
            Eleccion::Reasignar {
                columna: "unidad_id".into(),
                a: "otra".into(),
            },
        )
        .unwrap();
        r.decidir(
            "unidades",
            "u-hija",
            Eleccion::Vaciar {
                columna: "parent_id".into(),
            },
        )
        .unwrap();
        b.aplicar(&mut r);
        assert!(!b.hay("unidades", "u-nueva"));
        assert_eq!(
            b.uno("SELECT unidad_id FROM puestos WHERE id = 'p-nuevo'")
                .unwrap(),
            "otra"
        );
        assert_eq!(
            b.uno("SELECT parent_id FROM unidades WHERE id = 'u-hija'"),
            None
        );
    }

    #[test]
    fn descartar_una_fila_rota_arrastra_lo_que_depende_de_ella_como_otro_bloqueo() {
        let mut b = banco();
        con_rama_nueva(&mut b);
        let mut r = b.abrir();
        r.decidir("unidades", "u-nueva", Eleccion::Omitir).unwrap();
        r.decidir(
            "puestos",
            "p-nuevo",
            Eleccion::Descartar {
                columna: "unidad_id".into(),
            },
        )
        .unwrap();
        r.decidir(
            "unidades",
            "u-hija",
            Eleccion::Descartar {
                columna: "parent_id".into(),
            },
        )
        .unwrap();
        b.verificar(&mut r);
        let asignacion = r
            .bloqueos
            .iter()
            .find(|x| x.tabla == "asignaciones")
            .unwrap();
        assert_eq!(asignacion.columna.as_deref(), Some("puesto_id"));
        r.decidir(
            "asignaciones",
            "as-nueva",
            Eleccion::Descartar {
                columna: "puesto_id".into(),
            },
        )
        .unwrap();
        b.aplicar(&mut r);
        for (t, id) in [
            ("puestos", "p-nuevo"),
            ("unidades", "u-hija"),
            ("asignaciones", "as-nueva"),
        ] {
            assert!(
                !b.hay(t, id),
                "lo descartado que venía del archivo no deja rastro: {id}"
            );
        }
    }

    #[test]
    fn resolver_todas_deja_vacio_lo_que_se_puede_y_saca_lo_demas() {
        let mut b = banco();
        con_rama_nueva(&mut b);
        let mut r = b.abrir();
        r.decidir("unidades", "u-nueva", Eleccion::Omitir).unwrap();
        r.masivo(Masivo {
            accion: AccionMasiva::ResolverRotas,
            tipo: None,
        });
        b.aplicar(&mut r);
        assert_eq!(
            b.uno("SELECT parent_id FROM unidades WHERE id = 'u-hija'"),
            None
        );
        assert!(!b.hay("puestos", "p-nuevo"));
        assert!(!b.hay("asignaciones", "as-nueva"));
    }

    #[test]
    fn lo_de_aqui_que_quedaria_apuntando_a_algo_borrado_tambien_bloquea() {
        let mut b = banco();
        // en el archivo se eliminó una unidad; aquí tiene un puesto vivo que el archivo no conoce
        b.mia(&format!(
            "INSERT INTO puestos (id, unidad_id, cargo_id, created_at, updated_at) VALUES ('p-local', 'hija', 'cargo-b', '{F0}', '{F0}');"
        ));
        b.archivo(&format!(
            "UPDATE unidades SET deleted_at = '{F1}', updated_at = '{F1}' WHERE id = 'hija';
             UPDATE puestos SET deleted_at = '{F1}', updated_at = '{F1}' WHERE id = 'p-hija';
             UPDATE asignaciones SET deleted_at = '{F1}', updated_at = '{F1}' WHERE puesto_id = 'p-hija';
             UPDATE conexiones SET deleted_at = '{F1}', updated_at = '{F1}' WHERE origen_id = 'hija' OR destino_id = 'hija';"
        ));
        let mut r = b.abrir();
        let local = r
            .bloqueos
            .iter()
            .find(|x| x.id == "p-local")
            .expect("bloqueo del puesto de aquí");
        assert_eq!(local.tipo, TipoBloqueo::Referencia);
        assert_eq!(b.intentar(&mut r).unwrap_err().codigo, "bloqueada");
        // la salida: no aplicar ese borrado
        r.decidir("unidades", "hija", Eleccion::Mantener).unwrap();
        b.aplicar(&mut r);
        assert!(b.viva("unidades", "hija"));
    }

    #[test]
    fn una_referencia_rota_que_ya_estaba_aqui_no_detiene_la_fusion() {
        let mut b = banco();
        b.mia(&format!(
            "UPDATE unidades SET deleted_at = '{F0}' WHERE id = 'otra';"
        ));
        let mut r = b.abrir();
        // el archivo la trae viva y sin cambios después: sigue borrada, y lo de aquí que le apuntaba ya estaba así
        assert_eq!(r.resumen().bloqueos.referencia, 0, "{:?}", r.bloqueos);
        b.aplicar(&mut r);
    }

    fn con_ciclo(b: &mut Banco) {
        // en el archivo, «rama» pasa a colgar de «hija», que sube a «raiz». Tomar solo lo primero cierra el círculo.
        b.archivo(&format!(
            "UPDATE unidades SET parent_id = 'raiz', updated_at = '{F1}' WHERE id = 'hija';
             UPDATE unidades SET parent_id = 'hija', updated_at = '{F1}' WHERE id = 'rama';"
        ));
    }

    #[test]
    fn un_ciclo_bloquea_y_se_elige_que_superior_cambiar() {
        let mut b = banco();
        con_ciclo(&mut b);
        let mut r = b.abrir();
        // todo del archivo no hace ciclo
        assert_eq!(r.resumen().bloqueos.ciclo, 0);
        r.decidir("unidades", "hija", eleccion_campos(&[])).unwrap();
        b.verificar(&mut r);
        assert_eq!(r.resumen().bloqueos.ciclo, 2);
        assert!(
            r.bloqueos
                .iter()
                .all(|x| x.tabla == "unidades" && x.vaciable)
        );
        assert_eq!(b.intentar(&mut r).unwrap_err().codigo, "bloqueada");
        // la salida: cambiar el superior de una de las dos
        r.decidir(
            "unidades",
            "rama",
            Eleccion::Reasignar {
                columna: "parent_id".into(),
                a: "otra".into(),
            },
        )
        .unwrap();
        b.aplicar(&mut r);
        assert_eq!(
            b.uno("SELECT parent_id FROM unidades WHERE id = 'rama'")
                .unwrap(),
            "otra"
        );
        assert!(!validar::hay_ciclo(&b.local).unwrap());
    }

    #[test]
    fn un_valor_de_mantenedor_con_el_mismo_nombre_se_une_y_no_es_una_diferencia() {
        let mut b = banco();
        // el archivo llama distinto al mismo cargo: su id no está aquí, su nombre sí
        b.archivo(&format!(
            "INSERT INTO cargos (id, nombre, created_at, updated_at) VALUES ('cargo-otro', 'jéfe', '{F0}', '{F0}');
             UPDATE puestos SET cargo_id = 'cargo-otro' WHERE id = 'p-rama';"
        ));
        b.mia("UPDATE cargos SET nombre = 'Jefe' WHERE id = 'cargo-a';");
        b.archivo("UPDATE cargos SET deleted_at = NULL WHERE id = 'cargo-a';");
        let mut r = b.abrir();
        assert_eq!(caso(&r, "cargos", "cargo-otro").caso.tipo, TipoCaso::Union);
        assert!(
            r.indice("puestos", "p-rama").is_err(),
            "el mismo cargo no es una diferencia"
        );
        assert_eq!(r.resumen().aplicara.unir, 1);
        b.aplicar(&mut r);
        assert!(!b.hay("cargos", "cargo-otro"));
    }

    #[test]
    fn la_misma_etiqueta_en_la_misma_unidad_con_otro_id_no_molesta() {
        let mut b = banco();
        b.archivo(&format!(
            "UPDATE unidad_etiquetas SET deleted_at = '{F0}' WHERE id = 'ue-a';
             INSERT INTO unidad_etiquetas (id, unidad_id, etiqueta_id, created_at, updated_at) VALUES ('ue-otra', 'rama', 'et-a', '{F1}', '{F1}');"
        ));
        let mut r = b.abrir();
        // se mantiene la de aquí, y la otra es la misma
        r.decidir("unidad_etiquetas", "ue-a", Eleccion::Mantener)
            .unwrap();
        b.verificar(&mut r);
        assert_eq!(r.resumen().bloqueos.total, 0, "{:?}", r.bloqueos);
        b.aplicar(&mut r);
        assert!(!b.hay("unidad_etiquetas", "ue-otra"));
    }

    // --- Campos sensibles y lo que llega a la interfaz ---

    #[test]
    fn la_foto_se_compara_sin_mostrar_sus_bytes() {
        let mut b = banco();
        b.archivo(&format!(
            "UPDATE trabajadores SET foto_png = 'FOTOSECRETA', updated_at = '{F1}' WHERE id = 'ana';"
        ));
        let r = b.abrir();
        let imp = b.i.solo_lectura().unwrap();
        let d = r.detalle(&b.local, &imp, "trabajadores", "ana").unwrap();
        let campo = d.campos.iter().find(|c| c.columna == "foto_png").unwrap();
        assert_eq!(campo.archivo.oculto, Some("FOTOSECRETA".len()));
        assert_eq!(campo.archivo.texto, None);
        assert!(!serde_json::to_string(&d).unwrap().contains("FOTOSECRETA"));
    }

    #[test]
    fn una_referencia_se_muestra_por_su_nombre_nunca_por_su_id() {
        let mut b = banco();
        b.archivo(&format!(
            "UPDATE trabajadores SET sede_id = 'sede-b', updated_at = '{F1}' WHERE id = 'ana';"
        ));
        let r = b.abrir();
        let imp = b.i.solo_lectura().unwrap();
        let d = r.detalle(&b.local, &imp, "trabajadores", "ana").unwrap();
        assert_eq!(d.campos[0].mio.texto.as_deref(), Some("Sede A"));
        assert_eq!(d.campos[0].archivo.texto.as_deref(), Some("SedeFuera"));
    }

    #[test]
    fn la_pagina_corta_y_sabe_cuantos_hay() {
        let mut b = banco();
        let mut sql = String::new();
        for n in 0..450 {
            sql += &format!(
                "INSERT INTO trabajadores (id, nombre, created_at, updated_at) VALUES ('n{n:04}', 'N{n}', '{F1}', '{F1}');"
            );
        }
        b.archivo(&sql);
        let r = b.abrir();
        let imp = b.i.solo_lectura().unwrap();
        let filtro = |desde, cuantos, tabla: Option<&str>| Filtro {
            tipo: Some(TipoCaso::Nuevo),
            tabla: tabla.map(str::to_string),
            solo_dudosas: false,
            desde,
            cuantos,
        };
        let p = r.pagina(&b.local, &imp, &filtro(0, 100, None)).unwrap();
        assert_eq!((p.filas.len(), p.total), (100, 450));
        assert_eq!(p.filas[0].nombre, "N0");
        let p = r.pagina(&b.local, &imp, &filtro(440, 100, None)).unwrap();
        assert_eq!(p.filas.len(), 10);
        // una página no puede ser más grande que el tope, aunque se pida
        let p = r
            .pagina(&b.local, &imp, &filtro(0, 1_000_000, None))
            .unwrap();
        assert_eq!(p.filas.len(), MAX_PAGINA);
        let p = r
            .pagina(&b.local, &imp, &filtro(0, 10, Some("unidades")))
            .unwrap();
        assert_eq!(p.total, 0);
    }

    // --- Archivo hostil ---

    #[test]
    fn un_archivo_hostil_no_rompe_nada() {
        let mut b = banco();
        let enorme = "N".repeat(1024);
        let texto = "T".repeat(200 * 1024);
        b.archivo(&format!(
            "UPDATE trabajadores SET nombre = '{enorme}', notas = '{texto}', updated_at = '9999-99-99T99:99:99.999Z' WHERE id = 'ana';
             UPDATE unidades SET parent_id = 'raiz', updated_at = '{F1}' WHERE id = 'hija';
             UPDATE unidades SET parent_id = 'hija', updated_at = 'ayer' WHERE id = 'rama';
             INSERT INTO trabajadores (id, nombre, created_at, updated_at) VALUES ('h1', '{enorme}', '<script>', '{FUTURA}');
             INSERT INTO asignaciones (id, puesto_id, trabajador_id, tipo, desde, created_at, updated_at)
               VALUES ('as-h', 'p-fuera', 'muerta', 'reemplazo', '2020-01-01', 'x', 'x');"
        ));
        validar::revisar(b.i.temporal.ruta(), MIGRACIONES).unwrap();
        let mut r = b.abrir();
        let imp = b.i.solo_lectura().unwrap();
        // lo que se muestra está cortado
        let p = r
            .pagina(
                &b.local,
                &imp,
                &Filtro {
                    tipo: None,
                    tabla: None,
                    solo_dudosas: true,
                    desde: 0,
                    cuantos: 50,
                },
            )
            .unwrap();
        assert!(p.filas.iter().all(|f| f.nombre.chars().count() <= 200));
        let d = r.detalle(&b.local, &imp, "trabajadores", "ana").unwrap();
        let notas = d.campos.iter().find(|c| c.columna == "notas").unwrap();
        assert!(notas.archivo.cortado);
        assert_eq!(
            notas.archivo.texto.as_ref().unwrap().chars().count(),
            MAX_TEXTO
        );
        assert_eq!(
            d.actualizada_archivo, None,
            "lo que no es una fecha no llega a la interfaz"
        );
        drop(imp);

        // la asignación a una persona eliminada aquí y en el archivo es una referencia rota
        assert!(
            r.bloqueos
                .iter()
                .any(|x| x.id == "as-h" && x.tipo == TipoBloqueo::Referencia)
        );
        r.decidir(
            "asignaciones",
            "as-h",
            Eleccion::Descartar {
                columna: "trabajador_id".into(),
            },
        )
        .unwrap();
        // aceptar lo preseleccionado no da con el círculo: la fecha rara no gana
        r.masivo(Masivo {
            accion: AccionMasiva::Recientes,
            tipo: None,
        });
        b.verificar(&mut r);
        assert_eq!(r.resumen().bloqueos.total, 0, "{:?}", r.bloqueos);
        b.aplicar(&mut r);
        // las fechas de lo que entró son las de ahora, no las del archivo
        let fecha = b
            .uno("SELECT updated_at FROM trabajadores WHERE id = 'h1'")
            .unwrap();
        assert!(fecha_valida(&fecha) && fecha.as_str() < "2100");
        assert!(fecha_valida(
            &b.uno("SELECT created_at FROM trabajadores WHERE id = 'h1'")
                .unwrap()
        ));
        assert_eq!(
            b.uno("SELECT nombre FROM trabajadores WHERE id = 'ana'")
                .unwrap(),
            "Ana",
            "sin tocar"
        );
        assert!(!validar::hay_ciclo(&b.local).unwrap());
    }

    #[test]
    fn un_archivo_con_campos_de_identidad_raros_no_llega_al_sql() {
        let mut b = banco();
        let mut r = b.abrir();
        for mala in ["trabajadores; DROP TABLE meta", "nadie", ""] {
            let e = r.decidir(mala, "x", Eleccion::Agregar).unwrap_err();
            assert_eq!(e.codigo, "desconocido", "{mala}");
        }
        let e = r
            .decidir(
                "trabajadores",
                "ana",
                Eleccion::Vaciar {
                    columna: "nombre = 'x'; --".into(),
                },
            )
            .unwrap_err();
        assert_eq!(e.codigo, "desconocido");
        let e = r
            .decidir("trabajadores", "nadie", Eleccion::Agregar)
            .unwrap_err();
        assert_eq!(e.codigo, "desconocido");
        // una decisión que no es de ese caso tampoco
        let mut b2 = banco();
        b2.archivo(&format!(
            "UPDATE trabajadores SET nombre = 'X', updated_at = '{F1}' WHERE id = 'ana';"
        ));
        let mut r2 = b2.abrir();
        assert_eq!(
            r2.decidir("trabajadores", "ana", Eleccion::Borrar)
                .unwrap_err()
                .codigo,
            "desconocido"
        );
        assert_eq!(
            r2.decidir("trabajadores", "ana", eleccion_campos(&["correo"]))
                .unwrap_err()
                .codigo,
            "desconocido",
            "un campo que no es distinto"
        );
        assert_eq!(
            r2.decidir("trabajadores", "ana", eleccion_campos(&["inventada"]))
                .unwrap_err()
                .codigo,
            "desconocido"
        );
    }

    #[test]
    fn un_padre_hostil_en_las_raices_de_una_parcial_no_cierra_un_circulo_sin_avisar() {
        let raices = vec!["rama".to_string()];
        let mut b = banco_con(Some(&raices));
        // la raíz dice colgar de su propia hija
        b.archivo(&format!(
            "UPDATE meta SET valor = '[{{\"id\":\"rama\",\"padre\":\"hija\"}}]' WHERE clave = 'raices';
             UPDATE unidades SET nombre = 'Rama 2', updated_at = '{F1}' WHERE id = 'rama';"
        ));
        let mut r = b.abrir();
        assert!(r.resumen().bloqueos.ciclo > 0, "{:?}", r.bloqueos);
        assert_eq!(b.intentar(&mut r).unwrap_err().codigo, "bloqueada");
        r.masivo(Masivo {
            accion: AccionMasiva::TodoMio,
            tipo: None,
        });
        b.aplicar(&mut r);
        assert!(!validar::hay_ciclo(&b.local).unwrap());
    }

    // --- Archivo parcial ---

    #[test]
    fn en_una_parcial_lo_cortado_no_es_una_diferencia() {
        let raices = vec!["rama".to_string()];
        let mut b = banco_con(Some(&raices));
        let mut r = b.abrir();
        // sin parent_id ni jefatura que cuenten como cambio, ni lo que no viajó como borrado
        assert!(
            r.casos.is_empty(),
            "{:?}",
            r.casos
                .iter()
                .map(|c| (&c.caso.tabla, &c.caso.id))
                .collect::<Vec<_>>()
        );
        b.aplicar(&mut r);
        assert_eq!(
            b.uno("SELECT parent_id FROM unidades WHERE id = 'rama'")
                .unwrap(),
            "raiz"
        );
        assert_eq!(
            b.uno("SELECT jefe_puesto_id FROM unidades WHERE id = 'rama'")
                .unwrap(),
            "p-fuera"
        );
        assert!(b.viva("trabajadores", "fuera"));
    }

    #[test]
    fn una_rama_nueva_de_una_parcial_va_al_lugar_elegido() {
        let raices = vec!["rama".to_string()];
        let mut b = banco_con(Some(&raices));
        b.mia("DELETE FROM vistas; DELETE FROM subarboles_guardados; DELETE FROM actividad_roles; DELETE FROM actividades;
             DELETE FROM procesos; DELETE FROM unidad_etiquetas; DELETE FROM conexiones; DELETE FROM asignaciones;
             UPDATE unidades SET jefe_puesto_id = NULL; DELETE FROM puestos;
             UPDATE unidades SET parent_id = NULL WHERE id = 'otra';
             DELETE FROM unidades WHERE id IN ('rama', 'hija', 'borrada', 'raiz');
             DELETE FROM trabajadores WHERE id IN ('ana', 'bruno');");
        b.lugares.insert("rama".into(), Some("otra".into()));
        let mut r = b.abrir();
        b.aplicar(&mut r);
        assert_eq!(
            b.uno("SELECT parent_id FROM unidades WHERE id = 'rama'")
                .unwrap(),
            "otra"
        );
        assert_eq!(
            b.uno("SELECT parent_id FROM unidades WHERE id = 'hija'")
                .unwrap(),
            "rama"
        );
        assert!(b.viva("puestos", "p-rama"));
    }

    /// Una rama donde `ana` ya no ocupa nada: el archivo la trae resumida.
    fn con_resumida(b: &mut Banco) {
        b.mia(
            "UPDATE trabajadores SET telefono = '123', notas = 'mis notas', foto_png = 'FOTO', sede_id = 'sede-a',
               tipo_contrato_id = NULL, jornada_id = NULL WHERE id = 'ana';",
        );
        b.archivo(&format!(
            "UPDATE asignaciones SET hasta = '2021-01-01', updated_at = '{F0}' WHERE trabajador_id = 'ana';
             UPDATE trabajadores SET telefono = NULL, tipo_contrato_id = NULL, sede_id = NULL, jornada_id = NULL,
               foto_png = NULL, notas = NULL WHERE id = 'ana';"
        ));
    }

    fn datos_de_ana(b: &Banco) {
        assert_eq!(
            b.uno("SELECT telefono FROM trabajadores WHERE id = 'ana'")
                .unwrap(),
            "123"
        );
        assert_eq!(
            b.uno("SELECT notas FROM trabajadores WHERE id = 'ana'")
                .unwrap(),
            "mis notas"
        );
        assert_eq!(
            b.uno("SELECT foto_png FROM trabajadores WHERE id = 'ana'")
                .unwrap(),
            "FOTO"
        );
        assert_eq!(
            b.uno("SELECT sede_id FROM trabajadores WHERE id = 'ana'")
                .unwrap(),
            "sede-a"
        );
    }

    #[test]
    fn una_persona_resumida_no_vacia_los_datos_de_aqui() {
        let raices = vec!["rama".to_string()];
        let mut b = banco_con(Some(&raices));
        con_resumida(&mut b);
        let mut r = b.abrir();
        // lo que trae vacío no es una diferencia, por más que «lo mío» sea más antiguo
        assert!(
            r.indice("trabajadores", "ana").is_err(),
            "no se ofrece vaciar nada"
        );
        b.aplicar(&mut r);
        datos_de_ana(&b);

        // si además cambió el nombre, se decide solo el nombre
        let mut b = banco_con(Some(&raices));
        con_resumida(&mut b);
        b.archivo(&format!(
            "UPDATE trabajadores SET nombre = 'Ana 2', updated_at = '{F1}' WHERE id = 'ana';"
        ));
        let mut r = b.abrir();
        let c = caso(&r, "trabajadores", "ana");
        assert_eq!(
            r.nombres_mascara("trabajadores", c.caso.columnas),
            ["nombre"]
        );
        assert_eq!(r.eleccion(c), eleccion_campos(&["nombre"]));
        let imp = b.i.solo_lectura().unwrap();
        let d = r.detalle(&b.local, &imp, "trabajadores", "ana").unwrap();
        assert_eq!(
            d.campos.len(),
            1,
            "solo se muestra lo que de verdad difiere"
        );
        drop(imp);
        // ni pidiéndolo: esos campos no se pueden tomar del archivo
        assert_eq!(
            r.decidir("trabajadores", "ana", eleccion_campos(&["notas"]))
                .unwrap_err()
                .codigo,
            "desconocido"
        );
        r.masivo(Masivo {
            accion: AccionMasiva::TodoArchivo,
            tipo: None,
        });
        b.aplicar(&mut r);
        assert_eq!(
            b.uno("SELECT nombre FROM trabajadores WHERE id = 'ana'")
                .unwrap(),
            "Ana 2"
        );
        datos_de_ana(&b);
    }

    #[test]
    fn revivir_a_una_persona_resumida_conserva_sus_datos() {
        let raices = vec!["rama".to_string()];
        let mut b = banco_con(Some(&raices));
        con_resumida(&mut b);
        b.mia(&format!(
            "UPDATE trabajadores SET deleted_at = '{F0}' WHERE id = 'ana';"
        ));
        b.mia(&format!(
            "UPDATE asignaciones SET deleted_at = '{F0}' WHERE trabajador_id = 'ana';"
        ));
        b.mia(&format!(
            "UPDATE actividad_roles SET deleted_at = '{F0}' WHERE trabajador_id = 'ana';"
        ));
        b.archivo(&format!(
            "UPDATE trabajadores SET updated_at = '{F2}' WHERE id = 'ana';"
        ));
        let mut r = b.abrir();
        assert_eq!(caso(&r, "trabajadores", "ana").decision, Decision::Mantener);
        b.aplicar(&mut r);
        assert!(b.viva("trabajadores", "ana"));
        datos_de_ana(&b);
    }

    #[test]
    fn unir_a_una_persona_resumida_con_los_datos_del_archivo_no_vacia_nada() {
        let raices = vec!["rama".to_string()];
        let mut b = banco_con(Some(&raices));
        b.mia(&format!(
            "INSERT INTO trabajadores (id, nombre, correo, telefono, notas, created_at, updated_at)
               VALUES ('de-aqui', 'Eva de aquí', 'eva@x.cl', '555', 'notas de aquí', '{F0}', '{F0}');"
        ));
        b.archivo(&format!(
            "INSERT INTO trabajadores (id, nombre, correo, created_at, updated_at)
               VALUES ('resumida', 'Eva del archivo', 'EVA@x.cl', '{F1}', '{F1}');
             INSERT INTO asignaciones (id, puesto_id, trabajador_id, tipo, desde, hasta, created_at, updated_at)
               VALUES ('as-vieja', 'p-hija', 'resumida', 'titular', '2001-01-01', '2002-01-01', '{F1}', '{F1}');"
        ));
        let mut r = b.abrir();
        let imp = b.i.solo_lectura().unwrap();
        let d = r
            .detalle(&b.local, &imp, "trabajadores", "resumida")
            .unwrap();
        assert!(
            d.campos
                .iter()
                .all(|c| c.columna != "telefono" && c.columna != "notas"),
            "no se muestra como diferencia"
        );
        drop(imp);
        r.decidir("trabajadores", "resumida", Eleccion::UnirArchivo)
            .unwrap();
        b.aplicar(&mut r);
        assert_eq!(
            b.uno("SELECT nombre FROM trabajadores WHERE id = 'de-aqui'")
                .unwrap(),
            "Eva del archivo"
        );
        assert_eq!(
            b.uno("SELECT telefono FROM trabajadores WHERE id = 'de-aqui'")
                .unwrap(),
            "555"
        );
        assert_eq!(
            b.uno("SELECT notas FROM trabajadores WHERE id = 'de-aqui'")
                .unwrap(),
            "notas de aquí"
        );
        assert_eq!(
            b.uno("SELECT trabajador_id FROM asignaciones WHERE id = 'as-vieja'")
                .unwrap(),
            "de-aqui"
        );
    }

    #[test]
    fn resumida_es_sin_asignacion_vigente_como_en_alcance() {
        let raices = vec!["rama".to_string()];
        let vaciar = "UPDATE trabajadores SET telefono = NULL WHERE id = 'bruno';";
        let telefono = format!(
            "UPDATE trabajadores SET telefono = '9', updated_at = '{F0}' WHERE id = 'bruno';"
        );
        // con vigente: el vacío del archivo sí es una diferencia. Un fin futuro sigue vigente.
        for sql in [
            "",
            "UPDATE asignaciones SET hasta = '2999-01-01' WHERE trabajador_id = 'bruno';",
        ] {
            let mut b = banco_con(Some(&raices));
            b.mia(&telefono);
            b.archivo(vaciar);
            b.archivo(sql);
            assert!(b.abrir().indice("trabajadores", "bruno").is_ok(), "{sql}");
        }
        // sin vigente: cerrada, o que aún no empieza
        for sql in [
            "UPDATE asignaciones SET hasta = '2021-01-01' WHERE trabajador_id = 'bruno';",
            "UPDATE asignaciones SET desde = '2999-01-01', hasta = NULL WHERE trabajador_id = 'bruno';",
        ] {
            let mut b = banco_con(Some(&raices));
            b.mia(&telefono);
            b.archivo(vaciar);
            b.archivo(sql);
            assert!(b.abrir().indice("trabajadores", "bruno").is_err(), "{sql}");
        }
        // un archivo completo no tiene este caso: un vacío es un vacío
        let mut b = banco();
        b.mia(&telefono);
        b.archivo(vaciar);
        b.archivo("UPDATE asignaciones SET hasta = '2021-01-01' WHERE trabajador_id = 'bruno';");
        assert!(b.abrir().indice("trabajadores", "bruno").is_ok());
    }

    // --- La base cambió, el trabajo, y lo que se aplica ---

    #[test]
    fn si_la_base_cambio_desde_la_revision_avisa_y_no_aplica() {
        let mut b = banco();
        b.archivo(&format!(
            "UPDATE trabajadores SET nombre = 'A2', updated_at = '{F1}' WHERE id = 'ana';
             UPDATE trabajadores SET nombre = 'B2', updated_at = '{F1}' WHERE id = 'bruno';
             INSERT INTO trabajadores (id, nombre, created_at, updated_at) VALUES ('nueva', 'Nueva', '{F1}', '{F1}');"
        ));
        let mut r = b.abrir();
        r.decidir("trabajadores", "bruno", eleccion_campos(&[]))
            .unwrap();
        r.decidir("trabajadores", "nueva", Eleccion::Omitir)
            .unwrap();
        b.verificar(&mut r);

        // una fila con decisión cambió
        b.local
            .execute_batch("UPDATE trabajadores SET telefono = '1' WHERE id = 'ana';")
            .unwrap();
        let dir = b.dir.path().join("respaldos");
        std::fs::create_dir_all(&dir).unwrap();
        let revision = b.revision_datos();
        let v = r.version;
        let e = aplicar(&mut b.local, &dir, &b.i, &r, v, "1").err().unwrap();
        assert_eq!((e.codigo, e.detalle.as_str()), ("base_cambio", "1"));
        assert_eq!(
            b.uno("SELECT nombre FROM trabajadores WHERE id = 'ana'")
                .unwrap(),
            "Ana",
            "no se escribió nada"
        );
        assert_eq!(b.revision_datos(), revision);
        assert_eq!(b.respaldos(), 0);

        // comparar de nuevo: lo de esa fila vuelve a su preselección; lo demás sigue decidido
        let r2 = abrir(&mut b.local, &b.i, Lugares::new(), Some(&r), |_, _| true).unwrap();
        assert_eq!(
            r2.resumen().restablecidas,
            0,
            "ana no tenía una decisión a mano"
        );
        assert_eq!(
            caso(&r2, "trabajadores", "bruno").decision,
            Decision::Campos(0)
        );
        assert_eq!(
            caso(&r2, "trabajadores", "nueva").decision,
            Decision::Omitir
        );

        // con una decisión a mano sobre la fila que cambia, se cuenta
        b.local
            .execute_batch("UPDATE trabajadores SET telefono = '2' WHERE id = 'bruno';")
            .unwrap();
        let r3 = abrir(&mut b.local, &b.i, Lugares::new(), Some(&r2), |_, _| true).unwrap();
        assert_eq!(r3.resumen().restablecidas, 1);
        assert_eq!(
            caso(&r3, "trabajadores", "bruno").decision,
            preseleccion(&caso(&r3, "trabajadores", "bruno").caso)
        );
    }

    #[test]
    fn una_fila_nueva_que_ya_aparecio_aqui_cuenta_como_cambio() {
        let mut b = banco();
        b.archivo(&format!(
            "INSERT INTO trabajadores (id, nombre, created_at, updated_at) VALUES ('nueva', 'Nueva', '{F1}', '{F1}');"
        ));
        let mut r = b.abrir();
        b.mia(&format!(
            "INSERT INTO trabajadores (id, nombre, created_at, updated_at) VALUES ('nueva', 'Mía', '{F2}', '{F2}');"
        ));
        assert_eq!(b.intentar(&mut r).err().unwrap().codigo, "base_cambio");
    }

    #[test]
    fn la_persona_con_la_que_se_une_tambien_se_vigila() {
        let mut b = banco();
        con_duplicado(&mut b);
        let mut r = b.abrir();
        r.decidir("trabajadores", "otra-eva", Eleccion::UnirMio)
            .unwrap();
        b.mia("UPDATE trabajadores SET correo = 'otra@x.cl' WHERE id = 'de-aqui';");
        assert_eq!(b.intentar(&mut r).err().unwrap().codigo, "base_cambio");
    }

    #[test]
    fn solo_se_aplica_lo_que_se_verifico_con_esas_decisiones() {
        let mut b = banco();
        b.archivo(&format!(
            "UPDATE trabajadores SET nombre = 'A2', updated_at = '{F1}' WHERE id = 'ana';"
        ));
        let mut r = b.abrir();
        let vista = r.version;
        r.decidir("trabajadores", "ana", eleccion_campos(&[]))
            .unwrap();
        let dir = b.dir.path().join("respaldos");
        std::fs::create_dir_all(&dir).unwrap();
        // otra decisión después de lo que se vio
        assert_eq!(
            aplicar(&mut b.local, &dir, &b.i, &r, vista, "1")
                .err()
                .unwrap()
                .codigo,
            "sin_verificar"
        );
        // sin verificar
        let v = r.version;
        assert_eq!(
            aplicar(&mut b.local, &dir, &b.i, &r, v, "1")
                .err()
                .unwrap()
                .codigo,
            "sin_verificar"
        );
        // una verificación vieja no sirve
        let (viejo, bloqueos) = verificar(&mut b.local, &b.i, &r).unwrap();
        r.decidir("trabajadores", "ana", eleccion_campos(&["nombre"]))
            .unwrap();
        r.anotar_verificacion(viejo, bloqueos);
        let v = r.version;
        assert_eq!(
            aplicar(&mut b.local, &dir, &b.i, &r, v, "1")
                .err()
                .unwrap()
                .codigo,
            "sin_verificar"
        );
        b.verificar(&mut r);
        let v = r.version;
        aplicar(&mut b.local, &dir, &b.i, &r, v, "1").unwrap();
        assert_eq!(
            b.uno("SELECT nombre FROM trabajadores WHERE id = 'ana'")
                .unwrap(),
            "A2"
        );
    }

    #[test]
    fn aplicar_es_todo_o_nada_y_deja_respaldo_y_una_revision() {
        let mut b = banco();
        b.archivo(&format!(
            "UPDATE trabajadores SET nombre = 'A2', updated_at = '{F1}' WHERE id = 'ana';
             INSERT INTO trabajadores (id, nombre, created_at, updated_at) VALUES ('nueva', 'Nueva', '{F1}', '{F1}');"
        ));
        let mut r = b.abrir();
        let antes: i64 = b.revision_datos().parse().unwrap();
        let h = b.aplicar(&mut r);
        assert_eq!(b.revision_datos().parse::<i64>().unwrap(), antes + 1);
        assert_eq!(b.respaldos(), 1);
        assert_eq!(h.tablas.len(), 1);
        assert_eq!((h.tablas[0].agregadas, h.tablas[0].cambiadas), (1, 1));

        // verificar no escribe
        let mut b = banco();
        b.archivo(&format!(
            "UPDATE trabajadores SET nombre = 'A2', updated_at = '{F1}' WHERE id = 'ana';"
        ));
        let mut r = b.abrir();
        b.verificar(&mut r);
        assert_eq!(
            b.uno("SELECT nombre FROM trabajadores WHERE id = 'ana'")
                .unwrap(),
            "Ana"
        );
        assert_eq!(b.revision_datos(), "0");
    }

    #[test]
    fn un_fallo_en_medio_no_deja_nada_escrito() {
        let mut b = banco();
        b.archivo(&format!(
            "UPDATE trabajadores SET nombre = 'A2', updated_at = '{F1}' WHERE id = 'ana';
             UPDATE puestos SET cargo_id = 'cargo-b', updated_at = '{F1}' WHERE id = 'p-rama';"
        ));
        let mut r = b.abrir();
        // una decisión sobre un lugar que no existe hace fallar la pasada después de abrir la transacción
        r.lugares.insert("rama".into(), Some("nadie".into()));
        let (s, e) = (r.version, verificar(&mut b.local, &b.i, &r).err().unwrap());
        assert_eq!(e.codigo, "desconocido");
        r.anotar_verificacion(s, Vec::new());
        let dir = b.dir.path().join("respaldos");
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(
            aplicar(&mut b.local, &dir, &b.i, &r, s, "1")
                .err()
                .unwrap()
                .codigo,
            "desconocido"
        );
        assert_eq!(
            b.uno("SELECT nombre FROM trabajadores WHERE id = 'ana'")
                .unwrap(),
            "Ana"
        );
        assert_eq!(
            b.uno("SELECT cargo_id FROM puestos WHERE id = 'p-rama'")
                .unwrap(),
            "cargo-a"
        );
    }

    #[test]
    fn las_decisiones_son_del_trabajo_y_se_pierden_al_cancelar() {
        let mut b = banco();
        let r = b.abrir();
        let ruta = b.i.temporal.ruta().to_path_buf();
        let s = Sesiones::default();
        s.empezar("t1").unwrap();
        let i = std::mem::replace(
            &mut b.i,
            Importacion {
                temporal: Temporal::nuevo(b.dir.path(), "vacio"),
                meta: MetaArchivo {
                    parcial: false,
                    ramas: Vec::new(),
                    organizacion: String::new(),
                },
            },
        );
        s.guardar_importacion("t1", i).unwrap();
        s.guardar_revision("t1", r).unwrap();
        assert_eq!(s.revision("otro").err().unwrap().codigo, "desconocido");
        assert_eq!(s.importacion("otro").err().unwrap().codigo, "desconocido");
        assert!(s.revision("t1").is_ok());

        // otro trabajo no puede dejar lo suyo aquí
        let r2 = banco().abrir();
        assert_eq!(
            s.guardar_revision("otro", r2).err().unwrap().codigo,
            "cancelado"
        );

        // volver atrás suelta las decisiones, pero el archivo sigue abierto
        s.soltar_revision("t1");
        assert_eq!(s.revision("t1").err().unwrap().codigo, "desconocido");
        assert!(s.importacion("t1").is_ok());

        // lo que alguien aún usa se borra cuando termina, y cancelar lo deja sin efecto
        let en_uso = s.importacion("t1").unwrap();
        s.cancelar("t1");
        assert!(ruta.exists());
        assert_eq!(s.importacion("t1").err().unwrap().codigo, "desconocido");
        drop(en_uso);
        assert!(!ruta.exists());
    }

    #[test]
    fn cancelar_detiene_la_comparacion() {
        let mut b = banco();
        let e = abrir(&mut b.local, &b.i, Lugares::new(), None, |_, _| false)
            .err()
            .unwrap();
        assert_eq!(e.codigo, "cancelado");
    }

    // --- Tamaño e ida y vuelta ---

    #[test]
    fn una_fusion_de_miles_de_diferencias_termina_y_cuenta_bien() {
        const N: usize = 30_000;
        let mut b = banco();
        let tx = b.local.transaction().unwrap();
        {
            let mut q = tx
                .prepare("INSERT INTO trabajadores (id, nombre, correo, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)")
                .unwrap();
            for n in 0..N {
                q.execute([
                    format!("p{n:06}"),
                    format!("Persona {n}"),
                    format!("p{n}@x.cl"),
                    F0.to_string(),
                ])
                .unwrap();
            }
        }
        tx.commit().unwrap();
        let copia = alcance::copiar(&b.local, b.dir.path()).unwrap();
        let (temporal, _) = alcance::preparar(copia, b.dir.path(), None).unwrap();
        let meta = validar::leer_meta(&validar::solo_lectura(temporal.ruta()).unwrap()).unwrap();
        b.i = Importacion { temporal, meta };
        // 20 000 distintas, 5 000 borradas en el archivo, 5 000 nuevas
        let f = Connection::open(b.i.temporal.ruta()).unwrap();
        let tx = f.unchecked_transaction().unwrap();
        tx.execute(&format!("UPDATE trabajadores SET nombre = nombre || ' 2', updated_at = '{F1}' WHERE id LIKE 'p%' AND CAST(substr(id, 2) AS INTEGER) < 20000"), []).unwrap();
        tx.execute(&format!("UPDATE trabajadores SET deleted_at = '{F1}', updated_at = '{F1}' WHERE id LIKE 'p%' AND CAST(substr(id, 2) AS INTEGER) BETWEEN 20000 AND 24999"), []).unwrap();
        {
            let mut q = tx
                .prepare("INSERT INTO trabajadores (id, nombre, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)")
                .unwrap();
            for n in 0..5000 {
                q.execute([format!("z{n:06}"), format!("Nueva {n}"), F1.to_string()])
                    .unwrap();
            }
        }
        tx.commit().unwrap();
        drop(f);

        let inicio = std::time::Instant::now();
        let mut r = b.abrir();
        let abierta = inicio.elapsed();
        let resumen = r.resumen();
        assert_eq!(resumen.aplicara.cambiar, 20_000);
        assert_eq!(resumen.aplicara.borrar, 5000);
        assert_eq!(resumen.aplicara.agregar, 5000);
        let imp = b.i.solo_lectura().unwrap();
        let t = std::time::Instant::now();
        let p = r
            .pagina(
                &b.local,
                &imp,
                &Filtro {
                    tipo: Some(TipoCaso::Diferente),
                    tabla: None,
                    solo_dudosas: false,
                    desde: 19_950,
                    cuantos: 100,
                },
            )
            .unwrap();
        assert_eq!(p.filas.len(), 50);
        assert!(
            t.elapsed().as_secs() < 2,
            "una página no recorre filas de más: {:?}",
            t.elapsed()
        );
        drop(imp);
        r.decidir("trabajadores", "p000000", eleccion_campos(&[]))
            .unwrap();
        let h = b.aplicar(&mut r);
        let total = inicio.elapsed();
        let t = h.tablas.iter().find(|x| x.tabla == "trabajadores").unwrap();
        assert_eq!((t.cambiadas, t.borradas, t.agregadas), (19_999, 5000, 5000));
        assert_eq!(
            b.uno("SELECT nombre FROM trabajadores WHERE id = 'p000000'")
                .unwrap(),
            "Persona 0"
        );
        assert_eq!(
            b.uno("SELECT nombre FROM trabajadores WHERE id = 'p000001'")
                .unwrap(),
            "Persona 1 2"
        );
        // sin compilar optimizado: el margen es holgado, y mide que nada se vuelva cuadrático
        assert!(total.as_secs() < 120, "abrir {abierta:?}, total {total:?}");
    }

    fn base_vacia(dir: &std::path::Path) -> Connection {
        let mut c = db::abrir(&dir.join("boldo.db")).unwrap();
        db::migrar(&mut c, dir).unwrap();
        db::asegurar_meta(&c).unwrap();
        c
    }

    /// Por la puerta de verdad: exportar a un `.boldo` cifrado y abrirlo con su código.
    fn enviar(de: &Connection, dir_de: &std::path::Path, dir_a: &std::path::Path) -> Importacion {
        let copia = alcance::copiar(de, dir_de).unwrap();
        let (t, _) = alcance::preparar(copia, dir_de, None).unwrap();
        let archivo: PathBuf = dir_de.join(nombre_sugerido(t.ruta()).unwrap());
        let codigo = guardar(t.ruta(), &archivo, |_, _| true).unwrap();
        super::super::abrir(&archivo, dir_a, &codigo, MIGRACIONES, |_, _| true).unwrap()
    }

    fn resolver(
        c: &mut Connection,
        dir: &std::path::Path,
        i: &Importacion,
        cambiar: impl FnOnce(&mut Revision),
    ) {
        let mut r = abrir(c, i, Lugares::new(), None, |_, _| true).unwrap();
        cambiar(&mut r);
        let (v, b) = verificar(c, i, &r).unwrap();
        r.anotar_verificacion(v, b);
        let v = r.version;
        let respaldos = dir.join("respaldos");
        std::fs::create_dir_all(&respaldos).unwrap();
        aplicar(c, &respaldos, i, &r, v, "1.2.3").unwrap();
    }

    #[test]
    fn ida_y_vuelta_real_entre_dos_bases() {
        // A nace con datos y B los recibe en una base vacía
        let (dir_a, mut a) = base_con_datos();
        a.execute_batch(&format!(
            "UPDATE trabajadores SET updated_at = '{F0}', created_at = '{F0}';
             UPDATE unidades SET updated_at = '{F0}', created_at = '{F0}';"
        ))
        .unwrap();
        let dir_b = tempfile::tempdir().unwrap();
        let mut b = base_vacia(dir_b.path());
        let i = enviar(&a, dir_a.path(), dir_b.path());
        resolver(&mut b, dir_b.path(), &i, |_| {});
        drop(i);
        assert!(fusion::viva(&b, "trabajadores", "ana").unwrap());
        assert!(!fusion::viva(&b, "unidades", "borrada").unwrap_or(false));

        // cada lado edita lo suyo y un mismo registro
        a.execute_batch(&format!(
            "UPDATE trabajadores SET telefono = 'de A', updated_at = '{F1}' WHERE id = 'ana';
             UPDATE trabajadores SET nombre = 'Bruno A', updated_at = '{F1}' WHERE id = 'bruno';"
        ))
        .unwrap();
        b.execute_batch(&format!(
            "UPDATE trabajadores SET nombre = 'Bruno B', updated_at = '{F2}' WHERE id = 'bruno';
             INSERT INTO unidades (id, tipo_id, nombre, parent_id, created_at, updated_at) VALUES ('de-b', '{TIPO}', 'De B', 'raiz', '{F2}', '{F2}');
             UPDATE conexiones SET deleted_at = '{F2}', updated_at = '{F2}' WHERE id = 'x-dentro';"
        ))
        .unwrap();

        // A recibe lo de B: lo más reciente de cada lado
        let i = enviar(&b, dir_b.path(), dir_a.path());
        resolver(&mut a, dir_a.path(), &i, |r| {
            assert_eq!(
                caso(r, "trabajadores", "bruno").caso.mas_reciente,
                Lado::Archivo
            );
            assert_eq!(caso(r, "unidades", "de-b").caso.tipo, TipoCaso::Nuevo);
            assert_eq!(caso(r, "conexiones", "x-dentro").decision, Decision::Borrar);
            // lo que tiene A más nuevo se queda
            assert_eq!(caso(r, "trabajadores", "ana").decision, Decision::Campos(0));
        });
        drop(i);
        let nombre = |c: &Connection, id: &str, col: &str| -> Option<String> {
            c.query_row(
                &format!("SELECT {col} FROM trabajadores WHERE id = ?1"),
                [id],
                |f| f.get(0),
            )
            .unwrap()
        };
        assert_eq!(nombre(&a, "bruno", "nombre").unwrap(), "Bruno B");
        assert_eq!(nombre(&a, "ana", "telefono").unwrap(), "de A");
        assert!(fusion::viva(&a, "unidades", "de-b").unwrap());
        assert!(!fusion::viva(&a, "conexiones", "x-dentro").unwrap());

        // y B recibe lo de A: quedan iguales, y otra pasada no encuentra nada
        let i = enviar(&a, dir_a.path(), dir_b.path());
        resolver(&mut b, dir_b.path(), &i, |_| {});
        drop(i);
        assert_eq!(nombre(&b, "ana", "telefono").unwrap(), "de A");
        let i = enviar(&a, dir_a.path(), dir_b.path());
        let r = abrir(&mut b, &i, Lugares::new(), None, |_, _| true).unwrap();
        let quedan: Vec<_> = r
            .casos
            .iter()
            .map(|c| (c.caso.tabla, c.caso.id.clone(), c.caso.tipo))
            .collect();
        assert!(quedan.is_empty(), "{quedan:?}");
    }

    #[test]
    fn opciones_filtra_con_el_mismo_comparador_y_solo_lo_vivo() {
        let b = banco();
        let o = opciones(&b.local, "unidades", "ÓTRA").unwrap();
        assert!(
            o.is_empty(),
            "sin esa tilde en el nombre de prueba no aparece: UnidadFuera"
        );
        let o = opciones(&b.local, "unidades", "unidadfuéra").unwrap();
        assert_eq!(o[0].id, "otra");
        let todas = opciones(&b.local, "unidades", "").unwrap();
        assert!(todas.iter().all(|x| x.id != "borrada"));
        assert_eq!(
            opciones(&b.local, "tabla_rara", "").err().unwrap().codigo,
            "desconocido"
        );
        let puestos = opciones(&b.local, "puestos", "jefe").unwrap();
        assert!(puestos.iter().any(|x| x.nombre.contains("Rama")));
    }
}
