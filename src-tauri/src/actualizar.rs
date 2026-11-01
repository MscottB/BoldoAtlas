//! Actualizador (spec §12 «Actualizar»). Es la única conexión que la app hace sola: lee la lista pública de
//! releases de GitHub, el `latest.json` y el `novedades.json` del release elegido. No envía datos ni
//! identificadores y nunca instala sin que el usuario lo confirme en la ventana de actualización.
//!
//! - Dónde está el manifiesto: cada release publica su propio `latest.json` (firmado en CI). La app pide la
//!   lista de releases a la API y elige la versión más nueva que lo trae; `releases/latest/download/` no sirve
//!   mientras todas las versiones son pre-releases (GitHub responde 404) y la API no las ordena por SemVer.
//! - Canal: una versión final solo recibe versiones finales; una pre-release (alpha, beta) o un build de
//!   desarrollo recibe también pre-releases.
//! - Instalado: tauri-plugin-updater (instalador NSIS, `.app` de macOS, AppImage). `.deb`/`.rpm`: solo se
//!   ofrece descargar el paquete. Portable de Windows: se reemplaza a sí misma dentro de su carpeta (el exe
//!   en uso pasa a `BoldoAtlas.old.exe`, que se borra al siguiente arranque). Las portables de Linux (AppImage)
//!   y macOS (`.app`) usan el plugin: sus temporales caen en `datos/temporales` (ver `rutas::entorno_portable`).
use crate::comandos::Estado;
use futures_util::future::{AbortHandle, Abortable};
use semver::Version;
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

const RELEASES: &str = "https://api.github.com/repos/MscottB/BoldoAtlas/releases?per_page=30";
const MANIFIESTO: &str = "latest.json";
const NOVEDADES: &str = "novedades.json";
/// Nombre del programa dentro del zip portable de Windows (scripts/release.mjs).
const EXE_PORTABLE: &str = "BoldoAtlas.exe";
/// Prefijo de las carpetas temporales del plugin en Windows: `<productName>-<versión>-updater-…`.
const TEMPORAL_PLUGIN: &str = "BoldoAtlas-";
const ESPERA: Duration = Duration::from_secs(30);

/// Error de los comandos del actualizador. `codigo` lo traduce la interfaz (`actualizar.error.<codigo>`, es/en);
/// `detalle` es el texto técnico del sistema o de la biblioteca, sin traducir.
#[derive(Debug, Serialize, PartialEq)]
pub struct Fallo {
    pub codigo: &'static str,
    pub detalle: String,
}

fn fallo(codigo: &'static str, detalle: impl std::fmt::Display) -> Fallo {
    Fallo {
        codigo,
        detalle: detalle.to_string(),
    }
}

/// Respuesta no exitosa de la API de GitHub: 403 y 429 son su límite de consultas sin cuenta.
pub fn codigo_http(estado: u16) -> &'static str {
    match estado {
        403 | 429 => "limite",
        _ => "respuesta",
    }
}

/// Error de tauri-plugin-updater: red, manifiesto que no calza, firma inválida o instalación.
pub fn codigo_plugin(e: &tauri_plugin_updater::Error) -> &'static str {
    use tauri_plugin_updater::Error as E;
    match e {
        E::Reqwest(r) if r.is_decode() => "manifiesto",
        E::Reqwest(_) | E::Network(_) => "red",
        E::Minisign(_)
        | E::Base64(_)
        | E::SignatureUtf8(_)
        | E::SignedVersionMismatch { .. }
        | E::MissingSignedVersion => "firma",
        E::ReleaseNotFound
        | E::TargetNotFound(_)
        | E::TargetsNotFound(_)
        | E::Serialization(_)
        | E::Semver(_)
        | E::UrlParse(_) => "manifiesto",
        _ => "instalar",
    }
}

#[derive(Debug, Deserialize)]
pub struct ReleaseGh {
    pub tag_name: String,
    #[serde(default)]
    pub draft: bool,
    pub html_url: String,
    #[serde(default)]
    pub assets: Vec<AssetGh>,
}

#[derive(Debug, Deserialize)]
pub struct AssetGh {
    pub name: String,
    pub browser_download_url: String,
}

