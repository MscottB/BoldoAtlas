use crate::db::{self, Sentencia};
use crate::intercambio::validar::solo_lectura_cerrada;
use crate::intercambio::{self, Sesiones, alcance, fusion, revision};
use crate::organizaciones::{
    self, Abierta, ArchivoAgregado, Base, ESPERA_ARRANQUE, ESPERA_CAMBIO, EliminadaVista, Entrada,
    Lista, OTRA_BASE, OrganizacionVista, abrir_base, abrir_entrada, abrir_principal_libre,
    agregar_archivo, anotar_abierta, anotar_creada, base_de, bloquear, borrar_archivo_de,
    borrar_respaldos_de, cargar_lista, crear_en_carpeta, entrada_de_base, es_color_valido,
    es_id_valido, escribir_lista, guardar_eliminada, identidad_nueva, lista_protegida,
    principal_libre, revisar_para_eliminar, vista_de, vistas,
};
use crate::respaldos::{self, Fallo, Respaldo};
use crate::rutas::{self, InfoProyecto, Rutas};
use rusqlite::Connection;
use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Mutex, MutexGuard, RwLock, TryLockError};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder};
use tauri_plugin_opener::OpenerExt;

/// Cuánto espera un cambio de organización a que terminen los trabajos en curso.
const ESPERA_TRABAJOS: Duration = Duration::from_secs(2);

/// El texto que `errores.ts` reconoce para volver a decirlo en el idioma activo.
fn motivo_de_apertura(f: Fallo) -> String {
    match f.codigo {
        "esquema_nuevo" => db::texto_esquema_nuevo(f.detalle, db::MIGRACIONES.len()),
        "abierta_en_otra_copia" => format!(
            "Otra copia de BoldoAtlas tiene abierta esta base: {}",
            f.detalle
        ),
        _ => f.detalle,
    }
}

/// La organización que no abrió al arrancar, y por qué. Se abrió `boldo.db` en su lugar.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AvisoInicio {
    codigo: &'static str,
    detalle: String,
    nombre: String,
}

/// Si iniciar falla, la app no se cierra: guarda el error y el frontend lo muestra.
pub struct Estado {
    conn: Mutex<Option<Connection>>,
    /// Se escribe solo con `conn` tomado. Sigue ahí tras `cerrar_ordenado`: es lo que abre `reabrir`.
    base: Mutex<Option<Base>>,
    bloqueo: Mutex<Option<File>>,
    /// Se toma durante todo leer, cambiar y escribir `organizaciones.json`. Orden: `conn`, luego `lista`.
    lista: Mutex<()>,
    /// El archivo que espera una respuesta: ruta, entrada buscada y lo que vale como confirmado si la respuesta es sí.
    pendiente: Mutex<Option<ArchivoPendiente>>,
    rutas: Option<Rutas>,
    version_esquema: AtomicI64,
    error: Mutex<Option<String>>,
    aviso_inicio: Mutex<Option<AvisoInicio>>,
}

