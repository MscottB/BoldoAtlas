//! Cada organización es un archivo aparte. Aquí está lo que hace falta para abrir uno, su identidad y su bloqueo, y la lista
//! de las que tiene esta copia de la app.
use crate::db;
use crate::intercambio::validar::{
    MAX_BYTES_VIVOS, revisar_organizacion, solo_lectura_cerrada, version_leida, version_y_esquema,
};
use crate::intercambio::{Temporal, nombre_limpio};
use crate::respaldos::{
    Fallo, borrar_bd, borrar_respaldos, bytes_en, cerrar_copia, con_sufijo, copia_de_base,
    fecha_de_eliminada, limpiar_parciales, sello_local, volcar,
};
use crate::rutas::Rutas;
use rusqlite::{Connection, ErrorCode, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::fs::{self, File, OpenOptions, TryLockError};
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf, Prefix};
use std::sync::mpsc;
use std::time::{Duration, Instant, UNIX_EPOCH};

/// Quien pide datos cree tener abierta otra base: no se ejecuta nada.
pub const OTRA_BASE: &str = "otra_base";

/// Al arrancar se espera a que suelte el archivo la copia que se está cerrando (un reinicio, una actualización).
pub const ESPERA_ARRANQUE: Duration = Duration::from_secs(8);
/// Al cambiar de organización, quien tiene el archivo es otra copia en uso: esperar solo demoraría el aviso.
pub const ESPERA_CAMBIO: Duration = Duration::ZERO;

/// La base abierta: la organización con que trabaja esta copia de la app.
#[derive(Debug, Clone, PartialEq)]
pub struct Base {
    pub id: String,
    pub bd: PathBuf,
    pub respaldos: PathBuf,
}

/// Un archivo ya listo para usar. El bloqueo dura lo que dure `bloqueo`.
pub struct Abierta {
    pub conn: Connection,
    pub bloqueo: File,
    pub id: String,
    pub version: i64,
}

/// Solo la forma canónica: el id da nombre a una carpeta, y las demás formas del UUID serían otra carpeta para el mismo id.
pub fn es_id_valido(id: &str) -> bool {
    uuid::Uuid::try_parse(id).is_ok_and(|u| u.to_string() == id)
}

/// El `db_id` del archivo. Si falta o no es válido (el archivo puede venir de cualquier parte), escribe uno nuevo.
pub fn identidad(conn: &Connection) -> Result<String, String> {
    let actual: Option<String> = conn
        .query_row("SELECT valor FROM meta WHERE clave = 'db_id'", [], |f| {
            f.get(0)
        })
        .ok();
    match actual.filter(|id| es_id_valido(id)) {
        Some(id) => Ok(id),
        None => identidad_nueva(conn),
    }
}

/// Le da al archivo un `db_id` nuevo: también para uno cuyo id ya usa otra entrada, porque se cruzarían pestañas y preferencias.
pub fn identidad_nueva(conn: &Connection) -> Result<String, String> {
    let id = uuid::Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO meta (clave, valor) VALUES ('db_id', ?1)
         ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
        [&id],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

/// `ErrorKind` no clasifica los códigos habituales de un controlador o una carpeta de red sin bloqueos. Con su valor numérico,
/// para no sumar `libc` por dos constantes.
fn bloqueo_sin_soporte(e: &io::Error) -> bool {
    let codigos: &[i32] = if cfg!(windows) {
        &[1, 50] // ERROR_INVALID_FUNCTION, ERROR_NOT_SUPPORTED
    } else if cfg!(target_os = "linux") {
        &[37, 95] // ENOLCK (NFS sin lockd), ENOTSUP
    } else if cfg!(target_os = "macos") {
        &[77, 45] // ENOLCK, ENOTSUP
    } else {
        &[]
    };
    e.kind() == io::ErrorKind::Unsupported || e.raw_os_error().is_some_and(|c| codigos.contains(&c))
}

/// Toma `<bd>.bloqueo`, reintentando hasta `espera`. El sistema lo suelta al cerrar el archivo o si la app se cae.
pub fn bloquear(bd: &Path, espera: Duration) -> Result<File, Fallo> {
    let archivo = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(con_sufijo(bd, ".bloqueo"))?;
    let limite = Instant::now() + espera;
    loop {
        match archivo.try_lock() {
            Ok(()) => return Ok(archivo),
            Err(TryLockError::WouldBlock) if Instant::now() < limite => {
                std::thread::sleep(Duration::from_millis(25))
            }
            Err(TryLockError::WouldBlock) => {
                return Err(Fallo::de("abierta_en_otra_copia", bd.display()));
            }
            // shortcut: en un sistema de archivos sin bloqueos dos copias pueden abrir el mismo archivo, cambiarlo si
            // alguno de esos sistemas ofrece otra forma de detectarlo
            Err(TryLockError::Error(e)) if bloqueo_sin_soporte(&e) => return Ok(archivo),
            Err(TryLockError::Error(e)) => return Err(e.into()),
        }
    }
}

/// Un disco lleno se arregla liberando espacio: no es una migración fallida.
fn fallo_al_migrar(e: String) -> Fallo {
    if e == db::SIN_ESPACIO {
        e.into()
    } else {
        Fallo::de("migracion", e)
    }
}

/// Bloquea, revisa sin tocar el archivo y solo entonces lo abre para escribir: uno de esquema más nuevo o que no es SQLite
/// queda como estaba. `id_nuevo` es para un archivo recién creado; si no, el id es el que el archivo ya tiene.
pub fn abrir_base(
    bd: &Path,
    respaldos: &Path,
    id_nuevo: Option<&str>,
    espera: Duration,
    migraciones: &[&str],
) -> Result<Abierta, Fallo> {
    fs::create_dir_all(respaldos)?;
    let bloqueo = bloquear(bd, espera)?;
    if bd.exists() {
        version_leida(&solo_lectura_cerrada(bd)?, migraciones)?;
    }
    let mut conn = db::abrir(bd)?;
    let version = db::migrar_con(&mut conn, migraciones, respaldos).map_err(fallo_al_migrar)?;
    if let Some(id) = id_nuevo {
        conn.execute("INSERT INTO meta (clave, valor) VALUES ('db_id', ?1)", [id])?;
    }
    db::asegurar_meta(&conn)?;
    let id = identidad(&conn)?;
    Ok(Abierta {
        conn,
        bloqueo,
        id,
        version,
    })
}

const LISTA: &str = "organizaciones.json";
const VERSION_LISTA: u32 = 1;
/// El archivo de siempre: no se mueve, y sus respaldos siguen en `respaldos/`.
const PRINCIPAL: &str = "boldo.db";
pub(crate) const CARPETA: &str = "organizaciones";
const ARCHIVO: &str = "organizacion.db";
const ELIMINADAS: &str = "organizaciones-eliminadas";
/// Cuánto del nombre de la organización va en el nombre de su copia. Un nombre largo no debe agotar el de la ruta.
const LARGO_EN_COPIA: usize = 40;
/// Cuántas veces se intenta leer la lista si el error no es que falte, y la pausa entre intentos.
const LECTURAS_LISTA: u32 = 3;
const PAUSA_LECTURA: Duration = Duration::from_millis(100);
/// Cuánto se espera a que una unidad externa diga si el archivo está.
const LIMITE_UNIDAD: Duration = Duration::from_secs(3);
/// Cuántas copias de una lista dañada se guardan. Al llegar aquí no se pisa ninguna, ni se reemplaza la lista.
const COPIAS_DANADO: u32 = 20;

pub const PALETA: [&str; 8] = [
    "#3b6fb5", "#2f855a", "#b7791f", "#c05621", "#9b2c2c", "#805ad5", "#2c7a7b", "#b83280",
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Entrada {
    pub id: String,
    /// Relativa a la carpeta de datos, para que se pueda mover; absoluta si es externa.
    pub ruta: String,
    pub externa: bool,
    /// Copia de `meta.org_nombre`, para mostrarla sin abrir el archivo.
    pub nombre: String,
    pub color: String,
    pub abierta: String,
    #[serde(default)]
    pub ejemplo: bool,
}

impl Entrada {
    pub fn principal(id: &str) -> Entrada {
        Entrada {
            id: id.into(),
            ruta: PRINCIPAL.into(),
            externa: false,
            nombre: String::new(),
            color: String::new(),
            abierta: String::new(),
            ejemplo: false,
        }
    }

    pub fn es_principal(&self) -> bool {
        !self.externa && self.ruta == PRINCIPAL
    }

    /// Una interna solo puede estar en uno de sus dos lugares: el texto exacto deja fuera `..`, `C:x`, `BOLDO.DB` y la carpeta
    /// de otra organización.
    fn es_valida(&self) -> bool {
        es_id_valido(&self.id)
            && if self.externa {
                Path::new(&self.ruta).is_absolute()
            } else {
                self.ruta == PRINCIPAL || self.ruta == ruta_interna(&self.id)
            }
    }
}

pub(crate) fn ruta_interna(id: &str) -> String {
    format!("{CARPETA}/{id}/{ARCHIVO}")
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Lista {
    pub version: u32,
    pub organizaciones: Vec<Entrada>,
    /// El archivo tiene algo que esta copia no puede reemplazar: no se pudo leer, o es de una versión más nueva. Se abre lo
    /// que se pueda y `escribir_lista` lo rechaza.
    #[serde(skip)]
    pub no_escribir: bool,
}

/// Lo que Inicio muestra de cada organización.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizacionVista {
    pub id: String,
    pub nombre: String,
    pub color: String,
    pub abierta: String,
    pub externa: bool,
    pub ruta: String,
    pub existe: bool,
    pub activa: bool,
    pub logo: Option<String>,
    /// `None`: no se pudo leer.
    pub bytes_base: Option<u64>,
    pub bytes_respaldos: Option<u64>,
    pub ejemplo: bool,
}

pub fn ruta_de(r: &Rutas, e: &Entrada) -> PathBuf {
    if e.externa {
        PathBuf::from(&e.ruta)
    } else {
        r.datos.join(&e.ruta)
    }
}

pub fn base_de(r: &Rutas, e: &Entrada) -> Base {
    Base {
        id: e.id.clone(),
        bd: ruta_de(r, e),
        respaldos: if e.es_principal() {
            r.respaldos.clone()
        } else {
            r.datos.join(CARPETA).join(&e.id).join("respaldos")
        },
    }
}

/// La entrada de la base abierta que no está en la lista: su lugar se sabe por dónde está. Nombre, color y hora los pone
/// `anotar_abierta`.
pub fn entrada_de_base(r: &Rutas, b: &Base) -> Entrada {
    if b.bd == r.bd {
        return Entrada::principal(&b.id);
    }
    let interna = ruta_interna(&b.id);
    let externa = b.bd != r.datos.join(&interna);
    Entrada {
        ruta: if externa {
            b.bd.to_string_lossy().into_owned()
        } else {
            interna
        },
        externa,
        ..Entrada::principal(&b.id)
    }
}

fn leer_meta(conn: &Connection, clave: &str) -> Option<String> {
    conn.query_row("SELECT valor FROM meta WHERE clave = ?1", [clave], |f| {
        f.get(0)
    })
    .ok()
}

/// Nada que perder ni que heredar: es lo que deja una instalación nueva. Sin filas, ni siquiera eliminadas, en ninguna tabla
/// (también las que sumen migraciones futuras, y sin fallar por las que aún no tenga una base antigua), salvo `meta` y las
/// semillas intactas de `tipos_unidad`, y sin nombre ni logo.
pub fn esta_vacia(conn: &Connection) -> rusqlite::Result<bool> {
    let tablas = conn
        .prepare(
            r"SELECT name FROM sqlite_master WHERE type = 'table'
              AND name NOT IN ('meta', 'tipos_unidad') AND name NOT LIKE 'sqlite\_%' ESCAPE '\'",
        )?
        .query_map([], |f| f.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    for tabla in tablas {
        let tabla = tabla.replace('"', "\"\"");
        let sql = format!("SELECT EXISTS (SELECT 1 FROM \"{tabla}\")");
        if conn.query_row(&sql, [], |f| f.get::<_, bool>(0))? {
            return Ok(false);
        }
    }
    conn.query_row(
        "SELECT NOT EXISTS (
                SELECT 1 FROM tipos_unidad
                WHERE id NOT IN ('00000000-0000-7000-8000-000000000001',
                                 '00000000-0000-7000-8000-000000000002',
                                 '00000000-0000-7000-8000-000000000003',
                                 '00000000-0000-7000-8000-000000000004')
                   OR deleted_at IS NOT NULL
                   OR updated_at <> created_at)
            AND COALESCE((SELECT valor FROM meta WHERE clave = 'org_nombre'), '') = ''
            AND COALESCE((SELECT valor FROM meta WHERE clave = 'logo_png'), '') = ''",
        [],
        |f| f.get(0),
    )
}

/// El menos usado; entre iguales, el primero de la paleta.
pub fn color_libre(l: &Lista) -> &'static str {
    PALETA
        .into_iter()
        .min_by_key(|c| l.organizaciones.iter().filter(|e| e.color == *c).count())
        .unwrap_or(PALETA[0])
}

/// La entrada de un archivo que se reconstruye, sin tocarlo. `carpeta`: el id que debe tener para estar donde está.
fn entrada_de(bd: &Path, ruta: String, carpeta: Option<&str>) -> Option<Entrada> {
    let conn = solo_lectura_cerrada(bd).ok()?;
    let id = leer_meta(&conn, "db_id")
        .filter(|id| es_id_valido(id) && carpeta.is_none_or(|c| c == id))?;
    // si no se puede revisar se lista igual, que es el error seguro: al abrirla se dice el motivo
    if esta_vacia(&conn).unwrap_or(false) {
        return None;
    }
    let modificado = fs::metadata(bd).ok()?.modified().ok()?;
    let segundos = modificado.duration_since(UNIX_EPOCH).ok()?.as_secs_f64();
    let abierta = conn
        .query_row(
            "SELECT strftime('%Y-%m-%dT%H:%M:%fZ', ?1, 'unixepoch')",
            [segundos],
            |f| f.get(0),
        )
        .ok()?;
    Some(Entrada {
        id,
        ruta,
        externa: false,
        nombre: leer_meta(&conn, "org_nombre").unwrap_or_default(),
        color: String::new(),
        abierta,
        ejemplo: false,
    })
}

/// Con `boldo.db` y lo que haya en `organizaciones/`. Las externas no se pueden saber: salen de la lista, y sus archivos siguen donde están.
fn reconstruir(r: &Rutas) -> Lista {
    let mut encontradas = vec![entrada_de(&r.bd, PRINCIPAL.into(), None)];
    for carpeta in fs::read_dir(r.datos.join(CARPETA))
        .into_iter()
        .flatten()
        .flatten()
    {
        let nombre = carpeta.file_name();
        if let Some(id) = nombre.to_str().filter(|n| es_id_valido(n)) {
            encontradas.push(entrada_de(
                &carpeta.path().join(ARCHIVO),
                ruta_interna(id),
                Some(id),
            ));
        }
    }
    let mut l = Lista {
        version: VERSION_LISTA,
        organizaciones: Vec::new(),
        no_escribir: false,
    };
    for mut e in encontradas.into_iter().flatten() {
        e.color = color_libre(&l).into();
        l.organizaciones.push(e);
    }
    sin_repetidos(&mut l);
    l
}

/// Una sola entrada por id, la primera: con dos se cruzarían pestañas y preferencias, y se verían dos activas.
fn sin_repetidos(l: &mut Lista) {
    let mut vistos = HashSet::new();
    l.organizaciones.retain(|e| vistos.insert(e.id.clone()));
}

/// Reintenta lo que no sea que falte: un antivirus o una copia de seguridad pueden tenerlo tomado un momento.
fn leer_con_reintento(ruta: &Path) -> io::Result<Vec<u8>> {
    let mut intento = 1;
    loop {
        match fs::read(ruta) {
            Err(e) if e.kind() != io::ErrorKind::NotFound && intento < LECTURAS_LISTA => {
                intento += 1;
                std::thread::sleep(PAUSA_LECTURA);
            }
            hecho => return hecho,
        }
    }
}

/// `None` si no se entiende. La versión se mira antes que el formato: una más nueva puede tener otro, y eso no es un daño.
fn interpretar(bytes: &[u8]) -> Option<Lista> {
    let valor: Value = serde_json::from_slice(bytes).ok()?;
    let version = u32::try_from(valor.get("version")?.as_u64()?).ok()?;
    if version <= VERSION_LISTA {
        return serde_json::from_value(valor).ok();
    }
    let organizaciones = valor
        .get("organizaciones")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|e| Entrada::deserialize(e).ok())
        .collect();
    Some(Lista {
        version,
        organizaciones,
        no_escribir: true,
    })
}

/// Guarda la lista dañada con un nombre libre: una copia anterior también puede tener las externas. La misma lista no gasta
/// otra copia. `false` si no quedó guardada.
fn copiar_danada(ruta: &Path, bytes: &[u8]) -> bool {
    for n in 0..COPIAS_DANADO {
        let copia = match n {
            0 => con_sufijo(ruta, ".danado"),
            n => con_sufijo(ruta, &format!(".danado-{n}")),
        };
        match OpenOptions::new().write(true).create_new(true).open(&copia) {
            Ok(mut archivo) => {
                let hecho = archivo.write_all(bytes).is_ok();
                if !hecho {
                    let _ = fs::remove_file(&copia);
                }
                return hecho;
            }
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {
                if fs::read(&copia).is_ok_and(|b| b == bytes) {
                    return true;
                }
            }
            Err(_) => return false,
        }
    }
    false
}