#[derive(Debug, PartialEq)]
pub struct Elegida {
    pub version: Version,
    pub manifiesto: String,
    pub novedades: Option<String>,
    pub pagina: String,
}

/// La versión publicada más nueva y mayor que `actual` entre las que traen `latest.json`, según el canal
/// (ver el comentario del módulo). Los borradores y las etiquetas que no son SemVer no cuentan.
pub fn elegir(releases: &[ReleaseGh], actual: &Version) -> Option<Elegida> {
    let con_pre = !actual.pre.is_empty();
    releases
        .iter()
        .filter(|r| !r.draft)
        .filter_map(|r| {
            let v = Version::parse(r.tag_name.trim_start_matches('v')).ok()?;
            let url = |n: &str| {
                r.assets
                    .iter()
                    .find(|a| a.name == n)
                    .map(|a| a.browser_download_url.clone())
            };
            Some(Elegida {
                manifiesto: url(MANIFIESTO)?,
                novedades: url(NOVEDADES),
                pagina: r.html_url.clone(),
                version: v,
            })
        })
        .filter(|e| (con_pre || e.version.pre.is_empty()) && e.version > *actual)
        .max_by(|a, b| a.version.cmp(&b.version))
}

/// Cómo se actualiza esta copia de BoldoAtlas.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Modo {
    /// Instalador de Windows, `.app` de macOS o AppImage: lo hace el plugin y la app se reinicia.
    Instalador,
    /// Junto a `portable.flag`: se reemplaza dentro de su carpeta; `datos/` no se toca.
    Portable,
    /// `.deb`/`.rpm` en Linux: lo actualiza el gestor de paquetes; solo se ofrece descargar.
    Paquete,
}

/// `os` es `std::env::consts::OS`; `appimage`, si este exe corre dentro de un AppImage.
pub fn modo(os: &str, portable: bool, appimage: bool) -> Modo {
    if os == "linux" && !appimage {
        Modo::Paquete
    } else if portable {
        Modo::Portable
    } else {
        Modo::Instalador
    }
}

/// Objetivo de `latest.json` para este sistema (los arma scripts/manifiesto.mjs con `ACTUALIZABLES`).
pub fn objetivo(modo: Modo, os: &str, arch: &str) -> Option<String> {
    match (modo, os) {
        (Modo::Paquete, _) => None,
        (Modo::Portable, "windows") => Some(format!("windows-{arch}-portable")),
        (_, "windows") => Some(format!("windows-{arch}")),
        (_, "linux") => Some(format!("linux-{arch}")),
        (_, "macos") => Some(format!("darwin-{arch}")),
        _ => None,
    }
}

/// `BoldoAtlas.exe` → `BoldoAtlas.old.exe`, junto al exe.
pub fn ruta_vieja(exe: &Path) -> PathBuf {
    exe.with_extension("old.exe")
}

/// Carpeta de los temporales de la actualización de la portable, dentro de `datos/`.
pub fn dir_temporal(datos: &Path) -> PathBuf {
    datos.join("actualizacion")
}

/// El programa del zip portable de Windows, ya verificado por su firma. Solo se lee la entrada `BoldoAtlas.exe`
/// por nombre exacto: ninguna ruta del zip decide dónde se escribe.
pub fn exe_del_zip(zip: &[u8]) -> Result<Vec<u8>, Fallo> {
    let mut archivo = zip::ZipArchive::new(std::io::Cursor::new(zip))
        .map_err(|e| fallo("paquete", format!("zip: {e}")))?;
    let mut entrada = archivo
        .by_name(EXE_PORTABLE)
        .map_err(|_| fallo("paquete", format!("{EXE_PORTABLE} ∉ zip")))?;
    let mut exe = Vec::new();
    entrada
        .read_to_end(&mut exe)
        .map_err(|e| fallo("paquete", format!("{EXE_PORTABLE}: {e}")))?;
    if !exe.starts_with(b"MZ") {
        return Err(fallo("paquete", format!("{EXE_PORTABLE}: no MZ")));
    }
    Ok(exe)
}