type ArchivoPendiente = (PathBuf, Option<String>, Vec<&'static str>);

/// `agregar_archivo`, sin las migraciones: las pruebas ponen otra, que pregunta más.
type Agregar<'a> =
    &'a dyn Fn(&Rutas, &Path, Option<&str>, &[&str]) -> Result<ArchivoAgregado, Fallo>;

fn agregar_de_verdad(
    r: &Rutas,
    ruta: &Path,
    buscando: Option<&str>,
    confirmados: &[&str],
) -> Result<ArchivoAgregado, Fallo> {
    agregar_archivo(r, ruta, buscando, confirmados, db::MIGRACIONES)
}

impl Estado {
    /// Se llama al comienzo de `run()`, antes de que existan otros hilos: la portable ajusta aquí
    /// variables de entorno del proceso. La base abre después, en `abrir_inicial`.
    pub fn iniciar() -> Self {
        let resultado = (|| {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let linux = |v| {
                std::env::var_os(v)
                    .filter(|_| cfg!(target_os = "linux"))
                    .map(PathBuf::from)
            };
            let (appimage, appdir) = (linux("APPIMAGE"), linux("APPDIR"));
            let exe_dir = rutas::carpeta_programa(&exe, appimage.as_deref(), appdir.as_deref())
                .ok_or("No se pudo ubicar la carpeta del programa.")?;
            let r = rutas::dir_datos(&exe_dir, dirs::data_dir().as_deref())?;
            if r.portable {
                for (nombre, ruta) in rutas::entorno_portable(std::env::consts::OS, &r.datos) {
                    std::fs::create_dir_all(&ruta).map_err(|e| e.to_string())?;
                    // SAFETY: aún no hay otros hilos que lean el entorno (ver la nota de la función)
                    unsafe { std::env::set_var(nombre, ruta) };
                }
            }
            Ok::<_, String>(r)
        })();
        let (rutas, error) = match resultado {
            Ok(r) => (Some(r), None),
            Err(e) => (None, Some(e)),
        };
        Estado {
            conn: Mutex::new(None),
            base: Mutex::new(None),
            bloqueo: Mutex::new(None),
            lista: Mutex::new(()),
            pendiente: Mutex::new(None),
            rutas,
            version_esquema: AtomicI64::new(0),
            error: Mutex::new(error),
            aviso_inicio: Mutex::new(None),
        }
    }

    #[cfg(test)]
    pub(crate) fn de_prueba(
        conn: Option<Connection>,
        base: Option<Base>,
        rutas: Option<Rutas>,
    ) -> Estado {
        Estado {
            conn: Mutex::new(conn),
            base: Mutex::new(base),
            bloqueo: Mutex::new(None),
            lista: Mutex::new(()),
            pendiente: Mutex::new(None),
            rutas,
            version_esquema: AtomicI64::new(0),
            error: Mutex::new(None),
            aviso_inicio: Mutex::new(None),
        }
    }

    /// Se llama en `setup`.
    pub fn abrir_inicial(&self) {
        self.abrir_inicial_con(ESPERA_ARRANQUE, db::MIGRACIONES);
    }

    /// Abre la última organización abierta. Si no se puede, `boldo.db` (o lo crea vacío) y deja el aviso: nada de lo que le
    /// pase a la lista o a otro archivo deja sin base. La pantalla de error queda solo para cuando falla el propio `boldo.db`.
    pub fn abrir_inicial_con(&self, espera: Duration, migraciones: &[&str]) {
        let Some(r) = self.rutas.as_ref() else {
            return;
        };
        let mut conn = self.conn.lock().unwrap_or_else(|p| p.into_inner());
        let _lista = self.lista.lock().unwrap_or_else(|p| p.into_inner());
        let mut lista = cargar_lista(r);
        let guardar_error = |f| {
            *self.error.lock().unwrap_or_else(|p| p.into_inner()) = Some(motivo_de_apertura(f));
        };
        let ultima = lista
            .organizaciones
            .iter()
            .max_by(|a, b| a.abierta.cmp(&b.abierta))
            .cloned();
        let mut aviso = None;
        let mut abierta = None;
        let mut es_la_ultima = true;
        let mut anotar = true;
        if let Some(e) = ultima {
            match abrir_entrada(r, &e, espera, migraciones) {
                Ok(a) => abierta = Some((a, e)),
                // ya se intentó `boldo.db`: intentarlo de nuevo solo volvería a esperar el bloqueo
                Err(f) if e.es_principal() && !matches!(f.codigo, "no_encontrado" | "otro_id") => {
                    return guardar_error(f);
                }
                Err(f) => {
                    // la otra sigue siendo la última: el próximo arranque la reintenta, por si vuelve el pendrive
                    es_la_ultima = e.es_principal();
                    aviso = Some(AvisoInicio {
                        codigo: f.codigo,
                        detalle: f.detalle,
                        nombre: e.nombre,
                    })
                }
            }
        }
        let (a, e) = match abierta {
            Some(x) => x,
            None => match abrir_base(&r.bd, &r.respaldos, None, espera, migraciones) {
                Ok(mut a) => {
                    // no se acepta un id repetido. Si no se puede cambiar, se abre igual, sin que quede en la lista
                    if lista
                        .organizaciones
                        .iter()
                        .any(|o| o.id == a.id && !o.es_principal())
                    {
                        match identidad_nueva(&a.conn) {
                            Ok(id) => a.id = id,
                            Err(_) => anotar = false,
                        }
                    }
                    let e = Entrada::principal(&a.id);
                    (a, e)
                }
                Err(f) => return guardar_error(f),
            },
        };
        // la lista no es imprescindible: sin poder escribirla (o si salió marcada) se abre igual, y se reintenta la próxima vez
        if anotar && anotar_abierta(&mut lista, &e, &a.conn, es_la_ultima).is_ok() {
            let _ = escribir_lista(r, &lista);
        }
        *conn = Some(a.conn);
        *self.bloqueo.lock().unwrap_or_else(|p| p.into_inner()) = Some(a.bloqueo);
        *self.base.lock().unwrap_or_else(|p| p.into_inner()) = Some(base_de(r, &e));
        self.version_esquema.store(a.version, Ordering::Relaxed);
        *self.aviso_inicio.lock().unwrap_or_else(|p| p.into_inner()) = aviso;
    }

    fn listar_organizaciones(&self) -> Result<Vec<OrganizacionVista>, Fallo> {
        let r = self.rutas()?;
        let lista = {
            let _lista = self.lista.lock().unwrap_or_else(|p| p.into_inner());
            cargar_lista(r)
        };
        let activa = self.base_abierta().map(|b| b.id);
        Ok(vistas(r, &lista, activa.as_deref()))
    }

    /// Sin trabajos en curso y con la conexión libre: un respaldo la tiene mientras dura.
    fn conexion_libre(
        &self,
        ocupada: &dyn Fn() -> bool,
    ) -> Result<MutexGuard<'_, Option<Connection>>, Fallo> {
        let limite = Instant::now() + ESPERA_TRABAJOS;
        loop {
            if !ocupada() {
                match self.conn.try_lock() {
                    Ok(g) => return Ok(g),
                    Err(TryLockError::Poisoned(_)) => {
                        return Err("La conexión quedó en un estado inválido."
                            .to_string()
                            .into());
                    }
                    Err(TryLockError::WouldBlock) => {}
                }
            }
            if Instant::now() >= limite {
                return Err(Fallo::de("trabajo_en_curso", ""));
            }
            std::thread::sleep(Duration::from_millis(25));
        }
    }

    /// Pasa a otra organización. La nueva abre antes de soltar la anterior: cualquier fallo deja la anterior abierta, con su
    /// bloqueo.
    pub fn cambiar_a(
        &self,
        id: &str,
        ocupada: &dyn Fn() -> bool,
        migraciones: &[&str],
    ) -> Result<OrganizacionVista, Fallo> {
        let r = self.rutas()?;
        if self.base_abierta().is_some_and(|b| b.id == id) {
            return self.ya_abierta(r, id);
        }
        let mut conn = self.conexion_libre(ocupada)?;
        // otro cambio pudo llegar a esta mientras se esperaba, y su bloqueo parecería el de otra copia
        if self.comprobar(id).is_ok() {
            drop(conn);
            return self.ya_abierta(r, id);
        }
        let lista = {
            let _lista = self.lista.lock().unwrap_or_else(|p| p.into_inner());
            cargar_lista(r)
        };
        // no se podría anotar el cambio, así que la otra no se toca. Y reconstruida no tiene las externas: no es `desconocido`
        if lista.no_escribir {
            return Err(lista_protegida());
        }
        let e = lista
            .organizaciones
            .into_iter()
            .find(|o| o.id == id)
            .ok_or_else(|| Fallo::de("desconocido", id))?;
        let nueva = abrir_entrada(r, &e, ESPERA_CAMBIO, migraciones)?;
        let base = base_de(r, &e);
        self.cambiar_a_abierta(&mut conn, nueva, base.bd, base.respaldos, Some(&e))?;
        drop(conn);
        let lista = {
            let _lista = self.lista.lock().unwrap_or_else(|p| p.into_inner());
            cargar_lista(r)
        };
        Ok(vista_de(r, lista, e))
    }

    /// Pedir la que ya está abierta no la reabre. Solo deja su hora al día, y lo que lo impida no impide seguir en ella: un
    /// respaldo que tiene la conexión, o una lista que no se puede escribir.
    fn ya_abierta(&self, r: &Rutas, id: &str) -> Result<OrganizacionVista, Fallo> {
        let (lista, e) = {
            let conn = self.conn.try_lock();
            let _lista = self.lista.lock().unwrap_or_else(|p| p.into_inner());
            let mut lista = cargar_lista(r);
            let e = lista
                .organizaciones
                .iter()
                .find(|o| o.id == id)
                .cloned()
                // un `boldo.db` vacío no se lista, y una externa sale de una lista reconstruida
                .or_else(|| {
                    self.base_abierta()
                        .filter(|b| b.id == id)
                        .map(|b| entrada_de_base(r, &b))
                })
                .ok_or_else(|| Fallo::de("desconocido", id))?;
            if let Ok(conn) = &conn
                && let Some(c) = conn.as_ref()
                && self.comprobar(id).is_ok()
                && anotar_abierta(&mut lista, &e, c, true).is_ok()
            {
                let _ = escribir_lista(r, &lista);
            }
            (lista, e)
        };
        Ok(vista_de(r, lista, e))
    }

    /// Deja `nueva` como la base abierta. `conn` es la ranura ya tomada: la base solo se escribe con ella. Sin `entrada` es un
    /// `boldo.db` sin listar, que entra a la lista solo si no está vacío.
    fn cambiar_a_abierta(
        &self,
        conn: &mut Option<Connection>,
        nueva: Abierta,
        bd: PathBuf,
        respaldos: PathBuf,
        entrada: Option<&Entrada>,
    ) -> Result<(), Fallo> {
        let r = self.rutas()?;
        let e = entrada
            .cloned()
            .unwrap_or_else(|| Entrada::principal(&nueva.id));
        // hasta escribir `base`: antes, una búsqueda confirmada no vería que esta ya es la abierta y la sacaría de la lista
        let _lista = self.lista.lock().unwrap_or_else(|p| p.into_inner());
        let mut lista = cargar_lista(r);
        anotar_abierta(&mut lista, &e, &nueva.conn, true)?;
        escribir_lista(r, &lista)?;
        // ya no hay vuelta atrás: la lista dice que abre la nueva, así que un error aquí no la detiene
        if let Some(anterior) = conn.take() {
            // sin esperar a otro lector, con `conn` tomado: su `-wal` se recupera al reabrirla
            let _ = anterior.busy_timeout(Duration::ZERO);
            let _ = anterior.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()));
            let _ = anterior.close();
        }
        *conn = Some(nueva.conn);
        // reemplazarlo suelta el de la anterior, ya cerrada
        *self.bloqueo.lock().unwrap_or_else(|p| p.into_inner()) = Some(nueva.bloqueo);
        *self.base.lock().unwrap_or_else(|p| p.into_inner()) = Some(Base {
            id: nueva.id,
            bd,
            respaldos,
        });
        self.version_esquema.store(nueva.version, Ordering::Relaxed);
        // eran del arranque: una recarga de la ventana no debe volver a mostrarlos
        *self.error.lock().unwrap_or_else(|p| p.into_inner()) = None;
        *self.aviso_inicio.lock().unwrap_or_else(|p| p.into_inner()) = None;
        Ok(())
    }

    /// Borra una organización del disco. `Some` con la base nueva si era la abierta. Antes de borrar pasa todo lo que puede fallar
    /// sin perder nada. Lo que falle ya borrando deja la entrada en la lista: eliminarla de nuevo termina lo que faltó; si el archivo
    /// ya no está, sin pedir copia ni borrarlo.
    pub fn eliminar(
        &self,
        id: &str,
        guardar_copia: bool,
        borrar_archivo: bool,
        ocupada: &dyn Fn() -> bool,
        migraciones: &[&str],
    ) -> Result<Option<OrganizacionVista>, Fallo> {
        let r = self.rutas()?;
        if !es_id_valido(id) {
            return Err(Fallo::de("desconocido", id));
        }
        // todo el tiempo: nadie abre esta ni otra mientras se borra
        let mut conn = self.conexion_libre(ocupada)?;
        let (lista, e) = {
            let _lista = self.lista.lock().unwrap_or_else(|p| p.into_inner());
            let lista = cargar_lista(r);
            if lista.no_escribir {
                return Err(lista_protegida());
            }
            let e = lista
                .organizaciones
                .iter()
                .find(|o| o.id == id)
                .cloned()
                .ok_or_else(|| Fallo::de("desconocido", id))?;
            // si no se puede escribir, se sabe antes de tocar nada
            escribir_lista(r, &lista)?;
            (lista, e)
        };
        let base = base_de(r, &e);
        let borra_archivo = !e.externa || borrar_archivo;
        let abierta = self.comprobar(id).ok();
        // es la abierta por su id, y lo que se borra es lo que dice la lista: otra ruta no es el archivo que está abierto
        if abierta.as_ref().is_some_and(|b| b.bd != base.bd) {
            return Err(Fallo::de("otro_id", base.bd.display()));
        }
        let abierta = abierta.is_some();
        let existe = revisar_para_eliminar(r, &e, abierta, guardar_copia, borrar_archivo)?;
        let mut bloqueo = None;
        let mut ya_borrado = false;
        if abierta {
            let c = conn.as_ref().ok_or_else(|| self.motivo_sin_base())?;
            if guardar_copia {
                guardar_eliminada(r, &e, c)?;
            }
            if !self.pasar_a_otra(&mut conn, &lista, &e, migraciones)? {
                self.vaciar_principal(&mut conn, &base, migraciones)?;
                ya_borrado = true;
            }
        } else {
            if existe && borra_archivo {
                bloqueo = Some(bloquear(&base.bd, ESPERA_CAMBIO)?);
            }
            if guardar_copia {
                guardar_eliminada(r, &e, &solo_lectura_cerrada(&base.bd)?)?;
            }
        }
        if borra_archivo && !ya_borrado {
            // la que estaba abierta ya soltó el suyo
            if bloqueo.is_none() && existe {
                bloqueo = Some(bloquear(&base.bd, ESPERA_CAMBIO)?);
            }
            borrar_archivo_de(&base, bloqueo)?;
        }
        borrar_respaldos_de(r, &e)?;
        // al final: si algo de lo anterior falla sigue en la lista. Eliminarla de nuevo termina lo que faltó; si el archivo ya no
        // está, sin pedir copia ni borrarlo
        let lista = {
            let _lista = self.lista.lock().unwrap_or_else(|p| p.into_inner());
            let mut lista = cargar_lista(r);
            lista.organizaciones.retain(|o| o.id != id);
            escribir_lista(r, &lista)?;
            lista
        };
        if !abierta {
            return Ok(None);
        }
        let nueva = self.base_abierta().ok_or_else(|| self.motivo_sin_base())?;
        drop(conn);
        Ok(Some(vista_de(r, lista, entrada_de_base(r, &nueva))))
    }

    /// Deja abierta otra que no sea `e`: la más reciente que abra y, si ninguna, `boldo.db`, que puede no estar listado. `false` si
    /// `e` es `boldo.db` y no queda dónde ir.
    fn pasar_a_otra(
        &self,
        conn: &mut Option<Connection>,
        lista: &Lista,
        e: &Entrada,
        migraciones: &[&str],
    ) -> Result<bool, Fallo> {
        let r = self.rutas()?;
        let mut otras: Vec<_> = lista
            .organizaciones
            .iter()
            .filter(|o| o.id != e.id)
            .collect();
        otras.sort_by(|a, b| b.abierta.cmp(&a.abierta));
        for o in otras {
            if let Ok(nueva) = abrir_entrada(r, o, ESPERA_CAMBIO, migraciones) {
                let base = base_de(r, o);
                self.cambiar_a_abierta(conn, nueva, base.bd, base.respaldos, Some(o))?;
                return Ok(true);
            }
        }
        if e.es_principal() {
            return Ok(false);
        }
        let mut a = abrir_base(&r.bd, &r.respaldos, None, ESPERA_CAMBIO, migraciones)?;
        // también el de la que se elimina: se cruzarían pestañas y preferencias, y al sacarla de la lista saldría esta
        if lista
            .organizaciones
            .iter()
            .any(|o| o.id == a.id && !o.es_principal())
        {
            a.id = identidad_nueva(&a.conn)?;
        }
        self.cambiar_a_abierta(conn, a, r.bd.clone(), r.respaldos.clone(), None)?;
        Ok(true)
    }

    /// `boldo.db` es la abierta y no hay a dónde ir: se cierra, se borra y se abre vacío. Si no se pudo borrar, vuelve a abrir lo que
    /// quedó. Si no se puede abrir nada, queda lo mismo que al arrancar así: la pantalla de error.
    fn vaciar_principal(
        &self,
        conn: &mut Option<Connection>,
        base: &Base,
        migraciones: &[&str],
    ) -> Result<(), Fallo> {
        if let Some(c) = conn.take() {
            let _ = c.close();
        }
        let bloqueo = self
            .bloqueo
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .take();
        let mut borrado = borrar_archivo_de(base, bloqueo);
        // aunque haya fallado lo de al lado: lo que abra ahora es otra organización, y ya no se puede reintentar
        if !base.bd.exists() {
            borrado = borrado.and(respaldos::borrar_respaldos(&base.respaldos));
        }
        let abierta = abrir_base(&base.bd, &base.respaldos, None, ESPERA_CAMBIO, migraciones)
            .and_then(|a| {
                self.cambiar_a_abierta(conn, a, base.bd.clone(), base.respaldos.clone(), None)
            });
        if let Err(f) = abierta {
            *self.base.lock().unwrap_or_else(|p| p.into_inner()) = None;
            *self.error.lock().unwrap_or_else(|p| p.into_inner()) =
                Some(motivo_de_apertura(Fallo::de(f.codigo, &f.detalle)));
            return Err(f);
        }
        borrado
    }

    /// Deja en la lista lo que dice ahora la base abierta, como su nombre. No cuenta como abrirla.
    pub fn sincronizar(&self, base_id: &str) -> Result<(), Fallo> {
        let r = self.rutas()?;
        self.con_conexion(base_id, |c| {
            let base = self.base(base_id)?;
            let _lista = self.lista.lock().unwrap_or_else(|p| p.into_inner());
            let mut lista = cargar_lista(r);
            if lista.no_escribir {
                return Err(lista_protegida());
            }
            let e = lista
                .organizaciones
                .iter()
                .find(|o| o.id == base_id)
                .cloned()
                .unwrap_or_else(|| entrada_de_base(r, &base));
            anotar_abierta(&mut lista, &e, c, false)?;
            escribir_lista(r, &lista)
        })
    }

    /// Solo la saca de la lista. La abierta no: su archivo está en uso, y la lista es de donde arranca.
    pub fn quitar(&self, id: &str) -> Result<(), Fallo> {
        let r = self.rutas()?;
        let _lista = self.lista.lock().unwrap_or_else(|p| p.into_inner());
        let mut lista = cargar_lista(r);
        if lista.no_escribir {
            return Err(lista_protegida());
        }
        if self.base_abierta().is_some_and(|b| b.id == id) {
            return Err(Fallo::de("abierta", id));
        }
        let antes = lista.organizaciones.len();
        lista.organizaciones.retain(|o| o.id != id);
        if lista.organizaciones.len() == antes {
            return Err(Fallo::de("desconocido", id));
        }
        escribir_lista(r, &lista)
    }

    pub fn colorear(&self, id: &str, color: &str) -> Result<(), Fallo> {
        let r = self.rutas()?;
        if !es_color_valido(color) {
            return Err(Fallo::de("contenido_invalido", color));
        }
        let _lista = self.lista.lock().unwrap_or_else(|p| p.into_inner());
        let mut lista = cargar_lista(r);
        if lista.no_escribir {
            return Err(lista_protegida());
        }
        let e = lista
            .organizaciones
            .iter_mut()
            .find(|o| o.id == id)
            .ok_or_else(|| Fallo::de("desconocido", id))?;
        e.color = color.into();
        escribir_lista(r, &lista)
    }

    fn listar_eliminadas(&self) -> Result<Vec<EliminadaVista>, Fallo> {
        Ok(organizaciones::listar_eliminadas(self.rutas()?))
    }

    fn borrar_eliminada(&self, nombre: &str) -> Result<(), Fallo> {
        let r = self.rutas()?;
        let _lista = self.lista.lock().unwrap_or_else(|p| p.into_inner());
        organizaciones::borrar_eliminada(r, nombre)
    }

    fn restaurar_eliminada(&self, nombre: &str, migraciones: &[&str]) -> Result<String, Fallo> {
        let r = self.rutas()?;
        let _lista = self.lista.lock().unwrap_or_else(|p| p.into_inner());
        let abierta = self.base_abierta().map(|b| b.id);
        organizaciones::restaurar_eliminada(r, nombre, abierta.as_deref(), migraciones)
    }

    /// El `.boldo` abierto en ese trabajo, como organización nueva, con la lista tomada todo el tiempo. Al salir bien el trabajo se
    /// cierra, para que se pueda abrir la nueva; si falla, sigue abierto para reintentar o cancelar.
    fn como_nueva(&self, sesiones: &Sesiones, trabajo: &str) -> Result<String, Fallo> {
        let r = self.rutas()?;
        let i = sesiones.tomar_importacion(trabajo)?;
        let hecho = {
            let _lista = self.lista.lock().unwrap_or_else(|p| p.into_inner());
            intercambio::como_nueva(&i, r)
        };
        if hecho.is_ok() {
            sesiones.cancelar(trabajo);
        } else {
            let _ = sesiones.guardar_importacion(trabajo, i);
        }
        hecho
    }

    /// Crea una organización y devuelve su id. No cambia de base: la abre `abrir_organizacion`. Usa `boldo.db` si está libre,
    /// abierto o no; si no, una carpeta nueva. `sentencias` viene de la interfaz: `db::lote` deja pasar solo lo permitido.
    pub fn crear(
        &self,
        sentencias: &[Sentencia],
        version_app: &str,
        ejemplo: bool,
        migraciones: &[&str],
    ) -> Result<String, Fallo> {
        let r = self.rutas()?;
        let mut conn = self
            .conn
            .lock()
            .map_err(|_| "La conexión quedó en un estado inválido.".to_string())?;
        let _lista = self.lista.lock().unwrap_or_else(|p| p.into_inner());
        let mut lista = cargar_lista(r);
        if lista.no_escribir {
            return Err(lista_protegida());
        }
        // si no se puede escribir, se sabe antes de tocar nada: en `boldo.db` el lote no tiene vuelta atrás
        escribir_lista(r, &lista)?;
        // shortcut: si la lista deja de poder escribirse justo entre esa escritura y la de aquí, en `boldo.db` las filas quedan
        // sin listar, y si hay otras entradas no se vuelven a ver; deshacer el lote si llega a pasar
        let llenar = |l: &mut Lista, e: Entrada, c: &mut Connection| -> Result<(), Fallo> {
            db::lote(c, sentencias, version_app)?;
            anotar_creada(l, e, c, ejemplo);
            escribir_lista(r, l)
        };
        match self.base_abierta().filter(|b| b.bd == r.bd) {
            Some(b) => {
                if let Some(c) = conn.as_mut()
                    && principal_libre(&lista, &b.id, c)
                {
                    llenar(&mut lista, Entrada::principal(&b.id), c)?;
                    return Ok(b.id);
                }
            }
            None => {
                if let Some(mut a) = abrir_principal_libre(r, &lista, migraciones) {
                    llenar(&mut lista, Entrada::principal(&a.id), &mut a.conn)?;
                    return Ok(a.id);
                }
            }
        }
        crear_en_carpeta(r, &mut lista, migraciones, llenar)
    }

    /// Deja un archivo en la lista, con ella tomada todo el tiempo. Si hay que preguntar, queda pendiente con lo que ya se
    /// confirmó más lo que se pregunta, que vale solo si la respuesta es sí. La abierta no se reemplaza: su archivo está ahí.
    fn agregar_archivo_con(
        &self,
        ruta: PathBuf,
        buscando: Option<String>,
        mut confirmados: Vec<&'static str>,
        agregar: Agregar,
    ) -> Result<ArchivoAgregado, Fallo> {
        let r = self.rutas()?;
        let hecho = {
            let _lista = self.lista.lock().unwrap_or_else(|p| p.into_inner());
            // `base` se toma y se suelta aquí mismo: nadie la retiene esperando `lista`, y `ya_abierta` ya va en este orden
            if let Some(b) = &buscando
                && self.base_abierta().is_some_and(|abierta| abierta.id == *b)
            {
                return Err(Fallo::de("abierta", b));
            }
            agregar(r, &ruta, buscando.as_deref(), &confirmados)?
        };
        if let Some(motivo) = hecho.pide {
            confirmados.push(motivo);
            *self.pendiente.lock().unwrap_or_else(|p| p.into_inner()) =
                Some((ruta, buscando, confirmados));
        }
        Ok(hecho)
    }

    /// Responde lo que preguntó `agregar_archivo_con`, una sola vez. Con un sí se revisa de nuevo: el archivo pudo cambiar.
    fn confirmar_archivo_con(
        &self,
        si: bool,
        agregar: Agregar,
    ) -> Result<Option<ArchivoAgregado>, Fallo> {
        let pendiente = self
            .pendiente
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .take();
        match pendiente {
            Some((ruta, buscando, confirmados)) if si => self
                .agregar_archivo_con(ruta, buscando, confirmados, agregar)
                .map(Some),
            _ => Ok(None),
        }
    }

    pub fn base_abierta(&self) -> Option<Base> {
        self.base.lock().unwrap_or_else(|p| p.into_inner()).clone()
    }

    fn soltar_bloqueo(&self) {
        *self.bloqueo.lock().unwrap_or_else(|p| p.into_inner()) = None;
    }

    fn motivo_sin_base(&self) -> String {
        self.error
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
            .unwrap_or_else(|| "La base de datos no está abierta.".into())
    }

    /// La base abierta, solo si es la que cree tener quien pregunta.
    fn comprobar(&self, base_id: &str) -> Result<Base, String> {
        match self.base_abierta() {
            Some(b) if b.id == base_id => Ok(b),
            Some(_) => Err(OTRA_BASE.into()),
            None => Err(self.motivo_sin_base()),
        }
    }

    pub(crate) fn base(&self, base_id: &str) -> Result<Base, Fallo> {
        Ok(self.comprobar(base_id)?)
    }

    /// El seguro contra mezclas: compara con `conn` tomado, que es con lo que se cambia de base.
    pub(crate) fn con_conexion<T, E: From<String>>(
        &self,
        base_id: &str,
        f: impl FnOnce(&mut Connection) -> Result<T, E>,
    ) -> Result<T, E> {
        let mut guardia = self
            .conn
            .lock()
            .map_err(|_| "La conexión quedó en un estado inválido.".to_string())?;
        self.comprobar(base_id)?;
        let conn = guardia.as_mut().ok_or_else(|| self.motivo_sin_base())?;
        f(conn)
    }

    /// Como `con_conexion`, para lo que cierra y reemplaza la conexión: restaurar y reemplazar.
    pub(crate) fn con_ranura<T>(
        &self,
        base_id: &str,
        f: impl FnOnce(&mut Option<Connection>, &Base) -> Result<T, Fallo>,
    ) -> Result<T, Fallo> {
        let mut guardia = self
            .conn
            .lock()
            .map_err(|_| "La conexión quedó en un estado inválido.".to_string())?;
        let base = self.base(base_id)?;
        f(&mut guardia, &base)
    }

    /// Cierra la conexión al salir: SQLite vuelca el WAL y borra -wal/-shm. Si un respaldo tiene la
    /// conexión, espera `espera` y se rinde (devuelve false) para no colgar el cierre.
    pub fn cerrar_ordenado(&self, espera: Duration) -> bool {
        let limite = Instant::now() + espera;
        loop {
            match self.conn.try_lock() {
                Ok(mut g) => {
                    if let Some(c) = g.take() {
                        let _ = c.close();
                    }
                    self.soltar_bloqueo();
                    return true;
                }
                Err(TryLockError::Poisoned(p)) => {
                    drop(p.into_inner().take());
                    self.soltar_bloqueo();
                    return true;
                }
                Err(TryLockError::WouldBlock) if Instant::now() < limite => {
                    std::thread::sleep(Duration::from_millis(25))
                }
                Err(TryLockError::WouldBlock) => return false,
            }
        }
    }

    /// Perfil del WebView (localStorage, caché) de la portable: dentro de `datos/`. Instalada: el de Tauri.
    /// macOS no permite elegirlo: WKWebView usa siempre ~/Library/WebKit.
    /// Si no se pudo usar `datos/` (abierta desde el zip, pendrive de solo lectura, app translocada…), la
    /// pantalla de error usa el perfil por defecto de Tauri, fuera de la carpeta: es solo para mostrar el
    /// error, y una carpeta del sistema que se puede escribir es mejor que no poder mostrarlo.
    pub fn dir_webview(&self) -> Option<PathBuf> {
        let r = self.rutas.as_ref().filter(|r| r.portable)?;
        Some(r.datos.join("webview"))
    }

    /// Vuelve a abrir la base que cerró `cerrar_ordenado` cuando lo que venía después falló (p. ej. el instalador de
    /// Windows no se pudo lanzar). Con la base abierta no hace nada.
    pub fn reabrir(&self) -> Result<(), String> {
        let mut conn = self.conn.lock().unwrap_or_else(|p| p.into_inner());
        if conn.is_none() {
            let Some(base) = self.base_abierta() else {
                self.rutas
                    .as_ref()
                    .ok_or("No se ubicó la carpeta de datos.")?;
                // `abrir_inicial` falló: no hay base que reabrir y su motivo sigue en pantalla
                return Ok(());
            };
            let bloqueo = bloquear(&base.bd, ESPERA_CAMBIO).map_err(motivo_de_apertura)?;
            *conn = Some(db::abrir(&base.bd)?);
            *self.bloqueo.lock().unwrap_or_else(|p| p.into_inner()) = Some(bloqueo);
        }
        Ok(())
    }

    /// Rutas de datos, si se pudieron ubicar (las usa el actualizador).
    pub fn rutas_app(&self) -> Option<&Rutas> {
        self.rutas.as_ref()
    }

    fn rutas(&self) -> Result<&Rutas, Fallo> {
        self.rutas
            .as_ref()
            .ok_or_else(|| "No se ubicó la carpeta de datos.".to_string().into())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InfoApp {
    base_id: String,
    dir_datos: String,
    ruta_bd: String,
    portable: bool,
    version_esquema: i64,
    error: Option<String>,
    aviso_inicio: Option<AvisoInicio>,
}

/// En un hilo aparte: mira cada archivo, y una unidad externa lenta no debe congelar la ventana.
#[tauri::command]
pub async fn listar_organizaciones(app: AppHandle) -> Result<Vec<OrganizacionVista>, Fallo> {
    tauri::async_runtime::spawn_blocking(move || app.state::<Estado>().listar_organizaciones())
        .await
        .map_err(|e| e.to_string())?
}

/// En un hilo aparte: abrir puede migrar y hacer su respaldo. Sin `base_id`: es lo que cambia la base.
#[tauri::command]
pub async fn abrir_organizacion(app: AppHandle, id: String) -> Result<OrganizacionVista, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let sesiones = app.state::<Sesiones>();
        app.state::<Estado>()
            .cambiar_a(&id, &|| sesiones.ocupada(), db::MIGRACIONES)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// En un hilo aparte: crea y migra un archivo. Sin `base_id`: no es un dato de la base abierta.
#[tauri::command]
pub async fn crear_organizacion(
    app: AppHandle,
    sentencias: Vec<Sentencia>,
    version_app: String,
    ejemplo: bool,
) -> Result<String, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<Estado>()
            .crear(&sentencias, &version_app, ejemplo, db::MIGRACIONES)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// En un hilo aparte, como las que siguen: espera `lista`, que `restaurar_eliminada` retiene toda la copia, y en el hilo principal
/// congelaría la ventana.
#[tauri::command]
pub async fn quitar_organizacion(app: AppHandle, id: String) -> Result<(), Fallo> {
    tauri::async_runtime::spawn_blocking(move || app.state::<Estado>().quitar(&id))
        .await
        .map_err(|e| e.to_string())?
}

/// En un hilo aparte: la copia lee el archivo entero, y pasar a otra puede migrarla. Sin `base_id`: no es un dato de la abierta.
#[tauri::command]
pub async fn eliminar_organizacion(
    app: AppHandle,
    id: String,
    guardar_copia: bool,
    borrar_archivo: bool,
) -> Result<Option<OrganizacionVista>, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let sesiones = app.state::<Sesiones>();
        app.state::<Estado>().eliminar(
            &id,
            guardar_copia,
            borrar_archivo,
            &|| sesiones.ocupada(),
            db::MIGRACIONES,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn color_organizacion(app: AppHandle, id: String, color: String) -> Result<(), Fallo> {
    tauri::async_runtime::spawn_blocking(move || app.state::<Estado>().colorear(&id, &color))
        .await
        .map_err(|e| e.to_string())?
}

/// En un hilo aparte: espera `conn` y `lista`.
#[tauri::command]
pub async fn sincronizar_organizacion(app: AppHandle, base_id: String) -> Result<(), Fallo> {
    tauri::async_runtime::spawn_blocking(move || app.state::<Estado>().sincronizar(&base_id))
        .await
        .map_err(|e| e.to_string())?
}

/// En un hilo aparte: mira cada copia.
#[tauri::command]
pub async fn listar_eliminadas(app: AppHandle) -> Result<Vec<EliminadaVista>, Fallo> {
    tauri::async_runtime::spawn_blocking(move || app.state::<Estado>().listar_eliminadas())
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn borrar_eliminada(app: AppHandle, nombre: String) -> Result<(), Fallo> {
    tauri::async_runtime::spawn_blocking(move || app.state::<Estado>().borrar_eliminada(&nombre))
        .await
        .map_err(|e| e.to_string())?
}

/// En un hilo aparte: copia el archivo entero. Devuelve el id de la nueva, que abre `abrir_organizacion`.
#[tauri::command]
pub async fn restaurar_eliminada(app: AppHandle, nombre: String) -> Result<String, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<Estado>()
            .restaurar_eliminada(&nombre, db::MIGRACIONES)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Pide un `.db` y lo deja en la lista, sin abrirlo. `None` si no se eligió nada. En un hilo aparte: revisarlo lo lee entero.
#[tauri::command]
pub async fn agregar_archivo_organizacion(
    app: AppHandle,
    buscando: Option<String>,
) -> Result<Option<ArchivoAgregado>, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let estado = app.state::<Estado>();
        *estado.pendiente.lock().unwrap_or_else(|p| p.into_inner()) = None;
        let elegido = dialogo_con(&app, "db").blocking_pick_file();
        let Some(ruta) = elegido.and_then(|f| f.into_path().ok()) else {
            return Ok(None);
        };
        estado
            .agregar_archivo_con(ruta, buscando, Vec::new(), &agregar_de_verdad)
            .map(Some)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// La respuesta a lo que preguntó `agregar_archivo_organizacion`. `None` si no se sigue.
#[tauri::command]
pub async fn confirmar_archivo_organizacion(
    app: AppHandle,
    si: bool,
) -> Result<Option<ArchivoAgregado>, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<Estado>()
            .confirmar_archivo_con(si, &agregar_de_verdad)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn info_app(estado: State<Estado>) -> InfoApp {
    let r = estado.rutas.as_ref();
    InfoApp {
        base_id: estado.base_abierta().map(|b| b.id).unwrap_or_default(),
        dir_datos: r.map(|r| r.datos.display().to_string()).unwrap_or_default(),
        ruta_bd: r.map(|r| r.bd.display().to_string()).unwrap_or_default(),
        portable: r.is_some_and(|r| r.portable),
        version_esquema: estado.version_esquema.load(Ordering::Relaxed),
        error: estado
            .error
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone(),
        aviso_inicio: estado
            .aviso_inicio
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone(),
    }
}

// En `spawn_blocking`: ni el hilo principal ni los trabajadores de tokio quedan esperando la conexión mientras un respaldo
// o una importación la tienen. El orden de los lotes lo guarda `colaLotes` en src/db/cliente.ts.
#[tauri::command]
pub async fn db_consultar(
    app: AppHandle,
    base_id: String,
    sql: String,
    params: Vec<Value>,
) -> Result<Vec<Map<String, Value>>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<Estado>()
            .con_conexion(&base_id, |c| db::consultar(c, &sql, &params))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn db_lote(
    app: AppHandle,
    base_id: String,
    sentencias: Vec<Sentencia>,
    version_app: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<Estado>()
            .con_conexion(&base_id, |c| db::lote(c, &sentencias, &version_app))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn listar_respaldos(app: AppHandle, base_id: String) -> Result<Vec<Respaldo>, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        respaldos::listar(&app.state::<Estado>().base(&base_id)?.respaldos)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Como `respaldar_ahora`, pero con un nombre propio que la poda nunca borra: lo usa «reemplazar los datos».
#[tauri::command]
pub async fn respaldar_antes_de_reemplazar(
    app: AppHandle,
    base_id: String,
) -> Result<String, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let estado = app.state::<Estado>();
        let dir = estado.base(&base_id)?.respaldos;
        estado.con_conexion(&base_id, |c| {
            respaldos::respaldar_antes_de_reemplazar(c, &dir, &respaldos::sello_local(c)?)
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Antes de optimizar las fotos: conserva las originales, y de estos quedan los últimos 3.
#[tauri::command]
pub async fn respaldar_antes_de_optimizar(
    app: AppHandle,
    base_id: String,
) -> Result<String, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let estado = app.state::<Estado>();
        let dir = estado.base(&base_id)?.respaldos;
        estado.con_conexion(&base_id, |c| {
            respaldos::respaldar_antes_de_optimizar(c, &dir, &respaldos::sello_local(c)?)
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// En un hilo aparte: el VACUUM INTO no congela la ventana.
#[tauri::command]
pub async fn respaldar_ahora(app: AppHandle, base_id: String) -> Result<String, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let estado = app.state::<Estado>();
        let dir = estado.base(&base_id)?.respaldos;
        estado.con_conexion(&base_id, |c| {
            respaldos::respaldar(c, &dir, &respaldos::sello_local(c)?)
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Si sale bien, reinicia la app: todo el estado (Rust y frontend) se vuelve a cargar desde la base restaurada.
#[tauri::command]
pub async fn restaurar_respaldo(
    app: AppHandle,
    base_id: String,
    nombre: String,
) -> Result<(), Fallo> {
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        app2.state::<Estado>().con_ranura(&base_id, |conexion, b| {
            respaldos::restaurar(conexion, b, &nombre, db::MIGRACIONES)
        })
    })
    .await
    .map_err(|e| e.to_string())??;
    app.restart()
}

/// Abre una carpeta en el gestor de archivos. En la portable de Linux, xdg-open se lanza sin las variables que
/// la app apunta a `datos/` (ver `rutas::entorno_portable`): un gestor de archivos lanzado directamente las
/// heredaría y pondría su papelera y sus recientes en el pendrive. Quedan sin definir, o sea, las por defecto.
fn abrir_carpeta(app: &AppHandle, r: &Rutas, carpeta: &std::path::Path) -> Result<(), Fallo> {
    #[cfg(target_os = "linux")]
    if r.portable {
        let mut xdg = std::process::Command::new("xdg-open");
        for (nombre, _) in rutas::entorno_portable("linux", &r.datos) {
            xdg.env_remove(nombre);
        }
        if let Ok(mut hijo) = xdg.arg(carpeta).spawn() {
            // se espera en otro hilo para no dejar un proceso zombi
            std::thread::spawn(move || hijo.wait());
            return Ok(());
        }
    }
    #[cfg(not(target_os = "linux"))]
    let _ = r;
    app.opener()
        .open_path(carpeta.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string().into())
}

/// Abre la carpeta conocida por Rust; la interfaz nunca envía una ruta.
#[tauri::command]
pub fn abrir_carpeta_respaldos(
    app: AppHandle,
    estado: State<Estado>,
    base_id: String,
) -> Result<(), Fallo> {
    let base = estado.base(&base_id)?;
    abrir_carpeta(&app, estado.rutas()?, &base.respaldos)
}

/// Datos del proyecto abierto (modo, ruta, tamaño, última modificación); la ruta la conoce Rust.
#[tauri::command]
pub fn info_proyecto(estado: State<Estado>, base_id: String) -> Result<InfoProyecto, Fallo> {
    let base = estado.base(&base_id)?;
    Ok(rutas::info_proyecto(estado.rutas()?, &base)?)
}

/// Abre la carpeta de datos conocida por Rust; la interfaz nunca envía una ruta.
#[tauri::command]
pub fn abrir_carpeta_datos(app: AppHandle, estado: State<Estado>) -> Result<(), Fallo> {
    let r = estado.rutas()?;
    abrir_carpeta(&app, r, &r.datos)
}

#[derive(Clone, Serialize)]
struct Avance {
    trabajo: String,
    etapa: &'static str,
    hecho: u64,
    total: u64,
}

fn avisar(app: &AppHandle, trabajo: &str, etapa: &'static str, hecho: u64, total: u64) {
    let _ = app.emit(
        "intercambio-avance",
        Avance {
            trabajo: trabajo.to_string(),
            etapa,
            hecho,
            total,
        },
    );
}

/// El avance de `etapa`; deja de seguir cuando se cancela ese trabajo.
fn seguimiento(
    app: &AppHandle,
    trabajo: &str,
    etapa: &'static str,
) -> impl FnMut(u64, u64) -> bool + use<> {
    let (app, trabajo) = (app.clone(), trabajo.to_string());
    move |hecho, total| {
        avisar(&app, &trabajo, etapa, hecho, total);
        app.state::<Sesiones>().sigue(&trabajo)
    }
}

/// Diálogo nativo desde Rust: la interfaz nunca ve ni envía una ruta, y no necesita ningún permiso del plugin.
fn dialogo(app: &AppHandle) -> FileDialogBuilder<tauri::Wry> {
    dialogo_con(app, "boldo")
}

fn dialogo_con(app: &AppHandle, extension: &str) -> FileDialogBuilder<tauri::Wry> {
    let d = app.dialog().file().add_filter("BoldoAtlas", &[extension]);
    match app.get_webview_window("main") {
        Some(v) => d.set_parent(&v),
        None => d,
    }
}

fn nombre_archivo(ruta: &std::path::Path) -> String {
    ruta.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Copia la base y le quita lo que no va (`raices` None: va toda). Queda esperando a que se elija dónde guardarla.
#[tauri::command]
pub async fn exportar_preparar(
    app: AppHandle,
    base_id: String,
    trabajo: String,
    raices: Option<Vec<String>>,
) -> Result<alcance::ResumenExportacion, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let (estado, sesiones) = (app.state::<Estado>(), app.state::<Sesiones>());
        let datos = &estado.rutas()?.datos;
        sesiones.empezar(&trabajo)?;
        avisar(&app, &trabajo, "copiando", 0, 0);
        let copia = estado.con_conexion(&base_id, |c| alcance::copiar(c, datos))?;
        let (temporal, resumen) = alcance::preparar(copia, datos, raices.as_deref())?;
        // si se canceló mientras tanto, el temporal se borra al soltarlo
        sesiones.guardar_exportacion(&trabajo, temporal)?;
        Ok(resumen)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
pub struct Guardado {
    nombre: String,
    codigo: String,
}

/// Pregunta dónde guardar. false si no se eligió un lugar; la copia sigue preparada. No es un trabajo: espera al usuario.
#[tauri::command]
pub async fn exportar_elegir_destino(app: AppHandle, trabajo: String) -> Result<bool, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let sesiones = app.state::<Sesiones>();
        let copia = sesiones.ruta_exportacion(&trabajo)?;
        let elegido = dialogo(&app)
            .set_file_name(intercambio::nombre_sugerido(&copia)?)
            .blocking_save_file();
        let Some(destino) = elegido.and_then(|f| f.into_path().ok()) else {
            return Ok(false);
        };
        sesiones.guardar_destino(&trabajo, intercambio::con_extension(destino)?)?;
        Ok(true)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Cifra al destino elegido. Devuelve el código una sola vez.
#[tauri::command]
pub async fn exportar_guardar(app: AppHandle, trabajo: String) -> Result<Guardado, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let (temporal, destino) = app.state::<Sesiones>().tomar_exportacion(&trabajo)?;
        let codigo = intercambio::guardar(
            temporal.ruta(),
            &destino,
            seguimiento(&app, &trabajo, "cifrando"),
        )?;
        Ok(Guardado {
            nombre: nombre_archivo(&destino),
            codigo,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
pub struct ArchivoElegido {
    nombre: String,
    bytes: u64,
}

/// Elige el archivo a importar. Rust se queda con la ruta; la interfaz solo recibe qué mostrar.
#[tauri::command]
pub async fn importar_elegir(
    app: AppHandle,
    trabajo: String,
) -> Result<Option<ArchivoElegido>, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let sesiones = app.state::<Sesiones>();
        // no elegir nada deja como estaba lo que ya se había elegido
        if !sesiones.sigue(&trabajo) {
            sesiones.empezar(&trabajo)?;
        }
        let Some(ruta) = dialogo(&app)
            .blocking_pick_file()
            .and_then(|f| f.into_path().ok())
        else {
            return Ok(None);
        };
        let elegido = ArchivoElegido {
            nombre: nombre_archivo(&ruta),
            bytes: std::fs::metadata(&ruta)?.len(),
        };
        sesiones.guardar_archivo(&trabajo, ruta)?;
        Ok(Some(elegido))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Descifra, revisa y calcula lo que pasaría, sin aplicar nada. El código no sale de esta función.
#[tauri::command]
pub async fn importar_abrir(
    app: AppHandle,
    base_id: String,
    trabajo: String,
    codigo: String,
) -> Result<intercambio::ResumenImportacion, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let (estado, sesiones) = (app.state::<Estado>(), app.state::<Sesiones>());
        let archivo = sesiones.archivo(&trabajo)?;
        let i = intercambio::abrir(
            &archivo,
            &estado.rutas()?.datos,
            &codigo,
            db::MIGRACIONES,
            seguimiento(&app, &trabajo, "descifrando"),
        )?;
        avisar(&app, &trabajo, "revisando", 0, 0);
        let resumen = estado.con_conexion(&base_id, |c| intercambio::revisar(c, &i))?;
        sesiones.guardar_importacion(&trabajo, i)?;
        Ok(resumen)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// «Agregar lo nuevo». Si falla, la importación sigue abierta para reintentar o cancelar.
#[tauri::command]
pub async fn importar_agregar(
    app: AppHandle,
    base_id: String,
    trabajo: String,
    lugares: HashMap<String, Option<String>>,
    version_app: String,
) -> Result<fusion::Informe, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let (estado, sesiones) = (app.state::<Estado>(), app.state::<Sesiones>());
        let dir = estado.base(&base_id)?.respaldos;
        let i = sesiones.tomar_importacion(&trabajo)?;
        let hecho = estado.con_conexion(&base_id, |c| {
            intercambio::agregar(c, &dir, &i, &lugares, &version_app)
        });
        if hecho.is_err() {
            let _ = sesiones.guardar_importacion(&trabajo, i);
        }
        hecho
    })
    .await
    .map_err(|e| e.to_string())?
}

/// «Reemplazar todo». Si sale bien, reinicia la app, como al restaurar un respaldo.
#[tauri::command]
pub async fn importar_reemplazar(
    app: AppHandle,
    base_id: String,
    trabajo: String,
) -> Result<(), Fallo> {
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (estado, sesiones) = (app2.state::<Estado>(), app2.state::<Sesiones>());
        let i = sesiones.tomar_importacion(&trabajo)?;
        let hecho = estado.con_ranura(&base_id, |conexion, b| {
            intercambio::reemplazar(conexion, b, &i, db::MIGRACIONES)
        });
        if hecho.is_err() {
            let _ = sesiones.guardar_importacion(&trabajo, i);
        }
        hecho
    })
    .await
    .map_err(|e| e.to_string())??;
    app.restart()
}

/// «Como organización nueva». Devuelve su id, y no cambia de base. Sin `base_id`: no es un dato de la abierta.
#[tauri::command]
pub async fn importar_como_nueva(app: AppHandle, trabajo: String) -> Result<String, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<Estado>()
            .como_nueva(&app.state::<Sesiones>(), &trabajo)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// «Revisar y decidir»: compara el archivo con la base, sin escribir nada. Comparar de nuevo conserva las decisiones sobre las
/// filas que no cambiaron.
#[tauri::command]
pub async fn importar_comparar(
    app: AppHandle,
    base_id: String,
    trabajo: String,
    lugares: HashMap<String, Option<String>>,
) -> Result<revision::ResumenRevision, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let (estado, sesiones) = (app.state::<Estado>(), app.state::<Sesiones>());
        let i = sesiones.importacion(&trabajo)?;
        let anterior = sesiones.revision(&trabajo).ok();
        let guardia = anterior.as_ref().map(|a| leer(a));
        let r = estado.con_conexion(&base_id, |c| {
            revision::abrir(
                c,
                &i,
                lugares,
                guardia.as_deref(),
                seguimiento(&app, &trabajo, "comparando"),
            )
        })?;
        drop(guardia);
        let resumen = r.resumen();
        sesiones.guardar_revision(&trabajo, r)?;
        Ok(resumen)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Volver a elegir qué hacer con el archivo. Las decisiones se pierden; la interfaz ya avisó.
#[tauri::command]
pub fn importar_volver(sesiones: State<Sesiones>, trabajo: String) {
    sesiones.soltar_revision(&trabajo);
}

fn leer(r: &RwLock<revision::Revision>) -> std::sync::RwLockReadGuard<'_, revision::Revision> {
    r.read().unwrap_or_else(|p| p.into_inner())
}

fn escribir(r: &RwLock<revision::Revision>) -> std::sync::RwLockWriteGuard<'_, revision::Revision> {
    r.write().unwrap_or_else(|p| p.into_inner())
}

/// Lo que necesita mirar la revisión, ya abierta: la base y el archivo, solo para leer.
fn con_revision<T: Send + 'static>(
    app: AppHandle,
    base_id: String,
    trabajo: String,
    f: impl FnOnce(&Connection, &Connection, &revision::Revision) -> Result<T, Fallo> + Send + 'static,
) -> tauri::async_runtime::JoinHandle<Result<T, Fallo>> {
    tauri::async_runtime::spawn_blocking(move || {
        let (estado, sesiones) = (app.state::<Estado>(), app.state::<Sesiones>());
        let (i, r) = (
            sesiones.importacion(&trabajo)?,
            sesiones.revision(&trabajo)?,
        );
        let imp = i.solo_lectura()?;
        let guardia = leer(&r);
        estado.con_conexion(&base_id, |c| f(c, &imp, &guardia))
    })
}

#[tauri::command]
pub async fn revision_resumen(
    app: AppHandle,
    trabajo: String,
) -> Result<revision::ResumenRevision, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let r = app.state::<Sesiones>().revision(&trabajo)?;
        let resumen = leer(&r).resumen();
        Ok(resumen)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn revision_pagina(
    app: AppHandle,
    base_id: String,
    trabajo: String,
    filtro: revision::Filtro,
) -> Result<revision::Pagina, Fallo> {
    con_revision(app, base_id, trabajo, move |c, imp, r| {
        r.pagina(c, imp, &filtro)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn revision_detalle(
    app: AppHandle,
    base_id: String,
    trabajo: String,
    tabla: String,
    id: String,
) -> Result<revision::DetalleCaso, Fallo> {
    con_revision(app, base_id, trabajo, move |c, imp, r| {
        r.detalle(c, imp, &tabla, &id)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Anota una decisión. Lo aplicado sale de aquí, no de lo que la interfaz mande al final.
#[tauri::command]
pub async fn revision_decidir(
    app: AppHandle,
    trabajo: String,
    tabla: String,
    id: String,
    eleccion: revision::Eleccion,
) -> Result<revision::ResumenRevision, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let r = app.state::<Sesiones>().revision(&trabajo)?;
        let mut g = escribir(&r);
        g.decidir(&tabla, &id, eleccion)?;
        Ok(g.resumen())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn revision_masivo(
    app: AppHandle,
    trabajo: String,
    accion: revision::Masivo,
) -> Result<revision::ResumenRevision, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let r = app.state::<Sesiones>().revision(&trabajo)?;
        let mut g = escribir(&r);
        g.masivo(accion);
        Ok(g.resumen())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// La misma pasada que al aplicar, deshecha al final: dice qué detendría «Aplicar» con las decisiones de ahora.
#[tauri::command]
pub async fn revision_verificar(
    app: AppHandle,
    base_id: String,
    trabajo: String,
) -> Result<revision::ResumenRevision, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let (estado, sesiones) = (app.state::<Estado>(), app.state::<Sesiones>());
        let (i, r) = (
            sesiones.importacion(&trabajo)?,
            sesiones.revision(&trabajo)?,
        );
        let v = {
            let g = leer(&r);
            let sesiones = &sesiones;
            let trabajo = &trabajo;
            estado.con_conexion(&base_id, |c| {
                revision::verificar(c, &i, &g, || sesiones.sigue(trabajo))
            })?
        };
        let mut g = escribir(&r);
        g.anotar_verificacion(v);
        Ok(g.resumen())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn revision_bloqueos(
    app: AppHandle,
    base_id: String,
    trabajo: String,
    desde: usize,
    cuantos: usize,
) -> Result<revision::PaginaBloqueos, Fallo> {
    con_revision(app, base_id, trabajo, move |c, imp, r| {
        r.pagina_bloqueos(c, imp, desde, cuantos)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// A qué se puede reasignar una referencia: filas vivas de esta base.
#[tauri::command]
pub async fn revision_opciones(
    app: AppHandle,
    base_id: String,
    trabajo: String,
    destino: String,
    texto: String,
) -> Result<Vec<revision::Opcion>, Fallo> {
    con_revision(app, base_id, trabajo, move |c, _, _| {
        revision::opciones(c, &destino, &texto)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Aplica lo decidido en esta revisión, en una sola transacción y con respaldo. `version` es la revisión que se vio: si hubo
/// otra decisión después, o la base cambió, no se escribe nada.
#[tauri::command]
pub async fn revision_aplicar(
    app: AppHandle,
    base_id: String,
    trabajo: String,
    version: u64,
    confirmado: bool,
    version_app: String,
) -> Result<revision::InformeRevision, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        let (estado, sesiones) = (app.state::<Estado>(), app.state::<Sesiones>());
        let dir = estado.base(&base_id)?.respaldos;
        let r = sesiones.revision(&trabajo)?;
        let i = sesiones.importacion(&trabajo)?;
        let hecho = {
            let g = leer(&r);
            estado.con_conexion(&base_id, |c| {
                revision::aplicar(c, &dir, &i, &g, version, confirmado, &version_app)
            })
        };
        // ya aplicado no se puede aplicar dos veces
        if hecho.is_ok() {
            let _ = sesiones.tomar_importacion(&trabajo);
            sesiones.soltar_revision(&trabajo);
        }
        hecho
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Detiene ese trabajo y borra sus temporales. Nada se aplicó.
#[tauri::command]
pub fn intercambio_cancelar(sesiones: State<Sesiones>, trabajo: String) {
    sesiones.cancelar(&trabajo);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn estado(conn: Connection) -> Estado {
        Estado::de_prueba(Some(conn), None, None)
    }

    /// La carpeta de una portable, temporal: las pruebas nunca tocan los datos reales.
    fn rutas_de_prueba() -> (tempfile::TempDir, Rutas) {
        let exe = tempfile::tempdir().unwrap();
        std::fs::write(exe.path().join("portable.flag"), "").unwrap();
        let r = rutas::dir_datos(exe.path(), None).unwrap();
        (exe, r)
    }

    #[test]
    fn cerrar_ordenado_suelta_el_bloqueo() {
        let (_exe, r) = rutas_de_prueba();
        let bd = r.bd.clone();
        let e = Estado::de_prueba(None, None, Some(r));
        e.abrir_inicial();
        let base = e.base_abierta().unwrap();
        assert_eq!(base.bd, bd);
        assert_eq!(
            e.version_esquema.load(Ordering::Relaxed),
            db::MIGRACIONES.len() as i64
        );
        assert_eq!(
            bloquear(&bd, ESPERA_CAMBIO).unwrap_err().codigo,
            "abierta_en_otra_copia"
        );
        assert!(e.cerrar_ordenado(Duration::from_secs(1)));
        bloquear(&bd, ESPERA_CAMBIO).unwrap();
        // la base sigue anotada: es a la que vuelve `reabrir`
        assert_eq!(e.base_abierta(), Some(base));
    }

    #[test]
    fn reabrir_vuelve_a_la_base_abierta_con_su_bloqueo() {
        let (_exe, r) = rutas_de_prueba();
        let bd = r.datos.join("otra.db");
        let respaldos = r.datos.join("otra-respaldos");
        let a = abrir_base(&bd, &respaldos, None, ESPERA_CAMBIO, db::MIGRACIONES)
            .ok()
            .unwrap();
        let base = Base {
            id: a.id.clone(),
            bd: bd.clone(),
            respaldos,
        };
        let principal = r.bd.clone();
        let e = Estado::de_prueba(Some(a.conn), Some(base), Some(r));
        *e.bloqueo.lock().unwrap() = Some(a.bloqueo);
        assert!(e.cerrar_ordenado(Duration::from_secs(1)));
        drop(bloquear(&bd, ESPERA_CAMBIO).unwrap());

        e.reabrir().unwrap();
        let id: String = e
            .con_conexion(&a.id, |c| {
                c.query_row("SELECT valor FROM meta WHERE clave = 'db_id'", [], |f| {
                    f.get(0)
                })
                .map_err(|x| x.to_string())
            })
            .unwrap();
        assert_eq!(id, a.id);
        assert!(!principal.exists());
        assert_eq!(
            bloquear(&bd, ESPERA_CAMBIO).unwrap_err().codigo,
            "abierta_en_otra_copia"
        );
    }

    #[test]
    fn abrir_inicial_con_esquema_nuevo_guarda_el_texto_de_hoy() {
        let (_exe, r) = rutas_de_prueba();
        let c = db::abrir(&r.bd).unwrap();
        c.pragma_update(None, "user_version", 99).unwrap();
        c.close().unwrap();
        let e = Estado::de_prueba(None, None, Some(r));
        e.abrir_inicial();
        let error = e.error.lock().unwrap().clone().unwrap();
        let esperado = format!(
            "esquema 99; esta app conoce hasta el {}",
            db::MIGRACIONES.len()
        );
        assert!(error.contains(&esperado), "{error}");
        assert!(e.conn.lock().unwrap().is_none());
        assert_eq!(e.base_abierta(), None);
        // el motivo también llega a quien pida datos
        let datos = e.con_conexion("A", |_| Ok::<_, String>(())).unwrap_err();
        assert_eq!(datos, error);
        // no hay nada que reabrir: si falló una actualización, sigue la pantalla de error
        e.reabrir().unwrap();
        assert!(e.conn.lock().unwrap().is_none());
    }

    #[test]
    fn el_motivo_de_otra_copia_es_el_que_traduce_la_interfaz() {
        assert_eq!(
            motivo_de_apertura(Fallo::de("abierta_en_otra_copia", "C:/x")),
            "Otra copia de BoldoAtlas tiene abierta esta base: C:/x"
        );
        // un motivo vacío dejaría pasar el arranque sin pantalla de error
        assert_eq!(
            motivo_de_apertura(db::SIN_ESPACIO.to_string().into()),
            db::SIN_ESPACIO
        );
    }

    /// Una base «A» en una carpeta temporal, ya migrada.
    fn con_base_a() -> (tempfile::TempDir, Estado) {
        let dir = tempfile::tempdir().unwrap();
        let bd = dir.path().join("a.db");
        let mut conn = db::abrir(&bd).unwrap();
        db::migrar(&mut conn, dir.path()).unwrap();
        db::asegurar_meta(&conn).unwrap();
        let base = Base {
            id: "A".into(),
            bd,
            respaldos: dir.path().join("respaldos"),
        };
        (dir, Estado::de_prueba(Some(conn), Some(base), None))
    }

    #[test]
    fn con_conexion_con_otra_base_no_ejecuta_nada() {
        let (_dir, e) = con_base_a();
        let mut corrio = false;
        let r: Result<(), String> = e.con_conexion("B", |_| {
            corrio = true;
            Ok(())
        });
        assert_eq!(r.unwrap_err(), "otra_base");
        assert!(!corrio);
        // y con la base que está abierta, sí
        e.con_conexion("A", |_| Ok::<_, String>(())).unwrap();
    }

    #[test]
    fn lote_con_base_antigua_no_escribe() {
        let (_dir, e) = con_base_a();
        let revision = || -> String {
            e.con_conexion("A", |c| {
                c.query_row(
                    "SELECT valor FROM meta WHERE clave = 'data_revision'",
                    [],
                    |f| f.get(0),
                )
                .map_err(|x| x.to_string())
            })
            .unwrap()
        };
        let antes = revision();
        let antigua = e.con_conexion("antigua", |c| db::lote(c, &[], "t"));
        assert_eq!(antigua.unwrap_err(), "otra_base");
        assert_eq!(revision(), antes);
        e.con_conexion("A", |c| db::lote(c, &[], "t")).unwrap();
        assert_ne!(revision(), antes);
    }

    #[test]
    fn con_ranura_y_base_rechazan_otra_base() {
        let (_dir, e) = con_base_a();
        let mut corrio = false;
        let r = e.con_ranura("B", |_, _| {
            corrio = true;
            Ok(())
        });
        assert_eq!(r.unwrap_err().codigo, "otra_base");
        assert!(!corrio);
        assert_eq!(e.base("B").unwrap_err().codigo, "otra_base");

        assert_eq!(e.base("A").unwrap().id, "A");
        let id = e.con_ranura("A", |ranura, base| {
            assert!(ranura.is_some());
            Ok(base.id.clone())
        });
        assert_eq!(id.unwrap(), "A");
    }

    #[test]
    fn sin_base_abierta_se_responde_el_motivo_y_no_otra_base() {
        let e = Estado::de_prueba(None, None, None);
        *e.error.lock().unwrap() = Some("motivo".into());
        assert_eq!(e.base("A").unwrap_err().detalle, "motivo");
        assert_eq!(
            e.con_ranura("A", |_, _| Ok(())).unwrap_err().detalle,
            "motivo"
        );
    }

    #[test]
    fn fallo_desde_texto_reconoce_otra_base_y_sin_espacio() {
        let de = |t: &str| Fallo::from(t.to_string());
        assert_eq!(de("otra_base").codigo, "otra_base");
        assert_eq!(de("sin_espacio").codigo, "sin_espacio");
        let otro = de("algo más");
        assert_eq!((otro.codigo, otro.detalle.as_str()), ("fallo", "algo más"));
    }

    #[test]
    fn un_disco_lleno_da_sin_espacio() {
        let io = std::io::Error::from(std::io::ErrorKind::StorageFull);
        assert_eq!(Fallo::from(io).codigo, "sin_espacio");
        let lleno = rusqlite::Error::SqliteFailure(rusqlite::ffi::Error::new(13), None);
        assert_eq!(
            lleno.sqlite_error_code(),
            Some(rusqlite::ErrorCode::DiskFull)
        );
        assert_eq!(Fallo::from(lleno).codigo, "sin_espacio");
        // los demás errores siguen como estaban
        let otro = std::io::Error::from(std::io::ErrorKind::NotFound);
        assert_eq!(Fallo::from(otro).codigo, "fallo");
    }

    #[test]
    fn cerrar_ordenado_no_deja_wal_ni_shm() {
        let dir = tempfile::tempdir().unwrap();
        let bd = dir.path().join("boldo.db");
        let mut conn = db::abrir(&bd).unwrap();
        db::migrar(&mut conn, dir.path()).unwrap();
        db::asegurar_meta(&conn).unwrap();
        db::lote(&mut conn, &[], "t").unwrap();
        let wal = dir.path().join("boldo.db-wal");
        assert!(wal.exists(), "con la conexión abierta el WAL existe");
        let e = estado(conn);
        assert!(e.cerrar_ordenado(Duration::from_secs(1)));
        assert!(!wal.exists());
        assert!(!dir.path().join("boldo.db-shm").exists());
        assert!(e.conn.lock().unwrap().is_none());
        // cerrar dos veces no falla
        assert!(e.cerrar_ordenado(Duration::from_millis(10)));
    }

    #[test]
    fn reabrir_tras_cerrar_deja_la_base_usable() {
        let exe = tempfile::tempdir().unwrap();
        std::fs::write(exe.path().join("portable.flag"), "").unwrap();
        let r = rutas::dir_datos(exe.path(), None).unwrap();
        let mut conn = db::abrir(&r.bd).unwrap();
        db::migrar(&mut conn, &r.respaldos).unwrap();
        db::asegurar_meta(&conn).unwrap();
        let base = Base {
            id: String::new(),
            bd: r.bd.clone(),
            respaldos: r.respaldos.clone(),
        };
        let e = Estado::de_prueba(Some(conn), Some(base), Some(r));
        // abierta: no hace nada
        e.reabrir().unwrap();
        assert!(e.cerrar_ordenado(Duration::from_secs(1)));
        assert!(e.conn.lock().unwrap().is_none());
        e.reabrir().unwrap();
        let n: i64 = e
            .con_conexion("", |c| {
                c.query_row("SELECT count(*) FROM meta", [], |f| f.get(0))
                    .map_err(|x| x.to_string())
            })
            .unwrap();
        assert!(n > 0);
    }

    #[test]
    fn reabrir_sin_rutas_falla_sin_entrar_en_panico() {
        let e = Estado::de_prueba(None, None, None);
        assert!(e.reabrir().is_err());
    }

    #[test]
    fn cerrar_ordenado_se_rinde_si_un_respaldo_tiene_la_conexion() {
        let dir = tempfile::tempdir().unwrap();
        let e = estado(db::abrir(&dir.path().join("boldo.db")).unwrap());
        let _ocupada = e.conn.lock().unwrap();
        let t = Instant::now();
        assert!(!e.cerrar_ordenado(Duration::from_millis(100)));
        assert!(t.elapsed() < Duration::from_secs(2));
    }
}

#[cfg(test)]
mod arranque_organizaciones {
    use super::*;
    use crate::organizaciones::prueba::{crear, entrada, escribir, interna, rutas, sin_rastros};
    use crate::organizaciones::{Entrada, Lista, base_de, cargar_lista, ruta_de};
    use std::fs;

    const YA: Duration = Duration::ZERO;

    fn arrancar(r: &Rutas) -> Estado {
        let e = Estado::de_prueba(None, None, Some(r.clone()));
        e.abrir_inicial_con(Duration::from_millis(100), db::MIGRACIONES);
        e
    }

    fn lista_del_json(r: &Rutas) -> Lista {
        serde_json::from_slice(&fs::read(r.datos.join("organizaciones.json")).unwrap()).unwrap()
    }

    /// Que quien arrancó tenga `boldo.db` y lo pueda usar.
    fn abrio_boldo_db(e: &Estado, r: &Rutas) -> Base {
        let base = e.base_abierta().unwrap();
        assert_eq!(base.bd, r.bd);
        assert_eq!(base.respaldos, r.respaldos);
        assert_eq!(*e.error.lock().unwrap(), None);
        e.con_conexion(&base.id, |_| Ok::<_, String>(())).unwrap();
        base
    }

    fn aviso(e: &Estado) -> (&'static str, String) {
        let a = e.aviso_inicio.lock().unwrap().clone().unwrap();
        (a.codigo, a.nombre)
    }

    /// `boldo.db` con datos y otra organización abierta después: es la que intentará abrir al arrancar.
    fn con_principal(r: &Rutas, ultima: Entrada) -> String {
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        escribir(r, vec![entrada(&id, "boldo.db", false, "2020"), ultima]);
        id
    }

    fn fija_meta(bd: &std::path::Path, clave: &str, valor: &str) {
        let c = db::abrir(bd).unwrap();
        c.execute(
            "INSERT OR REPLACE INTO meta (clave, valor) VALUES (?1, ?2)",
            [clave, valor],
        )
        .unwrap();
        c.close().unwrap();
    }

    #[test]
    fn primer_arranque_lista_boldo_db_sin_moverlo() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", &db::MIGRACIONES[..1]);
        let c = db::abrir(&r.bd).unwrap();
        c.execute(
            "INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at)
             VALUES ('u1', '00000000-0000-7000-8000-000000000001', 'Gerencia', 'x', 'x')",
            [],
        )
        .unwrap();
        c.close().unwrap();
        let respaldo = r.respaldos.join("boldo-20200101-0000.db");
        fs::write(&respaldo, "un respaldo").unwrap();

        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert_eq!(*e.aviso_inicio.lock().unwrap(), None);
        assert_eq!(
            e.version_esquema.load(Ordering::Relaxed),
            db::MIGRACIONES.len() as i64
        );
        let nombre: String = e
            .con_conexion(&id, |c| {
                c.query_row("SELECT nombre FROM unidades WHERE id = 'u1'", [], |f| {
                    f.get(0)
                })
                .map_err(|x| x.to_string())
            })
            .unwrap();
        assert_eq!(nombre, "Gerencia");
        assert_eq!(fs::read(&respaldo).unwrap(), b"un respaldo");
        assert!(fs::read_dir(&r.respaldos).unwrap().flatten().any(|f| {
            f.file_name()
                .to_string_lossy()
                .starts_with("antes-migracion-1-")
        }));

        let l = lista_del_json(&r);
        assert_eq!(l.version, 1);
        assert_eq!(l.organizaciones.len(), 1);
        let o = &l.organizaciones[0];
        assert_eq!(o.id, id);
        assert_eq!(o.ruta, "boldo.db");
        assert!(!o.externa);
        assert_eq!(o.nombre, "La mía");
        assert!(!r.datos.join("organizaciones").join(&id).exists());
    }

    #[test]
    fn sin_boldo_db_se_crea_vacio_y_no_se_lista() {
        let (_exe, r) = rutas();
        let e = arrancar(&r);
        abrio_boldo_db(&e, &r);
        assert!(r.bd.is_file());
        assert!(cargar_lista(&r).organizaciones.is_empty());
    }

    #[test]
    fn boldo_db_vaciado_sale_de_la_lista() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "", db::MIGRACIONES);
        escribir(&r, vec![entrada(&id, "boldo.db", false, "2020")]);
        abrio_boldo_db(&arrancar(&r), &r);
        assert!(lista_del_json(&r).organizaciones.is_empty());
    }

    #[test]
    fn rutas_relativas_sobreviven_a_mover_la_carpeta() {
        let (_exe, r) = rutas();
        let o = interna(&r, "2026");
        crear(&r.bd, "La mía", db::MIGRACIONES);
        escribir(&r, vec![o.clone()]);

        let nueva = tempfile::tempdir().unwrap();
        fs::write(nueva.path().join("portable.flag"), "").unwrap();
        fs::rename(&r.datos, nueva.path().join("datos")).unwrap();
        let movida = rutas::dir_datos(nueva.path(), None).unwrap();

        let e = arrancar(&movida);
        let base = e.base_abierta().unwrap();
        assert_eq!(base.id, o.id);
        assert!(base.bd.starts_with(&movida.datos), "{}", base.bd.display());
        assert_eq!(*e.aviso_inicio.lock().unwrap(), None);
    }

    #[test]
    fn arranca_en_la_ultima_abierta() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        let vieja = interna(&r, "2026-01-01T00:00:00.000Z");
        let ultima = interna(&r, "2026-06-01T00:00:00.000Z");
        escribir(
            &r,
            vec![
                entrada(&id, "boldo.db", false, "2025-01-01T00:00:00.000Z"),
                ultima.clone(),
                vieja.clone(),
            ],
        );
        let e = arrancar(&r);
        let base = e.base_abierta().unwrap();
        assert_eq!(base, base_de(&r, &ultima));
        assert!(base.respaldos.is_dir());
        assert_eq!(
            bloquear(&base.bd, YA).unwrap_err().codigo,
            "abierta_en_otra_copia"
        );

        // queda al día y con el nombre del archivo; las demás, como estaban
        let l = lista_del_json(&r);
        let de = |id: &str| l.organizaciones.iter().find(|o| o.id == id).unwrap();
        assert_ne!(de(&ultima.id).abierta, ultima.abierta);
        assert_eq!(de(&ultima.id).nombre, "Interna");
        assert_eq!(de(&ultima.id).color, ultima.color);
        assert_eq!(de(&vieja.id), &vieja);

        let vista = e.listar_organizaciones().unwrap();
        assert_eq!(vista.len(), 3);
        for v in &vista {
            assert_eq!(v.activa, v.id == ultima.id, "{}", v.nombre);
        }
    }

    #[test]
    fn con_la_ultima_ausente_abre_boldo_db_y_avisa() {
        let (_exe, r) = rutas();
        let afuera = tempfile::tempdir().unwrap();
        let pendrive = afuera.path().join("retirado.db");
        let ausente = entrada(
            &uuid::Uuid::now_v7().to_string(),
            pendrive.to_str().unwrap(),
            true,
            "2026",
        );
        let id = con_principal(&r, ausente.clone());

        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert_eq!(aviso(&e), ("no_encontrado", ausente.nombre.clone()));
        let detalle = e.aviso_inicio.lock().unwrap().clone().unwrap().detalle;
        assert!(detalle.contains(&ausente.ruta), "{detalle}");
        assert!(!pendrive.exists());

        // la ausente sigue, igual que estaba, para cuando vuelva el pendrive
        let l = lista_del_json(&r);
        assert_eq!(l.organizaciones.len(), 2);
        assert!(l.organizaciones.contains(&ausente));
        // `boldo.db` no pasa a ser la última: su hora sigue igual
        let principal = l.organizaciones.iter().find(|o| o.id == id).unwrap();
        assert_eq!(principal.abierta, "2020");
    }

    #[test]
    fn al_volver_el_pendrive_se_reabre_la_ultima() {
        let (_exe, r) = rutas();
        let afuera = tempfile::tempdir().unwrap();
        let pendrive = afuera.path().join("externa.db");
        let guardada = afuera.path().join("guardada.db");
        let id_externa = crear(&pendrive, "Del pendrive", db::MIGRACIONES);
        fs::rename(&pendrive, &guardada).unwrap();
        let o = entrada(&id_externa, pendrive.to_str().unwrap(), true, "2026");
        con_principal(&r, o);

        // el aviso se repite mientras no abra
        for _ in 0..2 {
            let e = arrancar(&r);
            abrio_boldo_db(&e, &r);
            assert_eq!(aviso(&e).0, "no_encontrado");
            assert!(e.cerrar_ordenado(Duration::from_secs(1)));
        }

        fs::rename(&guardada, &pendrive).unwrap();
        let e = arrancar(&r);
        assert_eq!(e.base_abierta().unwrap().id, id_externa);
        assert_eq!(*e.aviso_inicio.lock().unwrap(), None);
    }

    #[test]
    fn un_boldo_db_sin_entrada_se_lista_sin_pasar_a_ser_la_ultima() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        let afuera = tempfile::tempdir().unwrap();
        let ausente = entrada(
            &uuid::Uuid::now_v7().to_string(),
            afuera.path().join("retirado.db").to_str().unwrap(),
            true,
            "2026",
        );
        escribir(&r, vec![ausente.clone()]);

        let e = arrancar(&r);
        abrio_boldo_db(&e, &r);
        assert!(e.cerrar_ordenado(Duration::from_secs(1)));
        let l = lista_del_json(&r);
        assert_eq!(l.organizaciones.len(), 2);
        assert!(l.organizaciones.iter().any(|o| o.id == id));
        assert!(l.organizaciones.contains(&ausente));

        // sigue intentando la ausente
        assert_eq!(aviso(&arrancar(&r)).0, "no_encontrado");
    }

    #[test]
    fn boldo_db_con_el_id_de_otra_no_pisa_su_entrada() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        let otra = entrada(
            &id,
            &format!("organizaciones/{id}/organizacion.db"),
            false,
            "2026",
        );
        escribir(&r, vec![otra.clone()]);
        let e = arrancar(&r);
        let base = abrio_boldo_db(&e, &r);
        assert_ne!(base.id, id);
        let l = lista_del_json(&r);
        assert_eq!(l.organizaciones.len(), 2);
        assert!(l.organizaciones.contains(&otra));
        let principal = l.organizaciones.iter().find(|o| o.es_principal()).unwrap();
        assert_eq!(principal.id, base.id);
        // el id nuevo queda en el archivo, y solo una se ve activa
        let activas = e.listar_organizaciones().unwrap();
        assert_eq!(activas.iter().filter(|v| v.activa).count(), 1);
        assert!(e.cerrar_ordenado(Duration::from_secs(1)));
        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, base.id);
    }

    #[test]
    fn otro_id_no_escribe_en_el_archivo_ajeno() {
        let (_exe, r) = rutas();
        let o = interna(&r, "2026");
        let bd = ruta_de(&r, &o);
        // un archivo de esquema anterior, con otro id, en el lugar de la entrada: abrirlo lo migraría
        fs::remove_file(&bd).unwrap();
        crear(&bd, "Ajena", &db::MIGRACIONES[..1]);
        let antes = fs::read(&bd).unwrap();
        let id = con_principal(&r, o.clone());

        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert_eq!(aviso(&e).0, "otro_id");
        assert_eq!(fs::read(&bd).unwrap(), antes);
        sin_rastros(&bd);
        assert!(!respaldos::con_sufijo(&bd, ".bloqueo").exists());
        assert!(!base_de(&r, &o).respaldos.exists());
    }

    #[test]
    fn un_db_id_invalido_tambien_da_otro_id() {
        let (_exe, r) = rutas();
        let o = interna(&r, "2026");
        let bd = ruta_de(&r, &o);
        fija_meta(&bd, "db_id", "../../x");
        let antes = fs::read(&bd).unwrap();
        con_principal(&r, o.clone());
        assert_eq!(aviso(&arrancar(&r)).0, "otro_id");
        // el archivo no se abrió para escribir
        assert_eq!(fs::read(&bd).unwrap(), antes);
        sin_rastros(&bd);
        assert!(!respaldos::con_sufijo(&bd, ".bloqueo").exists());
        assert!(!base_de(&r, &o).respaldos.exists());
    }

    #[test]
    fn un_archivo_sin_db_id_da_otro_id_sin_tocarlo() {
        for sql in [
            "DELETE FROM meta WHERE clave = 'db_id'",
            "UPDATE meta SET valor = NULL WHERE clave = 'db_id'",
            "UPDATE meta SET valor = 7 WHERE clave = 'db_id'",
        ] {
            let (_exe, r) = rutas();
            let o = interna(&r, "2026");
            let bd = ruta_de(&r, &o);
            let c = db::abrir(&bd).unwrap();
            c.execute(sql, []).unwrap();
            c.close().unwrap();
            let antes = fs::read(&bd).unwrap();
            con_principal(&r, o);
            assert_eq!(aviso(&arrancar(&r)).0, "otro_id", "{sql}");
            assert_eq!(fs::read(&bd).unwrap(), antes, "{sql}");
            assert!(!respaldos::con_sufijo(&bd, ".bloqueo").exists(), "{sql}");
        }
    }

    #[test]
    fn si_la_consulta_del_id_falla_decide_abrir_base() {
        let (_exe, r) = rutas();
        let o = interna(&r, "2026");
        let bd = ruta_de(&r, &o);
        fs::write(&bd, "no soy sqlite").unwrap();
        con_principal(&r, o);
        // no es que tenga otro id: dice lo que le pasa
        assert_eq!(aviso(&arrancar(&r)).0, "danado");
        assert_eq!(fs::read(&bd).unwrap(), b"no soy sqlite");
    }

    #[test]
    fn si_no_se_puede_revisar_si_esta_vacia_se_lista() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "", db::MIGRACIONES);
        let c = db::abrir(&r.bd).unwrap();
        c.pragma_update(None, "foreign_keys", "OFF").unwrap();
        c.execute_batch("DROP TABLE unidades; DROP TABLE tipos_unidad;")
            .unwrap();
        c.close().unwrap();
        escribir(&r, vec![]);
        abrio_boldo_db(&arrancar(&r), &r);
        assert_eq!(lista_del_json(&r).organizaciones[0].id, id);
    }

    #[test]
    fn sin_poder_cambiar_el_id_abre_boldo_db_sin_anotarlo() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        let c = db::abrir(&r.bd).unwrap();
        c.execute_batch(
            "CREATE TRIGGER sin_cambios BEFORE UPDATE ON meta BEGIN SELECT RAISE(ABORT, 'no'); END;",
        )
        .unwrap();
        c.close().unwrap();
        let otra = entrada(
            &id,
            &format!("organizaciones/{id}/organizacion.db"),
            false,
            "2026",
        );
        escribir(&r, vec![otra.clone()]);
        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert_eq!(aviso(&e).0, "no_encontrado");
        assert_eq!(lista_del_json(&r).organizaciones, vec![otra]);
    }

    /// Lo que escribiría una versión más nueva: otro formato de entrada al lado de una que aún se entiende.
    fn json_de_version_mayor(o: &Entrada) -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({
            "version": 2,
            "organizaciones": [{ "formato": "nuevo" }, o],
            "ajustes": { "tema": "oscuro" },
        }))
        .unwrap()
    }

    #[test]
    fn version_mayor_no_se_reescribe_y_abre_lo_que_entiende() {
        let (_exe, r) = rutas();
        crear(&r.bd, "La mía", db::MIGRACIONES);
        let o = interna(&r, "2026");
        let json = r.datos.join("organizaciones.json");
        let antes = json_de_version_mayor(&o);
        fs::write(&json, &antes).unwrap();

        let e = arrancar(&r);
        assert_eq!(e.base_abierta().unwrap().id, o.id);
        assert_eq!(fs::read(&json).unwrap(), antes);
        assert!(!r.datos.join("organizaciones.json.danado").exists());
    }

    #[test]
    fn version_mayor_sin_nada_que_entender_abre_boldo_db() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        let json = r.datos.join("organizaciones.json");
        let antes = br#"{"version":2,"lista":{"otra":"forma"}}"#;
        fs::write(&json, antes).unwrap();

        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert_eq!(fs::read(&json).unwrap(), antes);
    }

    /// Tomado como lo toma un antivirus: no deja leerlo, y sí reemplazarlo.
    #[cfg(windows)]
    fn tomar(ruta: &std::path::Path) -> fs::File {
        use std::os::windows::fs::OpenOptionsExt;
        const SOLO_BORRAR: u32 = 4; // FILE_SHARE_DELETE
        fs::OpenOptions::new()
            .read(true)
            .share_mode(SOLO_BORRAR)
            .open(ruta)
            .unwrap()
    }

    #[cfg(windows)]
    #[test]
    fn archivo_tomado_deja_la_lista_intacta() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        let afuera = tempfile::tempdir().unwrap();
        let externa = entrada(
            &uuid::Uuid::now_v7().to_string(),
            afuera.path().join("externa.db").to_str().unwrap(),
            true,
            "2020",
        );
        escribir(&r, vec![externa.clone()]);
        let json = r.datos.join("organizaciones.json");
        let antes = fs::read(&json).unwrap();

        let tomado = tomar(&json);
        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        drop(tomado);

        assert_eq!(fs::read(&json).unwrap(), antes);
        assert!(!r.datos.join("organizaciones.json.danado").exists());
        assert_eq!(cargar_lista(&r).organizaciones, vec![externa]);
    }

    #[cfg(windows)]
    #[test]
    fn un_error_pasajero_al_leer_se_reintenta() {
        let (_exe, r) = rutas();
        let o = entrada(&uuid::Uuid::now_v7().to_string(), "boldo.db", false, "x");
        escribir(&r, vec![o.clone()]);
        let tomado = tomar(&r.datos.join("organizaciones.json"));
        let hilo = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(20));
            drop(tomado);
        });
        assert_eq!(cargar_lista(&r).organizaciones, vec![o]);
        hilo.join().unwrap();
    }

    #[test]
    fn un_danado_anterior_no_se_pisa() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        let json = r.datos.join("organizaciones.json");
        let anterior = r.datos.join("organizaciones.json.danado");
        fs::write(&json, "{ dañado").unwrap();
        fs::write(&anterior, "con las externas").unwrap();
        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert_eq!(fs::read_to_string(&anterior).unwrap(), "con las externas");
        assert_eq!(
            fs::read_to_string(r.datos.join("organizaciones.json.danado-1")).unwrap(),
            "{ dañado"
        );
        assert_eq!(lista_del_json(&r).organizaciones[0].id, id);
    }

    #[test]
    fn con_la_unica_ausente_crea_boldo_db_y_avisa() {
        let (_exe, r) = rutas();
        let afuera = tempfile::tempdir().unwrap();
        let ausente = entrada(
            &uuid::Uuid::now_v7().to_string(),
            afuera.path().join("retirado.db").to_str().unwrap(),
            true,
            "2026",
        );
        escribir(&r, vec![ausente.clone()]);
        let e = arrancar(&r);
        abrio_boldo_db(&e, &r);
        assert_eq!(aviso(&e).0, "no_encontrado");
        assert_eq!(lista_del_json(&r).organizaciones, vec![ausente]);
    }

    #[test]
    fn con_la_ultima_en_otra_copia_abre_boldo_db_y_avisa() {
        let (_exe, r) = rutas();
        let ocupada = interna(&r, "2026");
        let id = con_principal(&r, ocupada.clone());
        let _otra_copia = bloquear(&ruta_de(&r, &ocupada), YA).unwrap();

        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert_eq!(aviso(&e).0, "abierta_en_otra_copia");
    }

    #[test]
    fn arranque_con_externa_con_trigger_abre_boldo_db_y_avisa() {
        let (_exe, r) = rutas();
        let afuera = tempfile::tempdir().unwrap();
        let bd = afuera.path().join("externa.db");
        let id_externa = crear(&bd, "Con trigger", db::MIGRACIONES);
        let c = db::abrir(&bd).unwrap();
        c.execute_batch("CREATE TRIGGER t AFTER INSERT ON meta BEGIN SELECT 1; END;")
            .unwrap();
        c.close().unwrap();
        let antes = fs::read(&bd).unwrap();
        let o = entrada(&id_externa, bd.to_str().unwrap(), true, "2026");
        let id = con_principal(&r, o.clone());

        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert_eq!(aviso(&e).0, "contenido_invalido");
        // no se abrió para escribir: ni un archivo al lado, ni su carpeta de respaldos
        assert_eq!(fs::read(&bd).unwrap(), antes);
        sin_rastros(&bd);
        assert!(!respaldos::con_sufijo(&bd, ".bloqueo").exists());
        assert!(!base_de(&r, &o).respaldos.exists());
    }

    #[test]
    fn arranque_con_otro_id_abre_boldo_db_y_avisa() {
        let (_exe, r) = rutas();
        let cambiada = interna(&r, "2026");
        let bd = ruta_de(&r, &cambiada);
        fija_meta(&bd, "db_id", &uuid::Uuid::now_v7().to_string());
        let id = con_principal(&r, cambiada);

        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert_eq!(aviso(&e).0, "otro_id");
        // la soltó
        bloquear(&bd, YA).unwrap();
    }

    #[test]
    fn un_boldo_db_con_otro_id_no_duplica_su_entrada() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        let vieja = uuid::Uuid::now_v7().to_string();
        escribir(&r, vec![entrada(&vieja, "boldo.db", false, "2020")]);
        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert_eq!(aviso(&e).0, "otro_id");
        let l = lista_del_json(&r);
        assert_eq!(l.organizaciones.len(), 1);
        assert_eq!(l.organizaciones[0].id, id);
    }

    #[test]
    fn si_falla_el_propio_boldo_db_queda_la_pantalla_de_error() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        escribir(&r, vec![entrada(&id, "boldo.db", false, "2020")]);
        let _otra_copia = bloquear(&r.bd, YA).unwrap();
        let e = arrancar(&r);
        assert_eq!(e.base_abierta(), None);
        let error = e.error.lock().unwrap().clone().unwrap();
        assert!(error.contains("Otra copia"), "{error}");
        assert_eq!(*e.aviso_inicio.lock().unwrap(), None);
    }

    #[test]
    fn sin_poder_leer_ni_escribir_la_lista_abre_boldo_db() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        // una carpeta con el nombre del archivo: no se puede leer ni reemplazar
        let json = r.datos.join("organizaciones.json");
        fs::create_dir(&json).unwrap();
        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert!(json.is_dir());
        assert!(!r.datos.join("organizaciones.json.tmp").exists());
        assert!(!r.datos.join("organizaciones.json.danado").exists());
    }

    #[test]
    fn json_danado_abre_boldo_db_y_lo_reescribe() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        fs::write(r.datos.join("organizaciones.json"), "{ dañado").unwrap();
        let e = arrancar(&r);
        assert_eq!(abrio_boldo_db(&e, &r).id, id);
        assert_eq!(lista_del_json(&r).organizaciones[0].id, id);
        assert_eq!(
            fs::read_to_string(r.datos.join("organizaciones.json.danado")).unwrap(),
            "{ dañado"
        );
    }

    #[test]
    fn listar_no_deja_archivos_junto_a_una_cerrada() {
        let (_exe, r) = rutas();
        let o = interna(&r, "2026");
        let bd = ruta_de(&r, &o);
        fija_meta(&bd, "logo_png", "QUJD");
        let carpeta = base_de(&r, &o).respaldos;
        fs::create_dir_all(&carpeta).unwrap();
        fs::write(carpeta.join("boldo-20200101-0000.db"), "12345").unwrap();
        escribir(&r, vec![o.clone()]);
        let antes = fs::read(&bd).unwrap();
        // el archivo sigue en WAL: abrirlo solo para leer dejaría -wal y -shm
        assert_eq!(antes[18], 2);

        let e = Estado::de_prueba(None, None, Some(r.clone()));
        let vista = e.listar_organizaciones().unwrap();
        assert_eq!(vista.len(), 1);
        let v = &vista[0];
        assert_eq!(v.logo.as_deref(), Some("QUJD"));
        assert!(v.existe && !v.activa);
        assert_eq!(v.bytes_base, antes.len() as u64);
        assert_eq!(v.bytes_respaldos, 5);
        assert_eq!(v.nombre, o.nombre);
        sin_rastros(&bd);
        assert_eq!(fs::read(&bd).unwrap(), antes);
    }

    #[test]
    fn listar_una_con_logo_vacio_no_da_logo() {
        let (_exe, r) = rutas();
        let o = interna(&r, "2026");
        fija_meta(&ruta_de(&r, &o), "logo_png", "");
        escribir(&r, vec![o]);
        let e = Estado::de_prueba(None, None, Some(r.clone()));
        assert_eq!(e.listar_organizaciones().unwrap()[0].logo, None);
    }

    #[test]
    fn restaurar_vuelve_a_la_que_estaba_abierta() {
        let (_exe, r) = rutas();
        let ultima = interna(&r, "2026");
        con_principal(&r, ultima.clone());

        let e = arrancar(&r);
        let base = e.base_abierta().unwrap();
        assert_eq!(base.id, ultima.id);
        let nombre = e
            .con_conexion(&base.id, |c| {
                respaldos::respaldar(c, &base.respaldos, "20200101-0000")
            })
            .unwrap();
        e.con_ranura(&base.id, |conexion, b| {
            respaldos::restaurar(conexion, b, &nombre, db::MIGRACIONES)
        })
        .unwrap();
        // lo que hace `app.restart()`
        assert!(e.cerrar_ordenado(Duration::from_secs(1)));
        drop(e);

        let e = arrancar(&r);
        assert_eq!(e.base_abierta(), Some(base));
        assert_eq!(*e.aviso_inicio.lock().unwrap(), None);
    }
}