/// La lista. Si falta, se reconstruye. Si está dañada también, tras guardar una copia en `.danado`, porque tenía las externas.
/// Si no se pudo leer o es de una versión más nueva, sale marcada para no reemplazar el archivo. Una entrada que apunta afuera
/// de donde debe se descarta, y queda una sola por id.
pub fn cargar_lista(r: &Rutas) -> Lista {
    let ruta = r.datos.join(LISTA);
    let bytes = match leer_con_reintento(&ruta) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return reconstruir(r),
        Err(_) => {
            return Lista {
                no_escribir: true,
                ..reconstruir(r)
            };
        }
    };
    if let Some(mut l) = interpretar(&bytes) {
        l.organizaciones.retain(Entrada::es_valida);
        sin_repetidos(&mut l);
        return l;
    }
    // sin la copia no se reemplaza
    Lista {
        no_escribir: !copiar_danada(&ruta, &bytes),
        ..reconstruir(r)
    }
}

pub fn lista_protegida() -> Fallo {
    Fallo::de(
        "lista_protegida",
        "organizaciones.json no se pudo leer o es de una versión más nueva: no se reemplaza",
    )
}

/// A un temporal, que se renombra: un corte no la deja a medias.
pub fn escribir_lista(r: &Rutas, l: &Lista) -> Result<(), Fallo> {
    if l.no_escribir {
        return Err(lista_protegida());
    }
    let destino = r.datos.join(LISTA);
    let temporal = con_sufijo(&destino, ".tmp");
    let escribir = || -> Result<(), Fallo> {
        let bytes = serde_json::to_vec_pretty(l).map_err(|e| e.to_string())?;
        let mut archivo = File::create(&temporal)?;
        archivo.write_all(&bytes)?;
        archivo.sync_all()?;
        drop(archivo);
        fs::rename(&temporal, &destino)?;
        Ok(())
    };
    let hecho = escribir();
    if hecho.is_err() {
        let _ = fs::remove_file(&temporal);
    }
    hecho
}

/// El `db_id` que tiene el archivo. A diferencia de `leer_meta`, separa que no lo tenga (sin tabla, sin fila, nulo o que no es
/// texto: `Ok(None)`) de que la consulta falle (`Err`).
fn id_del_archivo(conn: &Connection) -> rusqlite::Result<Option<String>> {
    let hay_meta: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta')",
        [],
        |f| f.get(0),
    )?;
    if !hay_meta {
        return Ok(None);
    }
    conn.query_row("SELECT valor FROM meta WHERE clave = 'db_id'", [], |f| {
        Ok(f.get::<_, String>(0).ok())
    })
    .optional()
    .map(Option::flatten)
}

/// `false` si no responde a tiempo. Un hilo colgado no daña nada: solo mira, y se va con el proceso.
fn con_limite(limite: Duration, f: impl FnOnce() -> bool + Send + 'static) -> bool {
    let (envio, recibo) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = envio.send(f());
    });
    recibo.recv_timeout(limite).unwrap_or(false)
}

/// Por un enlace, SQLite lo busca junto al enlace o junto al archivo, según el sistema.
fn tiene_diario(bd: &Path) -> bool {
    con_sufijo(bd, "-journal").exists()
        || fs::canonicalize(bd).is_ok_and(|c| con_sufijo(&c, "-journal").exists())
}

/// Una unidad que no responde cuelga hasta esto, y el arranque ocurre antes de crear la ventana.
fn esta_su_archivo(e: &Entrada, bd: &Path) -> bool {
    if e.externa {
        let bd = bd.to_path_buf();
        con_limite(LIMITE_UNIDAD, move || bd.is_file())
    } else {
        bd.is_file()
    }
}

/// Abre lo que dice la entrada, si sigue siendo eso. Lo que se pueda saber sin escribir se revisa antes: un archivo externo pudo
/// cambiar desde que se agregó, y uno con otro id no es de esta entrada, así que no se migra ni se le deja nada al lado.
pub fn abrir_entrada(
    r: &Rutas,
    e: &Entrada,
    espera: Duration,
    migraciones: &[&str],
) -> Result<Abierta, Fallo> {
    abrir_entrada_con(r, e, espera, migraciones, es_ruta_de_red)
}

/// `es_red` es para las pruebas: una carpeta de red no se puede armar en un temporal.
fn abrir_entrada_con(
    r: &Rutas,
    e: &Entrada,
    espera: Duration,
    migraciones: &[&str],
    es_red: fn(&Path) -> bool,
) -> Result<Abierta, Fallo> {
    let base = base_de(r, e);
    if !esta_su_archivo(e, &base.bd) {
        return Err(Fallo::de("no_encontrado", base.bd.display()));
    }
    if e.externa {
        // shortcut: si la unidad se cuelga justo después, aquí no hay límite: el arranque espera, y un cambio de organización
        // también, con `conn` tomado, así que la base abierta queda sin responder; cambiarlo si llega a pasar
        // lo mismo que al agregarla, porque pudo cambiar: una unidad que ahora es de red, un diario que cambiaría lo revisado
        if fs::canonicalize(&base.bd).is_ok_and(|c| es_red(&c)) {
            return Err(Fallo::de("contenido_invalido", "red"));
        }
        if tiene_diario(&base.bd) {
            return Err(Fallo::de("contenido_invalido", "journal"));
        }
        version_y_esquema(&base.bd, migraciones)?;
    }
    // si la consulta falla no se sabe de quién es: lo decide `abrir_base`, para no tomar un error pasajero por `otro_id`
    if let Ok(c) = solo_lectura_cerrada(&base.bd)
        && let Ok(id) = id_del_archivo(&c)
        && id.as_deref() != Some(e.id.as_str())
    {
        return Err(Fallo::de("otro_id", base.bd.display()));
    }
    let a = abrir_base(&base.bd, &base.respaldos, None, espera, migraciones)?;
    if a.id != e.id {
        return Err(Fallo::de("otro_id", base.bd.display()));
    }
    if e.externa {
        // lo que dejó una restauración interrumpida: `limpiar_carpetas` no entra en esa carpeta, y aquí ya se tiene el bloqueo
        let _ = borrar_bd(&copia_de_base(&base));
    }
    Ok(a)
}

/// Lo que pasó al agregar un archivo. Con `pide` no se cambió nada, y se repite con ese motivo en los confirmados.
#[derive(Debug, PartialEq, Serialize)]
pub struct ArchivoAgregado {
    pub id: Option<String>,
    /// `"red"`, `"otro_id"`, `"tope"` o `"journal"`.
    pub pide: Option<&'static str>,
    /// `"copia"` o `"fuera_de_portable"`.
    pub avisos: Vec<&'static str>,
}

/// `ruta`, ya canónica. No toca el disco.
pub fn es_ruta_de_red(ruta: &Path) -> bool {
    // shortcut: en Linux y macOS no detecta carpetas montadas; si hace falta, leer /proc/mounts y statfs.
    matches!(ruta.components().next(), Some(Component::Prefix(p))
        if matches!(p.kind(), Prefix::UNC(..) | Prefix::VerbatimUNC(..)))
}

fn es_db(ruta: &Path) -> bool {
    ruta.extension()
        .is_some_and(|x| x.eq_ignore_ascii_case("db"))
}

/// Dónde está lo que se eligió: la ruta absoluta, para guardar, y la canónica, para comparar. El filtro del diálogo no basta: un
/// `x.restaurando` sería su propia copia al restaurar.
fn ubicar(ruta: &Path) -> Result<(PathBuf, PathBuf), Fallo> {
    let invalido = |detalle| Err(Fallo::de("contenido_invalido", detalle));
    if !es_db(ruta) {
        return invalido("extension");
    }
    let absoluta = std::path::absolute(ruta)?;
    // la lista la guarda como texto: otra ruta no volvería a encontrar el archivo
    if absoluta.to_str().is_none() {
        return invalido("ruta");
    }
    let canonica = fs::canonicalize(&absoluta).map_err(|e| match e.kind() {
        io::ErrorKind::NotFound => Fallo::de("no_encontrado", ruta.display()),
        _ => e.into(),
    })?;
    if !es_db(&canonica) {
        return invalido("extension");
    }
    if !canonica.is_file() {
        return invalido("archivo");
    }
    Ok((absoluta, canonica))
}

/// Un corte durante el primer paso a WAL de un archivo en modo DELETE deja un `-journal` legítimo, sin el que la base queda
/// corrupta. Leer el esquema lo aplica. Sin pasar a WAL: el archivo aún no se revisó. Con el bloqueo: otra copia de la app puede
/// tenerlo abierto. Por un enlace, SQLite busca el diario junto al enlace o junto al archivo, según el sistema: se abre por
/// donde está.
fn aplicar_diario(bd: &Path, canonica: &Path) -> Result<(), Fallo> {
    let _bloqueo = bloquear(bd, ESPERA_CAMBIO)?;
    let junto_al_real = !con_sufijo(bd, "-journal").exists();
    let c = Connection::open(if junto_al_real { canonica } else { bd })?;
    c.query_row("SELECT count(*) FROM sqlite_master", [], |_| Ok(()))?;
    c.close().map_err(|(_, e)| e)?;
    if tiene_diario(bd) {
        return Err(Fallo::de("contenido_invalido", "journal"));
    }
    Ok(())
}

/// Si `e` apunta al archivo de `canonica`, por el camino que sea. `false` si su unidad no responde.
fn es_el_mismo(r: &Rutas, e: &Entrada, canonica: &Path) -> bool {
    let (ruta, canonica) = (ruta_de(r, e), canonica.to_path_buf());
    con_limite(LIMITE_UNIDAD, move || {
        fs::canonicalize(ruta).is_ok_and(|c| c == canonica)
    })
}

/// Escribe un `db_id` nuevo en un archivo ya revisado. Con el bloqueo: otra copia de la app puede tenerlo abierto.
fn escribir_id_nuevo(bd: &Path) -> Result<String, Fallo> {
    let _bloqueo = bloquear(bd, ESPERA_CAMBIO)?;
    let c = db::abrir(bd)?;
    let id = identidad_nueva(&c)?;
    c.close().map_err(|(_, e)| e)?;
    Ok(id)
}

/// Copia un archivo a una organización nueva en `organizaciones/`, sin escribir en él. Se queda con `id_libre` si es el que trae
/// la copia y su carpeta no tiene base ni restos que SQLite aplicaría; si no, recibe uno nuevo. Pasa por un temporal: un corte no
/// deja una base a medias en esa carpeta.
pub(crate) fn copiar_a_carpeta(
    r: &Rutas,
    origen: &Path,
    id_libre: Option<&str>,
    migraciones: &[&str],
) -> Result<String, Fallo> {
    let temporal = Temporal::nuevo(&r.datos, "archivo");
    solo_lectura_cerrada(origen)?.execute("VACUUM INTO ?1", [temporal.ruta().to_string_lossy()])?;
    // el origen se leyó dos veces, y otro equipo pudo cambiarlo entre medio: una interna no vuelve a pasar por `version_y_esquema`.
    // El total no rechaza: ya se preguntó por el del origen.
    revisar_organizacion(temporal.ruta(), migraciones, MAX_BYTES_VIVOS)?;
    let id_copia = id_del_archivo(&solo_lectura_cerrada(temporal.ruta())?)?;
    let ocupada = |id: &str| {
        let bd = r.datos.join(ruta_interna(id));
        ["", "-wal", "-journal"]
            .iter()
            .any(|s| con_sufijo(&bd, s).exists())
    };
    let id = match id_libre.filter(|id| id_copia.as_deref() == Some(*id) && !ocupada(id)) {
        Some(id) => id.to_owned(),
        None => {
            let c = db::abrir(temporal.ruta())?;
            let id = identidad_nueva(&c)?;
            cerrar_copia(c, temporal.ruta())?;
            id
        }
    };
    let destino = r.datos.join(ruta_interna(&id));
    let carpeta = r.datos.join(CARPETA).join(&id);
    fs::create_dir_all(&carpeta)?;
    if let Err(f) = fs::rename(temporal.ruta(), &destino) {
        // solo si quedó vacía: una conservada puede tener sus respaldos
        let _ = fs::remove_dir(&carpeta);
        return Err(f.into());
    }
    Ok(id)
}

/// Deja en la lista un archivo que eligió el usuario, validado como un `.boldo`. No lo abre: lo abre `abrir_organizacion`.
/// `buscando` es la entrada que se está reubicando.
pub fn agregar_archivo(
    r: &Rutas,
    ruta: &Path,
    buscando: Option<&str>,
    confirmados: &[&str],
    migraciones: &[&str],
) -> Result<ArchivoAgregado, Fallo> {
    agregar_con_tope(r, ruta, buscando, confirmados, migraciones, MAX_BYTES_VIVOS)
}

fn agregar_con_tope(
    r: &Rutas,
    ruta: &Path,
    buscando: Option<&str>,
    confirmados: &[&str],
    migraciones: &[&str],
    max_bytes: i64,
) -> Result<ArchivoAgregado, Fallo> {
    agregar_con_red(
        r,
        ruta,
        buscando,
        confirmados,
        migraciones,
        max_bytes,
        es_ruta_de_red,
    )
}

/// `es_red` es para las pruebas: una carpeta de red no se puede armar en un temporal.
pub(crate) fn agregar_con_red(
    r: &Rutas,
    ruta: &Path,
    buscando: Option<&str>,
    confirmados: &[&str],
    migraciones: &[&str],
    max_bytes: i64,
    es_red: fn(&Path) -> bool,
) -> Result<ArchivoAgregado, Fallo> {
    let preguntar = |motivo| {
        Ok(ArchivoAgregado {
            id: None,
            pide: Some(motivo),
            avisos: Vec::new(),
        })
    };
    let mut lista = cargar_lista(r);
    if lista.no_escribir {
        return Err(lista_protegida());
    }
    if let Some(b) = buscando
        && !lista.organizaciones.iter().any(|e| e.id == b)
    {
        return Err(Fallo::de("desconocido", b));
    }
    let (absoluta, canonica) = ubicar(ruta)?;
    let datos = fs::canonicalize(&r.datos)?;
    let relativa = canonica.strip_prefix(&datos).ok();
    let de_red = relativa.is_none() && es_red(&canonica);
    // `immutable` no ve un `-journal`, que al abrir para escribir cambiaría lo ya revisado: se aplica antes de revisar, y solo si
    // se busca una organización propia que así lo dejó un corte, porque escribe en el archivo.
    if tiene_diario(&absoluta) {
        if de_red || buscando.is_none() {
            return Err(Fallo::de("contenido_invalido", "journal"));
        }
        if !confirmados.contains(&"journal") {
            return preguntar("journal");
        }
        aplicar_diario(&absoluta, &canonica)?;
    }
    // con un `-wal`, leerlo usa memoria compartida y deja un `-shm` en la carpeta compartida
    if de_red && con_sufijo(&absoluta, "-wal").exists() {
        return Err(Fallo::de("contenido_invalido", "wal"));
    }
    if de_red && !confirmados.contains(&"red") {
        return preguntar("red");
    }
    let revisada = revisar_organizacion(&absoluta, migraciones, max_bytes)?;
    let (id_archivo, nombre) = {
        let c = solo_lectura_cerrada(&absoluta)?;
        let id = id_del_archivo(&c)?.filter(|id| es_id_valido(id));
        (id, leer_meta(&c, "org_nombre").unwrap_or_default())
    };
    let id_archivo = id_archivo.as_deref();
    if buscando.is_some_and(|b| id_archivo != Some(b)) && !confirmados.contains(&"otro_id") {
        return preguntar("otro_id");
    }
    if revisada.excede_bytes && !confirmados.contains(&"tope") {
        return preguntar("tope");
    }

    // la buscada, si este archivo no es ella, se reemplaza. Una entrada de este archivo con otro id ya no apunta a nada.
    lista.organizaciones.retain(|e| {
        id_archivo == Some(e.id.as_str())
            || (buscando != Some(e.id.as_str()) && !es_el_mismo(r, e, &canonica))
    });
    let duena = lista
        .organizaciones
        .iter()
        .find(|e| id_archivo == Some(e.id.as_str()));
    let es_la_misma = duena.is_some_and(|e| es_el_mismo(r, e, &canonica));
    // el mismo archivo, salvo si ahora es de red: esa entrada ya no abre, y se copia conservando su id
    if es_la_misma && !de_red {
        escribir_lista(r, &lista)?;
        return Ok(ArchivoAgregado {
            id: id_archivo.map(str::to_owned),
            pide: None,
            avisos: Vec::new(),
        });
    }
    // su id lo tiene otra entrada: si su archivo ya no está, este es ese archivo movido; si está, este es una copia. Una unidad
    // que no responde no cuenta como que ya no está: el archivo de esa entrada puede seguir ahí
    let es_copia = !es_la_misma
        && duena.is_some_and(|e| {
            let bd = ruta_de(r, e);
            !con_limite(LIMITE_UNIDAD, move || !bd.is_file())
        });
    let id_libre = id_archivo.filter(|_| !es_copia);
    let principal = relativa == Some(Path::new(PRINCIPAL));
    let en_su_carpeta = id_libre.is_some_and(|id| relativa == Some(Path::new(&ruta_interna(id))));
    // dentro de `datos/`, fuera de su lugar, escribirle un id lo dañaría como respaldo, y la poda lo borraría (decisión 27)
    let copiar = de_red || (relativa.is_some() && !principal && !en_su_carpeta);
    let id = if copiar {
        copiar_a_carpeta(r, &absoluta, id_libre, migraciones)?
    } else if let Some(id) = id_libre {
        id.to_owned()
    } else {
        escribir_id_nuevo(&absoluta)?
    };
    let externa = relativa.is_none() && !copiar;
    let ruta_nueva = if externa {
        absoluta.to_string_lossy().into_owned()
    } else if principal {
        PRINCIPAL.to_owned()
    } else {
        ruta_interna(&id)
    };
    // el mismo archivo, ya de red, que no pudo conservar su id: su entrada seguiría apuntando a la red
    if es_la_misma && id_archivo != Some(id.as_str()) {
        lista
            .organizaciones
            .retain(|e| id_archivo != Some(e.id.as_str()));
    }
    if let Some(e) = lista.organizaciones.iter_mut().find(|e| e.id == id) {
        e.ruta = ruta_nueva;
        e.externa = externa;
        e.nombre = nombre;
    } else {
        let color = color_libre(&lista).into();
        lista.organizaciones.push(Entrada {
            id: id.clone(),
            ruta: ruta_nueva,
            externa,
            nombre,
            color,
            abierta: String::new(),
            ejemplo: false,
        });
    }
    if let Err(f) = escribir_lista(r, &lista) {
        if copiar {
            let _ = borrar_bd(&r.datos.join(ruta_interna(&id)));
        }
        return Err(f);
    }
    let mut avisos = Vec::new();
    // no conservó el id que traía: lo tiene otra entrada, o su carpeta ya tiene base
    if id_archivo.is_some_and(|a| a != id) {
        avisos.push("copia");
    }
    // su carpeta es la del programa, que contiene `datos/`
    if externa && r.portable && !datos.parent().is_some_and(|c| canonica.starts_with(c)) {
        avisos.push("fuera_de_portable");
    }
    Ok(ArchivoAgregado {
        id: Some(id),
        pide: None,
        avisos,
    })
}

