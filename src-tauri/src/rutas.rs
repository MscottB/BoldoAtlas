use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub const IDENTIFICADOR: &str = "io.github.mscottb.boldoatlas";

#[derive(Debug, Clone)]
pub struct Rutas {
    pub datos: PathBuf,
    pub bd: PathBuf,
    pub respaldos: PathBuf,
    #[allow(dead_code)] // la usa la Fase 5 (escenarios)
    pub escenarios: PathBuf,
    pub portable: bool,
}

/// Carpeta donde se busca `portable.flag`: la del AppImage en Linux (`$APPIMAGE`: el exe corre desde un
/// montaje temporal), la que contiene `BoldoAtlas.app` en macOS y la del exe en los demás casos.
pub fn carpeta_programa(exe: &Path, appimage: Option<&Path>) -> Option<PathBuf> {
    if let Some(a) = appimage {
        return a.parent().map(Path::to_path_buf);
    }
    let dir = exe.parent()?;
    let app = dir.parent().and_then(Path::parent);
    match app {
        Some(app) if dir.ends_with("Contents/MacOS") && app.extension() == Some("app".as_ref()) => {
            app.parent().map(Path::to_path_buf)
        }
        _ => Some(dir.to_path_buf()),
    }
}

/// Variables de entorno que la portable apunta a `datos/` para que los temporales y las cachés del sistema
/// (WebView, GTK, fuentes) no se escriban fuera de su carpeta. `os` es `std::env::consts::OS`.
pub fn entorno_portable(os: &str, datos: &Path) -> Vec<(&'static str, PathBuf)> {
    let tmp = datos.join("temporales");
    match os {
        "windows" => vec![("TEMP", tmp.clone()), ("TMP", tmp)],
        // XDG_CONFIG_HOME no: ahí está dconf, y la app perdería el tema del escritorio
        "linux" => vec![
            ("TMPDIR", tmp),
            ("XDG_CACHE_HOME", datos.join("cache")),
            ("XDG_DATA_HOME", datos.join("compartidos")),
        ],
        _ => vec![("TMPDIR", tmp)],
    }
}

/// Portable si existe `portable.flag` en `carpeta` (ver `carpeta_programa`); si no, la carpeta de la app
/// dentro de `appdata`, la carpeta de datos del usuario (APPDATA en Windows, ~/.local/share en Linux, ~/Library/Application Support en macOS).
pub fn dir_datos(exe_dir: &Path, appdata: Option<&Path>) -> Result<Rutas, String> {
    if exe_dir
        .components()
        .any(|c| c.as_os_str() == "AppTranslocation")
    {
        return Err(format!(
            "macOS abrió BoldoAtlas en una copia temporal de solo lectura ({}). Si es la versión portable, quita la cuarentena de su carpeta (xattr -dr com.apple.quarantine <carpeta>) y ábrela de nuevo; si la instalaste con el .dmg, arrástrala a Aplicaciones y ábrela desde ahí.",
            exe_dir.display()
        ));
    }
    if abierto_desde_zip(exe_dir) {
        return Err(format!(
            "BoldoAtlas se está ejecutando desde dentro de un .zip ({}). Ciérralo, extráelo primero a una carpeta y ábrelo desde ahí; si no, los datos quedarían en una carpeta temporal y se perderían.",
            exe_dir.display()
        ));
    }
    let portable = exe_dir.join("portable.flag").is_file();
    let datos = if portable {
        exe_dir.join("datos")
    } else {
        appdata
            .ok_or("No se encontró la carpeta de datos del usuario.")?
            .join(IDENTIFICADOR)
    };
    let respaldos = datos.join("respaldos");
    let escenarios = datos.join("escenarios");
    let preparar = || -> std::io::Result<()> {
        std::fs::create_dir_all(&respaldos)?;
        std::fs::create_dir_all(&escenarios)?;
        let prueba = datos.join(".prueba-escritura");
        std::fs::write(&prueba, b"ok")?;
        std::fs::remove_file(prueba)
    };
    preparar().map_err(|e| {
        format!(
            "No se puede escribir en {}. Mueve BoldoAtlas a una carpeta con permiso de escritura (por ejemplo, Documentos) o revisa los permisos de esa carpeta. Detalle: {e}",
            datos.display()
        )
    })?;
    Ok(Rutas {
        bd: datos.join("boldo.db"),
        datos,
        respaldos,
        escenarios,
        portable,
    })
}