/// Deja `nuevo` en `temporal/` (en `datos/`, el mismo disco que el exe) y lo cambia por el exe en uso. Windows
/// permite renombrar un exe en ejecución, no borrarlo: el viejo queda como `.old.exe` hasta el siguiente arranque.
pub fn reemplazar(exe: &Path, nuevo: &[u8], temporal: &Path) -> Result<(), Fallo> {
    let nombre = exe
        .file_name()
        .ok_or_else(|| fallo("reemplazo", exe.display()))?;
    std::fs::create_dir_all(temporal)
        .map_err(|e| fallo("reemplazo", format!("{}: {e}", temporal.display())))?;
    let listo = temporal.join(nombre);
    std::fs::write(&listo, nuevo)
        .map_err(|e| fallo("reemplazo", format!("{}: {e}", listo.display())))?;
    intercambiar(exe, &listo)
}

/// Pone `listo` en el lugar de `exe`, que pasa a `.old.exe`. Si no se puede, devuelve el anterior a su lugar.
/// Errores: `reemplazo` (todo quedó como estaba) o `restaurar` (el detalle es dónde quedó la versión anterior).
pub fn intercambiar(exe: &Path, listo: &Path) -> Result<(), Fallo> {
    let viejo = ruta_vieja(exe);
    let _ = std::fs::remove_file(&viejo); // de una actualización anterior que no alcanzó a limpiarse
    std::fs::rename(exe, &viejo).map_err(|e| fallo("reemplazo", e))?;
    if let Err(e) = std::fs::rename(listo, exe) {
        return match std::fs::rename(&viejo, exe) {
            Ok(()) => Err(fallo("reemplazo", e)),
            Err(_) => Err(fallo("restaurar", viejo.display())),
        };
    }
    Ok(())
}

/// Después de poner el exe nuevo en su lugar: cierra SQLite, abre la versión nueva y termina, también si no se
/// pudo abrir (la versión nueva ya está; se abre a mano). Esta copia nunca sigue corriendo sin base de datos.
/// Devuelve si se pudo abrir la versión nueva.
pub fn terminar_tras_reemplazo(
    cerrar: impl FnOnce(),
    abrir_nueva: impl FnOnce() -> std::io::Result<()>,
    salir: impl FnOnce(),
) -> bool {
    cerrar();
    let abierta = abrir_nueva().is_ok();
    salir();
    abierta
}

/// Temporales de una actualización anterior (spec §12 «Limpieza»): el `.old.exe` de la portable de Windows,
/// `datos/actualizacion/` y las carpetas `BoldoAtlas-<versión>-updater-…` que el instalador de Windows deja
/// en el temporal (en la portable, el temporal es `datos/temporales`). Nada más.
pub fn limpiar(exe: &Path, datos: &Path, temporal: &Path) {
    let _ = std::fs::remove_file(ruta_vieja(exe));
    let _ = std::fs::remove_dir_all(dir_temporal(datos));
    let Ok(lista) = std::fs::read_dir(temporal) else {
        return;
    };
    for e in lista.flatten() {
        let nombre = e.file_name().to_string_lossy().into_owned();
        if nombre.starts_with(TEMPORAL_PLUGIN)
            && nombre.contains("-updater-")
            && e.file_type().is_ok_and(|t| t.is_dir())
        {
            let _ = std::fs::remove_dir_all(e.path());
        }
    }
}

/// Al iniciar (desde `setup`, ya ajustado el entorno de la portable), en otro hilo: el proceso anterior puede
/// tardar un momento en soltar el `.old.exe`.
pub fn limpiar_al_iniciar(datos: PathBuf) {
    std::thread::spawn(move || {
        let Ok(exe) = std::env::current_exe() else {
            return;
        };
        for _ in 0..20 {
            limpiar(&exe, &datos, &std::env::temp_dir());
            if !ruta_vieja(&exe).exists() {
                break;
            }
            std::thread::sleep(Duration::from_millis(500));
        }
    });
}

/// Si se puede crear el icono de la bandeja. En Linux, tray-icon carga libayatana-appindicator3 o libappindicator3
/// al crear el icono y, si no está, entra en pánico; con `panic = "abort"` eso cerraría la app entera. Se prueban
/// los mismos nombres que libappindicator-sys (con `backcompat`, que viene por defecto) y, si ninguno carga, la
/// interfaz no crea el icono.
#[tauri::command]
pub fn bandeja_disponible() -> bool {
    appindicator()
}

