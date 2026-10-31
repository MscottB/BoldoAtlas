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

/// Portable si existe `portable.flag` junto al exe; si no, carpeta de la app en APPDATA.
pub fn dir_datos(exe_dir: &Path, appdata: Option<&Path>) -> Result<Rutas, String> {
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
            .ok_or("No se encontró la carpeta APPDATA de Windows.")?
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