/// Deja en la lista lo que se acaba de abrir, con su nombre y su hora. Un `boldo.db` vacío no se lista: lo usa la primera
/// organización que se cree. `es_la_ultima` es `false` si se abrió porque otra no pudo: no toma su lugar, y el próximo arranque
/// la reintenta. Sin hora previa queda en blanco, la más antigua.
pub fn anotar_abierta(
    l: &mut Lista,
    e: &Entrada,
    conn: &Connection,
    es_la_ultima: bool,
) -> rusqlite::Result<()> {
    // el mismo archivo con otro id (se reemplazó por fuera): la entrada anterior ya no apunta a nada
    l.organizaciones
        .retain(|o| o.id == e.id || o.ruta != e.ruta || o.externa != e.externa);
    // si no se puede revisar se lista, que es el error seguro
    if e.es_principal() && esta_vacia(conn).unwrap_or(false) {
        l.organizaciones.retain(|o| !o.es_principal());
        return Ok(());
    }
    let nombre = leer_meta(conn, "org_nombre").unwrap_or_default();
    let abierta: String =
        conn.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |f| {
            f.get(0)
        })?;
    let misma = l
        .organizaciones
        .iter_mut()
        .find(|o| o.id == e.id && o.ruta == e.ruta);
    if let Some(o) = misma {
        o.nombre = nombre;
        if es_la_ultima {
            o.abierta = abierta;
        }
    } else {
        let color = color_libre(l).into();
        l.organizaciones.push(Entrada {
            nombre,
            color,
            abierta: if es_la_ultima { abierta } else { String::new() },
            ..e.clone()
        });
    }
    Ok(())
}

/// `boldo.db` recibe una organización nueva si ni él ni su id están en la lista y no tiene nada que heredar. `id` y `conn` son
/// los suyos.
pub fn principal_libre(l: &Lista, id: &str, conn: &Connection) -> bool {
    !l.organizaciones
        .iter()
        .any(|o| o.es_principal() || o.id == id)
        && esta_vacia(conn).unwrap_or(false)
}

/// `boldo.db` cerrado, listo para recibir una organización nueva. `None` si no lo está, también si otra copia lo tiene o no
/// abre: no impide crearla en su carpeta. Se mira antes sin tocarlo, y abierto se mira de nuevo, ya con el bloqueo.
pub fn abrir_principal_libre(r: &Rutas, l: &Lista, migraciones: &[&str]) -> Option<Abierta> {
    let parece_libre = !l.organizaciones.iter().any(Entrada::es_principal)
        && (!r.bd.exists()
            || solo_lectura_cerrada(&r.bd).is_ok_and(|c| esta_vacia(&c).unwrap_or(false)));
    if !parece_libre {
        return None;
    }
    abrir_base(&r.bd, &r.respaldos, None, ESPERA_CAMBIO, migraciones)
        .ok()
        .filter(|a| principal_libre(l, &a.id, &a.conn))
}

/// Una organización nueva en su carpeta. `llenar` recibe la entrada y el archivo ya abierto. Si algo falla se borra la carpeta: el
/// id recién se generó, así que es de esta llamada. Un corte, o un borrado que falla, la deja sin listar, sin datos del usuario.
pub fn crear_en_carpeta(
    r: &Rutas,
    l: &mut Lista,
    migraciones: &[&str],
    llenar: impl FnOnce(&mut Lista, Entrada, &mut Connection) -> Result<(), Fallo>,
) -> Result<String, Fallo> {
    let id = uuid::Uuid::now_v7().to_string();
    let e = Entrada {
        ruta: ruta_interna(&id),
        ..Entrada::principal(&id)
    };
    let base = base_de(r, &e);
    // el archivo se cierra al salir, antes de borrar: Windows no borra uno abierto
    let hecho = (|| {
        let mut a = abrir_base(
            &base.bd,
            &base.respaldos,
            Some(&id),
            ESPERA_CAMBIO,
            migraciones,
        )?;
        llenar(l, e, &mut a.conn)
    })();
    if hecho.is_err() {
        // si no se puede, el error que importa es el de arriba: lo que queda solo tiene lo que se intentaba crear
        let _ = fs::remove_dir_all(r.datos.join(CARPETA).join(&id));
    }
    hecho.map(|()| id)
}

/// Agrega lo recién creado a la lista. Sin hora, que es de cuando se abre: hasta entonces no es la que abre el arranque.
pub fn anotar_creada(l: &mut Lista, e: Entrada, conn: &Connection, ejemplo: bool) {
    let color = color_libre(l).into();
    l.organizaciones.push(Entrada {
        nombre: leer_meta(conn, "org_nombre").unwrap_or_default(),
        color,
        ejemplo,
        ..e
    });
}

/// `None` si no se pudo leer. Un archivo que no está no ocupa nada.
fn tam(ruta: &Path) -> Option<u64> {
    match fs::metadata(ruta) {
        Ok(m) => Some(m.len()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Some(0),
        Err(_) => None,
    }
}

/// El logo sale del archivo: la lista no guarda imágenes.
fn logo_de(bd: &Path) -> Option<String> {
    leer_meta(&solo_lectura_cerrada(bd).ok()?, "logo_png").filter(|l| !l.is_empty())
}

pub fn vistas(r: &Rutas, l: &Lista, activa: Option<&str>) -> Vec<OrganizacionVista> {
    l.organizaciones
        .iter()
        .map(|e| {
            let base = base_de(r, e);
            OrganizacionVista {
                id: e.id.clone(),
                nombre: e.nombre.clone(),
                color: e.color.clone(),
                abierta: e.abierta.clone(),
                externa: e.externa,
                ruta: base.bd.display().to_string(),
                existe: base.bd.is_file(),
                activa: activa == Some(e.id.as_str()),
                logo: logo_de(&base.bd),
                bytes_base: tam(&base.bd)
                    .zip(tam(&con_sufijo(&base.bd, "-wal")))
                    .map(|(bd, wal)| bd + wal),
                // lo que libera: de una interna se borra toda su carpeta, y de las demás solo los nombres propios
                bytes_respaldos: bytes_en(&base.respaldos, e.externa || e.es_principal()),
                ejemplo: e.ejemplo,
            }
        })
        .collect()
}

/// Lo que Inicio muestra de `e`, la abierta. Con los datos de `lista`, si está: un `boldo.db` vacío no se lista.
pub fn vista_de(r: &Rutas, mut lista: Lista, e: Entrada) -> OrganizacionVista {
    let id = e.id.clone();
    lista.organizaciones.retain(|o| o.id == id);
    if lista.organizaciones.is_empty() {
        lista.organizaciones.push(e);
    }
    vistas(r, &lista, Some(&id)).remove(0)
}

/// Lo que `organizaciones-eliminadas/` muestra de cada copia.
#[derive(Debug, Serialize)]
pub struct EliminadaVista {
    pub nombre: String,
    pub organizacion: String,
    pub fecha: String,
    pub bytes: u64,
}

/// Lo que impide eliminar `e`, sabido antes de tocar nada. Devuelve si su archivo está. La abierta se copia con su conexión, y su
/// archivo es el que abrió: de ella solo importa lo que diga la externa sobre borrarlo.
pub fn revisar_para_eliminar(
    r: &Rutas,
    e: &Entrada,
    abierta: bool,
    guardar_copia: bool,
    borrar_archivo: bool,
) -> Result<bool, Fallo> {
    let bd = ruta_de(r, e);
    let existe = esta_su_archivo(e, &bd);
    // una unidad retirada: sacarla de la lista no borraría lo que hay en ella, y hay que decirlo
    if !existe && ((guardar_copia && !abierta) || (e.externa && borrar_archivo)) {
        return Err(Fallo::de("no_encontrado", bd.display()));
    }
    // se borraría el enlace, y el archivo de verdad seguiría ahí
    if e.externa && borrar_archivo && fs::symlink_metadata(&bd).is_ok_and(|m| m.is_symlink()) {
        return Err(Fallo::de("contenido_invalido", "enlace"));
    }
    if abierta {
        return Ok(existe);
    }
    // `immutable` no lo ve: se copiarían páginas a medio escribir, y luego se borraría lo que las arregla
    if existe && guardar_copia && tiene_diario(&bd) {
        return Err(Fallo::de("contenido_invalido", "journal"));
    }
    let usa_el_archivo = !e.externa || borrar_archivo || guardar_copia;
    if existe && usa_el_archivo && !es_de_la_entrada(&solo_lectura_cerrada(&bd)?, e)? {
        return Err(Fallo::de("otro_id", bd.display()));
    }
    Ok(existe)
}

/// Lo ilegible en su lugar de siempre sigue siendo de ella, y eliminarla es lo que más le sirve. Lo que se lee sin id, solo si no
/// tiene nada que perder: si no, es de otro. Una externa pudo cambiar por fuera: sin ver su id, no se sabe qué es. Si no se pudo
/// mirar (no abre, un error pasajero), no se sabe nada del archivo: el error sigue, y no se borra ni se dice que es de otro.
fn es_de_la_entrada(c: &Connection, e: &Entrada) -> Result<bool, Fallo> {
    let mirar = || -> rusqlite::Result<bool> {
        Ok(match id_del_archivo(c)? {
            Some(id) => id == e.id,
            None => !e.externa && no_tiene_nada(c)?,
        })
    };
    match mirar() {
        Err(f) => match (&f, f.sqlite_error_code()) {
            // le falta una tabla o una columna de la app: tiene otra forma
            (rusqlite::Error::SqlInputError { .. }, _) | (_, Some(ErrorCode::Unknown)) => Ok(false),
            (_, Some(ErrorCode::NotADatabase | ErrorCode::DatabaseCorrupt)) => Ok(!e.externa),
            _ => Err(f.into()),
        },
        Ok(de_ella) => Ok(de_ella),
    }
}

/// Sin una tabla (un archivo de 0 bytes), o con las de la app y sin filas.
fn no_tiene_nada(c: &Connection) -> rusqlite::Result<bool> {
    let sin_tablas: bool =
        c.query_row("SELECT NOT EXISTS (SELECT 1 FROM sqlite_master)", [], |f| {
            f.get(0)
        })?;
    Ok(sin_tablas || esta_vacia(c)?)
}

/// La copia de `e` en `organizaciones-eliminadas/`. Pasa por un temporal: un corte no deja una copia a medias con nombre válido.
pub fn guardar_eliminada(r: &Rutas, e: &Entrada, c: &Connection) -> Result<String, Fallo> {
    let carpeta = r.datos.join(ELIMINADAS);
    fs::create_dir_all(&carpeta)?;
    let limpio: String = nombre_limpio(&e.nombre)
        .chars()
        .take(LARGO_EN_COPIA)
        .collect();
    let nombre = if limpio.is_empty() {
        "organizacion"
    } else {
        &limpio
    };
    volcar(c, &carpeta, &format!("{nombre}_"), &sello_local(c)?)
}

/// El archivo de una organización y lo que tiene al lado. Con `bloqueo` tomado mientras tanto: otra copia no lo abre a medio
/// borrar. Se suelta antes de quitar `.bloqueo`, que `borrar_bd` no incluye: Windows no borra uno abierto.
pub fn borrar_archivo_de(base: &Base, bloqueo: Option<File>) -> Result<(), Fallo> {
    borrar_bd(&base.bd)?;
    borrar_bd(&copia_de_base(base))?;
    drop(bloqueo);
    // si queda no tiene datos
    let _ = fs::remove_file(con_sufijo(&base.bd, ".bloqueo"));
    Ok(())
}

/// Los respaldos de `e`. Su carpeta se deriva de su id, nunca de lo que diga la ruta de la lista. Es toda suya si es interna; en
/// `boldo.db` y una externa solo se borran los respaldos, y lo demás se queda.
pub fn borrar_respaldos_de(r: &Rutas, e: &Entrada) -> Result<(), Fallo> {
    let carpeta = r.datos.join(CARPETA).join(&e.id);
    if !e.externa && !e.es_principal() {
        return match fs::remove_dir_all(&carpeta) {
            Err(f) if f.kind() != io::ErrorKind::NotFound => Err(f.into()),
            _ => Ok(()),
        };
    }
    let respaldos = base_de(r, e).respaldos;
    borrar_respaldos(&respaldos)?;
    if e.externa {
        // solo si quedaron vacías
        let _ = fs::remove_dir(&respaldos);
        let _ = fs::remove_dir(&carpeta);
    }
    Ok(())
}

/// Las copias que hay. Solo lo que tiene su forma de nombre: lo demás de la carpeta no se muestra, y por lo tanto no se borra.
fn nombres_eliminadas(r: &Rutas) -> Vec<String> {
    fs::read_dir(r.datos.join(ELIMINADAS))
        .into_iter()
        .flatten()
        .flatten()
        .filter(|f| f.file_type().is_ok_and(|t| t.is_file()))
        .filter_map(|f| f.file_name().into_string().ok())
        .filter(|n| fecha_de_eliminada(n).is_some())
        .collect()
}

/// De la más nueva a la más vieja.
pub fn listar_eliminadas(r: &Rutas) -> Vec<EliminadaVista> {
    let carpeta = r.datos.join(ELIMINADAS);
    let mut copias: Vec<_> = nombres_eliminadas(r)
        .into_iter()
        .filter_map(|nombre| {
            let ruta = carpeta.join(&nombre);
            Some(EliminadaVista {
                organizacion: solo_lectura_cerrada(&ruta)
                    .ok()
                    .and_then(|c| leer_meta(&c, "org_nombre"))
                    .unwrap_or_default(),
                fecha: fecha_de_eliminada(&nombre)?,
                bytes: fs::metadata(&ruta).ok()?.len(),
                nombre,
            })
        })
        .collect();
    copias.sort_by(|a, b| (&b.fecha, &b.nombre).cmp(&(&a.fecha, &a.nombre)));
    copias
}

/// La ruta de una copia, solo si `nombre` es uno de la lista: nunca una ruta que venga de la interfaz.
fn ruta_de_eliminada(r: &Rutas, nombre: &str) -> Result<PathBuf, Fallo> {
    if !nombres_eliminadas(r).iter().any(|n| n == nombre) {
        return Err(Fallo::de("desconocido", nombre));
    }
    Ok(r.datos.join(ELIMINADAS).join(nombre))
}

pub fn borrar_eliminada(r: &Rutas, nombre: &str) -> Result<(), Fallo> {
    Ok(borrar_bd(&ruta_de_eliminada(r, nombre)?)?)
}

/// Una organización nueva en su carpeta, con lo que tiene la copia, que se queda donde está. Conserva su id si nadie lo usa, para
/// recuperar pestañas y preferencias; `abierta` es la que puede no estar en la lista.
pub fn restaurar_eliminada(
    r: &Rutas,
    nombre: &str,
    abierta: Option<&str>,
    migraciones: &[&str],
) -> Result<String, Fallo> {
    let origen = ruta_de_eliminada(r, nombre)?;
    let mut lista = cargar_lista(r);
    if lista.no_escribir {
        return Err(lista_protegida());
    }
    let (id_libre, organizacion) = {
        let c = solo_lectura_cerrada(&origen)?;
        let id = id_del_archivo(&c)?.filter(|id| {
            es_id_valido(id)
                && abierta != Some(id.as_str())
                && !lista.organizaciones.iter().any(|e| e.id == *id)
        });
        (id, leer_meta(&c, "org_nombre").unwrap_or_default())
    };
    let id = copiar_a_carpeta(r, &origen, id_libre.as_deref(), migraciones)?;
    let color = color_libre(&lista).into();
    lista.organizaciones.push(Entrada {
        nombre: organizacion,
        color,
        ruta: ruta_interna(&id),
        ..Entrada::principal(&id)
    });
    if let Err(f) = escribir_lista(r, &lista) {
        let _ = borrar_bd(&r.datos.join(ruta_interna(&id)));
        return Err(f);
    }
    Ok(id)
}

/// `#rrggbb`: va a la interfaz tal cual.
pub fn es_color_valido(color: &str) -> bool {
    color.len() == 7
        && color.starts_with('#')
        && color.bytes().skip(1).all(|b| b.is_ascii_hexdigit())
}

/// Los temporales que dejó un corte en cada organización. Solo carpetas con nombre de id: nada sale de lo que diga un archivo.
pub fn limpiar_carpetas(r: &Rutas) {
    for carpeta in fs::read_dir(r.datos.join(CARPETA))
        .into_iter()
        .flatten()
        .flatten()
    {
        if carpeta.file_name().to_str().is_some_and(es_id_valido) {
            let dir = carpeta.path();
            limpiar_parciales(&dir, Some(&dir.join(ARCHIVO)));
            limpiar_parciales(&dir.join("respaldos"), None);
        }
    }
    // una copia de eliminada a medias, con su diario
    for f in fs::read_dir(r.datos.join(ELIMINADAS))
        .into_iter()
        .flatten()
        .flatten()
    {
        if f.file_name().to_str().is_some_and(|n| {
            ["", "-journal", "-wal", "-shm"]
                .iter()
                .any(|s| n.ends_with(&format!(".db.tmp{s}")))
        }) {
            let _ = fs::remove_file(f.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::MIGRACIONES;

    #[test]
    fn un_disco_lleno_al_migrar_no_cuenta_como_migracion_fallida() {
        assert_eq!(
            fallo_al_migrar(db::SIN_ESPACIO.into()).codigo,
            "sin_espacio"
        );
        assert_eq!(fallo_al_migrar("otra cosa".into()).codigo, "migracion");
    }

    fn id_de(conn: &Connection) -> String {
        conn.query_row("SELECT valor FROM meta WHERE clave = 'db_id'", [], |f| {
            f.get(0)
        })
        .unwrap()
    }

    fn base_en(dir: &Path) -> (PathBuf, PathBuf) {
        (dir.join("boldo.db"), dir.join("respaldos"))
    }

    #[test]
    fn id_valido_solo_en_forma_canonica() {
        let bueno = uuid::Uuid::now_v7();
        assert!(es_id_valido(&bueno.to_string()));
        for malo in [
            String::new(),
            "../x".to_string(),
            bueno.to_string().to_uppercase(),
            bueno.simple().to_string(),
            bueno.braced().to_string(),
            bueno.urn().to_string(),
        ] {
            assert!(!es_id_valido(&malo), "{malo}");
        }
    }

    #[test]
    fn identidad_reemplaza_un_db_id_invalido() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE meta (clave TEXT PRIMARY KEY NOT NULL, valor TEXT);
             INSERT INTO meta VALUES ('db_id', '../../x');",
        )
        .unwrap();
        let id = identidad(&c).unwrap();
        assert!(es_id_valido(&id), "{id}");
        assert_eq!(id_de(&c), id);
        // uno válido no cambia
        assert_eq!(identidad(&c).unwrap(), id);
        assert_eq!(id_de(&c), id);
    }

    #[test]
    fn segundo_bloqueo_da_abierta_en_otra_copia() {
        let dir = tempfile::tempdir().unwrap();
        let (bd, _) = base_en(dir.path());
        let primero = bloquear(&bd, ESPERA_CAMBIO).unwrap();
        assert!(con_sufijo(&bd, ".bloqueo").is_file());
        let e = bloquear(&bd, Duration::from_millis(100)).unwrap_err();
        assert_eq!(e.codigo, "abierta_en_otra_copia");
        assert_eq!(e.detalle, bd.display().to_string());
        drop(primero);
        bloquear(&bd, ESPERA_CAMBIO).unwrap();
    }

    #[test]
    fn bloquear_espera_a_que_se_suelte() {
        let dir = tempfile::tempdir().unwrap();
        let (bd, _) = base_en(dir.path());
        let primero = bloquear(&bd, ESPERA_CAMBIO).unwrap();
        let hilo = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(50));
            drop(primero);
        });
        bloquear(&bd, ESPERA_ARRANQUE).unwrap();
        hilo.join().unwrap();
    }

    #[test]
    fn con_espera_cambio_no_espera() {
        let dir = tempfile::tempdir().unwrap();
        let (bd, _) = base_en(dir.path());
        let _primero = bloquear(&bd, ESPERA_CAMBIO).unwrap();
        let t = Instant::now();
        let e = bloquear(&bd, ESPERA_CAMBIO).unwrap_err();
        assert_eq!(e.codigo, "abierta_en_otra_copia");
        assert_eq!(ESPERA_CAMBIO, Duration::ZERO);
        assert!(t.elapsed() < ESPERA_ARRANQUE);
    }

    #[test]
    fn bloqueo_sin_soporte_reconoce_lo_que_da_cada_sistema() {
        assert!(bloqueo_sin_soporte(&io::Error::from(
            io::ErrorKind::Unsupported
        )));
        assert!(!bloqueo_sin_soporte(&io::Error::from(
            io::ErrorKind::PermissionDenied
        )));
        // (código, si es falta de soporte); el permiso denegado y los demás siguen siendo un error
        #[cfg(windows)]
        let casos = [(1, true), (50, true), (120, true), (5, false), (33, false)];
        #[cfg(target_os = "linux")]
        let casos = [(37, true), (95, true), (13, false), (11, false)];
        #[cfg(target_os = "macos")]
        let casos = [(77, true), (45, true), (13, false), (35, false)];
        for (codigo, esperado) in casos {
            let e = io::Error::from_raw_os_error(codigo);
            assert_eq!(bloqueo_sin_soporte(&e), esperado, "{codigo}: {e}");
        }
    }

    #[test]
    fn abrir_base_no_toca_un_archivo_de_esquema_mas_nuevo() {
        let dir = tempfile::tempdir().unwrap();
        let (bd, respaldos) = base_en(dir.path());
        let c = db::abrir(&bd).unwrap();
        c.pragma_update(None, "user_version", 99).unwrap();
        c.close().unwrap();
        let e = abrir_base(&bd, &respaldos, None, ESPERA_CAMBIO, MIGRACIONES)
            .err()
            .unwrap();
        assert_eq!(e.codigo, "esquema_nuevo");
        assert_eq!(e.detalle, "99");
        assert!(!con_sufijo(&bd, "-wal").exists());
        assert!(!con_sufijo(&bd, "-shm").exists());
        let c = solo_lectura_cerrada(&bd).unwrap();
        let v: i64 = c
            .pragma_query_value(None, "user_version", |f| f.get(0))
            .unwrap();
        assert_eq!(v, 99);
    }

    #[test]
    fn abrir_base_rechaza_lo_que_no_es_sqlite() {
        let dir = tempfile::tempdir().unwrap();
        let (bd, respaldos) = base_en(dir.path());
        std::fs::write(&bd, "no soy sqlite").unwrap();
        let e = abrir_base(&bd, &respaldos, None, ESPERA_CAMBIO, MIGRACIONES)
            .err()
            .unwrap();
        assert_eq!(e.codigo, "danado");
        assert_eq!(std::fs::read(&bd).unwrap(), b"no soy sqlite");
    }

    #[test]
    fn abrir_base_con_migracion_que_falla_da_migracion() {
        let dir = tempfile::tempdir().unwrap();
        let (bd, respaldos) = base_en(dir.path());
        let e = abrir_base(&bd, &respaldos, None, ESPERA_CAMBIO, &["ESTO NO ES SQL;"])
            .err()
            .unwrap();
        assert_eq!(e.codigo, "migracion");
        assert!(e.detalle.contains("syntax error"), "{}", e.detalle);
        // al fallar suelta el bloqueo
        bloquear(&bd, ESPERA_CAMBIO).unwrap();
    }

    #[test]
    fn abrir_base_crea_la_base_con_el_id_pedido_y_la_mantiene_bloqueada() {
        let dir = tempfile::tempdir().unwrap();
        let (bd, respaldos) = base_en(dir.path());
        let id = uuid::Uuid::now_v7().to_string();
        let a = abrir_base(&bd, &respaldos, Some(&id), ESPERA_CAMBIO, MIGRACIONES)
            .ok()
            .unwrap();
        assert_eq!(a.id, id);
        assert_eq!(id_de(&a.conn), id);
        assert_eq!(a.version, MIGRACIONES.len() as i64);
        assert!(respaldos.is_dir());
        assert_eq!(
            bloquear(&bd, ESPERA_CAMBIO).unwrap_err().codigo,
            "abierta_en_otra_copia"
        );
        drop(a);
        // al volver a abrirla conserva su id
        let a = abrir_base(&bd, &respaldos, None, ESPERA_CAMBIO, MIGRACIONES)
            .ok()
            .unwrap();
        assert_eq!(a.id, id);
    }
}