#[cfg(test)]
mod cambiar_a {
    use super::*;
    use crate::intercambio::validar::solo_lectura_cerrada;
    use crate::organizaciones::prueba::{crear, entrada, escribir, interna, rutas, sin_rastros};
    use crate::organizaciones::{Lista, agregar_con_red, ruta_de};
    use crate::respaldos::con_sufijo;
    use std::fs;
    use std::sync::mpsc;

    const YA: Duration = Duration::ZERO;

    /// Dos organizaciones en una carpeta temporal, con A abierta.
    struct Dos {
        _exe: tempfile::TempDir,
        r: Rutas,
        e: Estado,
        a: Entrada,
        b: Entrada,
    }

    fn dos() -> Dos {
        let (_exe, r) = rutas();
        let (a, b) = (interna(&r, "2026"), interna(&r, "2020"));
        escribir(&r, vec![a.clone(), b.clone()]);
        let e = arrancar(&r);
        assert_eq!(e.base_abierta().unwrap().id, a.id);
        Dos { _exe, r, e, a, b }
    }

    fn arrancar(r: &Rutas) -> Estado {
        let e = Estado::de_prueba(None, None, Some(r.clone()));
        e.abrir_inicial_con(YA, db::MIGRACIONES);
        e
    }

    fn cambiar(e: &Estado, id: &str) -> Result<OrganizacionVista, Fallo> {
        e.cambiar_a(id, &|| false, db::MIGRACIONES)
    }