/// Dónde están los datos del proyecto abierto y cuánto ocupan; lo muestra «Datos del proyecto».
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InfoProyecto {
    pub portable: bool,
    pub dir_datos: String,
    pub ruta_bd: String,
    /// La base más su registro -wal (SQLite tiene ahí los últimos cambios hasta el siguiente volcado).
    pub bytes: u64,
    /// Última modificación, en milisegundos desde 1970.
    pub modificado: Option<i64>,
}

pub fn info_proyecto(r: &Rutas) -> Result<InfoProyecto, String> {
    let mut wal = r.bd.as_os_str().to_owned();
    wal.push("-wal");
    let metadatos =
        std::fs::metadata(&r.bd).map_err(|e| format!("No se pudo leer {}: {e}", r.bd.display()))?;
    let mut bytes = metadatos.len();
    let mut modificado = metadatos.modified().ok();
    if let Ok(m) = std::fs::metadata(wal) {
        bytes += m.len();
        modificado = modificado.max(m.modified().ok());
    }
    Ok(InfoProyecto {
        portable: r.portable,
        dir_datos: r.datos.display().to_string(),
        ruta_bd: r.bd.display().to_string(),
        bytes,
        modificado: modificado
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .and_then(|d| i64::try_from(d.as_millis()).ok()),
    })
}