#[cfg(test)]
pub(crate) mod prueba {
    use super::*;

    /// La carpeta de una portable, temporal: las pruebas nunca tocan los datos reales.
    pub fn rutas() -> (tempfile::TempDir, Rutas) {
        let exe = tempfile::tempdir().unwrap();
        fs::write(exe.path().join("portable.flag"), "").unwrap();
        let r = crate::rutas::dir_datos(exe.path(), None).unwrap();
        (exe, r)
    }

    /// Una base ya cerrada, con ese nombre. Devuelve su `db_id`.
    pub fn crear(bd: &Path, nombre: &str, migraciones: &[&str]) -> String {
        let carpeta = bd.parent().unwrap();
        fs::create_dir_all(carpeta).unwrap();
        let mut c = db::abrir(bd).unwrap();
        db::migrar_con(&mut c, migraciones, carpeta).unwrap();
        db::asegurar_meta(&c).unwrap();
        c.execute(
            "INSERT OR REPLACE INTO meta (clave, valor) VALUES ('org_nombre', ?1)",
            [nombre],
        )
        .unwrap();
        let id = identidad(&c).unwrap();
        c.close().unwrap();
        id
    }

    pub fn entrada(id: &str, ruta: &str, externa: bool, abierta: &str) -> Entrada {
        Entrada {
            id: id.into(),
            ruta: ruta.into(),
            externa,
            nombre: format!("Org {ruta}"),
            color: PALETA[0].into(),
            abierta: abierta.into(),
            ejemplo: false,
        }
    }

    /// Una organización con nombre en su carpeta de `organizaciones/`, y su entrada.
    pub fn interna(r: &Rutas, abierta: &str) -> Entrada {
        let temporal = r.datos.join("por-mover.db");
        let id = crear(&temporal, "Interna", db::MIGRACIONES);
        let ruta = format!("organizaciones/{id}/organizacion.db");
        fs::create_dir_all(r.datos.join("organizaciones").join(&id)).unwrap();
        fs::rename(&temporal, r.datos.join(&ruta)).unwrap();
        entrada(&id, &ruta, false, abierta)
    }

    pub fn escribir(r: &Rutas, organizaciones: Vec<Entrada>) {
        escribir_lista(
            r,
            &Lista {
                version: VERSION_LISTA,
                organizaciones,
                no_escribir: false,
            },
        )
        .unwrap();
    }

    /// `false`, con un aviso a la vista, si el sistema no deja crearlo (Windows sin ese permiso): la prueba no comprueba eso.
    pub fn crear_enlace(archivo: &Path, enlace: &Path) -> bool {
        #[cfg(windows)]
        let creado = std::os::windows::fs::symlink_file(archivo, enlace);
        #[cfg(unix)]
        let creado = std::os::unix::fs::symlink(archivo, enlace);
        if let Err(e) = &creado {
            // directo y sin `eprintln!`: `cargo test` esconde lo que este escribe en una prueba que pasa
            let _ = writeln!(
                io::stderr(),
                "AVISO: esta prueba no comprobó los enlaces, porque no se pudo crear uno: {e}"
            );
        }
        creado.is_ok()
    }

    pub fn sin_rastros(bd: &Path) {
        assert!(!con_sufijo(bd, "-wal").exists(), "{}", bd.display());
        assert!(!con_sufijo(bd, "-shm").exists(), "{}", bd.display());
    }
}

#[cfg(test)]
mod tests_lista {
    use super::prueba::*;
    use super::*;
    use crate::db::MIGRACIONES;
    use crate::respaldos;

    fn nuevo_id() -> String {
        uuid::Uuid::now_v7().to_string()
    }

    fn ids(l: &Lista) -> Vec<&str> {
        l.organizaciones.iter().map(|e| e.id.as_str()).collect()
    }

    #[test]
    fn base_vacia_no_se_lista() {
        let (_exe, r) = rutas();
        crear(&r.bd, "", MIGRACIONES);
        assert!(cargar_lista(&r).organizaciones.is_empty());
    }

    #[test]
    fn una_fila_eliminada_no_la_deja_vacia() {
        let (_exe, r) = rutas();
        crear(&r.bd, "", MIGRACIONES);
        let c = db::abrir(&r.bd).unwrap();
        assert!(esta_vacia(&c).unwrap());
        c.execute(
            "INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at, deleted_at)
             VALUES ('u', '00000000-0000-7000-8000-000000000001', 'U', 'x', 'x', 'x')",
            [],
        )
        .unwrap();
        assert!(!esta_vacia(&c).unwrap());
    }