    fn lista_del_json(r: &Rutas) -> Lista {
        serde_json::from_slice(&fs::read(r.datos.join("organizaciones.json")).unwrap()).unwrap()
    }

    fn fija_meta(bd: &Path, clave: &str, valor: &str) {
        let c = db::abrir(bd).unwrap();
        c.execute(
            "INSERT OR REPLACE INTO meta (clave, valor) VALUES (?1, ?2)",
            [clave, valor],
        )
        .unwrap();
        c.close().unwrap();
    }

    fn nombre_en(e: &Estado, id: &str) -> Result<String, String> {
        e.con_conexion(id, |c| {
            c.query_row(
                "SELECT valor FROM meta WHERE clave = 'org_nombre'",
                [],
                |f| f.get(0),
            )
            .map_err(|x| x.to_string())
        })
    }

    fn esquema_de(bd: &Path) -> i64 {
        solo_lectura_cerrada(bd)
            .unwrap()
            .pragma_query_value(None, "user_version", |f| f.get(0))
            .unwrap()
    }

    /// A sigue abierta, se puede escribir en ella, y conserva su bloqueo.
    fn sigue_a(d: &Dos) {
        let base = d.e.base_abierta().unwrap();
        assert_eq!(base, base_de(&d.r, &d.a));
        d.e.con_conexion(&d.a.id, |c| db::lote(c, &[], "t"))
            .unwrap();
        assert_eq!(
            bloquear(&base.bd, YA).unwrap_err().codigo,
            "abierta_en_otra_copia"
        );
    }

    /// Nada quedó tomado ni abierto en B.
    fn b_libre(d: &Dos) {
        let bd = ruta_de(&d.r, &d.b);
        drop(bloquear(&bd, YA).unwrap());
        sin_rastros(&bd);
    }

    #[test]
    fn sincronizar_deja_el_nombre_en_la_lista_sin_tocar_la_fecha() {
        let d = dos();
        let antes = lista_del_json(&d.r);
        let fecha = |l: &Lista| {
            l.organizaciones
                .iter()
                .find(|o| o.id == d.a.id)
                .map(|o| (o.abierta.clone(), o.nombre.clone()))
                .unwrap()
        };
        d.e.con_conexion(&d.a.id, |c| {
            c.execute(
                "UPDATE meta SET valor = 'Renombrada' WHERE clave = 'org_nombre'",
                [],
            )
            .map_err(|x| x.to_string())
        })
        .unwrap();
        d.e.sincronizar(&d.a.id).unwrap();
        let despues = lista_del_json(&d.r);
        assert_eq!(fecha(&despues), (fecha(&antes).0, "Renombrada".to_string()));
    }

    #[test]
    fn sincronizar_con_otra_base_no_escribe() {
        let d = dos();
        let antes = fs::read(d.r.datos.join("organizaciones.json")).unwrap();
        assert_eq!(d.e.sincronizar(&d.b.id).unwrap_err().codigo, "otra_base");
        assert_eq!(
            fs::read(d.r.datos.join("organizaciones.json")).unwrap(),
            antes
        );
    }

    #[test]
    fn cambia_de_base_y_la_anterior_rechaza() {
        let d = dos();
        fija_meta(&ruta_de(&d.r, &d.b), "org_nombre", "Beta");
        let v = cambiar(&d.e, &d.b.id).unwrap();
        assert_eq!(
            (v.id.as_str(), v.nombre.as_str()),
            (d.b.id.as_str(), "Beta")
        );
        assert!(v.activa);

        assert_eq!(nombre_en(&d.e, &d.a.id).unwrap_err(), "otra_base");
        assert_eq!(nombre_en(&d.e, &d.b.id).unwrap(), "Beta");
        assert_eq!(d.e.base_abierta(), Some(base_de(&d.r, &d.b)));
        assert_eq!(
            d.e.version_esquema.load(Ordering::Relaxed),
            db::MIGRACIONES.len() as i64
        );
        // la nueva queda bloqueada, y la anterior libre
        assert_eq!(
            bloquear(&ruta_de(&d.r, &d.b), YA).unwrap_err().codigo,
            "abierta_en_otra_copia"
        );
        bloquear(&ruta_de(&d.r, &d.a), YA).unwrap();
    }

    /// Mientras la lista dice la nueva y `base` todavía la anterior, una búsqueda confirmada no debe poder sacar a la nueva de la
    /// lista: se detiene el cambio justo antes de escribir `base`, tomando lo que necesita ahí.
    #[test]
    fn la_lista_sigue_tomada_hasta_escribir_la_base() {
        let d = dos();
        let tomado = d.e.bloqueo.lock().unwrap();
        std::thread::scope(|s| {
            let hilo = s.spawn(|| cambiar(&d.e, &d.b.id).map(|_| ()).map_err(|f| f.codigo));
            let ya_anotada = || {
                fs::read(d.r.datos.join("organizaciones.json"))
                    .ok()
                    .and_then(|b| serde_json::from_slice::<Lista>(&b).ok())
                    .is_some_and(|l| {
                        l.organizaciones
                            .iter()
                            .any(|o| o.id == d.b.id && o.abierta != d.b.abierta)
                    })
            };
            let limite = Instant::now() + Duration::from_secs(10);
            while !ya_anotada() {
                assert!(Instant::now() < limite, "el cambio no llegó a anotarse");
                std::thread::sleep(Duration::from_millis(1));
            }
            // lo que tarda en soltarla si no la retuviera
            std::thread::sleep(Duration::from_millis(100));
            assert_eq!(d.e.base_abierta().unwrap().id, d.a.id);
            assert!(matches!(
                d.e.lista.try_lock(),
                Err(TryLockError::WouldBlock)
            ));
            drop(tomado);
            hilo.join().unwrap().unwrap();
        });
        assert_eq!(d.e.base_abierta().unwrap().id, d.b.id);
    }

    #[test]
    fn la_anterior_queda_sin_wal() {
        let d = dos();
        let bd = ruta_de(&d.r, &d.a);
        d.e.con_conexion(&d.a.id, |c| db::lote(c, &[], "t"))
            .unwrap();
        assert!(con_sufijo(&bd, "-wal").exists());
        cambiar(&d.e, &d.b.id).unwrap();
        sin_rastros(&bd);
        assert_eq!(d.e.listar_organizaciones().unwrap().len(), 2);
        sin_rastros(&bd);
    }

    #[test]
    fn archivo_ausente_no_cambia_nada() {
        let d = dos();
        let bd = ruta_de(&d.r, &d.b);
        fs::remove_file(&bd).unwrap();
        assert_eq!(cambiar(&d.e, &d.b.id).unwrap_err().codigo, "no_encontrado");
        sigue_a(&d);
        assert!(!bd.exists());
        assert!(!con_sufijo(&bd, ".bloqueo").exists());
    }

    #[test]
    fn esquema_mas_nuevo_no_cambia_nada() {
        let d = dos();
        let bd = ruta_de(&d.r, &d.b);
        let c = db::abrir(&bd).unwrap();
        c.pragma_update(None, "user_version", 99).unwrap();
        c.close().unwrap();
        assert_eq!(cambiar(&d.e, &d.b.id).unwrap_err().codigo, "esquema_nuevo");
        sigue_a(&d);
        assert_eq!(esquema_de(&bd), 99);
        b_libre(&d);
    }