#[cfg(target_os = "linux")]
fn appindicator() -> bool {
    [
        "libayatana-appindicator3.so.1",
        "libappindicator3.so.1",
        "libayatana-appindicator3.so",
        "libappindicator3.so",
    ]
    .iter()
    // SAFETY: son bibliotecas del sistema que tray-icon cargaría igual; solo se abren y se sueltan
    .any(|l| unsafe { libloading::Library::new(*l) }.is_ok())
}

#[cfg(not(target_os = "linux"))]
fn appindicator() -> bool {
    true
}

/// Si este exe corre dentro de un AppImage (como `rutas::carpeta_programa`: un `$APPIMAGE` heredado no vale).
fn es_appimage() -> bool {
    let (Some(_), Some(dir)) = (std::env::var_os("APPIMAGE"), std::env::var_os("APPDIR")) else {
        return false;
    };
    std::env::current_exe().is_ok_and(|e| e.starts_with(dir))
}

/// La actualización encontrada, a la espera de que el usuario la confirme.
#[derive(Default)]
pub struct Actualizador {
    pendiente: Mutex<Option<(Update, Modo)>>,
    cancelar: Mutex<Option<AbortHandle>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Disponible {
    version: String,
    modo: Modo,
    /// Página del release: notas completas y, para `.deb`/`.rpm`, la descarga.
    pagina: String,
    /// `novedades.json` del release, si se pudo leer; la interfaz muestra las versiones intermedias.
    novedades: Option<serde_json::Value>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progreso {
    descargado: u64,
    total: Option<u64>,
}

/// La lista de releases. Solo en los builds de depuración (nunca en los publicados) se puede apuntar a un servidor
/// local con `BOLDO_RELEASES_URL`, para probar la ventana de actualización; la firma se exige igual.
fn url_releases() -> String {
    #[cfg(debug_assertions)]
    if let Ok(url) = std::env::var("BOLDO_RELEASES_URL") {
        return url;
    }
    RELEASES.to_string()
}

fn cliente() -> Result<reqwest::Client, Fallo> {
    // el plugin hace lo mismo antes de su primera consulta: rustls sin proveedor instalado no conecta
    let _ = rustls::crypto::ring::default_provider().install_default();
    reqwest::Client::builder()
        .user_agent("BoldoAtlas")
        .timeout(ESPERA)
        .build()
        .map_err(|e| fallo("interno", e))
}

/// Busca una versión nueva. `version_actual` es la de la interfaz (`__APP_VERSION_CORTA__`): la del binario
/// es solo X.Y.Z, porque el instalador de Windows no admite pre-releases, y no distingue las alpha entre sí.
#[tauri::command]
pub async fn buscar_actualizacion(
    app: AppHandle,
    version_actual: String,
) -> Result<Option<Disponible>, Fallo> {
    let actual = Version::parse(&version_actual).map_err(|e| fallo("version", e))?;
    let http = cliente()?;
    let respuesta = http
        .get(url_releases())
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| fallo("red", e))?;
    if !respuesta.status().is_success() {
        return Err(fallo(
            codigo_http(respuesta.status().as_u16()),
            respuesta.status(),
        ));
    }
    let releases: Vec<ReleaseGh> = respuesta.json().await.map_err(|e| fallo("respuesta", e))?;
    let Some(elegida) = elegir(&releases, &actual) else {
        *app.state::<Actualizador>()
            .pendiente
            .lock()
            .map_err(|e| fallo("interno", e))? = None;
        return Ok(None);
    };
    let novedades = match &elegida.novedades {
        Some(url) => match http.get(url).send().await {
            Ok(r) if r.status().is_success() => r.json().await.ok(),
            _ => None,
        },
        None => None,
    };
    let portable = app
        .state::<Estado>()
        .rutas_app()
        .ok_or_else(|| fallo("interno", "rutas"))?
        .portable;
    let modo = modo(std::env::consts::OS, portable, es_appimage());
    if let Some(objetivo) = objetivo(modo, std::env::consts::OS, std::env::consts::ARCH) {
        let url = elegida
            .manifiesto
            .parse()
            .map_err(|e| fallo("manifiesto", e))?;
        let nueva = elegida.version.clone();
        let al_salir = app.clone();
        let update = app
            .updater_builder()
            .endpoints(vec![url])
            .map_err(|e| fallo(codigo_plugin(&e), e))?
            .target(objetivo)
            .timeout(ESPERA)
            // la versión del binario no sirve (ver arriba): se compara con la elegida, que ya es mayor
            .version_comparator(move |_, r| r.version == nueva)
            // el instalador de Windows cierra la app sin pasar por RunEvent::Exit: se cierra SQLite antes
            .on_before_exit(move || {
                al_salir
                    .state::<Estado>()
                    .cerrar_ordenado(Duration::from_secs(3));
            })
            .build()
            .map_err(|e| fallo(codigo_plugin(&e), e))?
            .check()
            .await
            .map_err(|e| fallo(codigo_plugin(&e), e))?
            .ok_or_else(|| fallo("manifiesto", format!("latest.json ≠ {}", elegida.version)))?;
        *app.state::<Actualizador>()
            .pendiente
            .lock()
            .map_err(|e| fallo("interno", e))? = Some((update, modo));
    }
    Ok(Some(Disponible {
        version: elegida.version.to_string(),
        modo,
        pagina: elegida.pagina,
        novedades,
    }))
}

/// Descarga (con progreso y verificación de la firma) e instala la actualización que se buscó antes, y
/// reinicia la app. Si se cancela o falla, la versión actual queda tal cual.
#[tauri::command]
pub async fn instalar_actualizacion(
    app: AppHandle,
    progreso: Channel<Progreso>,
) -> Result<(), Fallo> {
    let estado = app.state::<Actualizador>();
    let (update, modo) = estado
        .pendiente
        .lock()
        .map_err(|e| fallo("interno", e))?
        .clone()
        .ok_or_else(|| fallo("pendiente", ""))?;
    let (abortar, registro) = AbortHandle::new_pair();
    *estado.cancelar.lock().map_err(|e| fallo("interno", e))? = Some(abortar);
    let mut descargado = 0u64;
    let mut avisado = 0u64;
    let descarga = update.download(
        |n, total| {
            descargado += n as u64;
            // un aviso cada 256 KB: no miles de mensajes por la IPC
            if descargado - avisado >= 256 * 1024 || Some(descargado) == total {
                avisado = descargado;
                let _ = progreso.send(Progreso { descargado, total });
            }
        },
        || {},
    );
    let bytes = Abortable::new(descarga, registro)
        .await
        .map_err(|_| fallo("cancelada", ""))?
        .map_err(|e| fallo(codigo_plugin(&e), e))?;
    instalar(&app, &update, modo, &bytes)
}

fn instalar(app: &AppHandle, update: &Update, modo: Modo, bytes: &[u8]) -> Result<(), Fallo> {
    let estado = app.state::<Estado>();
    if cfg!(windows) && modo == Modo::Portable {
        let exe = std::env::current_exe().map_err(|e| fallo("interno", e))?;
        let datos = estado
            .rutas_app()
            .ok_or_else(|| fallo("interno", "rutas"))?
            .datos
            .clone();
        // si falla, nada cambió y la base sigue abierta
        reemplazar(&exe, &exe_del_zip(bytes)?, &dir_temporal(&datos))?;
        // se abre la ruta de siempre (ahora el exe nuevo); el proceso actual sigue siendo el .old.exe
        terminar_tras_reemplazo(
            || {
                estado.cerrar_ordenado(Duration::from_secs(3));
            },
            || {
                std::process::Command::new(&exe)
                    .current_dir(exe.parent().unwrap_or(Path::new(".")))
                    .spawn()
                    .map(|_| ())
            },
            || app.exit(0),
        );
        return Ok(());
    }
    // Windows: lanza el instalador y cierra la app (on_before_exit cierra SQLite antes). macOS y Linux:
    // reemplaza el .app o el AppImage, restaurando el anterior si falla, y vuelve aquí para reiniciar.
    if let Err(e) = update.install(bytes) {
        // en Windows, on_before_exit ya cerró SQLite y el instalador no se lanzó: se reabre la base o, si no se
        // puede, la app termina; nunca sigue corriendo sin base de datos
        if estado.reabrir().is_err() {
            app.exit(1);
        }
        let codigo = match codigo_plugin(&e) {
            "firma" => "firma",
            _ => "instalar",
        };
        return Err(fallo(codigo, e));
    }
    estado.cerrar_ordenado(Duration::from_secs(3));
    app.restart()
}

#[tauri::command]
pub fn cancelar_actualizacion(estado: State<'_, Actualizador>) {
    if let Some(a) = estado.cancelar.lock().ok().and_then(|mut c| c.take()) {
        a.abort();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    fn release(tag: &str, assets: &[&str]) -> ReleaseGh {
        ReleaseGh {
            tag_name: tag.into(),
            draft: false,
            html_url: format!("https://github.com/x/releases/tag/{tag}"),
            assets: assets
                .iter()
                .map(|n| AssetGh {
                    name: (*n).into(),
                    browser_download_url: format!("https://dl/{tag}/{n}"),
                })
                .collect(),
        }
    }
    const AMBOS: &[&str] = &[MANIFIESTO, NOVEDADES];
    fn v(s: &str) -> Version {
        Version::parse(s).unwrap()
    }

    #[test]
    fn elige_la_mas_nueva_por_semver_y_no_por_el_orden_de_la_api() {
        // la API de GitHub puede listar alpha.9 antes que alpha.10
        let lista = [
            release("v0.1.0-alpha.9", AMBOS),
            release("v0.1.0-alpha.10", AMBOS),
            release("v0.1.0-alpha.8", AMBOS),
        ];
        let e = elegir(&lista, &v("0.1.0-alpha.8")).unwrap();
        assert_eq!(e.version, v("0.1.0-alpha.10"));
        assert_eq!(e.manifiesto, "https://dl/v0.1.0-alpha.10/latest.json");
        assert_eq!(
            e.novedades.as_deref(),
            Some("https://dl/v0.1.0-alpha.10/novedades.json")
        );
        assert_eq!(
            e.pagina,
            "https://github.com/x/releases/tag/v0.1.0-alpha.10"
        );
    }

    #[test]
    fn sin_version_mayor_no_ofrece_nada_ni_baja() {
        let lista = [
            release("v0.1.0-alpha.11", AMBOS),
            release("v0.1.0-alpha.10", AMBOS),
        ];
        assert_eq!(elegir(&lista, &v("0.1.0-alpha.11")), None);
        // un build de desarrollo posterior a la alpha.11 no ofrece volver a ella
        assert_eq!(elegir(&lista, &v("0.1.0-alpha.11.dev.3")), None);
        assert_eq!(elegir(&lista, &v("0.2.0")), None);
    }

    #[test]
    fn pre_release_menor_que_final_y_canal() {
        let lista = [release("v1.0.0", AMBOS), release("v1.1.0-beta.1", AMBOS)];
        // una alpha recibe pre-releases: la beta de 1.1 es la más nueva
        assert_eq!(
            elegir(&lista, &v("1.0.0-alpha.3")).unwrap().version,
            v("1.1.0-beta.1")
        );
        // una versión final solo recibe finales: 1.0.0 no tiene nada nuevo
        assert_eq!(elegir(&lista, &v("1.0.0")), None);
        assert_eq!(elegir(&lista, &v("0.9.0")).unwrap().version, v("1.0.0"));
        // 1.0.0-rc.1 < 1.0.0
        assert_eq!(
            elegir(&lista, &v("1.0.0-rc.1")).unwrap().version,
            v("1.1.0-beta.1")
        );
    }

    #[test]
    fn salta_borradores_etiquetas_raras_y_releases_sin_manifiesto() {
        let mut borrador = release("v0.3.0", AMBOS);
        borrador.draft = true;
        let lista = [
            borrador,
            release("ultima", AMBOS),
            release("v0.2.0", &[NOVEDADES]), // sin latest.json (anterior al actualizador)
            release("v0.1.5", &[MANIFIESTO]),
        ];
        let e = elegir(&lista, &v("0.1.0")).unwrap();
        assert_eq!(e.version, v("0.1.5"));
        assert_eq!(e.novedades, None);
    }

    #[test]
    fn modo_y_objetivo_por_sistema_y_tipo_de_instalacion() {
        let caso = |os, portable, appimage| {
            let m = modo(os, portable, appimage);
            (m, objetivo(m, os, "x86_64"))
        };
        let o = |s: &str| Some(s.to_string());
        assert_eq!(
            caso("windows", false, false),
            (Modo::Instalador, o("windows-x86_64"))
        );
        assert_eq!(
            caso("windows", true, false),
            (Modo::Portable, o("windows-x86_64-portable"))
        );
        assert_eq!(
            caso("linux", false, true),
            (Modo::Instalador, o("linux-x86_64"))
        );
        // la portable de Linux es el mismo AppImage
        assert_eq!(
            caso("linux", true, true),
            (Modo::Portable, o("linux-x86_64"))
        );
        assert_eq!(caso("linux", false, false), (Modo::Paquete, None));
        assert_eq!(
            caso("macos", false, false),
            (Modo::Instalador, o("darwin-x86_64"))
        );
        assert_eq!(
            caso("macos", true, false),
            (Modo::Portable, o("darwin-x86_64"))
        );
        assert_eq!(
            objetivo(Modo::Instalador, "macos", "aarch64"),
            o("darwin-aarch64")
        );
        assert_eq!(objetivo(Modo::Instalador, "freebsd", "x86_64"), None);
    }

    fn zip_con(entradas: &[(&str, &[u8])]) -> Vec<u8> {
        let mut z = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for (nombre, datos) in entradas {
            z.start_file(*nombre, zip::write::SimpleFileOptions::default())
                .unwrap();
            z.write_all(datos).unwrap();
        }
        z.finish().unwrap().into_inner()
    }

    #[test]
    fn del_zip_solo_toma_boldoatlas_exe_por_nombre_exacto() {
        let zip = zip_con(&[
            ("../BoldoAtlas.exe", b"MZmalo"),
            ("datos/.keep", b""),
            ("BoldoAtlas.exe", b"MZbueno"),
            ("portable.flag", b""),
        ]);
        assert_eq!(exe_del_zip(&zip).unwrap(), b"MZbueno");
        let sin = zip_con(&[("otra/BoldoAtlas.exe", b"MZ")]);
        assert_eq!(exe_del_zip(&sin).unwrap_err().codigo, "paquete");
        let falso = zip_con(&[("BoldoAtlas.exe", b"#!/bin/sh")]);
        assert_eq!(exe_del_zip(&falso).unwrap_err().codigo, "paquete");
        assert_eq!(exe_del_zip(b"no es zip").unwrap_err().codigo, "paquete");
    }

    #[test]
    fn reemplazar_deja_el_nuevo_y_el_viejo_como_old_exe_dentro_de_la_carpeta() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("BoldoAtlas.exe");
        let datos = dir.path().join("datos");
        fs::create_dir_all(&datos).unwrap();
        fs::write(&exe, b"MZviejo").unwrap();
        fs::write(datos.join("boldo.db"), b"base").unwrap();
        reemplazar(&exe, b"MZnuevo", &dir_temporal(&datos)).unwrap();
        assert_eq!(fs::read(&exe).unwrap(), b"MZnuevo");
        assert_eq!(
            fs::read(dir.path().join("BoldoAtlas.old.exe")).unwrap(),
            b"MZviejo"
        );
        assert_eq!(fs::read(datos.join("boldo.db")).unwrap(), b"base");
        // nada fuera de la carpeta de la portable
        let mut todo: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        todo.sort();
        assert_eq!(todo, ["BoldoAtlas.exe", "BoldoAtlas.old.exe", "datos"]);
    }

    #[test]
    fn si_no_se_puede_poner_el_nuevo_restaura_el_anterior() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("BoldoAtlas.exe");
        fs::write(&exe, b"MZviejo").unwrap();
        let err = intercambiar(&exe, &dir.path().join("no-existe.exe")).unwrap_err();
        assert_eq!(err.codigo, "reemplazo", "{err:?}");
        assert_eq!(fs::read(&exe).unwrap(), b"MZviejo");
        assert!(!ruta_vieja(&exe).exists());
    }