    #[test]
    fn json_ausente_se_reconstruye() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", MIGRACIONES);
        let e = interna(&r, "");
        let l = cargar_lista(&r);
        assert_eq!(l.version, 1);
        let principal = l.organizaciones.iter().find(|o| o.id == id).unwrap();
        assert_eq!(principal.ruta, "boldo.db");
        assert!(!principal.externa);
        assert_eq!(principal.nombre, "La mía");
        // `abierta` sale de la fecha de modificación
        assert!(principal.abierta.ends_with('Z'), "{}", principal.abierta);
        assert!(!principal.abierta.starts_with("1970"));
        let otra = l.organizaciones.iter().find(|o| o.id == e.id).unwrap();
        assert_eq!(otra.ruta, e.ruta);
        // cada una con su color
        assert_ne!(principal.color, otra.color);
        assert!(PALETA.contains(&principal.color.as_str()));
        // leerla no escribe ni deja nada al lado
        assert!(!r.datos.join("organizaciones.json").exists());
        sin_rastros(&r.bd);
        sin_rastros(&ruta_de(&r, otra));
    }

    #[test]
    fn json_danado_se_reconstruye_sin_externas_ni_tocar_archivos() {
        let (_exe, r) = rutas();
        let id = crear(&r.bd, "La mía", MIGRACIONES);
        let e = interna(&r, "");
        let afuera = tempfile::tempdir().unwrap();
        let externa = afuera.path().join("externa.db");
        crear(&externa, "Ajena", MIGRACIONES);
        let archivos = [r.bd.clone(), ruta_de(&r, &e), externa];
        let antes = archivos.clone().map(|p| fs::read(p).unwrap());

        for danado in ["{ esto no es json", r#"{"version":1}"#, ""] {
            fs::write(r.datos.join("organizaciones.json"), danado).unwrap();
            let l = cargar_lista(&r);
            let mut hay = ids(&l);
            hay.sort();
            let mut esperado = vec![id.as_str(), e.id.as_str()];
            esperado.sort();
            assert_eq!(hay, esperado, "{danado}");
        }
        assert_eq!(antes, archivos.map(|p| fs::read(p).unwrap()));
        // lo que tenía se conserva: puede traer externas que ya no se pueden saber
        for (sufijo, danado) in [
            ("danado", "{ esto no es json"),
            ("danado-1", r#"{"version":1}"#),
            ("danado-2", ""),
        ] {
            let copia = r.datos.join(format!("organizaciones.json.{sufijo}"));
            assert_eq!(fs::read_to_string(copia).unwrap(), danado);
        }
    }

    #[test]
    fn el_mismo_danado_no_gasta_copias() {
        let (_exe, r) = rutas();
        fs::write(r.datos.join("organizaciones.json"), "{ dañado").unwrap();
        for _ in 0..3 {
            assert!(!cargar_lista(&r).no_escribir);
        }
        assert!(r.datos.join("organizaciones.json.danado").exists());
        assert!(!r.datos.join("organizaciones.json.danado-1").exists());
    }

    #[test]
    fn al_llegar_al_tope_de_copias_no_se_pisa_ni_se_reemplaza() {
        let (_exe, r) = rutas();
        let json = r.datos.join("organizaciones.json");
        let copias: Vec<_> = (0..COPIAS_DANADO)
            .map(|n| match n {
                0 => con_sufijo(&json, ".danado"),
                n => con_sufijo(&json, &format!(".danado-{n}")),
            })
            .collect();
        for (n, copia) in copias.iter().enumerate() {
            fs::write(copia, format!("copia {n}")).unwrap();
        }
        fs::write(&json, "{ dañado").unwrap();
        let l = cargar_lista(&r);
        assert!(l.no_escribir);
        assert!(escribir_lista(&r, &l).is_err());
        assert_eq!(fs::read_to_string(&json).unwrap(), "{ dañado");
        for (n, copia) in copias.iter().enumerate() {
            assert_eq!(fs::read_to_string(copia).unwrap(), format!("copia {n}"));
        }
        assert!(!con_sufijo(&json, &format!(".danado-{COPIAS_DANADO}")).exists());
    }

    #[test]
    fn cargar_conserva_una_entrada_por_id() {
        let (_exe, r) = rutas();
        let id = nuevo_id();
        let interna_de_id = format!("organizaciones/{id}/organizacion.db");
        escribir(
            &r,
            vec![
                entrada(&id, "boldo.db", false, "1"),
                entrada(&id, &interna_de_id, false, "2"),
                entrada(&nuevo_id(), "boldo.db", false, "3"),
            ],
        );
        let l = cargar_lista(&r);
        assert_eq!(l.organizaciones.len(), 2);
        assert_eq!(l.organizaciones[0].abierta, "1");
        assert_eq!(l.organizaciones[1].abierta, "3");
    }

    #[test]
    fn reconstruir_conserva_una_entrada_por_id() {
        let (_exe, r) = rutas();
        let e = interna(&r, "x");
        // `boldo.db` es una copia de esa organización: tiene su id
        fs::copy(ruta_de(&r, &e), &r.bd).unwrap();
        let l = cargar_lista(&r);
        assert_eq!(ids(&l), [e.id.as_str()]);
        assert!(l.organizaciones[0].es_principal());
    }

    #[test]
    fn carpeta_con_otro_db_id_no_se_lista() {
        let (_exe, r) = rutas();
        let otra = nuevo_id();
        crear(
            &r.datos
                .join(format!("organizaciones/{otra}/organizacion.db")),
            "Con otro id",
            MIGRACIONES,
        );
        crear(
            &r.datos.join("organizaciones/no-es-un-id/organizacion.db"),
            "Carpeta rara",
            MIGRACIONES,
        );
        assert!(cargar_lista(&r).organizaciones.is_empty());
    }

    #[test]
    fn entrada_con_ruta_con_puntos_se_descarta() {
        let (_exe, r) = rutas();
        let id = nuevo_id();
        let mut lista: Vec<Entrada> = [
            "../x.db",
            "organizaciones/../../x.db",
            "/x.db",
            "",
            "C:\\x.db",
            "\\x.db",
            "C:x.db",
        ]
        .iter()
        // en otros sistemas estas dos últimas formas son nombres de archivo corrientes
        .filter(|ruta| cfg!(windows) || !(ruta.contains('\\') || ruta.contains(':')))
        .map(|ruta| entrada(&nuevo_id(), ruta, false, "x"))
        .collect();
        // una externa debe tener ruta absoluta, y un id inválido nunca da nombre a una carpeta
        lista.push(entrada(&nuevo_id(), "relativa.db", true, "x"));
        lista.push(entrada("../../x", "x.db", false, "x"));
        lista.push(entrada(&id, "boldo.db", false, "x"));
        escribir(&r, lista);
        assert_eq!(ids(&cargar_lista(&r)), [id.as_str()]);
    }

    #[test]
    fn escribir_no_deja_temporal() {
        let (_exe, r) = rutas();
        let e = entrada(&nuevo_id(), "boldo.db", false, "x");
        escribir(&r, vec![e.clone()]);
        assert_eq!(cargar_lista(&r).organizaciones, vec![e]);
        let nombres: Vec<_> = fs::read_dir(&r.datos)
            .unwrap()
            .flatten()
            .map(|f| f.file_name().to_string_lossy().into_owned())
            .filter(|n| n.starts_with("organizaciones"))
            .collect();
        assert_eq!(nombres, ["organizaciones.json"]);
    }

    #[test]
    fn el_ejemplo_es_opcional_en_el_json() {
        let (_exe, r) = rutas();
        let id = nuevo_id();
        fs::write(
            r.datos.join("organizaciones.json"),
            format!(
                r##"{{"version":1,"organizaciones":[{{"id":"{id}","ruta":"boldo.db","externa":false,"nombre":"N","color":"#3b6fb5","abierta":"x"}}]}}"##
            ),
        )
        .unwrap();
        assert!(!cargar_lista(&r).organizaciones[0].ejemplo);
    }

    #[test]
    fn la_poda_no_ve_otra_carpeta() {
        let (_exe, r) = rutas();
        let principal = entrada(&nuevo_id(), "boldo.db", false, "x");
        let otra = interna(&r, "x");
        let (a, b) = (base_de(&r, &principal), base_de(&r, &otra));
        assert_eq!(a.bd, r.bd);
        assert_eq!(a.respaldos, r.respaldos);
        assert_eq!(
            b.respaldos,
            r.datos
                .join("organizaciones")
                .join(&otra.id)
                .join("respaldos")
        );
        fs::create_dir_all(&b.respaldos).unwrap();

        crear(&r.bd, "Origen", MIGRACIONES);
        let c = db::abrir(&r.bd).unwrap();
        let de_b = respaldos::respaldar(&c, &b.respaldos, "20200101-0000").unwrap();
        let contenido = fs::read(b.respaldos.join(&de_b)).unwrap();
        for i in 0..12 {
            respaldos::respaldar(&c, &a.respaldos, &format!("20210101-00{i:02}")).unwrap();
        }
        assert_eq!(
            respaldos::listar(&a.respaldos).unwrap().len(),
            respaldos::CONSERVAR
        );
        assert_eq!(respaldos::listar(&b.respaldos).unwrap().len(), 1);
        assert_eq!(fs::read(b.respaldos.join(&de_b)).unwrap(), contenido);
    }

    #[test]
    fn una_externa_guarda_sus_respaldos_en_la_app() {
        let (_exe, r) = rutas();
        let afuera = tempfile::tempdir().unwrap();
        let bd = afuera.path().join("externa.db");
        let e = entrada(&nuevo_id(), bd.to_str().unwrap(), true, "x");
        let base = base_de(&r, &e);
        assert_eq!(base.bd, bd);
        assert_eq!(
            base.respaldos,
            r.datos.join("organizaciones").join(&e.id).join("respaldos")
        );
    }

    #[test]
    fn color_libre_da_el_menos_usado_en_orden() {
        let con_color = |c: &str| Entrada {
            color: c.into(),
            ..entrada("x", "x", false, "x")
        };
        let mut l = Lista {
            version: 1,
            organizaciones: vec![],
            no_escribir: false,
        };
        assert_eq!(color_libre(&l), PALETA[0]);
        l.organizaciones
            .extend([PALETA[0], PALETA[2], PALETA[1]].map(con_color));
        assert_eq!(color_libre(&l), PALETA[3]);
        l.organizaciones
            .extend(PALETA[3..].iter().map(|c| con_color(c)));
        // todos con uno: vuelve al primero
        assert_eq!(color_libre(&l), PALETA[0]);
    }

    #[test]
    fn lo_que_no_se_puede_leer_no_se_ve_como_cero() {
        let d = tempfile::tempdir().unwrap();
        let ausente = d.path().join("ausente");
        assert_eq!(tam(&ausente), Some(0));
        assert_eq!(tam(Path::new("con\0nulo")), None);
        let archivo = d.path().join("archivo");
        fs::write(&archivo, "123").unwrap();
        assert_eq!(tam(&archivo), Some(3));
    }

    #[test]
    fn paleta_de_ts_coincide() {
        let ts = include_str!("../../src/features/organizaciones/paleta.ts");
        for color in PALETA {
            assert!(ts.contains(color), "{color}");
        }
        assert_eq!(ts.matches("color: \"#").count(), PALETA.len());
        assert_eq!(PALETA.len(), 8);
    }

    #[test]
    fn externa_ausente_aparece_como_no_existe() {
        let (_exe, r) = rutas();
        let afuera = tempfile::tempdir().unwrap();
        let bd = afuera.path().join("no-esta.db");
        let l = Lista {
            version: 1,
            organizaciones: vec![entrada(&nuevo_id(), bd.to_str().unwrap(), true, "x")],
            no_escribir: false,
        };
        let v = &vistas(&r, &l, None)[0];
        assert!(!v.existe && !v.activa);
        assert_eq!((v.bytes_base, v.bytes_respaldos), (Some(0), Some(0)));
        assert_eq!(v.logo, None);
        assert_eq!(v.ruta, bd.display().to_string());
        // mirarla no crea nada
        assert!(!bd.exists());
    }

    #[test]
    fn una_lista_marcada_no_se_escribe() {
        let (_exe, r) = rutas();
        let json = r.datos.join("organizaciones.json");
        fs::write(&json, "lo que había").unwrap();
        let l = Lista {
            version: 1,
            organizaciones: vec![],
            no_escribir: true,
        };
        assert_eq!(
            escribir_lista(&r, &l).unwrap_err().codigo,
            "lista_protegida"
        );
        assert_eq!(fs::read_to_string(&json).unwrap(), "lo que había");
        assert!(!con_sufijo(&json, ".tmp").exists());
        // la marca no llega al archivo
        escribir(&r, vec![]);
        assert!(!fs::read_to_string(&json).unwrap().contains("no_escribir"));
    }

    #[test]
    fn solo_lo_que_no_se_puede_reemplazar_sale_marcado() {
        let (_exe, r) = rutas();
        let json = r.datos.join("organizaciones.json");
        assert!(!cargar_lista(&r).no_escribir);
        fs::write(&json, "{ dañado").unwrap();
        assert!(!cargar_lista(&r).no_escribir);
        fs::write(&json, r#"{"version":2}"#).unwrap();
        assert!(cargar_lista(&r).no_escribir);
        fs::remove_file(&json).unwrap();
        fs::create_dir(&json).unwrap();
        assert!(cargar_lista(&r).no_escribir);
    }

    #[test]
    fn con_limite_se_rinde_si_no_responde() {
        assert!(con_limite(Duration::from_secs(5), || true));
        assert!(!con_limite(Duration::from_secs(5), || false));
        let t = Instant::now();
        assert!(!con_limite(Duration::from_millis(10), || {
            std::thread::sleep(Duration::from_secs(2));
            true
        }));
        assert!(t.elapsed() < Duration::from_secs(1));
    }

    #[test]
    fn una_ruta_interna_solo_vale_en_su_lugar() {
        let (_exe, r) = rutas();
        let (id, otro) = (nuevo_id(), nuevo_id());
        let buena = format!("organizaciones/{id}/organizacion.db");
        escribir(
            &r,
            vec![
                entrada(&nuevo_id(), "BOLDO.DB", false, "x"),
                entrada(&nuevo_id(), "Boldo.db", false, "x"),
                entrada(&nuevo_id(), "respaldos/boldo-20200101-0000.db", false, "x"),
                entrada(
                    &id,
                    &format!("organizaciones/{otro}/organizacion.db"),
                    false,
                    "x",
                ),
                entrada(
                    &id,
                    &format!("organizaciones\\{id}\\organizacion.db"),
                    false,
                    "x",
                ),
                entrada(&id, &buena, false, "x"),
            ],
        );
        let l = cargar_lista(&r);
        assert_eq!(l.organizaciones.len(), 1);
        assert_eq!(l.organizaciones[0].ruta, buena);
        assert!(!l.organizaciones[0].es_principal());
    }

    #[test]
    fn esta_vacia_cuenta_catalogos_y_logo() {
        let (_exe, r) = rutas();
        for sql in [
            "INSERT INTO cargos (id, nombre, created_at, updated_at) VALUES ('c', 'C', 'x', 'x')",
            "INSERT INTO sedes (id, nombre, created_at, updated_at) VALUES ('c', 'C', 'x', 'x')",
            "INSERT INTO tipos_contrato (id, nombre, created_at, updated_at) VALUES ('c', 'C', 'x', 'x')",
            "INSERT INTO jornadas (id, nombre, created_at, updated_at) VALUES ('c', 'C', 'x', 'x')",
            "INSERT INTO etiquetas (id, nombre, color, created_at, updated_at)
             VALUES ('c', 'C', '#000000', 'x', 'x')",
            "INSERT INTO leyendas (id, nombre, color, created_at, updated_at)
             VALUES ('c', 'C', '#000000', 'x', 'x')",
            "INSERT INTO zonas (id, nombre, color, created_at, updated_at)
             VALUES ('c', 'C', '#000000', 'x', 'x')",
            "INSERT INTO vistas (id, nombre, config, created_at, updated_at)
             VALUES ('c', 'C', '{}', 'x', 'x')",
            "INSERT INTO procesos (id, unidad_id, nombre, created_at, updated_at)
             VALUES ('c', 'u', 'C', 'x', 'x')",
            // una tabla que aún no existe, con un nombre que hay que escapar
            r#"CREATE TABLE "fu""tura" (x); INSERT INTO "fu""tura" VALUES (1);"#,
            // los tipos de unidad: uno nuevo, una semilla renombrada, una desactivada
            "INSERT INTO tipos_unidad (id, nombre, created_at, updated_at) VALUES ('c', 'C', 'x', 'x')",
            "UPDATE tipos_unidad SET nombre = 'Dirección', updated_at = 'despues'
             WHERE id = '00000000-0000-7000-8000-000000000001'",
            "UPDATE tipos_unidad SET deleted_at = 'x' WHERE id = '00000000-0000-7000-8000-000000000004'",
            "INSERT INTO meta (clave, valor) VALUES ('logo_png', 'QUJD')",
        ] {
            let _ = respaldos::borrar_bd(&r.bd);
            crear(&r.bd, "", MIGRACIONES);
            let c = db::abrir(&r.bd).unwrap();
            c.pragma_update(None, "foreign_keys", "OFF").unwrap();
            assert!(esta_vacia(&c).unwrap());
            c.execute_batch(sql).unwrap();
            assert!(!esta_vacia(&c).unwrap(), "{sql}");
            c.close().unwrap();
        }
        // una tabla futura sin filas no cuenta
        let _ = respaldos::borrar_bd(&r.bd);
        crear(&r.bd, "", MIGRACIONES);
        let c = db::abrir(&r.bd).unwrap();
        c.execute_batch("CREATE TABLE futura (x);").unwrap();
        assert!(esta_vacia(&c).unwrap());
        c.close().unwrap();

        // un logo que se quitó queda como texto vacío, y una base de esquema anterior también se puede revisar
        let _ = respaldos::borrar_bd(&r.bd);
        crear(&r.bd, "", &MIGRACIONES[..1]);
        let c = db::abrir(&r.bd).unwrap();
        c.execute(
            "INSERT INTO meta (clave, valor) VALUES ('logo_png', '')",
            [],
        )
        .unwrap();
        assert!(esta_vacia(&c).unwrap());
    }

    #[test]
    fn limpiar_carpetas_llega_a_cada_organizacion() {
        let (_exe, r) = rutas();
        let carpeta = r.datos.join("organizaciones").join(nuevo_id());
        let rara = r.datos.join("organizaciones").join("no-es-un-id");
        fs::create_dir_all(carpeta.join("respaldos")).unwrap();
        fs::create_dir_all(&rara).unwrap();
        fs::write(carpeta.join("organizacion.db"), "x").unwrap();
        let copia = carpeta.join("organizacion.restaurando");
        let parcial = carpeta.join("respaldos").join("boldo-1.db.tmp");
        let ajeno = carpeta.join("respaldos").join("notas.tmp");
        let en_la_rara = rara.join("boldo-1.db.tmp");
        for p in [&copia, &parcial, &ajeno, &en_la_rara] {
            fs::write(p, "x").unwrap();
        }
        limpiar_carpetas(&r);
        assert!(!copia.exists());
        assert!(!parcial.exists());
        assert!(ajeno.exists());
        assert!(en_la_rara.exists());
        assert!(carpeta.join("organizacion.db").exists());
    }

    #[test]
    fn limpiar_carpetas_quita_las_copias_de_eliminadas_a_medias() {
        let (_exe, r) = rutas();
        let carpeta = r.datos.join(ELIMINADAS);
        fs::create_dir_all(&carpeta).unwrap();
        let (a_medias, su_diario, copia, ajeno) = (
            carpeta.join("x_20260101-0000.db.tmp"),
            carpeta.join("x_20260101-0000.db.tmp-journal"),
            carpeta.join("x_20260101-0000.db"),
            carpeta.join("notas.tmp"),
        );
        for p in [&a_medias, &su_diario, &copia, &ajeno] {
            fs::write(p, "x").unwrap();
        }
        limpiar_carpetas(&r);
        assert!(!a_medias.exists());
        assert!(!su_diario.exists());
        assert!(copia.exists());
        assert!(ajeno.exists());
    }
}

#[cfg(test)]
mod tests_archivo {
    use super::prueba::*;
    use super::*;
    use crate::db::MIGRACIONES;
    use tempfile::TempDir;

    fn agregar(r: &Rutas, bd: &Path) -> Result<ArchivoAgregado, Fallo> {
        agregar_archivo(r, bd, None, &[], MIGRACIONES)
    }

    fn de_red(_: &Path) -> bool {
        true
    }

    /// Una lista vacía ya escrita: sin ella, `cargar_lista` reconstruye desde las carpetas.
    fn con_lista_vacia() -> (TempDir, Rutas) {
        let (exe, r) = rutas();
        escribir(&r, vec![]);
        (exe, r)
    }

    /// Una base válida, fuera de la carpeta de datos.
    fn afuera(nombre: &str) -> (TempDir, PathBuf, String) {
        let dir = tempfile::tempdir().unwrap();
        let bd = dir.path().join(nombre);
        let id = crear(&bd, "Ajena", MIGRACIONES);
        (dir, bd, id)
    }

    fn id_en(bd: &Path) -> Option<String> {
        id_del_archivo(&solo_lectura_cerrada(bd).unwrap()).unwrap()
    }

    fn alterar(bd: &Path, sql: &str) {
        let c = Connection::open(bd).unwrap();
        c.execute_batch(sql).unwrap();
        c.close().unwrap();
    }

    fn entrada_con(r: &Rutas, id: &str) -> Entrada {
        cargar_lista(r)
            .organizaciones
            .into_iter()
            .find(|e| e.id == id)
            .unwrap()
    }

    fn sin_rastros_ni_bloqueo(bd: &Path) {
        sin_rastros(bd);
        assert!(!con_sufijo(bd, ".bloqueo").exists(), "{}", bd.display());
    }

    fn temporales_en(r: &Rutas) -> Vec<String> {
        fs::read_dir(&r.datos)
            .unwrap()
            .flatten()
            .map(|f| f.file_name().to_string_lossy().into_owned())
            .filter(|n| n.contains(".tmp"))
            .collect()
    }

    #[test]
    fn ajeno_rechazado_sin_abrir_para_escribir() {
        for (cual, sql) in [
            (
                "trigger",
                "CREATE TRIGGER t AFTER INSERT ON meta BEGIN DELETE FROM meta; END;",
            ),
            ("vista", "CREATE VIEW v AS SELECT * FROM meta;"),
            ("tabla", "CREATE TABLE extra (x);"),
            ("version", "PRAGMA user_version = 0;"),
        ] {
            let (_exe, r) = con_lista_vacia();
            let (_d, bd, _) = afuera("ajena.db");
            alterar(&bd, sql);
            let antes = fs::read(&bd).unwrap();
            assert_eq!(
                agregar(&r, &bd).unwrap_err().codigo,
                "contenido_invalido",
                "{cual}"
            );
            assert_eq!(fs::read(&bd).unwrap(), antes, "{cual}");
            sin_rastros_ni_bloqueo(&bd);
            assert!(cargar_lista(&r).organizaciones.is_empty());
        }
        for bytes in [&b"no soy sqlite, aunque me llame .db"[..], b""] {
            let (_exe, r) = con_lista_vacia();
            let d = tempfile::tempdir().unwrap();
            let bd = d.path().join("ajena.db");
            fs::write(&bd, bytes).unwrap();
            assert_eq!(agregar(&r, &bd).unwrap_err().codigo, "contenido_invalido");
            assert_eq!(fs::read(&bd).unwrap(), bytes);
            sin_rastros_ni_bloqueo(&bd);
        }
    }

    #[test]
    fn archivo_con_otra_extension_se_rechaza_al_agregar_y_al_buscar() {
        for nombre in ["x.restaurando", "x.RESTAURANDO", "x.boldo", "x", "x.db.bak"] {
            let (_exe, r) = rutas();
            let (_d, bd, _) = afuera(nombre);
            let antes = fs::read(&bd).unwrap();
            let buscada = entrada(&uuid::Uuid::now_v7().to_string(), "boldo.db", false, "x");
            escribir(&r, vec![buscada.clone()]);
            for buscando in [None, Some(buscada.id.as_str())] {
                let e = agregar_archivo(&r, &bd, buscando, &["otro_id"], MIGRACIONES).unwrap_err();
                assert_eq!(e.codigo, "contenido_invalido", "{nombre}");
            }
            assert_eq!(fs::read(&bd).unwrap(), antes);
            assert_eq!(cargar_lista(&r).organizaciones, vec![buscada]);
        }
    }

    #[test]
    fn archivo_con_extension_en_mayusculas_vale() {
        let (_exe, r) = con_lista_vacia();
        let (_d, bd, id) = afuera("x.DB");
        assert_eq!(agregar(&r, &bd).unwrap().id, Some(id));
    }

    #[test]
    fn archivo_que_no_esta_o_es_una_carpeta() {
        let (_exe, r) = con_lista_vacia();
        let d = tempfile::tempdir().unwrap();
        assert_eq!(
            agregar(&r, &d.path().join("no-esta.db"))
                .unwrap_err()
                .codigo,
            "no_encontrado"
        );
        let carpeta = d.path().join("carpeta.db");
        fs::create_dir(&carpeta).unwrap();
        assert_eq!(
            agregar(&r, &carpeta).unwrap_err().codigo,
            "contenido_invalido"
        );
    }

    /// `immutable` no ve un diario pendiente, y abrir para escribir lo aplicaría sobre lo ya revisado.
    #[test]
    fn archivo_con_un_diario_al_lado_se_rechaza() {
        let (_exe, r) = con_lista_vacia();
        let (_d, bd, _) = afuera("x.db");
        fs::write(con_sufijo(&bd, "-journal"), "lo que cambiaría al abrir").unwrap();
        let antes = fs::read(&bd).unwrap();
        assert_eq!(agregar(&r, &bd).unwrap_err().codigo, "contenido_invalido");
        assert_eq!(fs::read(&bd).unwrap(), antes);
        assert!(cargar_lista(&r).organizaciones.is_empty());
    }

    /// Lo que deja un corte con una transacción a medias en modo DELETE: páginas ya escritas y el diario que las deshace.
    fn deja_un_diario_de_verdad(bd: &Path) {
        let carpeta = tempfile::tempdir().unwrap();
        let viva = carpeta.path().join("viva.db");
        fs::copy(bd, &viva).unwrap();
        let c = Connection::open(&viva).unwrap();
        c.execute_batch(
            "PRAGMA journal_mode = DELETE; PRAGMA cache_size = 2; BEGIN; CREATE TABLE a_medias (x);",
        )
        .unwrap();
        for _ in 0..30 {
            c.execute("INSERT INTO a_medias VALUES (zeroblob(100000))", [])
                .unwrap();
        }
        fs::copy(&viva, bd).unwrap();
        fs::copy(con_sufijo(&viva, "-journal"), con_sufijo(bd, "-journal")).unwrap();
        drop(c);
    }

    fn no_es_red(_: &Path) -> bool {
        false
    }

    #[test]
    fn buscar_con_un_diario_pregunta_y_con_un_si_lo_aplica() {
        let (_exe, r) = con_lista_vacia();
        let (_d, bd, id) = afuera("x.db");
        agregar(&r, &bd).unwrap();
        deja_un_diario_de_verdad(&bd);
        let diario = con_sufijo(&bd, "-journal");
        let antes = fs::read(&bd).unwrap();
        let buscar = |confirmados: &[&str]| {
            agregar_con_red(
                &r,
                &bd,
                Some(&id),
                confirmados,
                MIGRACIONES,
                i64::MAX,
                no_es_red,
            )
        };

        assert_eq!(buscar(&[]).unwrap().pide, Some("journal"));
        assert_eq!(fs::read(&bd).unwrap(), antes);
        assert!(diario.exists());

        let hecho = buscar(&["journal"]).unwrap();
        assert_eq!((hecho.id.as_deref(), hecho.pide), (Some(id.as_str()), None));
        assert!(!diario.exists());
        assert_eq!(id_en(&bd).as_deref(), Some(id.as_str()));
        let c = solo_lectura_cerrada(&bd).unwrap();
        let a_medias: i64 = c
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE name = 'a_medias'",
                [],
                |f| f.get(0),
            )
            .unwrap();
        assert_eq!(a_medias, 0, "el diario deshizo la transacción cortada");
    }

    /// Por un enlace, el diario puede estar junto al archivo de verdad, y en Windows SQLite no lo buscaría allí si abre el enlace.
    #[test]
    fn buscar_por_un_enlace_aplica_el_diario_del_archivo_real() {
        let (_exe, r) = con_lista_vacia();
        let (d, real, id) = afuera("x.db");
        agregar(&r, &real).unwrap();
        deja_un_diario_de_verdad(&real);
        let enlace = d.path().join("enlace.db");
        if !crear_enlace(&real, &enlace) {
            return;
        }
        let buscar = |confirmados: &[&str]| {
            agregar_con_red(
                &r,
                &enlace,
                Some(&id),
                confirmados,
                MIGRACIONES,
                i64::MAX,
                no_es_red,
            )
        };
        assert_eq!(buscar(&[]).unwrap().pide, Some("journal"));
        buscar(&["journal"]).unwrap();
        assert!(!con_sufijo(&real, "-journal").exists());
        let c = solo_lectura_cerrada(&real).unwrap();
        let a_medias: i64 = c
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE name = 'a_medias'",
                [],
                |f| f.get(0),
            )
            .unwrap();
        assert_eq!(a_medias, 0);
    }

    #[test]
    fn buscar_en_red_con_un_diario_no_lo_toca() {
        for confirmados in [&["journal"][..], &["journal", "red"]] {
            let (_exe, r) = con_lista_vacia();
            let (_d, bd, id) = afuera("x.db");
            agregar(&r, &bd).unwrap();
            deja_un_diario_de_verdad(&bd);
            let antes = fs::read(&bd).unwrap();
            let f = agregar_con_red(
                &r,
                &bd,
                Some(&id),
                confirmados,
                MIGRACIONES,
                i64::MAX,
                de_red,
            )
            .unwrap_err();
            assert_eq!(
                (f.codigo, f.detalle.as_str()),
                ("contenido_invalido", "journal")
            );
            assert_eq!(fs::read(&bd).unwrap(), antes);
            assert!(con_sufijo(&bd, "-journal").exists());
        }
    }

    #[test]
    fn externa_sobre_el_tope_pregunta_antes_de_abrir() {
        let (_exe, r) = con_lista_vacia();
        let (_d, bd, id) = afuera("pesada.db");
        let antes = fs::read(&bd).unwrap();
        let hecho = agregar_con_tope(&r, &bd, None, &[], MIGRACIONES, 1).unwrap();
        assert_eq!(hecho.pide, Some("tope"));
        assert_eq!(hecho.id, None);
        assert!(hecho.avisos.is_empty());
        assert_eq!(fs::read(&bd).unwrap(), antes);
        sin_rastros_ni_bloqueo(&bd);
        // rechazado: nadie vuelve a llamar, y no queda nada
        assert!(cargar_lista(&r).organizaciones.is_empty());

        let hecho = agregar_con_tope(&r, &bd, None, &["tope"], MIGRACIONES, 1).unwrap();
        assert_eq!((hecho.id.as_deref(), hecho.pide), (Some(id.as_str()), None));
        assert_eq!(entrada_con(&r, &id).ruta, bd.display().to_string());
    }

    #[test]
    fn archivo_con_un_campo_sobre_su_tope_no_pregunta() {
        let (_exe, r) = con_lista_vacia();
        let (_d, bd, _) = afuera("x.db");
        let c = db::abrir(&bd).unwrap();
        c.execute(
            "INSERT INTO trabajadores (id, nombre, created_at, updated_at) VALUES ('a', ?1, 'x', 'x')",
            ["x".repeat(2048)],
        )
        .unwrap();
        c.close().unwrap();
        for confirmados in [&[][..], &["tope"]] {
            let e = agregar_con_tope(&r, &bd, None, confirmados, MIGRACIONES, 1).unwrap_err();
            assert_eq!(e.codigo, "muy_pesado");
        }
    }

    #[test]
    fn cada_motivo_se_pregunta_por_separado() {
        let (_exe, r) = rutas();
        let buscada = entrada(&uuid::Uuid::now_v7().to_string(), "boldo.db", false, "x");
        escribir(&r, vec![buscada.clone()]);
        let (_d, bd, id) = afuera("en-red.db");
        let pide = |confirmados: &[&str]| {
            agregar_con_red(
                &r,
                &bd,
                Some(&buscada.id),
                confirmados,
                MIGRACIONES,
                1,
                de_red,
            )
            .unwrap()
        };
        assert_eq!(pide(&[]).pide, Some("red"));
        assert_eq!(pide(&["red"]).pide, Some("otro_id"));
        assert_eq!(pide(&["red", "otro_id"]).pide, Some("tope"));
        // una respuesta vale solo para lo que se preguntó
        assert_eq!(pide(&["otro_id", "tope"]).pide, Some("red"));
        assert_eq!(pide(&["red", "tope"]).pide, Some("otro_id"));
        // nada de eso tocó la lista
        assert_eq!(cargar_lista(&r).organizaciones, vec![buscada.clone()]);

        let hecho = pide(&["red", "otro_id", "tope"]);
        assert_eq!((hecho.id.as_deref(), hecho.pide), (Some(id.as_str()), None));
        assert_eq!(ids_de(&r), [id]);
    }

    fn ids_de(r: &Rutas) -> Vec<String> {
        cargar_lista(r)
            .organizaciones
            .into_iter()
            .map(|e| e.id)
            .collect()
    }

    #[test]
    fn esquema_mas_nuevo_rechazado() {
        let (_exe, r) = con_lista_vacia();
        let (_d, bd, _) = afuera("x.db");
        alterar(&bd, "PRAGMA user_version = 99;");
        let antes = fs::read(&bd).unwrap();
        assert_eq!(agregar(&r, &bd).unwrap_err().codigo, "esquema_nuevo");
        assert_eq!(fs::read(&bd).unwrap(), antes);
        sin_rastros_ni_bloqueo(&bd);
    }

    #[test]
    fn un_esquema_anterior_se_agrega_y_migra_al_abrir() {
        let (_exe, r) = con_lista_vacia();
        let d = tempfile::tempdir().unwrap();
        let bd = d.path().join("vieja.db");
        let id = crear(&bd, "Vieja", &MIGRACIONES[..1]);
        assert_eq!(agregar(&r, &bd).unwrap().id.as_ref(), Some(&id));
        let a = abrir_entrada(&r, &entrada_con(&r, &id), ESPERA_CAMBIO, MIGRACIONES)
            .ok()
            .unwrap();
        assert_eq!(a.version, MIGRACIONES.len() as i64);
    }

    #[test]
    fn externa_guarda_ruta_absoluta_y_sus_respaldos_van_a_la_app() {
        let (_exe, r) = con_lista_vacia();
        let (d, bd, id) = afuera("externa.db");
        let hecho = agregar(&r, &bd).unwrap();
        assert_eq!(hecho.id.as_deref(), Some(id.as_str()));
        let e = entrada_con(&r, &id);
        assert!(e.externa);
        assert!(Path::new(&e.ruta).is_absolute());
        assert_eq!(e.nombre, "Ajena");
        assert_eq!(e.abierta, "");
        assert!(!e.ejemplo);
        assert_eq!(e.color, PALETA[0]);
        assert_eq!(
            base_de(&r, &e).respaldos,
            r.datos.join("organizaciones").join(&id).join("respaldos")
        );
        // agregar no abre: nada al lado del archivo ni carpeta de respaldos
        sin_rastros_ni_bloqueo(&bd);
        assert!(!r.datos.join("organizaciones").join(&id).exists());
        assert!(!d.path().join("respaldos").exists());
        // la siguiente recibe otro color
        let (_d2, otra, id2) = afuera("otra.db");
        agregar(&r, &otra).unwrap();
        assert_eq!(entrada_con(&r, &id2).color, PALETA[1]);
        // y lo agregado abre, con su id
        let a = abrir_entrada(&r, &e, ESPERA_CAMBIO, MIGRACIONES)
            .ok()
            .unwrap();
        assert_eq!(a.id, id);
    }

    #[test]
    fn mismo_archivo_por_otro_camino_no_es_copia() {
        let (_exe, r) = con_lista_vacia();
        let (d, bd, id) = afuera("a.db");
        agregar(&r, &bd).unwrap();
        let antes = fs::read(&bd).unwrap();
        let carpeta = d.path().file_name().unwrap();
        let mut caminos = vec![d.path().join("..").join(carpeta).join("a.db")];
        if cfg!(windows) {
            caminos.push(PathBuf::from(bd.to_str().unwrap().to_uppercase()));
        }
        for camino in caminos {
            let hecho = agregar(&r, &camino).unwrap();
            assert_eq!(
                hecho.id.as_deref(),
                Some(id.as_str()),
                "{}",
                camino.display()
            );
            assert!(hecho.avisos.is_empty(), "{}", camino.display());
            assert_eq!(ids_de(&r), std::slice::from_ref(&id));
            assert_eq!(fs::read(&bd).unwrap(), antes);
            sin_rastros_ni_bloqueo(&bd);
        }
    }

    #[test]
    fn copia_recibe_un_db_id_nuevo_escrito_en_el_archivo() {
        let (_exe, r) = con_lista_vacia();
        let (d, original, id) = afuera("a.db");
        agregar(&r, &original).unwrap();
        let copia = d.path().join("b.db");
        fs::copy(&original, &copia).unwrap();
        let antes = fs::read(&original).unwrap();

        let hecho = agregar(&r, &copia).unwrap();
        assert!(hecho.avisos.contains(&"copia"));
        let nuevo = hecho.id.unwrap();
        assert_ne!(nuevo, id);
        assert!(es_id_valido(&nuevo));
        assert_eq!(id_en(&copia).as_deref(), Some(nuevo.as_str()));
        assert_eq!(fs::read(&original).unwrap(), antes);
        assert_eq!(ids_de(&r), [id, nuevo]);
        sin_rastros(&copia);
    }

    #[test]
    fn copia_abierta_en_otra_copia_de_la_app_no_se_toca() {
        let (_exe, r) = con_lista_vacia();
        let (d, original, id) = afuera("a.db");
        agregar(&r, &original).unwrap();
        let copia = d.path().join("b.db");
        fs::copy(&original, &copia).unwrap();
        let _bloqueo = bloquear(&copia, ESPERA_CAMBIO).unwrap();
        assert_eq!(
            agregar(&r, &copia).unwrap_err().codigo,
            "abierta_en_otra_copia"
        );
        assert_eq!(id_en(&copia).as_deref(), Some(id.as_str()));
        assert_eq!(ids_de(&r), [id]);
    }

    #[test]
    fn archivo_movido_no_es_copia() {
        let (_exe, r) = con_lista_vacia();
        let (d, bd, id) = afuera("a.db");
        agregar(&r, &bd).unwrap();
        let antes = entrada_con(&r, &id);
        let nuevo = d.path().join("movido.db");
        fs::rename(&bd, &nuevo).unwrap();
        let hecho = agregar(&r, &nuevo).unwrap();
        assert_eq!(hecho.id.as_deref(), Some(id.as_str()));
        assert!(!hecho.avisos.contains(&"copia"));
        assert_eq!(id_en(&nuevo).as_deref(), Some(id.as_str()));
        assert_eq!(
            cargar_lista(&r).organizaciones,
            vec![Entrada {
                ruta: nuevo.display().to_string(),
                ..antes
            }]
        );
    }

    #[test]
    fn db_id_invalido_recibe_uno_nuevo() {
        for sql in [
            "UPDATE meta SET valor = '../../x' WHERE clave = 'db_id';",
            "UPDATE meta SET valor = NULL WHERE clave = 'db_id';",
            "DELETE FROM meta WHERE clave = 'db_id';",
        ] {
            let (_exe, r) = con_lista_vacia();
            let (_d, bd, viejo) = afuera("x.db");
            alterar(&bd, sql);
            let hecho = agregar(&r, &bd).unwrap();
            let id = hecho.id.unwrap();
            assert!(es_id_valido(&id), "{sql}");
            assert_ne!(id, viejo);
            assert!(!hecho.avisos.contains(&"copia"), "{sql}");
            assert_eq!(id_en(&bd).as_deref(), Some(id.as_str()));
            assert!(entrada_con(&r, &id).es_valida());
            sin_rastros(&bd);
        }
    }

    #[test]
    fn buscar_con_otro_id_pide_confirmar() {
        let (_exe, r) = rutas();
        let d = tempfile::tempdir().unwrap();
        let perdida = d.path().join("perdida.db");
        let buscada = entrada(
            &uuid::Uuid::now_v7().to_string(),
            perdida.to_str().unwrap(),
            true,
            "2020",
        );
        let otra = interna(&r, "2021");
        escribir(&r, vec![buscada.clone(), otra.clone()]);
        let (_d, bd, id) = afuera("otra.db");

        let hecho = agregar_archivo(&r, &bd, Some(&buscada.id), &[], MIGRACIONES).unwrap();
        assert_eq!((hecho.id.as_deref(), hecho.pide), (None, Some("otro_id")));
        assert_eq!(
            cargar_lista(&r).organizaciones,
            vec![buscada.clone(), otra.clone()]
        );
        sin_rastros_ni_bloqueo(&bd);

        let hecho = agregar_archivo(&r, &bd, Some(&buscada.id), &["otro_id"], MIGRACIONES).unwrap();
        assert_eq!(hecho.id.as_deref(), Some(id.as_str()));
        assert_eq!(ids_de(&r), [otra.id, id]);
    }

    #[test]
    fn buscar_el_mismo_id_no_pregunta_y_conserva_la_entrada() {
        let (_exe, r) = con_lista_vacia();
        let (d, bd, id) = afuera("a.db");
        agregar(&r, &bd).unwrap();
        let nuevo = d.path().join("encontrado.db");
        fs::rename(&bd, &nuevo).unwrap();
        let hecho = agregar_archivo(&r, &nuevo, Some(&id), &[], MIGRACIONES).unwrap();
        assert_eq!((hecho.id.as_deref(), hecho.pide), (Some(id.as_str()), None));
        assert_eq!(entrada_con(&r, &id).ruta, nuevo.display().to_string());
        assert_eq!(ids_de(&r), [id]);
    }

    #[test]
    fn buscar_una_copia_de_otra_entrada_le_da_otro_id() {
        let (_exe, r) = con_lista_vacia();
        let (d, original, id) = afuera("a.db");
        agregar(&r, &original).unwrap();
        let (_d2, buscada, id_buscada) = afuera("b.db");
        agregar(&r, &buscada).unwrap();
        fs::remove_file(&buscada).unwrap();
        let copia = d.path().join("copia.db");
        fs::copy(&original, &copia).unwrap();

        let hecho =
            agregar_archivo(&r, &copia, Some(&id_buscada), &["otro_id"], MIGRACIONES).unwrap();
        assert!(hecho.avisos.contains(&"copia"));
        let nuevo = hecho.id.unwrap();
        assert_ne!(nuevo, id);
        assert_eq!(id_en(&copia).as_deref(), Some(nuevo.as_str()));
        assert_eq!(ids_de(&r), [id, nuevo]);
    }

    #[test]
    fn buscar_una_entrada_que_no_esta_es_desconocido() {
        let (_exe, r) = con_lista_vacia();
        let (_d, bd, _) = afuera("a.db");
        let e = agregar_archivo(&r, &bd, Some("..\\..\\x"), &[], MIGRACIONES).unwrap_err();
        assert_eq!(e.codigo, "desconocido");
    }

    #[test]
    fn dentro_de_datos_no_es_externa() {
        let (_exe, r) = con_lista_vacia();
        let id = crear(&r.bd, "La mía", MIGRACIONES);
        let e = interna(&r, "");
        let (bd_principal, bd_interna) = (r.bd.clone(), ruta_de(&r, &e));
        let antes = (
            fs::read(&bd_principal).unwrap(),
            fs::read(&bd_interna).unwrap(),
        );

        assert_eq!(agregar(&r, &bd_principal).unwrap().id.as_ref(), Some(&id));
        assert_eq!(agregar(&r, &bd_interna).unwrap().id.as_ref(), Some(&e.id));

        let principal = entrada_con(&r, &id);
        assert!(principal.es_principal());
        let otra = entrada_con(&r, &e.id);
        assert!(!otra.externa);
        // quedó fuera de la lista y vuelve con su id: su carpeta sigue alineada, y nada se escribió en ellas
        assert_eq!(otra.ruta, ruta_interna(&e.id));
        assert_eq!(
            antes,
            (
                fs::read(&bd_principal).unwrap(),
                fs::read(&bd_interna).unwrap()
            )
        );
        sin_rastros_ni_bloqueo(&bd_principal);
        sin_rastros_ni_bloqueo(&bd_interna);
    }

    #[test]
    fn boldo_db_con_el_id_de_otra_entrada_recibe_uno_nuevo() {
        let (_exe, r) = con_lista_vacia();
        let e = interna(&r, "x");
        escribir(&r, vec![e.clone()]);
        fs::copy(ruta_de(&r, &e), &r.bd).unwrap();
        let hecho = agregar(&r, &r.bd).unwrap();
        assert_eq!(hecho.avisos, ["copia"]);
        let id = hecho.id.unwrap();
        assert_ne!(id, e.id);
        assert!(entrada_con(&r, &id).es_principal());
        assert_eq!(id_en(&r.bd), Some(id));
    }

    #[test]
    fn base_en_respaldos_se_copia_a_su_carpeta_nueva() {
        for lugar in ["respaldos", "organizaciones-eliminadas", "otra-carpeta"] {
            let (_exe, r) = con_lista_vacia();
            let carpeta = r.datos.join(lugar);
            fs::create_dir_all(&carpeta).unwrap();
            let bd = carpeta.join("boldo-20260101-0900.db");
            let original = crear(&bd, "De respaldo", MIGRACIONES);
            let antes = fs::read(&bd).unwrap();

            let hecho = agregar(&r, &bd).unwrap();
            assert_eq!(hecho.pide, None, "{lugar}");
            assert!(hecho.avisos.is_empty(), "{lugar}");
            let id = hecho.id.unwrap();
            // el id estaba libre: se conserva, y sus pestañas siguen valiendo
            assert_eq!(id, original);
            let e = entrada_con(&r, &id);
            assert!(!e.externa);
            assert_eq!(e.ruta, ruta_interna(&id));
            assert_eq!(e.nombre, "De respaldo");
            assert_eq!(id_en(&ruta_de(&r, &e)).as_deref(), Some(id.as_str()));

            assert_eq!(fs::read(&bd).unwrap(), antes, "{lugar}");
            sin_rastros_ni_bloqueo(&bd);
            assert!(temporales_en(&r).is_empty(), "{:?}", temporales_en(&r));
            let a = abrir_entrada(&r, &e, ESPERA_CAMBIO, MIGRACIONES)
                .ok()
                .unwrap();
            assert_eq!(a.id, id);
        }
    }

    #[test]
    fn respaldo_de_una_organizacion_de_la_lista_es_una_copia() {
        let (_exe, r) = con_lista_vacia();
        let e = interna(&r, "x");
        escribir(&r, vec![e.clone()]);
        let bd = r.respaldos.join("boldo-20260101-0900.db");
        fs::copy(ruta_de(&r, &e), &bd).unwrap();
        let antes = fs::read(&bd).unwrap();

        let hecho = agregar(&r, &bd).unwrap();
        assert_eq!(hecho.avisos, ["copia"]);
        let id = hecho.id.unwrap();
        assert_ne!(id, e.id);
        assert_eq!(entrada_con(&r, &id).ruta, ruta_interna(&id));
        assert_eq!(id_en(&r.datos.join(ruta_interna(&id))), Some(id.clone()));
        // ni el respaldo ni la organización cambian
        assert_eq!(fs::read(&bd).unwrap(), antes);
        assert_eq!(id_en(&ruta_de(&r, &e)), Some(e.id));
    }

    #[test]
    fn carpeta_con_otro_id_no_se_toca_y_se_copia() {
        let (_exe, r) = con_lista_vacia();
        let e = interna(&r, "x");
        let ajeno = uuid::Uuid::now_v7().to_string();
        let bd = ruta_de(&r, &e);
        alterar(
            &bd,
            &format!("UPDATE meta SET valor = '{ajeno}' WHERE clave = 'db_id';"),
        );
        let antes = fs::read(&bd).unwrap();
        let hecho = agregar(&r, &bd).unwrap();
        assert_eq!(hecho.id.as_deref(), Some(ajeno.as_str()));
        assert_eq!(entrada_con(&r, &ajeno).ruta, ruta_interna(&ajeno));
        assert_eq!(fs::read(&bd).unwrap(), antes);
    }

    #[test]
    fn carpeta_cuyo_id_usa_otra_entrada_no_cambia_de_id() {
        let (_exe, r) = con_lista_vacia();
        let e = interna(&r, "x");
        let bd = ruta_de(&r, &e);
        let (_d, otra, _) = afuera("a.db");
        fs::copy(&bd, &otra).unwrap();
        agregar(&r, &otra).unwrap();
        let antes = fs::read(&bd).unwrap();

        let hecho = agregar(&r, &bd).unwrap();
        assert_eq!(hecho.avisos, ["copia"]);
        let nuevo = hecho.id.unwrap();
        assert_ne!(nuevo, e.id);
        assert_eq!(entrada_con(&r, &nuevo).ruta, ruta_interna(&nuevo));
        // su archivo sigue con el id que dice su carpeta
        assert_eq!(fs::read(&bd).unwrap(), antes);
        assert_eq!(id_en(&bd), Some(e.id));
    }

    #[test]
    fn copia_con_su_carpeta_ocupada_recibe_otro_id() {
        let (_exe, r) = con_lista_vacia();
        let e = interna(&r, "x");
        let bd = r.respaldos.join("boldo-20260101-0900.db");
        fs::copy(ruta_de(&r, &e), &bd).unwrap();
        let antes = fs::read(ruta_de(&r, &e)).unwrap();
        let hecho = agregar(&r, &bd).unwrap();
        assert_eq!(hecho.avisos, ["copia"]);
        let id = hecho.id.unwrap();
        assert_ne!(id, e.id);
        assert_eq!(fs::read(ruta_de(&r, &e)).unwrap(), antes);
    }

    #[test]
    fn copia_que_trae_un_trigger_no_llega_a_su_carpeta() {
        let (_exe, r) = con_lista_vacia();
        let (_d, bd, id) = afuera("a.db");
        alterar(
            &bd,
            "CREATE TRIGGER t AFTER INSERT ON meta BEGIN DELETE FROM meta; END;",
        );
        let f = copiar_a_carpeta(&r, &bd, Some(&id), MIGRACIONES).unwrap_err();
        assert_eq!(f.codigo, "contenido_invalido");
        assert!(!r.datos.join(ruta_interna(&id)).exists());
        assert!(temporales_en(&r).is_empty(), "{:?}", temporales_en(&r));
    }

    /// El origen pudo cambiar entre la revisión y la copia: la carpeta se nombra con lo que quedó en la copia.
    #[test]
    fn copia_con_otro_id_que_el_revisado_no_desalinea_su_carpeta() {
        let (_exe, r) = con_lista_vacia();
        let (_d, bd, id) = afuera("a.db");
        let revisado = uuid::Uuid::now_v7().to_string();
        let nuevo = copiar_a_carpeta(&r, &bd, Some(&revisado), MIGRACIONES).unwrap();
        assert_ne!(nuevo, revisado);
        assert_ne!(nuevo, id);
        assert_eq!(id_en(&r.datos.join(ruta_interna(&nuevo))), Some(nuevo));
        assert!(!r.datos.join(ruta_interna(&revisado)).exists());
    }

    #[test]
    fn copia_con_restos_en_su_carpeta_recibe_otro_id() {
        for sufijo in ["-wal", "-journal"] {
            let (_exe, r) = con_lista_vacia();
            let (_d, bd, id) = afuera("a.db");
            let huerfano = con_sufijo(&r.datos.join(ruta_interna(&id)), sufijo);
            fs::create_dir_all(huerfano.parent().unwrap()).unwrap();
            fs::write(&huerfano, "de antes").unwrap();
            let nuevo = copiar_a_carpeta(&r, &bd, Some(&id), MIGRACIONES).unwrap();
            assert_ne!(nuevo, id, "{sufijo}");
            assert_eq!(fs::read_to_string(&huerfano).unwrap(), "de antes");
            assert!(!r.datos.join(ruta_interna(&id)).exists());
        }
    }

    #[test]
    fn archivo_de_red_con_un_wal_se_rechaza_sin_dejar_nada_al_lado() {
        for confirmados in [&[][..], &["red"]] {
            let (_exe, r) = con_lista_vacia();
            let (_d, bd, _) = afuera("en-red.db");
            let wal = con_sufijo(&bd, "-wal");
            fs::write(&wal, "de otro equipo").unwrap();
            let antes = fs::read(&bd).unwrap();
            let f = agregar_con_red(&r, &bd, None, confirmados, MIGRACIONES, i64::MAX, de_red)
                .unwrap_err();
            assert_eq!(
                (f.codigo, f.detalle.as_str()),
                ("contenido_invalido", "wal")
            );
            assert!(!con_sufijo(&bd, "-shm").exists());
            assert_eq!(fs::read_to_string(&wal).unwrap(), "de otro equipo");
            assert_eq!(fs::read(&bd).unwrap(), antes);
            assert!(cargar_lista(&r).organizaciones.is_empty());
        }
    }

    #[test]
    fn externa_con_un_diario_al_lado_no_se_abre() {
        let (_exe, r) = con_lista_vacia();
        let (_d, bd, id) = afuera("a.db");
        agregar(&r, &bd).unwrap();
        fs::write(con_sufijo(&bd, "-journal"), "lo que cambiaría al abrir").unwrap();
        let antes = fs::read(&bd).unwrap();
        let f = abrir_entrada(&r, &entrada_con(&r, &id), ESPERA_CAMBIO, MIGRACIONES)
            .err()
            .unwrap();
        assert_eq!(
            (f.codigo, f.detalle.as_str()),
            ("contenido_invalido", "journal")
        );
        assert_eq!(fs::read(&bd).unwrap(), antes);
        sin_rastros_ni_bloqueo(&bd);
    }

    #[test]
    fn externa_que_paso_a_la_red_no_se_abre_y_se_copia_al_buscarla() {
        let (_exe, r) = con_lista_vacia();
        let (_d, bd, id) = afuera("a.db");
        agregar(&r, &bd).unwrap();
        let e = entrada_con(&r, &id);
        let antes = fs::read(&bd).unwrap();
        let f = abrir_entrada_con(&r, &e, ESPERA_CAMBIO, MIGRACIONES, de_red)
            .err()
            .unwrap();
        assert_eq!(
            (f.codigo, f.detalle.as_str()),
            ("contenido_invalido", "red")
        );
        assert_eq!(fs::read(&bd).unwrap(), antes);
        sin_rastros_ni_bloqueo(&bd);
        assert!(!base_de(&r, &e).respaldos.exists());

        let hecho =
            agregar_con_red(&r, &bd, Some(&id), &["red"], MIGRACIONES, i64::MAX, de_red).unwrap();
        assert_eq!(hecho.id.as_deref(), Some(id.as_str()));
        assert!(hecho.avisos.is_empty(), "{:?}", hecho.avisos);
        let e = entrada_con(&r, &id);
        assert!(!e.externa);
        assert_eq!(e.ruta, ruta_interna(&id));
        assert_eq!(id_en(&r.datos.join(ruta_interna(&id))), Some(id.clone()));
        let a = abrir_entrada(&r, &e, ESPERA_CAMBIO, MIGRACIONES).unwrap();
        assert_eq!(a.id, id);
        assert_eq!(fs::read(&bd).unwrap(), antes);
    }

    /// Sin poder conservar su id, la copia no se queda con la entrada: esa seguiría apuntando a la red.
    #[test]
    fn externa_que_paso_a_la_red_con_otro_id_no_deja_la_entrada_vieja() {
        for buscar in [false, true] {
            let (_exe, r) = con_lista_vacia();
            let (_d, bd, id) = afuera("a.db");
            agregar(&r, &bd).unwrap();
            let huerfano = con_sufijo(&r.datos.join(ruta_interna(&id)), "-wal");
            fs::create_dir_all(huerfano.parent().unwrap()).unwrap();
            fs::write(&huerfano, "de antes").unwrap();

            let buscando = buscar.then_some(id.as_str());
            let hecho = agregar_con_red(&r, &bd, buscando, &["red"], MIGRACIONES, i64::MAX, de_red)
                .unwrap();

            let nuevo = hecho.id.unwrap();
            assert_ne!(nuevo, id);
            assert_eq!(hecho.avisos, ["copia"]);
            let l = cargar_lista(&r).organizaciones;
            assert_eq!(l.len(), 1, "{l:?}");
            assert_eq!(l[0].id, nuevo);
            assert!(!l[0].externa);
        }
    }

    /// `es_red` ya mira la canónica: con un enlace, el diario está junto a ella y no junto a la ruta guardada.
    #[test]
    fn externa_por_un_enlace_con_un_diario_junto_al_archivo_no_se_abre() {
        let (_exe, r) = con_lista_vacia();
        let (_d, bd, id) = afuera("a.db");
        let enlaces = tempfile::tempdir().unwrap();
        let enlace = enlaces.path().join("enlace.db");
        if !crear_enlace(&bd, &enlace) {
            return;
        }
        escribir(
            &r,
            vec![entrada(&id, enlace.to_str().unwrap(), true, "2020")],
        );
        fs::write(con_sufijo(&bd, "-journal"), "lo que cambiaría al abrir").unwrap();
        let f = abrir_entrada(&r, &entrada_con(&r, &id), ESPERA_CAMBIO, MIGRACIONES)
            .err()
            .unwrap();
        assert_eq!(
            (f.codigo, f.detalle.as_str()),
            ("contenido_invalido", "journal")
        );
    }

    #[test]
    fn ruta_que_no_es_utf8_se_rechaza() {
        #[cfg(windows)]
        let ruta: PathBuf = {
            use std::os::windows::ffi::OsStringExt;
            let mut nombre = vec![u16::from(b'x'), 0xD800];
            nombre.extend(".db".encode_utf16());
            std::ffi::OsString::from_wide(&nombre).into()
        };
        #[cfg(unix)]
        let ruta: PathBuf = {
            use std::os::unix::ffi::OsStrExt;
            std::ffi::OsStr::from_bytes(b"x\xff.db").into()
        };
        let f = ubicar(&ruta).unwrap_err();
        assert_eq!(
            (f.codigo, f.detalle.as_str()),
            ("contenido_invalido", "ruta")
        );
    }

    #[test]
    fn portable_avisa_una_vez_fuera_de_su_carpeta() {
        let (exe, r) = con_lista_vacia();
        let (_d, bd, _) = afuera("a.db");
        assert_eq!(agregar(&r, &bd).unwrap().avisos, ["fuera_de_portable"]);
        assert!(agregar(&r, &bd).unwrap().avisos.is_empty());
        // junto al programa, pero fuera de `datos/`: sigue en su carpeta
        let junto = exe.path().join("junto.db");
        crear(&junto, "Junto", MIGRACIONES);
        let hecho = agregar(&r, &junto).unwrap();
        assert!(hecho.avisos.is_empty());
        assert!(entrada_con(&r, &hecho.id.unwrap()).externa);
    }

    #[test]
    fn instalada_no_avisa_de_la_portable() {
        let (exe, appdata) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let r = crate::rutas::dir_datos(exe.path(), Some(appdata.path())).unwrap();
        escribir(&r, vec![]);
        let (_d, bd, _) = afuera("a.db");
        assert!(agregar(&r, &bd).unwrap().avisos.is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn ruta_de_red() {
        assert!(es_ruta_de_red(Path::new(r"\\srv\c\a.db")));
        assert!(es_ruta_de_red(Path::new(r"\\?\UNC\srv\c\a.db")));
        assert!(!es_ruta_de_red(Path::new(r"C:\a.db")));
        assert!(!es_ruta_de_red(Path::new(r"\\?\C:\a.db")));
    }

    #[test]
    fn archivo_de_red_pide_confirmar_y_se_copia_a_la_app() {
        let (_exe, r) = con_lista_vacia();
        let (_d, bd, id) = afuera("en-red.db");
        let antes = fs::read(&bd).unwrap();
        let con = |confirmados: &[&str]| {
            agregar_con_red(&r, &bd, None, confirmados, MIGRACIONES, i64::MAX, de_red).unwrap()
        };
        let hecho = con(&[]);
        assert_eq!((hecho.id.as_deref(), hecho.pide), (None, Some("red")));
        assert!(cargar_lista(&r).organizaciones.is_empty());

        let hecho = con(&["red"]);
        assert_eq!(hecho.id.as_deref(), Some(id.as_str()));
        assert!(hecho.avisos.is_empty());
        let e = entrada_con(&r, &id);
        assert!(!e.externa);
        assert_eq!(e.ruta, ruta_interna(&id));
        assert_eq!(id_en(&ruta_de(&r, &e)), Some(id));
        assert_eq!(fs::read(&bd).unwrap(), antes);
        sin_rastros_ni_bloqueo(&bd);
        assert!(temporales_en(&r).is_empty());
    }

    #[test]
    fn dentro_de_datos_no_se_pregunta_por_la_red() {
        // una portable en una carpeta de red: `boldo.db` no se copia a sí mismo
        let (_exe, r) = con_lista_vacia();
        let id = crear(&r.bd, "La mía", MIGRACIONES);
        let hecho = agregar_con_red(&r, &r.bd, None, &[], MIGRACIONES, i64::MAX, de_red).unwrap();
        assert_eq!(hecho.id, Some(id));
    }

    #[test]
    fn una_lista_protegida_no_toca_nada() {
        let (_exe, r) = rutas();
        let json = r.datos.join("organizaciones.json");
        fs::write(&json, r#"{"version":2}"#).unwrap();
        let (_d, bd, _) = afuera("a.db");
        // su id tendría que escribirse: no se llega a eso
        alterar(&bd, "DELETE FROM meta WHERE clave = 'db_id';");
        let antes = fs::read(&bd).unwrap();
        assert_eq!(agregar(&r, &bd).unwrap_err().codigo, "lista_protegida");
        assert_eq!(fs::read(&bd).unwrap(), antes);
        sin_rastros_ni_bloqueo(&bd);
        assert_eq!(fs::read_to_string(&json).unwrap(), r#"{"version":2}"#);
    }

    #[test]
    fn vacuum_into_funciona_desde_solo_lectura() {
        let (_d, bd, _) = afuera("a.db");
        let d = tempfile::tempdir().unwrap();
        let antes = fs::read(&bd).unwrap();

        // cerrada: `immutable`, sin nada al lado
        let destino = d.path().join("copia.db");
        solo_lectura_cerrada(&bd)
            .unwrap()
            .execute("VACUUM INTO ?1", [destino.to_string_lossy()])
            .unwrap();
        sin_rastros(&bd);
        assert_eq!(fs::read(&bd).unwrap(), antes);
        assert_eq!(id_en(&destino), id_en(&bd));
        let c = solo_lectura_cerrada(&destino).unwrap();
        let ok: String = c
            .query_row("PRAGMA integrity_check", [], |f| f.get(0))
            .unwrap();
        assert_eq!(ok, "ok");

        // con su `-wal`: lo que no se ha volcado también va en la copia
        let escritora = db::abrir(&bd).unwrap();
        escritora
            .execute(
                "UPDATE meta SET valor = 'sin volcar' WHERE clave = 'org_nombre'",
                [],
            )
            .unwrap();
        assert!(con_sufijo(&bd, "-wal").exists());
        let destino = d.path().join("con-wal.db");
        solo_lectura_cerrada(&bd)
            .unwrap()
            .execute("VACUUM INTO ?1", [destino.to_string_lossy()])
            .unwrap();
        let nombre = leer_meta(&solo_lectura_cerrada(&destino).unwrap(), "org_nombre");
        assert_eq!(nombre.as_deref(), Some("sin volcar"));
    }

    /// Lo que no tiene `meta` no es de la entrada: no se le crea el esquema, ni un id, ni nada al lado.
    #[test]
    fn archivo_sin_tabla_meta_es_otro_id_sin_tocar_nada() {
        let (_exe, r) = rutas();
        let e = interna(&r, "x");
        let bd = ruta_de(&r, &e);
        fs::remove_file(&bd).unwrap();
        for bytes in [None, Some(())] {
            fs::write(&bd, "").unwrap();
            if bytes.is_some() {
                alterar(&bd, "CREATE TABLE otra (x);");
            }
            let antes = fs::read(&bd).unwrap();
            let f = abrir_entrada(&r, &e, ESPERA_CAMBIO, MIGRACIONES)
                .err()
                .unwrap();
            assert_eq!(f.codigo, "otro_id");
            assert_eq!(fs::read(&bd).unwrap(), antes);
            sin_rastros_ni_bloqueo(&bd);
            fs::remove_file(&bd).unwrap();
        }
        // una externa de 0 bytes, igual
        let d = tempfile::tempdir().unwrap();
        let bd = d.path().join("vacia.db");
        fs::write(&bd, "").unwrap();
        let e = entrada(&e.id, bd.to_str().unwrap(), true, "x");
        let f = abrir_entrada(&r, &e, ESPERA_CAMBIO, MIGRACIONES)
            .err()
            .unwrap();
        assert_eq!(f.codigo, "otro_id");
        assert_eq!(fs::read(&bd).unwrap(), b"");
        sin_rastros_ni_bloqueo(&bd);
    }

    fn truncar_a_su_primera_pagina(bd: &Path) {
        let pagina: i64 = solo_lectura_cerrada(bd)
            .unwrap()
            .pragma_query_value(None, "page_size", |f| f.get(0))
            .unwrap();
        OpenOptions::new()
            .write(true)
            .open(bd)
            .unwrap()
            .set_len(pagina as u64)
            .unwrap();
    }

    #[test]
    fn truncada_a_su_primera_pagina_es_danada_y_solo_la_interna_se_puede_eliminar() {
        let (_exe, r) = rutas();
        let i = interna(&r, "2020");
        let bd = ruta_de(&r, &i);
        truncar_a_su_primera_pagina(&bd);
        let error = id_del_archivo(&solo_lectura_cerrada(&bd).unwrap()).unwrap_err();
        assert_eq!(error.sqlite_error_code(), Some(ErrorCode::DatabaseCorrupt));

        assert!(revisar_para_eliminar(&r, &i, false, false, false).unwrap());

        let x = entrada(&i.id, bd.to_str().unwrap(), true, "2020");
        let f = revisar_para_eliminar(&r, &x, false, false, true).unwrap_err();
        assert_eq!(f.codigo, "otro_id");
    }

    /// No se pudo mirar: ni es ilegible, que dejaría borrarla sin ver su id, ni es de otro.
    #[test]
    fn lo_que_no_se_puede_abrir_no_dice_de_quien_es() {
        let (_exe, r) = rutas();
        let i = interna(&r, "2020");
        let carpeta = r.datos.join("organizaciones");
        for e in [&i, &entrada(&i.id, carpeta.to_str().unwrap(), true, "2020")] {
            let hecho = solo_lectura_cerrada(&carpeta).and_then(|c| es_de_la_entrada(&c, e));
            assert!(hecho.is_err());
        }
    }

    #[cfg(windows)]
    #[test]
    fn una_interna_que_otro_programa_retiene_no_se_da_por_ilegible() {
        use std::os::windows::fs::OpenOptionsExt;
        let (_exe, r) = rutas();
        let i = interna(&r, "2020");
        let retenida = OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(ruta_de(&r, &i))
            .unwrap();
        let f = revisar_para_eliminar(&r, &i, false, false, false).unwrap_err();
        assert_ne!(f.codigo, "otro_id");
        drop(retenida);
        assert!(revisar_para_eliminar(&r, &i, false, false, false).unwrap());
    }

    #[cfg(windows)]
    #[test]
    fn abrir_una_interna_retenida_lo_dice_y_se_puede_reintentar() {
        use std::os::windows::fs::OpenOptionsExt;
        let (_exe, r) = rutas();
        let i = interna(&r, "2020");
        let retenida = OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(ruta_de(&r, &i))
            .unwrap();
        let f = abrir_entrada(&r, &i, ESPERA_CAMBIO, MIGRACIONES)
            .err()
            .unwrap();
        assert_eq!(
            (f.codigo, f.detalle.as_str()),
            ("contenido_invalido", "no_abre")
        );
        drop(retenida);
        assert!(abrir_entrada(&r, &i, ESPERA_CAMBIO, MIGRACIONES).is_ok());
    }

    /// Una dañada abre y falla al leerla: nunca dice lo mismo que una que otro programa retiene.
    #[test]
    fn abrir_una_interna_danada_no_se_confunde_con_una_retenida() {
        let (_exe, r) = rutas();
        let basura = interna(&r, "2020");
        fs::write(ruta_de(&r, &basura), "no soy sqlite").unwrap();
        let cortada = interna(&r, "2021");
        OpenOptions::new()
            .write(true)
            .open(ruta_de(&r, &cortada))
            .unwrap()
            .set_len(4096)
            .unwrap();
        let de = |e| {
            abrir_entrada(&r, e, ESPERA_CAMBIO, MIGRACIONES)
                .err()
                .unwrap()
        };
        assert_eq!(de(&basura).codigo, "danado");
        assert_eq!(de(&cortada).codigo, "danado");
    }

    /// Otra conexión con la base tomada en exclusiva: `SQLITE_BUSY` de verdad, sin la espera de 5 s de cada conexión.
    #[test]
    fn un_error_pasajero_no_sale_como_otro_id() {
        let (_exe, r) = rutas();
        let i = interna(&r, "2020");
        let bd = ruta_de(&r, &i);
        let otra = db::abrir(&bd).unwrap();
        otra.pragma_update(None, "locking_mode", "EXCLUSIVE")
            .unwrap();
        otra.execute("UPDATE meta SET valor = 'x' WHERE clave = 'org_nombre'", [])
            .unwrap();
        let c = solo_lectura_cerrada(&bd).unwrap();
        c.busy_timeout(Duration::ZERO).unwrap();
        let error = id_del_archivo(&c).unwrap_err();
        assert_eq!(error.sqlite_error_code(), Some(ErrorCode::DatabaseBusy));

        let f = es_de_la_entrada(&c, &i).unwrap_err();

        assert_eq!(f.codigo, "fallo", "{}", f.detalle);
    }

    /// Una tabla `meta` que no es la de la app, o sin las tablas de la app: tiene otra forma, y eso sí dice que es de otro.
    #[test]
    fn lo_que_tiene_otra_forma_es_de_otro() {
        let (_exe, r) = rutas();
        let i = interna(&r, "2020");
        let bd = ruta_de(&r, &i);
        for sql in [
            "CREATE TABLE meta (otra);",
            "CREATE TABLE meta (clave, valor);",
        ] {
            fs::remove_file(&bd).unwrap();
            let c = Connection::open(&bd).unwrap();
            c.execute_batch(sql).unwrap();
            c.close().unwrap();
            let f = revisar_para_eliminar(&r, &i, false, false, false).unwrap_err();
            assert_eq!(f.codigo, "otro_id", "{sql}");
        }
    }
}