    #[test]
    fn migracion_que_falla_deja_la_anterior() {
        let d = dos();
        let bd = ruta_de(&d.r, &d.b);
        let antes = fs::read(&bd).unwrap();
        let con_una_mala = [db::MIGRACIONES, &["ESTO NO ES SQL;"]].concat();
        let f =
            d.e.cambiar_a(&d.b.id, &|| false, &con_una_mala)
                .unwrap_err();
        assert_eq!(f.codigo, "migracion");
        sigue_a(&d);
        assert_eq!(fs::read(&bd).unwrap(), antes);
        assert_eq!(esquema_de(&bd), db::MIGRACIONES.len() as i64);
        b_libre(&d);
    }

    /// Ni un archivo al lado, ni su carpeta de respaldos, ni una migración.
    fn b_sin_tocar(d: &Dos, antes: &[u8]) {
        let bd = ruta_de(&d.r, &d.b);
        assert_eq!(fs::read(&bd).unwrap(), antes);
        assert!(!con_sufijo(&bd, ".bloqueo").exists());
        assert!(!base_de(&d.r, &d.b).respaldos.exists());
        sin_rastros(&bd);
    }

    #[test]
    fn una_lista_ilegible_no_toca_la_otra() {
        let d = dos();
        let antes = fs::read(ruta_de(&d.r, &d.b)).unwrap();
        let json = d.r.datos.join("organizaciones.json");
        fs::remove_file(&json).unwrap();
        fs::create_dir(&json).unwrap();
        assert_eq!(
            cambiar(&d.e, &d.b.id).unwrap_err().codigo,
            "lista_protegida"
        );
        sigue_a(&d);
        b_sin_tocar(&d, &antes);
        assert!(json.is_dir());
    }

    #[test]
    fn una_lista_ilegible_no_dice_desconocido_de_una_externa() {
        let d = dos();
        let afuera = tempfile::tempdir().unwrap();
        let id = con_externa(&d, &afuera.path().join("externa.db"));
        let json = d.r.datos.join("organizaciones.json");
        fs::remove_file(&json).unwrap();
        fs::create_dir(&json).unwrap();
        // reconstruida no la tiene, pero sí está en el archivo que no se pudo leer
        assert_eq!(cambiar(&d.e, &id).unwrap_err().codigo, "lista_protegida");
        sigue_a(&d);
    }

    /// El fallo real entre los pasos 3 y 5: la lista se leyó bien, B ya se abrió, y falla recién al escribirla.
    #[test]
    fn falla_al_escribir_la_lista_deja_la_anterior() {
        let d = dos();
        let json = d.r.datos.join("organizaciones.json");
        let antes = fs::read(&json).unwrap();
        fs::create_dir(con_sufijo(&json, ".tmp")).unwrap();
        assert_eq!(cambiar(&d.e, &d.b.id).unwrap_err().codigo, "fallo");
        sigue_a(&d);
        // llegó a abrirla: su carpeta de respaldos lo dice
        assert!(base_de(&d.r, &d.b).respaldos.is_dir());
        b_libre(&d);
        assert_eq!(fs::read(&json).unwrap(), antes);
    }

    #[test]
    fn un_lector_en_la_anterior_no_detiene_el_cambio() {
        let d = dos();
        let bd = ruta_de(&d.r, &d.a);
        let lector = db::abrir(&bd).unwrap();
        lector.execute_batch("BEGIN").unwrap();
        lector
            .query_row("SELECT count(*) FROM meta", [], |f| f.get::<_, i64>(0))
            .unwrap();
        let revision = |c: &Connection| -> String {
            c.query_row(
                "SELECT valor FROM meta WHERE clave = 'data_revision'",
                [],
                |f| f.get(0),
            )
            .unwrap()
        };
        let antes = revision(&lector);
        // lo escrito después del lector no se puede volcar del todo mientras siga leyendo
        let escrita =
            d.e.con_conexion(&d.a.id, |c| {
                db::lote(c, &[], "t")?;
                Ok::<_, String>(revision(c))
            })
            .unwrap();
        assert_ne!(escrita, antes);

        let t = Instant::now();
        let v = cambiar(&d.e, &d.b.id).unwrap();
        // menos que los 5 s de `db::abrir`; no es la meta de 1 s
        assert!(t.elapsed() < Duration::from_secs(3), "{:?}", t.elapsed());
        assert!(v.activa);
        assert_eq!(d.e.base_abierta(), Some(base_de(&d.r, &d.b)));
        let l = lista_del_json(&d.r);
        let de = |id: &str| l.organizaciones.iter().find(|o| o.id == id).unwrap();
        assert!(de(&d.b.id).abierta > de(&d.a.id).abierta);

        drop(lector);
        assert!(d.e.cerrar_ordenado(Duration::from_secs(1)));
        assert_eq!(arrancar(&d.r).base_abierta().unwrap().id, d.b.id);
        // lo escrito en la anterior sigue ahí
        assert_eq!(revision(&db::abrir(&bd).unwrap()), escrita);
    }

    #[test]
    fn una_lista_de_version_mayor_da_su_propio_codigo() {
        let d = dos();
        let json = d.r.datos.join("organizaciones.json");
        let antes = serde_json::to_vec(&serde_json::json!({
            "version": 2,
            "organizaciones": [d.a, d.b],
            "ajustes": { "tema": "oscuro" },
        }))
        .unwrap();
        fs::write(&json, &antes).unwrap();
        let de_b = fs::read(ruta_de(&d.r, &d.b)).unwrap();
        assert_eq!(
            cambiar(&d.e, &d.b.id).unwrap_err().codigo,
            "lista_protegida"
        );
        sigue_a(&d);
        b_sin_tocar(&d, &de_b);
        assert_eq!(fs::read(&json).unwrap(), antes);
        // seguir en la que ya está abierta no es un cambio: no falla, y la lista no se toca
        assert!(cambiar(&d.e, &d.a.id).unwrap().activa);
        assert_eq!(fs::read(&json).unwrap(), antes);
    }

    #[test]
    fn bloqueo_de_otra_copia_no_cambia_nada() {
        let d = dos();
        let otra_copia = bloquear(&ruta_de(&d.r, &d.b), YA).unwrap();
        assert_eq!(
            cambiar(&d.e, &d.b.id).unwrap_err().codigo,
            "abierta_en_otra_copia"
        );
        sigue_a(&d);
        drop(otra_copia);
        b_libre(&d);
    }

    #[test]
    fn trabajo_en_curso_no_cambia_nada() {
        let d = dos();
        let t = Instant::now();
        let f =
            d.e.cambiar_a(&d.b.id, &|| true, db::MIGRACIONES)
                .unwrap_err();
        assert_eq!(f.codigo, "trabajo_en_curso");
        assert!(t.elapsed() < Duration::from_secs(5));
        sigue_a(&d);
        // ni siquiera se intentó abrir la otra
        assert!(!con_sufijo(&ruta_de(&d.r, &d.b), ".bloqueo").exists());
    }

    #[test]
    fn un_trabajo_que_termina_a_tiempo_no_estorba() {
        let d = dos();
        let vueltas = std::cell::Cell::new(0);
        let ocupada = || {
            vueltas.set(vueltas.get() + 1);
            vueltas.get() < 3
        };
        assert!(d.e.cambiar_a(&d.b.id, &ocupada, db::MIGRACIONES).is_ok());
        assert_eq!(vueltas.get(), 3);
        assert_eq!(d.e.base_abierta().unwrap().id, d.b.id);
    }

    #[test]
    fn cambiar_limpia_el_aviso_y_el_error_del_arranque() {
        let d = dos();
        let poner = || {
            *d.e.error.lock().unwrap() = Some("motivo".into());
            *d.e.aviso_inicio.lock().unwrap() = Some(AvisoInicio {
                codigo: "no_encontrado",
                detalle: String::new(),
                nombre: "Otra".into(),
            });
        };
        poner();
        // un cambio que falla no los quita, ni pedir la misma
        let desconocida = uuid::Uuid::now_v7().to_string();
        cambiar(&d.e, &desconocida).unwrap_err();
        cambiar(&d.e, &d.a.id).unwrap();
        assert!(d.e.error.lock().unwrap().is_some());
        assert!(d.e.aviso_inicio.lock().unwrap().is_some());

        cambiar(&d.e, &d.b.id).unwrap();
        assert_eq!(*d.e.error.lock().unwrap(), None);
        assert_eq!(*d.e.aviso_inicio.lock().unwrap(), None);
    }

    #[test]
    fn la_abierta_que_salio_de_la_lista_vuelve_a_ella() {
        let d = dos();
        let afuera = tempfile::tempdir().unwrap();
        let bd = afuera.path().join("externa.db");
        let id = con_externa(&d, &bd);
        cambiar(&d.e, &id).unwrap();
        // la externa ya no está, ni la interna que estaba al lado
        escribir(&d.r, vec![]);

        let v = cambiar(&d.e, &id).unwrap();
        assert!(v.activa);
        assert!(v.externa);
        assert_eq!(v.nombre, "Externa");
        let l = lista_del_json(&d.r);
        assert_eq!(l.organizaciones.len(), 1);
        let o = &l.organizaciones[0];
        assert_eq!((o.id.as_str(), o.nombre.as_str()), (id.as_str(), "Externa"));
        assert!(o.externa);
        assert_eq!(o.ruta, bd.to_str().unwrap());
        assert!(!o.color.is_empty());
        // sigue siendo un lugar válido: la lista la conserva al leerla
        assert_eq!(cargar_lista(&d.r).organizaciones.len(), 1);
    }

    #[test]
    fn la_interna_abierta_que_salio_de_la_lista_vuelve_con_su_ruta() {
        let d = dos();
        escribir(&d.r, vec![]);
        let v = cambiar(&d.e, &d.a.id).unwrap();
        assert!(v.activa && !v.externa);
        let l = cargar_lista(&d.r);
        assert_eq!(l.organizaciones.len(), 1);
        assert_eq!(l.organizaciones[0].ruta, d.a.ruta);
        assert!(!l.organizaciones[0].externa);
    }

    #[test]
    fn con_un_respaldo_en_curso_rechaza() {
        let d = dos();
        let (tomada, esperar_tomada) = mpsc::channel();
        let (soltar, esperar_soltar) = mpsc::channel::<()>();
        std::thread::scope(|s| {
            let e = &d.e;
            s.spawn(move || {
                let _g = e.conn.lock().unwrap();
                tomada.send(()).unwrap();
                let _ = esperar_soltar.recv();
            });
            esperar_tomada.recv().unwrap();
            assert_eq!(
                cambiar(&d.e, &d.b.id).unwrap_err().codigo,
                "trabajo_en_curso"
            );
            soltar.send(()).unwrap();
        });
        sigue_a(&d);
    }

    #[test]
    fn un_respaldo_que_termina_a_tiempo_no_estorba() {
        let d = dos();
        let (tomada, esperar_tomada) = mpsc::channel();
        std::thread::scope(|s| {
            s.spawn(|| {
                let _g = d.e.conn.lock().unwrap();
                tomada.send(()).unwrap();
                std::thread::sleep(Duration::from_millis(100));
            });
            esperar_tomada.recv().unwrap();
            cambiar(&d.e, &d.b.id).unwrap();
        });
        assert_eq!(d.e.base_abierta().unwrap().id, d.b.id);
    }

    #[test]
    fn respaldo_de_migracion_en_la_carpeta_de_esa_organizacion() {
        let d = dos();
        let temporal = d.r.datos.join("por-mover.db");
        let id = crear(&temporal, "Vieja", &db::MIGRACIONES[..1]);
        let ruta = format!("organizaciones/{id}/organizacion.db");
        fs::create_dir_all(d.r.datos.join("organizaciones").join(&id)).unwrap();
        fs::rename(&temporal, d.r.datos.join(&ruta)).unwrap();
        let vieja = entrada(&id, &ruta, false, "2020");
        escribir(&d.r, vec![d.a.clone(), vieja.clone()]);
        let nombres = |dir: &Path| -> Vec<String> {
            fs::read_dir(dir)
                .unwrap()
                .flatten()
                .map(|f| f.file_name().to_string_lossy().into_owned())
                .collect()
        };
        let en_la_principal = nombres(&d.r.respaldos);

        cambiar(&d.e, &id).unwrap();
        assert_eq!(
            d.e.version_esquema.load(Ordering::Relaxed),
            db::MIGRACIONES.len() as i64
        );
        let suyos = nombres(&base_de(&d.r, &vieja).respaldos);
        assert_eq!(suyos.len(), 1, "{suyos:?}");
        assert!(suyos[0].starts_with("antes-migracion-1-"), "{suyos:?}");
        assert_eq!(nombres(&d.r.respaldos), en_la_principal);
    }

    #[test]
    fn otro_db_id_se_rechaza() {
        let d = dos();
        let bd = ruta_de(&d.r, &d.b);
        fija_meta(&bd, "db_id", &uuid::Uuid::now_v7().to_string());
        let antes = fs::read(&bd).unwrap();
        assert_eq!(cambiar(&d.e, &d.b.id).unwrap_err().codigo, "otro_id");
        sigue_a(&d);
        assert_eq!(fs::read(&bd).unwrap(), antes);
        b_libre(&d);
    }

    #[test]
    fn externa_con_un_trigger_ajeno_se_rechaza() {
        let d = dos();
        let afuera = tempfile::tempdir().unwrap();
        let bd = afuera.path().join("externa.db");
        let id = crear(&bd, "Con trigger", db::MIGRACIONES);
        let c = db::abrir(&bd).unwrap();
        c.execute_batch("CREATE TRIGGER t AFTER INSERT ON meta BEGIN SELECT 1; END;")
            .unwrap();
        c.close().unwrap();
        let antes = fs::read(&bd).unwrap();
        let o = entrada(&id, bd.to_str().unwrap(), true, "2020");
        escribir(&d.r, vec![d.a.clone(), o.clone()]);

        assert_eq!(cambiar(&d.e, &id).unwrap_err().codigo, "contenido_invalido");
        sigue_a(&d);
        // no se abrió para escribir: ni un archivo al lado, ni su carpeta de respaldos
        assert_eq!(fs::read(&bd).unwrap(), antes);
        sin_rastros(&bd);
        assert!(!con_sufijo(&bd, ".bloqueo").exists());
        assert!(!base_de(&d.r, &o).respaldos.exists());
    }

    #[test]
    fn abrir_la_misma_no_reabre() {
        let d = dos();
        let sin_hora = Entrada {
            abierta: String::new(),
            ..d.a.clone()
        };
        escribir(&d.r, vec![sin_hora, d.b.clone()]);
        // una tabla temporal solo existe en esta conexión
        d.e.con_conexion(&d.a.id, |c| {
            c.execute_batch("CREATE TEMP TABLE marca (x)")
                .map_err(|x| x.to_string())
        })
        .unwrap();

        let v = cambiar(&d.e, &d.a.id).unwrap();
        assert!(v.activa);
        assert_eq!(v.id, d.a.id);
        d.e.con_conexion(&d.a.id, |c| {
            c.execute_batch("SELECT * FROM temp.marca")
                .map_err(|x| x.to_string())
        })
        .unwrap();
        let l = lista_del_json(&d.r);
        assert!(l.organizaciones[0].abierta.ends_with('Z'));
        assert_eq!(l.organizaciones[1], d.b);
        sigue_a(&d);
    }

    #[test]
    fn abrir_la_misma_no_espera_a_un_respaldo() {
        let d = dos();
        let json = d.r.datos.join("organizaciones.json");
        let antes = fs::read(&json).unwrap();
        let _ocupada = d.e.conn.lock().unwrap();
        let t = Instant::now();
        // con `ocupada` en true: la que ya está abierta no tiene nada que esperar
        let v = d.e.cambiar_a(&d.a.id, &|| true, db::MIGRACIONES).unwrap();
        assert!(v.activa);
        assert!(t.elapsed() < ESPERA_TRABAJOS);
        // sin la conexión no se sabe su nombre: la lista queda como estaba
        assert_eq!(fs::read(&json).unwrap(), antes);
    }

    #[test]
    fn abrir_el_boldo_db_vacio_abierto_no_lo_lista() {
        let (_exe, r) = rutas();
        let e = arrancar(&r);
        let id = e.base_abierta().unwrap().id;
        let v = cambiar(&e, &id).unwrap();
        assert!(v.activa);
        assert_eq!(v.ruta, r.bd.display().to_string());
        assert!(cargar_lista(&r).organizaciones.is_empty());
    }

    #[test]
    fn un_id_que_no_esta_en_la_lista_no_cambia_nada() {
        let d = dos();
        let otro = uuid::Uuid::now_v7().to_string();
        assert_eq!(cambiar(&d.e, &otro).unwrap_err().codigo, "desconocido");
        sigue_a(&d);
    }

    #[test]
    fn si_otro_cambio_llega_primero_no_parece_otra_copia() {
        let d = dos();
        // mientras este espera, otro cambio llega a la misma organización
        let v =
            d.e.cambiar_a(
                &d.b.id,
                &|| {
                    if d.e.base_abierta().unwrap().id != d.b.id {
                        cambiar(&d.e, &d.b.id).unwrap();
                    }
                    false
                },
                db::MIGRACIONES,
            )
            .unwrap();
        assert!(v.activa);
        assert_eq!(nombre_en(&d.e, &d.b.id).unwrap(), "Interna");
    }

    #[test]
    fn actualiza_nombre_y_fecha_en_la_lista() {
        // `abierta` puede venir en blanco: una entrada agregada al caer a `boldo.db`
        for hora in ["2020", ""] {
            let d = dos();
            let b = Entrada {
                abierta: hora.into(),
                ..d.b.clone()
            };
            let a_al_dia = cargar_lista(&d.r)
                .organizaciones
                .into_iter()
                .find(|o| o.id == d.a.id)
                .unwrap();
            escribir(&d.r, vec![a_al_dia.clone(), b]);
            cambiar(&d.e, &d.b.id).unwrap();

            let l = lista_del_json(&d.r);
            let de = |id: &str| l.organizaciones.iter().find(|o| o.id == id).unwrap();
            assert_eq!(de(&d.b.id).nombre, "Interna");
            assert_ne!(de(&d.b.id).nombre, d.b.nombre);
            assert!(de(&d.b.id).abierta.ends_with('Z'), "{hora}");
            assert_eq!(de(&d.b.id).color, d.b.color);
            assert_eq!(de(&d.a.id), &a_al_dia);

            // es la que abre el próximo arranque
            assert!(d.e.cerrar_ordenado(Duration::from_secs(1)));
            assert_eq!(arrancar(&d.r).base_abierta().unwrap().id, d.b.id);
        }
    }

    #[test]
    fn reabrir_tras_cambiar_vuelve_a_la_nueva() {
        let d = dos();
        cambiar(&d.e, &d.b.id).unwrap();
        assert!(d.e.cerrar_ordenado(Duration::from_secs(1)));
        drop(bloquear(&ruta_de(&d.r, &d.b), YA).unwrap());

        d.e.reabrir().unwrap();
        assert_eq!(d.e.base_abierta(), Some(base_de(&d.r, &d.b)));
        assert_eq!(nombre_en(&d.e, &d.b.id).unwrap(), "Interna");
        assert_eq!(
            bloquear(&ruta_de(&d.r, &d.b), YA).unwrap_err().codigo,
            "abierta_en_otra_copia"
        );
        bloquear(&ruta_de(&d.r, &d.a), YA).unwrap();
        assert!(!d.r.bd.exists());
    }

    /// Una externa con ese nombre de archivo, en la lista junto a A. Devuelve su id.
    fn con_externa(d: &Dos, bd: &Path) -> String {
        let id = crear(bd, "Externa", db::MIGRACIONES);
        escribir(
            &d.r,
            vec![
                d.a.clone(),
                entrada(&id, bd.to_str().unwrap(), true, "2020"),
            ],
        );
        id
    }

    #[test]
    fn limpia_una_restauracion_interrumpida_junto_a_la_externa() {
        let d = dos();
        let afuera = tempfile::tempdir().unwrap();
        let bd = afuera.path().join("externa.db");
        let id = con_externa(&d, &bd);
        let copia = respaldos::copia_de_base(&Base {
            id: id.clone(),
            bd: bd.clone(),
            respaldos: d.r.datos.join("organizaciones").join(&id).join("respaldos"),
        });
        // `externa.restaurando` puede ser de otra organización: no es de esta
        let ajenos = [
            afuera.path().join("notas.txt"),
            bd.with_extension("restaurando"),
        ];
        for p in [&copia, &con_sufijo(&copia, "-wal"), &ajenos[0], &ajenos[1]] {
            fs::write(p, "x").unwrap();
        }
        cambiar(&d.e, &id).unwrap();
        assert!(!copia.exists());
        assert!(!con_sufijo(&copia, "-wal").exists());
        assert!(ajenos.iter().all(|p| p.exists()));
        assert_eq!(nombre_en(&d.e, &id).unwrap(), "Externa");
    }

    /// Con el tope de 1 byte y como si fuera de red: es lo que hace preguntar más de una vez.
    fn con_preguntas(
        r: &Rutas,
        ruta: &Path,
        buscando: Option<&str>,
        confirmados: &[&str],
    ) -> Result<ArchivoAgregado, Fallo> {
        agregar_con_red(r, ruta, buscando, confirmados, db::MIGRACIONES, 1, |_| true)
    }

    fn un_archivo(nombre: &str) -> (tempfile::TempDir, PathBuf, String) {
        let carpeta = tempfile::tempdir().unwrap();
        let bd = carpeta.path().join(nombre);
        let id = crear(&bd, "Externa", db::MIGRACIONES);
        (carpeta, bd, id)
    }