/// El Explorador de Windows extrae a `%TEMP%\Temp<N>_<archivo>.zip\` el exe que se abre dentro de un zip.
fn abierto_desde_zip(exe_dir: &Path) -> bool {
    exe_dir.components().any(|c| {
        let nombre = c.as_os_str().to_string_lossy().to_lowercase();
        nombre.starts_with("temp") && nombre.contains('_') && nombre.ends_with(".zip")
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn detecta_exe_abierto_desde_zip() {
        // el Explorador de Windows extrae a %TEMP%\Temp1_<archivo>.zip\ al abrir un exe dentro del zip
        let temp = tempfile::tempdir().unwrap();
        let exe = temp
            .path()
            .join("Temp1_BoldoAtlas_windows_x64_portable.zip");
        fs::create_dir_all(&exe).unwrap();
        fs::write(exe.join("portable.flag"), "").unwrap();
        let err = dir_datos(&exe, None).unwrap_err();
        assert!(err.contains("extráelo primero a una carpeta"), "{err}");
        assert!(!exe.join("datos").exists());
    }

    #[test]
    fn carpeta_programa_windows_es_la_del_exe() {
        // con / para que el test corra igual en los tres sistemas (\ solo separa en Windows)
        let exe = Path::new("C:/Portables/BoldoAtlas/BoldoAtlas.exe");
        assert_eq!(
            carpeta_programa(exe, None),
            Some(PathBuf::from("C:/Portables/BoldoAtlas"))
        );
    }

    #[test]
    fn carpeta_programa_linux_es_la_del_appimage() {
        // el exe corre desde el montaje temporal del AppImage; el flag está junto al .AppImage
        let exe = Path::new("/tmp/.mount_BoldoAxYz/usr/bin/boldo-atlas");
        let appimage = Path::new("/home/ana/pendrive/BoldoAtlas/BoldoAtlas.AppImage");
        assert_eq!(
            carpeta_programa(exe, Some(appimage)),
            Some(PathBuf::from("/home/ana/pendrive/BoldoAtlas"))
        );
        // .deb y .rpm: sin $APPIMAGE, la carpeta del exe (sin flag: modo instalado)
        assert_eq!(
            carpeta_programa(Path::new("/usr/bin/boldo-atlas"), None),
            Some(PathBuf::from("/usr/bin"))
        );
    }

    #[test]
    fn carpeta_programa_macos_es_la_que_contiene_el_app() {
        let exe = Path::new("/Users/ana/BoldoAtlas/BoldoAtlas.app/Contents/MacOS/boldo-atlas");
        assert_eq!(
            carpeta_programa(exe, None),
            Some(PathBuf::from("/Users/ana/BoldoAtlas"))
        );
        // un exe suelto en una carpeta llamada MacOS no es un .app
        let suelto = Path::new("/Users/ana/Contents/MacOS/boldo-atlas");
        assert_eq!(
            carpeta_programa(suelto, None),
            Some(PathBuf::from("/Users/ana/Contents/MacOS"))
        );
    }

    #[test]
    fn dir_datos_rechaza_app_translocada() {
        // macOS abre una copia de solo lectura si el .app tiene cuarentena
        let temp = tempfile::tempdir().unwrap();
        let dir = temp.path().join("AppTranslocation").join("ABCD").join("d");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("portable.flag"), "").unwrap();
        let err = dir_datos(&dir, None).unwrap_err();
        assert!(err.contains("xattr -dr com.apple.quarantine"), "{err}");
        assert!(!dir.join("datos").exists());
    }

    #[test]
    fn entorno_portable_apunta_dentro_de_datos() {
        let datos = Path::new("/p/datos");
        for os in ["windows", "linux", "macos"] {
            let vars = entorno_portable(os, datos);
            assert!(!vars.is_empty(), "{os}");
            for (nombre, ruta) in &vars {
                assert!(ruta.starts_with(datos), "{os} {nombre} {}", ruta.display());
            }
        }
        let nombres = |os| {
            entorno_portable(os, datos)
                .into_iter()
                .map(|(n, _)| n)
                .collect::<Vec<_>>()
        };
        assert_eq!(nombres("windows"), ["TEMP", "TMP"]);
        assert_eq!(
            nombres("linux"),
            ["TMPDIR", "XDG_CACHE_HOME", "XDG_DATA_HOME"]
        );
        assert_eq!(nombres("macos"), ["TMPDIR"]);
    }

    #[test]
    fn dir_datos_portable_usa_carpeta_del_exe() {
        let exe = tempfile::tempdir().unwrap();
        fs::write(exe.path().join("portable.flag"), "").unwrap();
        let r = dir_datos(exe.path(), None).unwrap();
        assert!(r.portable);
        assert_eq!(r.datos, exe.path().join("datos"));
        assert_eq!(r.bd, exe.path().join("datos").join("boldo.db"));
        assert!(r.respaldos.is_dir());
        assert!(r.escenarios.is_dir());
    }

    #[test]
    fn dir_datos_instalado_usa_appdata() {
        let exe = tempfile::tempdir().unwrap();
        let appdata = tempfile::tempdir().unwrap();
        let r = dir_datos(exe.path(), Some(appdata.path())).unwrap();
        assert!(!r.portable);
        assert_eq!(r.datos, appdata.path().join(IDENTIFICADOR));
        assert!(r.respaldos.is_dir());
    }

    #[test]
    fn info_proyecto_suma_la_base_y_su_wal() {
        let exe = tempfile::tempdir().unwrap();
        fs::write(exe.path().join("portable.flag"), "").unwrap();
        let r = dir_datos(exe.path(), None).unwrap();
        fs::write(&r.bd, b"12345").unwrap();
        fs::write(r.datos.join("boldo.db-wal"), b"abc").unwrap();
        let i = info_proyecto(&r).unwrap();
        assert!(i.portable);
        assert_eq!(i.bytes, 8);
        assert_eq!(i.ruta_bd, r.bd.display().to_string());
        assert_eq!(i.dir_datos, r.datos.display().to_string());
        assert!(i.modificado.unwrap() > 1_700_000_000_000);
    }

    #[test]
    fn info_proyecto_sin_wal_y_sin_base() {
        let exe = tempfile::tempdir().unwrap();
        let appdata = tempfile::tempdir().unwrap();
        let r = dir_datos(exe.path(), Some(appdata.path())).unwrap();
        let err = info_proyecto(&r).unwrap_err();
        assert!(err.contains("boldo.db"), "{err}");
        fs::write(&r.bd, b"1234").unwrap();
        let i = info_proyecto(&r).unwrap();
        assert!(!i.portable);
        assert_eq!(i.bytes, 4);
    }

    #[test]
    fn dir_datos_falla_con_mensaje() {
        let exe = tempfile::tempdir().unwrap();
        fs::write(exe.path().join("portable.flag"), "").unwrap();
        fs::write(exe.path().join("datos"), "soy un archivo").unwrap();
        let err = dir_datos(exe.path(), None).unwrap_err();
        assert!(
            err.contains(&exe.path().join("datos").display().to_string()),
            "{err}"
        );
        assert!(err.contains("permiso de escritura"), "{err}");
        assert!(err.contains("Documentos"), "{err}");
    }
}