    #[test]
    fn limpiar_borra_solo_los_temporales_de_la_actualizacion() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("BoldoAtlas.exe");
        let datos = dir.path().join("datos");
        let temporal = datos.join("temporales");
        fs::create_dir_all(dir_temporal(&datos)).unwrap();
        fs::create_dir_all(temporal.join("BoldoAtlas-0.1.0-alpha.12-updater-Ab12")).unwrap();
        fs::create_dir_all(temporal.join("otra-cosa-updater-x")).unwrap();
        fs::write(temporal.join("BoldoAtlas-nota-updater-.txt"), b"").unwrap();
        fs::write(&exe, b"MZ").unwrap();
        fs::write(ruta_vieja(&exe), b"MZ").unwrap();
        fs::write(dir_temporal(&datos).join("BoldoAtlas.exe"), b"MZ").unwrap();
        fs::write(datos.join("boldo.db"), b"base").unwrap();
        limpiar(&exe, &datos, &temporal);
        assert!(exe.exists());
        assert!(!ruta_vieja(&exe).exists());
        assert!(!dir_temporal(&datos).exists());
        assert!(
            !temporal
                .join("BoldoAtlas-0.1.0-alpha.12-updater-Ab12")
                .exists()
        );
        assert!(temporal.join("otra-cosa-updater-x").exists());
        assert!(temporal.join("BoldoAtlas-nota-updater-.txt").exists());
        assert!(datos.join("boldo.db").exists());
    }

    #[test]
    fn tras_reemplazar_siempre_termina_aunque_no_abra_la_version_nueva() {
        use std::cell::RefCell;
        for abre in [true, false] {
            let pasos = RefCell::new(Vec::new());
            let abierta = terminar_tras_reemplazo(
                || pasos.borrow_mut().push("cerrar"),
                || {
                    pasos.borrow_mut().push("abrir");
                    if abre {
                        Ok(())
                    } else {
                        Err(std::io::Error::other("bloqueado"))
                    }
                },
                || pasos.borrow_mut().push("salir"),
            );
            assert_eq!(abierta, abre);
            // la base se cierra antes de abrir la nueva y esta copia termina siempre
            assert_eq!(*pasos.borrow(), ["cerrar", "abrir", "salir"]);
        }
    }

    #[test]
    fn codigos_de_error_para_la_interfaz() {
        use tauri_plugin_updater::Error as E;
        assert_eq!(codigo_http(403), "limite");
        assert_eq!(codigo_http(429), "limite");
        assert_eq!(codigo_http(500), "respuesta");
        assert_eq!(codigo_http(404), "respuesta");
        assert_eq!(codigo_plugin(&E::Network("x".into())), "red");
        assert_eq!(codigo_plugin(&E::MissingSignedVersion), "firma");
        assert_eq!(
            codigo_plugin(&E::SignedVersionMismatch {
                signed: "1".into(),
                announced: "2".into()
            }),
            "firma"
        );
        assert_eq!(codigo_plugin(&E::TargetNotFound("x".into())), "manifiesto");
        assert_eq!(codigo_plugin(&E::ReleaseNotFound), "manifiesto");
        assert_eq!(codigo_plugin(&E::InvalidUpdaterFormat), "instalar");
        // se serializa con el código y el detalle técnico
        assert_eq!(
            serde_json::to_value(fallo("limite", "403 Forbidden")).unwrap(),
            serde_json::json!({ "codigo": "limite", "detalle": "403 Forbidden" })
        );
    }

    #[test]
    fn ruta_vieja_y_temporal_quedan_en_la_carpeta_de_la_portable() {
        let exe = Path::new("D:/pendrive/BoldoAtlas/BoldoAtlas.exe");
        assert_eq!(
            ruta_vieja(exe),
            Path::new("D:/pendrive/BoldoAtlas/BoldoAtlas.old.exe")
        );
        let datos = Path::new("D:/pendrive/BoldoAtlas/datos");
        assert!(dir_temporal(datos).starts_with(datos));
    }
}