    #[test]
    fn archivo_con_varias_preguntas_necesita_un_si_para_cada_una() {
        let d = dos();
        let (_c, bd, id) = un_archivo("a.db");
        let antes = lista_del_json(&d.r).organizaciones;
        let hecho =
            d.e.agregar_archivo_con(bd.clone(), Some(d.b.id.clone()), vec![], &con_preguntas)
                .unwrap();
        assert_eq!(hecho.pide, Some("red"));
        let hecho = d.e.confirmar_archivo_con(true, &con_preguntas).unwrap();
        assert_eq!(hecho.unwrap().pide, Some("otro_id"));
        let hecho = d.e.confirmar_archivo_con(true, &con_preguntas).unwrap();
        assert_eq!(hecho.unwrap().pide, Some("tope"));
        assert_eq!(lista_del_json(&d.r).organizaciones, antes);

        let hecho =
            d.e.confirmar_archivo_con(true, &con_preguntas)
                .unwrap()
                .unwrap();
        assert_eq!((hecho.id.as_deref(), hecho.pide), (Some(id.as_str()), None));
        let ids: Vec<_> = lista_del_json(&d.r)
            .organizaciones
            .into_iter()
            .map(|o| o.id)
            .collect();
        assert_eq!(ids, [d.a.id.clone(), id]);
        // ya no queda nada que confirmar
        assert!(
            d.e.confirmar_archivo_con(true, &con_preguntas)
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn archivo_rechazado_no_queda_pendiente_ni_en_la_lista() {
        let d = dos();
        let (_c, bd, _) = un_archivo("a.db");
        let antes = lista_del_json(&d.r).organizaciones;
        d.e.agregar_archivo_con(bd, None, vec![], &con_preguntas)
            .unwrap();
        assert!(
            d.e.confirmar_archivo_con(false, &con_preguntas)
                .unwrap()
                .is_none()
        );
        assert!(
            d.e.confirmar_archivo_con(true, &con_preguntas)
                .unwrap()
                .is_none()
        );
        assert_eq!(lista_del_json(&d.r).organizaciones, antes);
    }

    #[test]
    fn archivo_se_agrega_con_la_lista_tomada() {
        let d = dos();
        let (_c, bd, id) = un_archivo("a.db");
        let vista = std::cell::Cell::new(false);
        let con_lista = |r: &Rutas, ruta: &Path, b: Option<&str>, c: &[&str]| {
            vista.set(d.e.lista.try_lock().is_err());
            agregar_archivo(r, ruta, b, c, db::MIGRACIONES)
        };
        let hecho =
            d.e.agregar_archivo_con(bd, None, vec![], &con_lista)
                .unwrap();
        assert!(vista.get());
        assert_eq!(hecho.id, Some(id));
        assert!(d.e.lista.try_lock().is_ok());
    }

    #[test]
    fn archivo_no_reemplaza_la_entrada_abierta() {
        let d = dos();
        let (_c, bd, _) = un_archivo("a.db");
        let antes = lista_del_json(&d.r).organizaciones;
        let de_verdad = |r: &Rutas, ruta: &Path, b: Option<&str>, c: &[&str]| {
            agregar_archivo(r, ruta, b, c, db::MIGRACIONES)
        };
        let e =
            d.e.agregar_archivo_con(bd, Some(d.a.id.clone()), vec!["otro_id"], &de_verdad)
                .unwrap_err();
        assert_eq!(e.codigo, "abierta");
        assert_eq!(lista_del_json(&d.r).organizaciones, antes);
    }

    #[test]
    fn archivo_agregado_abre_con_abrir_organizacion() {
        let d = dos();
        let (_c, bd, id) = un_archivo("a.db");
        let de_verdad = |r: &Rutas, ruta: &Path, b: Option<&str>, c: &[&str]| {
            agregar_archivo(r, ruta, b, c, db::MIGRACIONES)
        };
        d.e.agregar_archivo_con(bd.clone(), None, vec![], &de_verdad)
            .unwrap();
        assert_eq!(cambiar(&d.e, &id).unwrap().id, id);
        assert_eq!(nombre_en(&d.e, &id).unwrap(), "Externa");
        // volver a elegirlo, ya abierto, no lo toma por una copia ni le cambia el id
        let hecho =
            d.e.agregar_archivo_con(bd, None, vec![], &de_verdad)
                .unwrap();
        assert_eq!(hecho.id, Some(id.clone()));
        assert!(hecho.avisos.iter().all(|a| *a != "copia"));
        assert_eq!(nombre_en(&d.e, &id).unwrap(), "Externa");
    }

    #[test]
    fn una_externa_que_se_llama_como_la_copia_no_se_borra() {
        let d = dos();
        let afuera = tempfile::tempdir().unwrap();
        let bd = afuera.path().join("externa.RESTAURANDO");
        let id = con_externa(&d, &bd);
        cambiar(&d.e, &id).unwrap();
        assert!(bd.exists());
        assert_eq!(nombre_en(&d.e, &id).unwrap(), "Externa");
    }

    #[test]
    fn sin_entrada_un_boldo_db_vacio_no_se_lista() {
        let d = dos();
        let a = abrir_base(&d.r.bd, &d.r.respaldos, None, YA, db::MIGRACIONES)
            .ok()
            .unwrap();
        let id = a.id.clone();
        let mut conn = d.e.conn.lock().unwrap();
        d.e.cambiar_a_abierta(&mut conn, a, d.r.bd.clone(), d.r.respaldos.clone(), None)
            .unwrap();
        drop(conn);
        let base = d.e.base_abierta().unwrap();
        assert_eq!((base.id.as_str(), &base.bd), (id.as_str(), &d.r.bd));
        let lista = lista_del_json(&d.r);
        assert!(!lista.organizaciones.iter().any(|o| o.id == id));
        bloquear(&ruta_de(&d.r, &d.a), YA).unwrap();
    }

    #[test]
    fn sin_entrada_un_boldo_db_con_datos_se_lista() {
        let d = dos();
        let id = crear(&d.r.bd, "La mía", db::MIGRACIONES);
        let a = abrir_base(&d.r.bd, &d.r.respaldos, None, YA, db::MIGRACIONES)
            .ok()
            .unwrap();
        let mut conn = d.e.conn.lock().unwrap();
        d.e.cambiar_a_abierta(&mut conn, a, d.r.bd.clone(), d.r.respaldos.clone(), None)
            .unwrap();
        drop(conn);
        let l = lista_del_json(&d.r);
        let o = l.organizaciones.iter().find(|o| o.id == id).unwrap();
        assert!(o.es_principal());
        assert_eq!(o.nombre, "La mía");
        assert_eq!(l.organizaciones.len(), 3);
    }
}

#[cfg(test)]
mod crear_nueva {
    use super::*;
    use crate::intercambio::validar::solo_lectura_cerrada;
    use crate::organizaciones::prueba::{crear, entrada, escribir, interna, rutas, sin_rastros};
    use crate::organizaciones::{Lista, PALETA, ruta_de};
    use crate::respaldos::con_sufijo;
    use serde_json::json;
    use std::fs;
    use std::path::Path;

    const YA: Duration = Duration::ZERO;

    fn arrancar(r: &Rutas) -> Estado {
        let e = Estado::de_prueba(None, None, Some(r.clone()));
        e.abrir_inicial_con(YA, db::MIGRACIONES);
        e
    }

    fn con_nombre(nombre: &str) -> Vec<Sentencia> {
        vec![Sentencia {
            sql: "INSERT OR REPLACE INTO meta (clave, valor) VALUES ('org_nombre', ?1)".into(),
            params: vec![json!(nombre)],
        }]
    }

    fn nueva(e: &Estado) -> Result<String, Fallo> {
        e.crear(&con_nombre("Nueva"), "t", false, db::MIGRACIONES)
    }

    fn lista_del_json(r: &Rutas) -> Lista {
        serde_json::from_slice(&fs::read(r.datos.join("organizaciones.json")).unwrap()).unwrap()
    }

    fn entrada_de(r: &Rutas, id: &str) -> Entrada {
        lista_del_json(r)
            .organizaciones
            .into_iter()
            .find(|o| o.id == id)
            .unwrap()
    }

    fn carpetas(r: &Rutas) -> usize {
        fs::read_dir(r.datos.join("organizaciones"))
            .into_iter()
            .flatten()
            .count()
    }

    fn meta_de(bd: &Path, clave: &str) -> String {
        solo_lectura_cerrada(bd)
            .unwrap()
            .query_row("SELECT valor FROM meta WHERE clave = ?1", [clave], |f| {
                f.get(0)
            })
            .unwrap()
    }

    fn meta_abierta(e: &Estado, id: &str, clave: &str) -> String {
        e.con_conexion(id, |c| {
            c.query_row("SELECT valor FROM meta WHERE clave = ?1", [clave], |f| {
                f.get(0)
            })
            .map_err(|x| x.to_string())
        })
        .unwrap()
    }

    /// Una organización interna abierta, sola en la lista.
    fn con_interna(r: &Rutas) -> (Entrada, Estado) {
        let otra = interna(r, "2026");
        escribir(r, vec![otra.clone()]);
        let e = arrancar(r);
        assert_eq!(e.base_abierta().unwrap().id, otra.id);
        (otra, e)
    }

    /// Lo creó en su carpeta: `db_id`, `respaldos/` y entrada, y el archivo quedó cerrado.
    fn esta_en_su_carpeta(r: &Rutas, id: &str) {
        let carpeta = r.datos.join("organizaciones").join(id);
        let bd = carpeta.join("organizacion.db");
        assert_eq!(meta_de(&bd, "db_id"), id);
        assert!(carpeta.join("respaldos").is_dir());
        let o = entrada_de(r, id);
        assert_eq!(o.ruta, format!("organizaciones/{id}/organizacion.db"));
        assert!(!o.externa);
        assert_eq!(o.nombre, "Nueva");
        sin_rastros(&bd);
        drop(bloquear(&bd, YA).unwrap());
    }

    #[test]
    fn la_primera_usa_boldo_db_vacio_y_abierto() {
        let (_exe, r) = rutas();
        let e = arrancar(&r);
        let base = e.base_abierta().unwrap();
        assert_eq!(base.bd, r.bd);

        let id = nueva(&e).unwrap();

        assert_eq!(id, base.id);
        assert!(!r.datos.join("organizaciones").exists());
        let l = lista_del_json(&r);
        assert_eq!(l.organizaciones.len(), 1);
        let o = &l.organizaciones[0];
        assert!(o.es_principal());
        assert_eq!(o.nombre, "Nueva");
        assert_eq!(o.color, PALETA[0]);
        // aún no se abre: la hora la pone `abrir_organizacion`
        assert_eq!(o.abierta, "");
        assert!(!o.ejemplo);
        assert_eq!(e.base_abierta(), Some(base));
        assert_eq!(meta_abierta(&e, &id, "org_nombre"), "Nueva");
        assert_eq!(meta_abierta(&e, &id, "data_revision"), "1");
    }

    #[test]
    fn con_boldo_db_ausente_lo_usa() {
        let (_exe, r) = rutas();
        let (otra, e) = con_interna(&r);
        assert!(!r.bd.exists());

        let id = nueva(&e).unwrap();

        assert_eq!(meta_de(&r.bd, "db_id"), id);
        assert_eq!(meta_de(&r.bd, "org_nombre"), "Nueva");
        assert!(entrada_de(&r, &id).es_principal());
        assert_eq!(carpetas(&r), 1);
        // no se cambió de base, y `boldo.db` quedó cerrado
        assert_eq!(e.base_abierta().unwrap().id, otra.id);
        sin_rastros(&r.bd);
        drop(bloquear(&r.bd, YA).unwrap());
    }

    #[test]
    fn con_boldo_db_con_datos_crea_su_carpeta() {
        let (_exe, r) = rutas();
        crear(&r.bd, "La mía", db::MIGRACIONES);
        let e = arrancar(&r);
        let base = e.base_abierta().unwrap();
        let revision = meta_abierta(&e, &base.id, "data_revision");

        let id = nueva(&e).unwrap();

        assert_ne!(id, base.id);
        esta_en_su_carpeta(&r, &id);
        let l = lista_del_json(&r);
        assert_eq!(l.organizaciones.len(), 2);
        // el color es el menos usado
        assert_ne!(l.organizaciones[0].color, l.organizaciones[1].color);
        // la base abierta no cambió
        assert_eq!(e.base_abierta(), Some(base.clone()));
        assert_eq!(meta_abierta(&e, &base.id, "org_nombre"), "La mía");
        assert_eq!(meta_abierta(&e, &base.id, "data_revision"), revision);
    }

    const UN_CARGO: &str =
        "INSERT INTO cargos (id, nombre, created_at, updated_at) VALUES ('c', 'C', 'x', 'x')";

    #[test]
    fn un_boldo_db_abierto_solo_con_catalogos_no_se_hereda() {
        let (_exe, r) = rutas();
        let e = arrancar(&r);
        let base = e.base_abierta().unwrap();
        e.con_conexion(&base.id, |c| {
            c.execute_batch(UN_CARGO).map_err(|x| x.to_string())
        })
        .unwrap();

        let id = nueva(&e).unwrap();

        assert_ne!(id, base.id);
        esta_en_su_carpeta(&r, &id);
        assert_eq!(meta_abierta(&e, &base.id, "data_revision"), "0");
    }

    #[test]
    fn un_boldo_db_cerrado_solo_con_catalogos_no_se_toca() {
        let (_exe, r) = rutas();
        crear(&r.bd, "", db::MIGRACIONES);
        let c = db::abrir(&r.bd).unwrap();
        c.execute_batch(UN_CARGO).unwrap();
        c.close().unwrap();
        let antes = fs::read(&r.bd).unwrap();
        let (_otra, e) = con_interna(&r);

        let id = nueva(&e).unwrap();

        esta_en_su_carpeta(&r, &id);
        assert_eq!(fs::read(&r.bd).unwrap(), antes);
    }

    #[test]
    fn lote_que_falla_no_deja_carpeta_ni_entrada() {
        for (sql, detalle) in [
            ("INSERT INTO no_existe VALUES (1)", "no_existe"),
            ("DROP TABLE meta", "Sentencia no permitida"),
        ] {
            let malas = [Sentencia {
                sql: sql.into(),
                params: vec![],
            }];
            let falla = |e: &Estado| {
                let f = e.crear(&malas, "t", false, db::MIGRACIONES).unwrap_err();
                assert!(f.detalle.contains(detalle), "{sql}: {}", f.detalle);
            };

            // hacia su carpeta
            let (_exe, r) = rutas();
            crear(&r.bd, "La mía", db::MIGRACIONES);
            let e = arrancar(&r);
            let antes = lista_del_json(&r);
            falla(&e);
            assert_eq!(carpetas(&r), 0, "{sql}");
            assert_eq!(lista_del_json(&r), antes);
            let id = e.base_abierta().unwrap().id;
            assert_eq!(meta_abierta(&e, &id, "org_nombre"), "La mía");

            // hacia `boldo.db` abierto
            let (_exe, r) = rutas();
            let e = arrancar(&r);
            falla(&e);
            assert_eq!(carpetas(&r), 0, "{sql}");
            assert!(lista_del_json(&r).organizaciones.is_empty());
            let id = e.base_abierta().unwrap().id;
            assert_eq!(meta_abierta(&e, &id, "data_revision"), "0");

            // hacia `boldo.db` cerrado
            let (_exe, r) = rutas();
            let (otra, e) = con_interna(&r);
            let antes = lista_del_json(&r);
            falla(&e);
            assert_eq!(carpetas(&r), 1, "{sql}");
            assert_eq!(lista_del_json(&r), antes);
            assert_eq!(e.base_abierta().unwrap().id, otra.id);
            // lo que queda es lo que deja una instalación nueva, y lo usa la próxima
            let id = nueva(&e).unwrap();
            assert!(entrada_de(&r, &id).es_principal());
        }
    }

    #[test]
    fn si_no_se_puede_escribir_la_lista_no_toca_nada() {
        let sin_escribir = |r: &Rutas| {
            fs::create_dir(con_sufijo(&r.datos.join("organizaciones.json"), ".tmp")).unwrap();
        };

        // hacia su carpeta
        let (_exe, r) = rutas();
        crear(&r.bd, "La mía", db::MIGRACIONES);
        let e = arrancar(&r);
        sin_escribir(&r);
        assert!(nueva(&e).is_err());
        assert_eq!(carpetas(&r), 0);

        // hacia `boldo.db` abierto
        let (_exe, r) = rutas();
        let e = arrancar(&r);
        let base = e.base_abierta().unwrap();
        sin_escribir(&r);
        assert!(nueva(&e).is_err());
        assert_eq!(meta_abierta(&e, &base.id, "data_revision"), "0");

        // hacia `boldo.db` cerrado
        let (_exe, r) = rutas();
        let (_otra, e) = con_interna(&r);
        sin_escribir(&r);
        assert!(nueva(&e).is_err());
        assert!(!r.bd.exists());
    }

    #[test]
    fn boldo_db_listado_y_vacio_no_se_reusa() {
        // cerrado
        let (_exe, r) = rutas();
        let principal = crear(&r.bd, "", db::MIGRACIONES);
        let otra = interna(&r, "2026");
        escribir(
            &r,
            vec![otra, entrada(&principal, "boldo.db", false, "2020")],
        );
        let e = arrancar(&r);
        let antes = fs::read(&r.bd).unwrap();
        let id = nueva(&e).unwrap();
        assert_ne!(id, principal);
        esta_en_su_carpeta(&r, &id);
        assert_eq!(fs::read(&r.bd).unwrap(), antes);

        // abierto, y listado con su id o con otro
        for con_su_id in [true, false] {
            let (_exe, r) = rutas();
            let e = arrancar(&r);
            let base = e.base_abierta().unwrap();
            let otro = uuid::Uuid::now_v7().to_string();
            let listado = if con_su_id { &base.id } else { &otro };
            escribir(&r, vec![entrada(listado, "boldo.db", false, "2020")]);
            let id = nueva(&e).unwrap();
            assert_ne!(id, base.id);
            esta_en_su_carpeta(&r, &id);
            assert_eq!(meta_abierta(&e, &base.id, "data_revision"), "0");
        }
    }

    #[test]
    fn no_comparte_id_con_ninguna_entrada() {
        // `boldo.db` cerrado y vacío, con el id de otra
        let (_exe, r) = rutas();
        crear(&r.bd, "", db::MIGRACIONES);
        let (otra, e) = con_interna(&r);
        let c = db::abrir(&r.bd).unwrap();
        c.execute(
            "UPDATE meta SET valor = ?1 WHERE clave = 'db_id'",
            [&otra.id],
        )
        .unwrap();
        c.close().unwrap();
        let id = nueva(&e).unwrap();
        assert_ne!(id, otra.id);
        esta_en_su_carpeta(&r, &id);
        assert_eq!(meta_de(&r.bd, "db_id"), otra.id);

        // `boldo.db` abierto y vacío, con el id de otra
        let (_exe, r) = rutas();
        let e = arrancar(&r);
        let base = e.base_abierta().unwrap();
        let ruta = format!("organizaciones/{}/organizacion.db", base.id);
        escribir(&r, vec![entrada(&base.id, &ruta, false, "2020")]);
        let id = nueva(&e).unwrap();
        assert_ne!(id, base.id);
        esta_en_su_carpeta(&r, &id);
        assert_eq!(meta_abierta(&e, &base.id, "data_revision"), "0");
    }

    #[test]
    fn si_boldo_db_no_se_puede_usar_crea_su_carpeta() {
        // lo tiene otra copia
        let (_exe, r) = rutas();
        crear(&r.bd, "", db::MIGRACIONES);
        let (_otra, e) = con_interna(&r);
        let tomado = bloquear(&r.bd, YA).unwrap();
        let id = nueva(&e).unwrap();
        esta_en_su_carpeta(&r, &id);
        assert_eq!(meta_de(&r.bd, "data_revision"), "0");
        drop(tomado);

        // no es una base
        let (_exe, r) = rutas();
        fs::write(&r.bd, "no soy sqlite").unwrap();
        let (_otra, e) = con_interna(&r);
        let id = nueva(&e).unwrap();
        esta_en_su_carpeta(&r, &id);
        assert_eq!(fs::read(&r.bd).unwrap(), b"no soy sqlite");
    }

    #[test]
    fn con_una_lista_protegida_no_crea_nada() {
        let (_exe, r) = rutas();
        let e = arrancar(&r);
        let json = r.datos.join("organizaciones.json");
        fs::write(&json, r#"{"version":2}"#).unwrap();
        let base = e.base_abierta().unwrap();

        assert_eq!(nueva(&e).unwrap_err().codigo, "lista_protegida");

        assert_eq!(fs::read_to_string(&json).unwrap(), r#"{"version":2}"#);
        assert!(!r.datos.join("organizaciones").exists());
        assert_eq!(meta_abierta(&e, &base.id, "data_revision"), "0");
    }

    #[test]
    fn portable_no_escribe_fuera_de_su_carpeta() {
        let padre = tempfile::tempdir().unwrap();
        let exe = padre.path().join("exe");
        fs::create_dir(&exe).unwrap();
        fs::write(exe.join("portable.flag"), "").unwrap();
        let r = rutas::dir_datos(&exe, None).unwrap();
        let e = arrancar(&r);

        // una en `boldo.db` y otra en su carpeta
        assert!(entrada_de(&r, &nueva(&e).unwrap()).es_principal());
        assert!(!entrada_de(&r, &nueva(&e).unwrap()).es_principal());

        let nombres = |p: &Path| {
            let mut n: Vec<_> = fs::read_dir(p)
                .unwrap()
                .flatten()
                .map(|f| f.file_name().to_string_lossy().into_owned())
                .collect();
            n.sort();
            n
        };
        assert_eq!(nombres(padre.path()), ["exe"]);
        assert_eq!(nombres(&exe), ["datos", "portable.flag"]);
    }

    #[test]
    fn ejemplo_queda_marcado() {
        let (_exe, r) = rutas();
        let e = arrancar(&r);
        let con = |ejemplo| {
            e.crear(&con_nombre("Nueva"), "t", ejemplo, db::MIGRACIONES)
                .unwrap()
        };
        let (en_principal, en_carpeta, sin_marca) = (con(true), con(true), con(false));
        assert!(entrada_de(&r, &en_principal).es_principal());
        assert!(entrada_de(&r, &en_carpeta).ejemplo);
        assert!(entrada_de(&r, &en_principal).ejemplo);
        assert!(!entrada_de(&r, &sin_marca).ejemplo);

        // pedir el `boldo.db` que ya está abierto le pone la hora y no le quita la marca
        let v = e
            .cambiar_a(&en_principal, &|| false, db::MIGRACIONES)
            .unwrap();
        assert!(v.activa && v.ejemplo);
        let o = entrada_de(&r, &en_principal);
        assert!(o.abierta.ends_with('Z'), "{}", o.abierta);
        assert!(o.ejemplo);

        // abrirla no le quita la marca
        e.cambiar_a(&en_carpeta, &|| false, db::MIGRACIONES)
            .unwrap();
        assert!(entrada_de(&r, &en_carpeta).ejemplo);
    }

    #[test]
    fn lo_creado_se_abre_con_abrir_organizacion() {
        let (_exe, r) = rutas();
        let (otra, e) = con_interna(&r);
        let primera = nueva(&e).unwrap();
        let segunda = nueva(&e).unwrap();
        assert_eq!(e.base_abierta().unwrap().id, otra.id);

        for id in [&primera, &segunda] {
            let v = e.cambiar_a(id, &|| false, db::MIGRACIONES).unwrap();
            assert!(v.activa);
            assert_eq!(v.nombre, "Nueva");
            assert_eq!(meta_abierta(&e, id, "org_nombre"), "Nueva");
            assert!(entrada_de(&r, id).abierta.ends_with('Z'));
        }
        assert_eq!(
            ruta_de(&r, &entrada_de(&r, &segunda)),
            e.base_abierta().unwrap().bd
        );
    }
}

#[cfg(test)]
mod como_nueva {
    use super::*;
    use crate::intercambio::prueba::base_con_datos;
    use crate::organizaciones::prueba::rutas;
    use crate::respaldos::con_sufijo;
    use std::fs;
    use std::sync::mpsc;

    const TRABAJO: &str = "t";

    /// El trabajo `TRABAJO`, con un archivo de esa base ya abierto.
    fn sesion_con_archivo(r: &Rutas, origen: &Connection, d: &Path) -> Sesiones {
        let copia = alcance::copiar(origen, d).unwrap();
        let (t, _) = alcance::preparar(copia, d, None).unwrap();
        let archivo = d.join("a.boldo");
        let codigo = intercambio::guardar(t.ruta(), &archivo, |_, _| true).unwrap();
        let i = intercambio::abrir(&archivo, &r.datos, &codigo, db::MIGRACIONES, |_, _| true);
        let s = Sesiones::default();
        s.empezar(TRABAJO).unwrap();
        s.guardar_importacion(TRABAJO, i.unwrap()).unwrap();
        s
    }

    #[test]
    fn al_salir_bien_suelta_el_trabajo_y_al_fallar_sigue_para_reintentar() {
        let (d, origen) = base_con_datos();
        let (_exe, r) = rutas();
        let s = sesion_con_archivo(&r, &origen, d.path());
        let e = Estado::de_prueba(None, None, Some(r.clone()));
        e.abrir_inicial_con(Duration::ZERO, db::MIGRACIONES);

        let tmp = con_sufijo(&r.datos.join("organizaciones.json"), ".tmp");
        fs::create_dir(&tmp).unwrap();
        assert!(e.como_nueva(&s, TRABAJO).is_err());
        fs::remove_dir(&tmp).unwrap();
        assert!(s.ocupada());
        assert!(s.importacion(TRABAJO).is_ok());

        let id = e.como_nueva(&s, TRABAJO).unwrap();
        assert!(!s.ocupada());
        // el temporal de la importación ya no está, y lo que sigue no choca con un trabajo en curso
        let temporales = fs::read_dir(&r.datos)
            .unwrap()
            .flatten()
            .filter(|f| f.file_name().to_string_lossy().ends_with(".db.tmp"))
            .count();
        assert_eq!(temporales, 0);
        let v = e.cambiar_a(&id, &|| s.ocupada(), db::MIGRACIONES).unwrap();
        assert!(v.activa);
    }

    #[test]
    fn espera_a_que_se_suelte_la_lista() {
        let (d, origen) = base_con_datos();
        let (_exe, r) = rutas();
        let s = sesion_con_archivo(&r, &origen, d.path());
        let e = Estado::de_prueba(None, None, Some(r.clone()));
        let (listo, hecho) = mpsc::channel();
        std::thread::scope(|hilos| {
            let tomada = e.lista.lock().unwrap();
            hilos.spawn(|| listo.send(e.como_nueva(&s, TRABAJO)).unwrap());
            assert!(hecho.recv_timeout(Duration::from_millis(200)).is_err());
            assert!(cargar_lista(&r).organizaciones.is_empty());
            drop(tomada);
            let id = hecho.recv().unwrap().unwrap();
            assert_eq!(cargar_lista(&r).organizaciones[0].id, id);
        });
    }

    /// Solo toma la lista: con la conexión ocupada en un respaldo también se puede, y la abierta sigue siendo la misma.
    #[test]
    fn no_necesita_la_conexion_y_la_abierta_no_cambia() {
        let (d, origen) = base_con_datos();
        let (_exe, r) = rutas();
        let e = Estado::de_prueba(None, None, Some(r.clone()));
        e.abrir_inicial_con(Duration::ZERO, db::MIGRACIONES);
        let abierta = e.base_abierta().unwrap();
        let s = sesion_con_archivo(&r, &origen, d.path());
        let _conn = e.conn.lock().unwrap();
        let id = e.como_nueva(&s, TRABAJO).unwrap();
        assert_ne!(abierta.id, id);
        assert_eq!(e.base_abierta(), Some(abierta));
    }
}

/// Todo en carpetas temporales. Lo que importa de cada caso es lo que **no** se borra.
#[cfg(test)]
mod eliminar {
    use super::*;
    use crate::intercambio::validar::solo_lectura_cerrada;
    use crate::organizaciones::prueba::{crear, crear_enlace, entrada, escribir, interna, rutas};
    use crate::organizaciones::{agregar_archivo, esta_vacia, ruta_de};
    use crate::respaldos::con_sufijo;
    use serde_json::json;
    use std::fs;

    const YA: Duration = Duration::ZERO;
    const RESPALDO: &str = "boldo-20200101-0000.db";

    /// Una de cada tipo, cada una con un respaldo y un archivo del usuario, y A abierta.
    struct Cuatro {
        _exe: tempfile::TempDir,
        _afuera: tempfile::TempDir,
        r: Rutas,
        e: Estado,
        a: Entrada,
        p: Entrada,
        i: Entrada,
        x: Entrada,
    }

    fn con_respaldos(r: &Rutas, o: &Entrada) {
        let dir = base_de(r, o).respaldos;
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(RESPALDO), "respaldo").unwrap();
        fs::write(dir.join("notas.txt"), "del usuario").unwrap();
    }

    fn arrancar(r: &Rutas) -> Estado {
        let e = Estado::de_prueba(None, None, Some(r.clone()));
        e.abrir_inicial_con(YA, db::MIGRACIONES);
        e
    }

    fn cuatro() -> Cuatro {
        let (_exe, r) = rutas();
        let _afuera = tempfile::tempdir().unwrap();
        let en_afuera = _afuera.path().join("externa.db");
        let id_x = crear(&en_afuera, "Externa", db::MIGRACIONES);
        let x = entrada(&id_x, en_afuera.to_str().unwrap(), true, "2022");
        let id_p = crear(&r.bd, "Principal", db::MIGRACIONES);
        let p = entrada(&id_p, "boldo.db", false, "2020");
        let (a, i) = (interna(&r, "2026"), interna(&r, "2021"));
        let todas = [a.clone(), p.clone(), i.clone(), x.clone()];
        todas.iter().for_each(|o| con_respaldos(&r, o));
        escribir(&r, todas.to_vec());
        let e = arrancar(&r);
        assert_eq!(e.base_abierta().unwrap().id, a.id);
        Cuatro {
            _exe,
            _afuera,
            r,
            e,
            a,
            p,
            i,
            x,
        }
    }

    fn eliminar(
        e: &Estado,
        id: &str,
        copia: bool,
        archivo: bool,
    ) -> Result<Option<OrganizacionVista>, Fallo> {
        e.eliminar(id, copia, archivo, &|| false, db::MIGRACIONES)
    }

    fn ids(r: &Rutas) -> Vec<String> {
        cargar_lista(r)
            .organizaciones
            .into_iter()
            .map(|o| o.id)
            .collect()
    }

    fn nombres(dir: &Path) -> Vec<String> {
        let mut n: Vec<_> = fs::read_dir(dir)
            .into_iter()
            .flatten()
            .flatten()
            .map(|f| f.file_name().to_string_lossy().into_owned())
            .collect();
        n.sort();
        n
    }

    fn meta_de(bd: &Path, clave: &str) -> Option<String> {
        solo_lectura_cerrada(bd)
            .unwrap()
            .query_row("SELECT valor FROM meta WHERE clave = ?1", [clave], |f| {
                f.get(0)
            })
            .ok()
    }

    fn fija_meta(bd: &Path, clave: &str, valor: &str) {
        let c = db::abrir(bd).unwrap();
        c.execute(
            "INSERT OR REPLACE INTO meta (clave, valor) VALUES (?1, ?2)",
            [clave, valor],
        )
        .unwrap();
        c.close().unwrap();
    }

    type Huella = (Option<String>, Option<String>, Vec<(String, Vec<u8>)>);

    /// Lo que debe seguir igual de una organización: quién es, y lo que hay en su carpeta de respaldos.
    fn huella(r: &Rutas, o: &Entrada) -> Huella {
        let bd = ruta_de(r, o);
        let dir = base_de(r, o).respaldos;
        let archivos = nombres(&dir)
            .into_iter()
            .map(|n| (n.clone(), fs::read(dir.join(n)).unwrap()))
            .collect();
        (meta_de(&bd, "db_id"), meta_de(&bd, "org_nombre"), archivos)
    }

    fn huellas(d: &Cuatro, sin: &str) -> Vec<Huella> {
        [&d.a, &d.p, &d.i, &d.x]
            .into_iter()
            .filter(|o| o.id != sin)
            .map(|o| huella(&d.r, o))
            .collect()
    }

    fn eliminadas(r: &Rutas) -> Vec<String> {
        nombres(&r.datos.join("organizaciones-eliminadas"))
    }

    fn eliminar_sin_tocar_otras(
        d: &Cuatro,
        o: &Entrada,
        copia: bool,
        archivo: bool,
    ) -> Result<Option<OrganizacionVista>, Fallo> {
        let antes = huellas(d, &o.id);
        let hecho = eliminar(&d.e, &o.id, copia, archivo);
        assert_eq!(huellas(d, &o.id), antes);
        hecho
    }

    #[test]
    fn eliminar_nueva_borra_su_carpeta() {
        let d = cuatro();
        let carpeta = d.r.datos.join("organizaciones").join(&d.i.id);
        drop(bloquear(&ruta_de(&d.r, &d.i), YA).unwrap());
        fs::write(carpeta.join("organizacion.restaurando"), "x").unwrap();

        let v = eliminar_sin_tocar_otras(&d, &d.i, false, false).unwrap();

        assert!(v.is_none());
        assert!(!carpeta.exists());
        assert!(!ids(&d.r).contains(&d.i.id));
        assert_eq!(d.e.base_abierta().unwrap().id, d.a.id);
    }

    #[test]
    fn eliminar_boldo_db_borra_archivo_y_respaldos_propios() {
        let d = cuatro();
        for s in ["-wal", "-shm", ".bloqueo"] {
            fs::write(con_sufijo(&d.r.bd, s), "x").unwrap();
        }
        let propios = [
            RESPALDO,
            "boldo-20200101-0000-2.db",
            "boldo-antes-de-restaurar-20200101-0000.db",
            "boldo-antes-de-reemplazar-20200101-0000.db",
            "boldo-antes-de-importar-20200101-0000.db",
            "boldo-antes-de-optimizar-20200101-0000.db",
            "antes-migracion-1-20200101000000-abcd1234.db",
            "antes-migracion-1-20200101000000-abcd1234.boldo",
            "boldo-20200101-0000.db.tmp",
        ];
        let ajenos = ["boldo-notas.db", "boldo-2020.db", "boldo.txt", "notas.txt"];
        for n in propios.iter().chain(&ajenos) {
            fs::write(d.r.respaldos.join(n), "x").unwrap();
        }
        // con el nombre de un respaldo, pero no es un archivo
        fs::create_dir(d.r.respaldos.join("boldo-20200102-0000.db")).unwrap();

        assert!(
            eliminar_sin_tocar_otras(&d, &d.p, false, false)
                .unwrap()
                .is_none()
        );

        for s in ["", "-wal", "-shm", "-journal", ".bloqueo"] {
            assert!(!con_sufijo(&d.r.bd, s).exists(), "{s}");
        }
        let mut quedan = ajenos.map(String::from).to_vec();
        quedan.push("boldo-20200102-0000.db".into());
        quedan.sort();
        assert_eq!(nombres(&d.r.respaldos), quedan);
        assert!(!ids(&d.r).contains(&d.p.id));
    }

    #[test]
    fn arrancar_sin_boldo_db_crea_uno_vacio_y_la_proxima_lo_usa() {
        let d = cuatro();
        let nueva = |e: &Estado| {
            let s = vec![Sentencia {
                sql: "INSERT OR REPLACE INTO meta (clave, valor) VALUES ('org_nombre', ?1)".into(),
                params: vec![json!("Nueva")],
            }];
            e.crear(&s, "t", false, db::MIGRACIONES).unwrap()
        };
        eliminar(&d.e, &d.p.id, false, false).unwrap();
        // otra abierta: se crea al usarlo, aunque no estuviera
        assert!(!d.r.bd.exists());
        let id = nueva(&d.e);
        let o = cargar_lista(&d.r)
            .organizaciones
            .into_iter()
            .find(|o| o.id == id)
            .unwrap();
        assert!(o.es_principal());
        assert_eq!(meta_de(&d.r.bd, "db_id"), Some(id));
        drop(d);

        // sin ninguna: el arranque lo crea, no lo lista, y la próxima lo usa
        let (_exe, r) = rutas();
        escribir(&r, vec![]);
        let e = arrancar(&r);
        assert_eq!(e.base_abierta().unwrap().bd, r.bd);
        assert!(ids(&r).is_empty());
        let id = nueva(&e);
        assert_eq!(id, e.base_abierta().unwrap().id);
        assert_eq!(ids(&r), [id]);
    }

    #[test]
    fn eliminar_externa_solo_la_saca_y_borra_sus_respaldos() {
        let d = cuatro();
        let bd = ruta_de(&d.r, &d.x);
        let ajeno = bd.with_extension("restaurando");
        fs::write(&ajeno, "de otro").unwrap();
        let antes = fs::read(&bd).unwrap();

        assert!(
            eliminar_sin_tocar_otras(&d, &d.x, false, false)
                .unwrap()
                .is_none()
        );

        assert_eq!(fs::read(&bd).unwrap(), antes);
        assert!(!con_sufijo(&bd, ".bloqueo").exists());
        assert!(ajeno.exists());
        assert!(!ids(&d.r).contains(&d.x.id));
        let suyos = base_de(&d.r, &d.x).respaldos;
        assert_eq!(nombres(&suyos), ["notas.txt"]);
    }

    #[test]
    fn eliminar_externa_sin_nada_ajeno_no_deja_su_carpeta() {
        let d = cuatro();
        let suyos = base_de(&d.r, &d.x).respaldos;
        fs::remove_file(suyos.join("notas.txt")).unwrap();
        eliminar(&d.e, &d.x.id, false, false).unwrap();
        assert!(!d.r.datos.join("organizaciones").join(&d.x.id).exists());
    }

    #[test]
    fn eliminar_externa_con_borrar_archivo_lo_borra() {
        let d = cuatro();
        let bd = ruta_de(&d.r, &d.x);
        let carpeta = bd.parent().unwrap().to_path_buf();
        let ajeno = bd.with_extension("restaurando");
        let otro = carpeta.join("otra.db");
        let suya = con_sufijo(&bd, &format!(".{}.restaurando", d.x.id));
        for p in [&ajeno, &otro, &suya] {
            fs::write(p, "x").unwrap();
        }
        drop(bloquear(&bd, YA).unwrap());

        assert!(
            eliminar_sin_tocar_otras(&d, &d.x, false, true)
                .unwrap()
                .is_none()
        );

        for s in ["", "-wal", "-shm", "-journal", ".bloqueo"] {
            assert!(!con_sufijo(&bd, s).exists(), "{s}");
        }
        assert!(!suya.exists());
        assert!(ajeno.exists());
        assert!(otro.exists());
        assert!(!ids(&d.r).contains(&d.x.id));
    }

    #[test]
    fn con_copia_queda_en_organizaciones_eliminadas() {
        for cual in 0..4 {
            let d = cuatro();
            let o = [&d.p, &d.i, &d.x, &d.a][cual];
            let (id, nombre, _) = huella(&d.r, o);
            eliminar_sin_tocar_otras(&d, o, true, false).unwrap();

            assert_eq!(eliminadas(&d.r).len(), 1, "{:?}", eliminadas(&d.r));
            let vistas = d.e.listar_eliminadas().unwrap();
            assert_eq!(vistas.len(), 1);
            assert_eq!(Some(vistas[0].organizacion.clone()), nombre);
            assert!(vistas[0].bytes > 0);
            assert_eq!(vistas[0].fecha.len(), 16, "{}", vistas[0].fecha);
            assert_eq!(&vistas[0].fecha[10..11], "T");
            let copia =
                d.r.datos
                    .join("organizaciones-eliminadas")
                    .join(&vistas[0].nombre);
            assert_eq!(meta_de(&copia, "db_id"), id);
            let ok: String = solo_lectura_cerrada(&copia)
                .unwrap()
                .query_row("PRAGMA integrity_check", [], |f| f.get(0))
                .unwrap();
            assert_eq!(ok, "ok");
        }
    }

    #[test]
    fn la_copia_de_la_abierta_lleva_lo_ultimo_que_se_escribio() {
        let d = cuatro();
        d.e.con_conexion(&d.a.id, |c| {
            c.execute(
                "UPDATE meta SET valor = 'Recién' WHERE clave = 'org_nombre'",
                [],
            )
            .map_err(|x| x.to_string())
        })
        .unwrap();
        eliminar(&d.e, &d.a.id, true, false).unwrap();
        assert_eq!(d.e.listar_eliminadas().unwrap()[0].organizacion, "Recién");
    }

    #[test]
    fn la_copia_no_se_sale_de_su_carpeta_por_el_nombre() {
        for nombre in [
            r"..\..\boldo",
            "../../boldo",
            "C:/x",
            "",
            "   ",
            "Año 100% ñandú",
            "con_guion_bajo",
            &"largo".repeat(100),
        ] {
            let d = cuatro();
            let mut i = d.i.clone();
            i.nombre = nombre.into();
            escribir(&d.r, vec![d.a.clone(), d.p.clone(), i.clone(), d.x.clone()]);
            eliminar(&d.e, &i.id, true, false).unwrap();
            let copias = eliminadas(&d.r);
            assert_eq!(copias.len(), 1, "{nombre}");
            assert!(!copias[0].contains(['/', '\\', ':', '%']), "{}", copias[0]);
            assert!(copias[0].len() < 200, "{}", copias[0]);
            assert_eq!(d.e.listar_eliminadas().unwrap().len(), 1, "{}", copias[0]);
            assert_eq!(
                fs::read_dir(&d.r.datos)
                    .unwrap()
                    .flatten()
                    .filter(|f| { f.file_name().to_string_lossy().ends_with(".db") })
                    .count(),
                1,
                "solo boldo.db"
            );
        }
    }

    #[test]
    fn dos_copias_del_mismo_nombre_no_se_pisan() {
        let d = cuatro();
        let mut x = d.x.clone();
        x.nombre.clone_from(&d.i.nombre);
        escribir(&d.r, vec![d.a.clone(), d.p.clone(), d.i.clone(), x]);
        eliminar(&d.e, &d.i.id, true, false).unwrap();
        eliminar(&d.e, &d.x.id, true, false).unwrap();
        assert_eq!(d.e.listar_eliminadas().unwrap().len(), 2);
    }

    #[test]
    fn sin_copia_no_queda_nada() {
        for cual in 0..4 {
            let d = cuatro();
            let o = [&d.p, &d.i, &d.x, &d.a][cual];
            eliminar(&d.e, &o.id, false, false).unwrap();
            assert!(eliminadas(&d.r).is_empty());
            assert!(d.e.listar_eliminadas().unwrap().is_empty());
        }
    }

    #[test]
    fn eliminar_la_abierta_pasa_antes_a_la_mas_reciente() {
        let d = cuatro();
        let carpeta = d.r.datos.join("organizaciones").join(&d.a.id);

        let v = eliminar_sin_tocar_otras(&d, &d.a, false, false)
            .unwrap()
            .unwrap();

        // la externa es la más reciente
        assert_eq!(v.id, d.x.id);
        assert!(v.activa);
        assert_eq!(d.e.base_abierta(), Some(base_de(&d.r, &d.x)));
        assert!(!carpeta.exists());
        assert_eq!(
            d.e.cambiar_a(&d.a.id, &|| false, db::MIGRACIONES)
                .unwrap_err()
                .codigo,
            "desconocido"
        );
        d.e.con_conexion(&d.x.id, |c| db::lote(c, &[], "t"))
            .unwrap();
        assert_eq!(
            d.e.con_conexion(&d.a.id, |c| db::lote(c, &[], "t")),
            Err("otra_base".to_string())
        );
    }

    #[test]
    fn eliminar_boldo_db_abierto_con_otras_pasa_a_una_y_lo_borra() {
        let d = cuatro();
        d.e.cambiar_a(&d.p.id, &|| false, db::MIGRACIONES).unwrap();
        fs::write(d.r.respaldos.join("notas2.txt"), "del usuario").unwrap();

        let v = eliminar(&d.e, &d.p.id, false, false).unwrap().unwrap();

        assert_eq!(v.id, d.a.id);
        for s in ["", "-wal", "-shm", ".bloqueo"] {
            assert!(!con_sufijo(&d.r.bd, s).exists(), "{s}");
        }
        assert_eq!(nombres(&d.r.respaldos), ["notas.txt", "notas2.txt"]);
        assert!(!ids(&d.r).contains(&d.p.id));
    }

    #[test]
    fn eliminar_la_externa_abierta_toca_su_archivo_solo_si_se_pide() {
        for borrar in [false, true] {
            let d = cuatro();
            let bd = ruta_de(&d.r, &d.x);
            d.e.cambiar_a(&d.x.id, &|| false, db::MIGRACIONES).unwrap();

            let v = eliminar(&d.e, &d.x.id, false, borrar).unwrap().unwrap();

            assert_eq!(v.id, d.a.id);
            assert_eq!(bd.exists(), !borrar);
            assert_eq!(con_sufijo(&bd, ".bloqueo").exists(), !borrar);
            // ya no la tiene nadie, aunque siga ahí
            if !borrar {
                drop(bloquear(&bd, YA).unwrap());
            }
            assert!(!ids(&d.r).contains(&d.x.id));
            assert_eq!(nombres(&base_de(&d.r, &d.x).respaldos), ["notas.txt"]);
        }
    }

    #[test]
    fn eliminar_la_unica_abierta_en_boldo_db_deja_uno_vacio() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        let p = entrada(&id, "boldo.db", false, "2020");
        con_respaldos(&r, &p);
        escribir(&r, vec![p]);
        let e = arrancar(&r);
        assert_eq!(e.base_abierta().unwrap().id, id);

        let v = eliminar(&e, &id, false, false).unwrap().unwrap();

        assert!(v.activa);
        assert_ne!(v.id, id);
        let base = e.base_abierta().unwrap();
        assert_eq!(
            (base.bd.clone(), base.id.clone()),
            (r.bd.clone(), v.id.clone())
        );
        assert!(ids(&r).is_empty(), "{:?}", ids(&r));
        assert_eq!(nombres(&r.respaldos), ["notas.txt"]);
        let vacia = e
            .con_conexion(&v.id, |c| esta_vacia(c).map_err(|x| x.to_string()))
            .unwrap();
        assert!(vacia);
        assert_eq!(
            bloquear(&r.bd, YA).unwrap_err().codigo,
            "abierta_en_otra_copia"
        );
        assert_eq!(meta_de(&r.bd, "db_id"), Some(v.id));
    }

    #[test]
    fn la_unica_con_copia_deja_la_copia_y_uno_vacio() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        escribir(&r, vec![entrada(&id, "boldo.db", false, "2020")]);
        let e = arrancar(&r);
        let v = eliminar(&e, &id, true, false).unwrap().unwrap();
        assert_ne!(v.id, id);
        let copia = e.listar_eliminadas().unwrap().remove(0);
        assert_eq!(copia.organizacion, "La mía");
        let ruta = r
            .datos
            .join("organizaciones-eliminadas")
            .join(&copia.nombre);
        assert_eq!(meta_de(&ruta, "db_id"), Some(id));
    }

    #[test]
    fn eliminar_la_abierta_si_la_otra_no_abre_prueba_la_siguiente() {
        let d = cuatro();
        // la más reciente después de A
        let externa = ruta_de(&d.r, &d.x);
        fs::remove_file(&externa).unwrap();

        let v = eliminar(&d.e, &d.a.id, false, false).unwrap().unwrap();

        assert_eq!(v.id, d.i.id);
        assert_eq!(d.e.base_abierta(), Some(base_de(&d.r, &d.i)));
        // sigue en la lista, sin archivo: por si vuelve el pendrive
        assert!(ids(&d.r).contains(&d.x.id));
        assert!(!ids(&d.r).contains(&d.a.id));
    }

    #[test]
    fn si_ninguna_abre_pasa_a_boldo_db_aunque_no_este_listado() {
        let (_exe, r) = rutas();
        let (a, b) = (interna(&r, "2026"), interna(&r, "2020"));
        fs::remove_file(ruta_de(&r, &b)).unwrap();
        escribir(&r, vec![a.clone(), b.clone()]);
        let e = arrancar(&r);
        assert!(!r.bd.exists());

        let v = eliminar(&e, &a.id, false, false).unwrap().unwrap();

        assert!(v.activa);
        assert_eq!(e.base_abierta().unwrap().bd, r.bd);
        // vacío: no se lista
        assert_eq!(ids(&r), [b.id.as_str()]);
        assert!(!r.datos.join("organizaciones").join(&a.id).exists());
        assert_eq!(
            bloquear(&r.bd, YA).unwrap_err().codigo,
            "abierta_en_otra_copia"
        );
    }

    #[test]
    fn boldo_db_con_el_id_de_otra_entrada_recibe_uno_nuevo() {
        for de_la_eliminada in [true, false] {
            let (_exe, r) = rutas();
            let (a, b) = (interna(&r, "2026"), interna(&r, "2020"));
            fs::remove_file(ruta_de(&r, &b)).unwrap();
            crear(&r.bd, "La mía", db::MIGRACIONES);
            let repetido = if de_la_eliminada { &a.id } else { &b.id };
            fija_meta(&r.bd, "db_id", repetido);
            escribir(&r, vec![a.clone(), b.clone()]);
            let e = arrancar(&r);
            assert_eq!(e.base_abierta().unwrap().id, a.id);

            let v = eliminar(&e, &a.id, false, false).unwrap().unwrap();

            assert_ne!(v.id, a.id);
            assert_ne!(v.id, b.id);
            assert_eq!(v.nombre, "La mía");
            assert_eq!(e.base_abierta().unwrap().bd, r.bd);
            let l = cargar_lista(&r).organizaciones;
            assert_eq!(l.len(), 2, "{l:?}");
            assert!(l.iter().any(|o| o.id == b.id && !o.es_principal()));
            assert!(l.iter().any(|o| o.id == v.id && o.es_principal()));
            drop(e);
            assert_eq!(meta_de(&r.bd, "db_id"), Some(v.id));
            assert_eq!(meta_de(&r.bd, "org_nombre").as_deref(), Some("La mía"));
        }
    }

    #[test]
    fn si_tampoco_boldo_db_abre_no_borra_nada() {
        let (_exe, r) = rutas();
        let a = interna(&r, "2026");
        con_respaldos(&r, &a);
        fs::write(&r.bd, "no soy sqlite").unwrap();
        escribir(&r, vec![a.clone()]);
        let e = arrancar(&r);
        assert_eq!(e.base_abierta().unwrap().id, a.id);

        assert!(eliminar(&e, &a.id, false, false).is_err());

        assert_eq!(e.base_abierta(), Some(base_de(&r, &a)));
        e.con_conexion(&a.id, |c| db::lote(c, &[], "t")).unwrap();
        assert_eq!(ids(&r), [a.id.as_str()]);
        assert_eq!(
            nombres(&base_de(&r, &a).respaldos),
            ["boldo-20200101-0000.db", "notas.txt"]
        );
        assert_eq!(fs::read(&r.bd).unwrap(), b"no soy sqlite");
    }

    #[test]
    fn eliminar_lo_que_otra_copia_tiene_abierto_no_borra_nada() {
        for copia in [false, true] {
            for cual in 0..3 {
                let d = cuatro();
                let (o, archivo) = [(&d.p, false), (&d.i, false), (&d.x, true)][cual];
                let bd = ruta_de(&d.r, o);
                let tomado = bloquear(&bd, YA).unwrap();
                let (antes, todas) = (fs::read(&bd).unwrap(), huellas(&d, ""));

                let f = eliminar(&d.e, &o.id, copia, archivo).err().unwrap();

                assert_eq!(f.codigo, "abierta_en_otra_copia");
                assert_eq!(fs::read(&bd).unwrap(), antes);
                assert_eq!(huellas(&d, ""), todas);
                assert!(ids(&d.r).contains(&o.id));
                assert!(eliminadas(&d.r).is_empty());
                drop(tomado);
            }
        }
    }

    /// No se toca el archivo: otra copia puede seguir usándolo.
    #[test]
    fn la_externa_que_otra_copia_tiene_abierta_se_puede_sacar_de_la_lista() {
        let d = cuatro();
        let bd = ruta_de(&d.r, &d.x);
        let _tomado = bloquear(&bd, YA).unwrap();
        let antes = fs::read(&bd).unwrap();
        eliminar(&d.e, &d.x.id, false, false).unwrap();
        assert_eq!(fs::read(&bd).unwrap(), antes);
        assert!(!ids(&d.r).contains(&d.x.id));
    }

    #[test]
    fn id_invalido_no_borra_nada() {
        let d = cuatro();
        let todas = huellas(&d, "");
        let lista = fs::read(d.r.datos.join("organizaciones.json")).unwrap();
        // uno válido, con carpeta, que no está en la lista
        let sin_lista = uuid::Uuid::now_v7().to_string();
        let suelta = d.r.datos.join("organizaciones").join(&sin_lista);
        fs::create_dir_all(&suelta).unwrap();
        fs::write(suelta.join("organizacion.db"), "x").unwrap();
        for id in [
            r"..\..\x",
            "../../x",
            "..",
            "",
            "boldo.db",
            d.a.id.to_uppercase().as_str(),
            sin_lista.as_str(),
        ] {
            for (copia, archivo) in [(false, false), (true, true)] {
                let f = eliminar(&d.e, id, copia, archivo).err().unwrap();
                assert_eq!(f.codigo, "desconocido", "{id}");
            }
        }
        assert_eq!(huellas(&d, ""), todas);
        assert!(suelta.join("organizacion.db").exists());
        assert!(eliminadas(&d.r).is_empty());
        assert_eq!(
            fs::read(d.r.datos.join("organizaciones.json")).unwrap(),
            lista
        );
    }

    #[test]
    fn un_archivo_que_ya_no_es_de_la_entrada_no_se_borra() {
        let d = cuatro();
        // otra organización en el lugar de la externa
        let bd = ruta_de(&d.r, &d.x);
        fija_meta(&bd, "db_id", &uuid::Uuid::now_v7().to_string());
        let antes = fs::read(&bd).unwrap();
        for copia in [false, true] {
            let f = eliminar(&d.e, &d.x.id, copia, true).err().unwrap();
            assert_eq!(f.codigo, "otro_id");
        }
        assert_eq!(fs::read(&bd).unwrap(), antes);
        assert!(!con_sufijo(&bd, ".bloqueo").exists());
        assert!(ids(&d.r).contains(&d.x.id));
        assert!(eliminadas(&d.r).is_empty());

        // algo que ni siquiera es una base
        fs::write(&bd, "del usuario").unwrap();
        assert_eq!(
            eliminar(&d.e, &d.x.id, false, true).err().unwrap().codigo,
            "otro_id"
        );
        assert_eq!(fs::read(&bd).unwrap(), b"del usuario");
        // solo sacarla de la lista no toca nada
        eliminar(&d.e, &d.x.id, false, false).unwrap();
        assert_eq!(fs::read(&bd).unwrap(), b"del usuario");
        assert!(!ids(&d.r).contains(&d.x.id));

        // otra organización en su propia carpeta o en `boldo.db`
        for o in [&d.i, &d.p] {
            let bd = ruta_de(&d.r, o);
            fija_meta(&bd, "db_id", &uuid::Uuid::now_v7().to_string());
            assert_eq!(
                eliminar(&d.e, &o.id, false, false).err().unwrap().codigo,
                "otro_id"
            );
            assert!(bd.exists());
            assert!(ids(&d.r).contains(&o.id));
        }
    }

    /// Dañada en su lugar de siempre: se puede eliminar, y es para lo que más sirve. Con copia no, porque no se puede copiar.
    #[test]
    fn una_interna_danada_se_puede_eliminar_sin_copia() {
        let d = cuatro();
        let bd = ruta_de(&d.r, &d.i);
        fs::write(&bd, "dañada").unwrap();
        assert!(eliminar(&d.e, &d.i.id, true, false).is_err());
        assert!(bd.exists());
        assert!(ids(&d.r).contains(&d.i.id));
        eliminar(&d.e, &d.i.id, false, false).unwrap();
        assert!(!d.r.datos.join("organizaciones").join(&d.i.id).exists());
    }

    #[test]
    fn sin_su_archivo_se_dice_si_se_pedia_copiarlo_o_borrarlo() {
        let d = cuatro();
        let (i, x) = (ruta_de(&d.r, &d.i), ruta_de(&d.r, &d.x));
        fs::remove_file(&i).unwrap();
        fs::remove_file(&x).unwrap();
        for (o, copia, archivo) in [
            (&d.i, true, false),
            (&d.x, true, false),
            (&d.x, false, true),
        ] {
            let f = eliminar(&d.e, &o.id, copia, archivo).err().unwrap();
            assert_eq!(f.codigo, "no_encontrado");
            assert!(ids(&d.r).contains(&o.id));
            assert!(nombres(&base_de(&d.r, o).respaldos).contains(&RESPALDO.to_string()));
        }
        assert!(!con_sufijo(&x, ".bloqueo").exists());
        eliminar(&d.e, &d.i.id, false, false).unwrap();
        eliminar(&d.e, &d.x.id, false, false).unwrap();
        assert!(!ids(&d.r).contains(&d.i.id));
        assert!(!ids(&d.r).contains(&d.x.id));
    }

    #[test]
    fn una_lista_protegida_no_deja_cambiar_nada() {
        let d = cuatro();
        let json = d.r.datos.join("organizaciones.json");
        fs::write(&json, r#"{"version":2}"#).unwrap();
        let todas = huellas(&d, "");
        for f in [
            eliminar(&d.e, &d.i.id, false, false).map(|_| ()),
            eliminar(&d.e, &d.a.id, false, false).map(|_| ()),
            d.e.quitar(&d.i.id),
            d.e.colorear(&d.i.id, "#000000"),
        ] {
            assert_eq!(f.unwrap_err().codigo, "lista_protegida");
        }
        assert_eq!(fs::read_to_string(&json).unwrap(), r#"{"version":2}"#);
        assert_eq!(huellas(&d, ""), todas);
        assert_eq!(d.e.base_abierta().unwrap().id, d.a.id);
    }

    #[test]
    fn si_la_lista_no_se_puede_escribir_no_borra_nada() {
        let d = cuatro();
        let tmp = con_sufijo(&d.r.datos.join("organizaciones.json"), ".tmp");
        fs::create_dir(&tmp).unwrap();
        let todas = huellas(&d, "");
        for o in [&d.i, &d.a] {
            assert!(eliminar(&d.e, &o.id, true, false).is_err());
        }
        assert_eq!(huellas(&d, ""), todas);
        assert_eq!(d.e.base_abierta().unwrap().id, d.a.id);
        assert!(eliminadas(&d.r).is_empty());
        fs::remove_dir(&tmp).unwrap();
    }

    #[test]
    fn un_trabajo_en_curso_no_deja_eliminar() {
        let d = cuatro();
        let todas = huellas(&d, "");
        let f =
            d.e.eliminar(&d.a.id, false, false, &|| true, db::MIGRACIONES)
                .err()
                .unwrap();
        assert_eq!(f.codigo, "trabajo_en_curso");
        assert_eq!(huellas(&d, ""), todas);
        assert_eq!(d.e.base_abierta().unwrap().id, d.a.id);
    }

    /// Windows no borra lo que tiene abierto otro programa. Lo que falta se puede reintentar.
    #[cfg(windows)]
    #[test]
    fn si_no_se_puede_borrar_sigue_en_la_lista_y_se_reintenta() {
        let d = cuatro();
        let bd = ruta_de(&d.r, &d.i);
        let otro = db::abrir(&bd).unwrap();
        assert!(eliminar(&d.e, &d.i.id, false, false).is_err());
        assert!(bd.exists());
        assert!(ids(&d.r).contains(&d.i.id));
        otro.close().unwrap();
        eliminar(&d.e, &d.i.id, false, false).unwrap();
        assert!(!bd.exists());
        assert!(!ids(&d.r).contains(&d.i.id));
    }

    #[cfg(windows)]
    #[test]
    fn la_unica_abierta_que_no_se_puede_borrar_vuelve_a_abrir() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        let p = entrada(&id, "boldo.db", false, "2020");
        con_respaldos(&r, &p);
        escribir(&r, vec![p]);
        let e = arrancar(&r);
        let otro = db::abrir(&r.bd).unwrap();

        assert!(eliminar(&e, &id, false, false).is_err());

        assert_eq!(e.base_abierta().unwrap().id, id);
        e.con_conexion(&id, |c| db::lote(c, &[], "t")).unwrap();
        assert_eq!(ids(&r), [id.as_str()]);
        assert!(r.respaldos.join(RESPALDO).exists());
        otro.close().unwrap();

        let v = eliminar(&e, &id, false, false).unwrap().unwrap();
        assert_ne!(v.id, id);
        assert!(ids(&r).is_empty());
    }

    #[test]
    fn quitar_no_borra_y_rechaza_la_abierta() {
        let d = cuatro();
        let todas = huellas(&d, "");
        assert_eq!(d.e.quitar(&d.a.id).unwrap_err().codigo, "abierta");
        assert!(ids(&d.r).contains(&d.a.id));
        for o in [&d.p, &d.i, &d.x] {
            d.e.quitar(&o.id).unwrap();
            assert!(!ids(&d.r).contains(&o.id));
        }
        // nada cambió en el disco, ni en los respaldos
        assert_eq!(huellas(&d, ""), todas);
        assert_eq!(d.e.quitar(&d.i.id).unwrap_err().codigo, "desconocido");
        assert_eq!(d.e.quitar(r"..\..\x").unwrap_err().codigo, "desconocido");
    }

    #[test]
    fn quitada_se_recupera_al_abrir_su_archivo() {
        let d = cuatro();
        for o in [&d.i, &d.x] {
            d.e.quitar(&o.id).unwrap();
            let hecho =
                agregar_archivo(&d.r, &ruta_de(&d.r, o), None, &[], db::MIGRACIONES).unwrap();
            assert_eq!(hecho.id.as_deref(), Some(o.id.as_str()));
            let v = d.e.cambiar_a(&o.id, &|| false, db::MIGRACIONES).unwrap();
            assert!(v.activa);
        }
    }

    #[test]
    fn restaurar_eliminada_es_organizacion_nueva() {
        let d = cuatro();
        let (_, nombre_org, _) = huella(&d.r, &d.i);
        eliminar(&d.e, &d.i.id, true, false).unwrap();
        let antes = huellas(&d, &d.i.id);
        let copia = d.e.listar_eliminadas().unwrap().remove(0).nombre;

        // su id quedó libre: vuelve con sus pestañas
        let primera = d.e.restaurar_eliminada(&copia, db::MIGRACIONES).unwrap();
        assert_eq!(primera, d.i.id);
        // ahora está en la lista
        let segunda = d.e.restaurar_eliminada(&copia, db::MIGRACIONES).unwrap();
        assert_ne!(segunda, d.i.id);

        let l = cargar_lista(&d.r).organizaciones;
        let o = l.iter().find(|o| o.id == segunda).unwrap();
        assert!(!o.externa);
        assert_eq!(o.ruta, format!("organizaciones/{segunda}/organizacion.db"));
        assert_eq!(Some(o.nombre.clone()), nombre_org);
        assert_eq!(
            meta_de(&ruta_de(&d.r, o), "db_id").as_deref(),
            Some(segunda.as_str())
        );
        let v = d.e.cambiar_a(&segunda, &|| false, db::MIGRACIONES).unwrap();
        assert!(v.activa);
        // la copia sigue, y lo demás no cambió
        assert_eq!(eliminadas(&d.r), [copia]);
        assert_eq!(huellas(&d, &d.i.id), antes);
    }

    #[test]
    fn restaurar_no_toma_el_id_de_la_abierta_ni_una_carpeta_ocupada() {
        let d = cuatro();
        let carpeta = d.r.datos.join("organizaciones-eliminadas");
        fs::create_dir_all(&carpeta).unwrap();
        let copia = |o: &Entrada, nombre: &str| {
            solo_lectura_cerrada(&ruta_de(&d.r, o))
                .unwrap()
                .execute("VACUUM INTO ?1", [carpeta.join(nombre).to_string_lossy()])
                .unwrap();
        };
        // quitada: no está en la lista, pero su archivo sigue en su carpeta
        copia(&d.i, "i_20200101-0000.db");
        d.e.quitar(&d.i.id).unwrap();
        let antes = fs::read(ruta_de(&d.r, &d.i)).unwrap();
        let id =
            d.e.restaurar_eliminada("i_20200101-0000.db", db::MIGRACIONES)
                .unwrap();
        assert_ne!(id, d.i.id);
        assert_eq!(fs::read(ruta_de(&d.r, &d.i)).unwrap(), antes);

        // abierta, sin estar en una lista que se reconstruyó: no se le repite el id
        d.e.cambiar_a(&d.x.id, &|| false, db::MIGRACIONES).unwrap();
        copia(&d.x, "x_20200101-0000.db");
        fs::remove_file(d.r.datos.join("organizaciones.json")).unwrap();
        assert!(!ids(&d.r).contains(&d.x.id));
        let id =
            d.e.restaurar_eliminada("x_20200101-0000.db", db::MIGRACIONES)
                .unwrap();
        assert_ne!(id, d.x.id);
    }

    #[test]
    fn borrar_y_restaurar_solo_aceptan_nombres_de_la_lista() {
        let d = cuatro();
        eliminar(&d.e, &d.i.id, true, false).unwrap();
        let carpeta = d.r.datos.join("organizaciones-eliminadas");
        let copia = eliminadas(&d.r).remove(0);
        // en su carpeta, pero sin forma de copia
        fs::write(carpeta.join("notas.db"), "del usuario").unwrap();
        fs::write(carpeta.join("notas.txt"), "del usuario").unwrap();
        fs::write(carpeta.join(format!("{copia}.tmp")), "a medias").unwrap();
        assert_eq!(d.e.listar_eliminadas().unwrap().len(), 1);
        let absoluta = carpeta.join(&copia).to_string_lossy().into_owned();
        let a_otra = ruta_de(&d.r, &d.a).to_string_lossy().into_owned();
        let todas = huellas(&d, &d.i.id);
        for nombre in [
            "../boldo.db",
            r"..\boldo.db",
            "..",
            ".",
            "",
            "notas.db",
            "notas.txt",
            "boldo.db",
            &format!("{copia}.tmp"),
            &copia.to_uppercase(),
            &absoluta,
            &a_otra,
        ] {
            assert_eq!(
                d.e.borrar_eliminada(nombre).unwrap_err().codigo,
                "desconocido",
                "{nombre}"
            );
            assert_eq!(
                d.e.restaurar_eliminada(nombre, db::MIGRACIONES)
                    .unwrap_err()
                    .codigo,
                "desconocido",
                "{nombre}"
            );
        }
        assert!(d.r.bd.exists());
        assert!(carpeta.join(&copia).exists());
        assert_eq!(huellas(&d, &d.i.id), todas);

        d.e.borrar_eliminada(&copia).unwrap();
        assert!(!carpeta.join(&copia).exists());
        assert!(carpeta.join("notas.db").exists());
        assert!(carpeta.join("notas.txt").exists());
        assert!(d.e.listar_eliminadas().unwrap().is_empty());
        assert_eq!(
            d.e.borrar_eliminada(&copia).unwrap_err().codigo,
            "desconocido"
        );
    }

    /// El id dice que es la abierta, y la lista dice qué archivo borrar: si no es el mismo, no se toca ninguno.
    #[test]
    fn la_abierta_con_otra_ruta_en_la_lista_no_borra_ese_archivo() {
        let d = cuatro();
        let tesis = d._afuera.path().join("tesis.docx");
        fs::write(&tesis, "del usuario").unwrap();
        let mut a = d.a.clone();
        a.externa = true;
        a.ruta = tesis.to_str().unwrap().into();
        escribir(&d.r, vec![a, d.p.clone(), d.i.clone(), d.x.clone()]);
        for (copia, archivo) in [(false, true), (true, true), (false, false)] {
            let f = eliminar(&d.e, &d.a.id, copia, archivo).err().unwrap();
            assert_eq!(f.codigo, "otro_id");
            assert_eq!(fs::read(&tesis).unwrap(), b"del usuario");
            assert_eq!(d.e.base_abierta(), Some(base_de(&d.r, &d.a)));
            assert!(eliminadas(&d.r).is_empty());
        }
        assert!(ruta_de(&d.r, &d.a).exists());
        drop(d);

        // la única, con la ruta de `boldo.db`: no hay a dónde ir, y se vaciaría
        let d = cuatro();
        let mut a = d.a.clone();
        a.ruta = "boldo.db".into();
        escribir(&d.r, vec![a]);
        let (antes, respaldos) = (fs::read(&d.r.bd).unwrap(), nombres(&d.r.respaldos));
        let f = eliminar(&d.e, &d.a.id, false, false).err().unwrap();
        assert_eq!(f.codigo, "otro_id");
        assert_eq!(fs::read(&d.r.bd).unwrap(), antes);
        assert_eq!(nombres(&d.r.respaldos), respaldos);
        assert_eq!(d.e.base_abierta(), Some(base_de(&d.r, &d.a)));
        assert!(ruta_de(&d.r, &d.a).exists());
    }

    /// `immutable` no ve el diario: se copiarían páginas a medio escribir, y después se borraría lo único que las arregla.
    #[test]
    fn la_copia_no_ignora_un_diario_sin_aplicar() {
        let d = cuatro();
        let bd = ruta_de(&d.r, &d.i);
        let diario = con_sufijo(&bd, "-journal");
        fs::write(&diario, "sin aplicar").unwrap();
        let f = eliminar(&d.e, &d.i.id, true, false).err().unwrap();
        assert_eq!(
            (f.codigo, f.detalle.as_str()),
            ("contenido_invalido", "journal")
        );
        assert!(bd.exists());
        assert_eq!(fs::read(&diario).unwrap(), b"sin aplicar");
        assert!(eliminadas(&d.r).is_empty());
        assert!(ids(&d.r).contains(&d.i.id));
        // sin copia no importa: se pidió borrarla
        eliminar(&d.e, &d.i.id, false, false).unwrap();
        assert!(!d.r.datos.join("organizaciones").join(&d.i.id).exists());

        // por un enlace, junto al archivo de verdad
        let real = ruta_de(&d.r, &d.x);
        let enlace = d._afuera.path().join("enlace.db");
        if crear_enlace(&real, &enlace) {
            let mut x = d.x.clone();
            x.ruta = enlace.to_str().unwrap().into();
            escribir(&d.r, vec![d.a.clone(), d.p.clone(), x]);
            fs::write(con_sufijo(&real, "-journal"), "sin aplicar").unwrap();
            let f = eliminar(&d.e, &d.x.id, true, false).err().unwrap();
            assert_eq!(
                (f.codigo, f.detalle.as_str()),
                ("contenido_invalido", "journal")
            );
            assert!(eliminadas(&d.r).is_empty());
        }
    }

    /// Lo que deja un corte: el archivo y un `-wal` con filas que aún no se vuelcan.
    fn deja_filas_en_el_wal(bd: &Path, nombre: &str) {
        let carpeta = tempfile::tempdir().unwrap();
        let (b, w) = (carpeta.path().join("b"), carpeta.path().join("w"));
        let c = db::abrir(bd).unwrap();
        c.pragma_update(None, "wal_autocheckpoint", 0).unwrap();
        c.execute(
            "UPDATE meta SET valor = ?1 WHERE clave = 'org_nombre'",
            [nombre],
        )
        .unwrap();
        fs::copy(bd, &b).unwrap();
        fs::copy(con_sufijo(bd, "-wal"), &w).unwrap();
        c.close().unwrap();
        fs::copy(&b, bd).unwrap();
        fs::copy(&w, con_sufijo(bd, "-wal")).unwrap();
    }

    #[test]
    fn la_copia_de_una_no_abierta_lleva_lo_que_sigue_en_el_wal() {
        for cual in 0..3 {
            let d = cuatro();
            let o = [&d.p, &d.i, &d.x][cual];
            let bd = ruta_de(&d.r, o);
            deja_filas_en_el_wal(&bd, "En el wal");

            eliminar(&d.e, &o.id, true, o.externa).unwrap();

            let copia = d.e.listar_eliminadas().unwrap().remove(0);
            assert_eq!(copia.organizacion, "En el wal");
            for s in ["", "-wal", "-shm", ".bloqueo"] {
                assert!(!con_sufijo(&bd, s).exists(), "{s}");
            }
        }
    }

    #[test]
    fn restaurar_con_una_lista_protegida_no_crea_nada() {
        let d = cuatro();
        eliminar(&d.e, &d.i.id, true, false).unwrap();
        let copia = d.e.listar_eliminadas().unwrap().remove(0).nombre;
        let json = d.r.datos.join("organizaciones.json");
        fs::write(&json, r#"{"version":2}"#).unwrap();
        let carpetas = nombres(&d.r.datos.join("organizaciones"));

        let f =
            d.e.restaurar_eliminada(&copia, db::MIGRACIONES)
                .unwrap_err();

        assert_eq!(f.codigo, "lista_protegida");
        assert_eq!(fs::read_to_string(&json).unwrap(), r#"{"version":2}"#);
        assert_eq!(nombres(&d.r.datos.join("organizaciones")), carpetas);
        assert_eq!(eliminadas(&d.r), [copia]);
    }

    #[test]
    fn lo_legible_sin_id_y_con_datos_no_se_borra() {
        let d = cuatro();
        for o in [&d.p, &d.i] {
            let bd = ruta_de(&d.r, o);
            let c = db::abrir(&bd).unwrap();
            c.execute("DELETE FROM meta WHERE clave = 'db_id'", [])
                .unwrap();
            c.close().unwrap();
            let antes = fs::read(&bd).unwrap();
            for copia in [false, true] {
                let f = eliminar(&d.e, &o.id, copia, false).err().unwrap();
                assert_eq!(f.codigo, "otro_id");
            }
            assert_eq!(fs::read(&bd).unwrap(), antes);
            assert!(base_de(&d.r, o).respaldos.join(RESPALDO).exists());
            assert!(ids(&d.r).contains(&o.id));
        }
        // ajena, sin `meta`
        let bd = ruta_de(&d.r, &d.p);
        fs::remove_file(&bd).unwrap();
        let c = Connection::open(&bd).unwrap();
        c.execute_batch("CREATE TABLE notas (x); INSERT INTO notas VALUES (1);")
            .unwrap();
        c.close().unwrap();
        assert_eq!(
            eliminar(&d.e, &d.p.id, false, false).err().unwrap().codigo,
            "otro_id"
        );
        assert!(bd.exists());
    }

    #[test]
    fn lo_que_no_tiene_nada_que_perder_si_se_borra() {
        // de 0 bytes
        let d = cuatro();
        fs::write(ruta_de(&d.r, &d.i), "").unwrap();
        eliminar(&d.e, &d.i.id, false, false).unwrap();
        assert!(!d.r.datos.join("organizaciones").join(&d.i.id).exists());

        // con el esquema y sin una fila, ni id
        let (_exe, r) = rutas();
        let a = interna(&r, "2026");
        let vacia = interna(&r, "2020");
        let bd = ruta_de(&r, &vacia);
        let c = db::abrir(&bd).unwrap();
        c.execute(
            "DELETE FROM meta WHERE clave IN ('db_id', 'org_nombre')",
            [],
        )
        .unwrap();
        c.close().unwrap();
        escribir(&r, vec![a, vacia.clone()]);
        let e = arrancar(&r);
        eliminar(&e, &vacia.id, false, false).unwrap();
        assert!(!bd.exists());
    }

    /// Una abierta cuyo archivo ya no está. Con el archivo real no se puede armar en Windows, que no borra uno abierto.
    fn abierta_sin_archivo(d: &Cuatro) -> Estado {
        let base = base_de(&d.r, &d.x);
        fs::remove_file(&base.bd).unwrap();
        let c = Connection::open_in_memory().unwrap();
        Estado::de_prueba(Some(c), Some(base), Some(d.r.clone()))
    }

    #[test]
    fn la_externa_abierta_sin_su_archivo_no_sale_como_si_se_hubiera_borrado() {
        let d = cuatro();
        let e = abierta_sin_archivo(&d);
        let f = eliminar(&e, &d.x.id, false, true).err().unwrap();
        assert_eq!(f.codigo, "no_encontrado");
        assert_eq!(e.base_abierta().unwrap().id, d.x.id);
        assert!(ids(&d.r).contains(&d.x.id));
        assert!(base_de(&d.r, &d.x).respaldos.join(RESPALDO).exists());
    }

    #[test]
    fn la_externa_abierta_sin_su_archivo_se_puede_sacar_de_la_lista() {
        let d = cuatro();
        let e = abierta_sin_archivo(&d);
        let v = eliminar(&e, &d.x.id, false, false).unwrap().unwrap();
        assert_ne!(v.id, d.x.id);
        assert!(!ids(&d.r).contains(&d.x.id));
    }

    #[test]
    fn una_externa_que_es_un_enlace_no_se_borra_a_medias() {
        let d = cuatro();
        let real = ruta_de(&d.r, &d.x);
        let enlace = d._afuera.path().join("enlace.db");
        if !crear_enlace(&real, &enlace) {
            return;
        }
        let mut x = d.x.clone();
        x.ruta = enlace.to_str().unwrap().into();
        escribir(&d.r, vec![d.a.clone(), d.p.clone(), d.i.clone(), x.clone()]);
        let hay = |ruta: &Path| fs::symlink_metadata(ruta).is_ok();
        let intacto = || {
            assert!(hay(&real) && hay(&enlace));
            assert!(ids(&d.r).contains(&d.x.id));
            assert!(base_de(&d.r, &x).respaldos.join(RESPALDO).exists());
        };

        let f = eliminar(&d.e, &d.x.id, false, true).err().unwrap();
        assert_eq!(
            (f.codigo, f.detalle.as_str()),
            ("contenido_invalido", "enlace")
        );
        intacto();

        // abierta: tampoco, y se queda en ella
        d.e.cambiar_a(&d.x.id, &|| false, db::MIGRACIONES).unwrap();
        let f = eliminar(&d.e, &d.x.id, false, true).err().unwrap();
        assert_eq!(
            (f.codigo, f.detalle.as_str()),
            ("contenido_invalido", "enlace")
        );
        assert_eq!(d.e.base_abierta().unwrap().id, d.x.id);
        intacto();

        // sacarla de la lista no borra ninguno de los dos
        let v = eliminar(&d.e, &d.x.id, false, false).unwrap().unwrap();
        assert_ne!(v.id, d.x.id);
        assert!(hay(&real) && hay(&enlace));
    }

    /// Una carpeta con el nombre de lo que hay que quitar: da error en todos los sistemas.
    #[test]
    fn la_unica_si_falla_lo_de_al_lado_igual_borra_sus_respaldos() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", db::MIGRACIONES);
        let p = entrada(&id, "boldo.db", false, "2020");
        con_respaldos(&r, &p);
        escribir(&r, vec![p]);
        let e = arrancar(&r);
        let retenida = r.datos.join("boldo.restaurando");
        fs::create_dir(&retenida).unwrap();
        fs::write(retenida.join("x"), "x").unwrap();

        assert!(eliminar(&e, &id, false, false).is_err());

        // el archivo ya no está: abrió uno vacío, y los respaldos no quedan para ese
        let base = e.base_abierta().unwrap();
        assert_ne!(base.id, id);
        assert_eq!(nombres(&r.respaldos), ["notas.txt"]);
        assert!(ids(&r).is_empty());
    }

    /// SQLite va empaquetado y se actualiza: `vaciar_principal` abre un archivo nuevo donde pudo quedar el `-wal` del anterior.
    #[test]
    fn sqlite_no_aplica_un_wal_sin_su_archivo() {
        let d = tempfile::tempdir().unwrap();
        let bd = d.path().join("x.db");
        crear(&bd, "Antes", db::MIGRACIONES);
        deja_filas_en_el_wal(&bd, "En el wal");
        assert!(con_sufijo(&bd, "-wal").exists());
        fs::remove_file(&bd).unwrap();

        let c = db::abrir(&bd).unwrap();

        let hay_meta: bool = c
            .query_row(
                "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE name = 'meta')",
                [],
                |f| f.get(0),
            )
            .unwrap();
        assert!(!hay_meta);
        c.close().unwrap();
        assert!(!con_sufijo(&bd, "-wal").exists());
    }

    /// El `.db` ya se fue y quedó algo al lado: pedirle lo mismo daría `no_encontrado`, y sacarla sin más termina.
    #[test]
    fn reintentar_sin_el_archivo_es_sin_pedir_copia_ni_borrarlo() {
        let d = cuatro();
        let bd = ruta_de(&d.r, &d.x);
        // un `-wal` que no se puede abrir frena antes: leer el archivo ya falla, y no se borra nada. Comprobado solo en Windows
        if cfg!(windows) {
            let wal = con_sufijo(&bd, "-wal");
            fs::create_dir(&wal).unwrap();
            let f = eliminar(&d.e, &d.x.id, false, true).err().unwrap();
            assert_eq!(f.codigo, "fallo", "{}", f.detalle);
            assert!(bd.exists());
            fs::remove_dir(&wal).unwrap();
        }

        fs::create_dir(con_sufijo(&bd, "-shm")).unwrap();
        assert!(eliminar(&d.e, &d.x.id, false, true).is_err());
        assert!(!bd.exists());
        assert!(ids(&d.r).contains(&d.x.id));

        let f = eliminar(&d.e, &d.x.id, false, true).err().unwrap();
        assert_eq!(f.codigo, "no_encontrado");
        assert!(ids(&d.r).contains(&d.x.id));

        eliminar(&d.e, &d.x.id, false, false).unwrap();
        assert!(!ids(&d.r).contains(&d.x.id));
    }

    #[test]
    fn color_invalido_se_rechaza() {
        let d = cuatro();
        let color = |id: &str| {
            cargar_lista(&d.r)
                .organizaciones
                .into_iter()
                .find(|o| o.id == id)
                .unwrap()
                .color
        };
        let antes = color(&d.i.id);
        for malo in [
            "",
            "rojo",
            "#12345",
            "#1234567",
            "#12345g",
            "123456",
            "#12345\u{e9}",
            "url(x)",
            "#123456;",
        ] {
            assert_eq!(
                d.e.colorear(&d.i.id, malo).unwrap_err().codigo,
                "contenido_invalido",
                "{malo}"
            );
            assert_eq!(color(&d.i.id), antes);
        }
        d.e.colorear(&d.i.id, "#a1b2c3").unwrap();
        assert_eq!(color(&d.i.id), "#a1b2c3");
        assert_eq!(color(&d.x.id), d.x.color);
        assert_eq!(
            d.e.colorear(&uuid::Uuid::now_v7().to_string(), "#a1b2c3")
                .unwrap_err()
                .codigo,
            "desconocido"
        );
    }
}
