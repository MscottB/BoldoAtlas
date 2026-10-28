use std::path::{Path, PathBuf};

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
            "No se puede escribir en {}. Si abriste BoldoAtlas desde dentro del .zip, extráelo primero a una carpeta. Detalle: {e}",
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

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
    fn dir_datos_falla_con_mensaje() {
        let exe = tempfile::tempdir().unwrap();
        fs::write(exe.path().join("portable.flag"), "").unwrap();
        fs::write(exe.path().join("datos"), "soy un archivo").unwrap();
        let err = dir_datos(exe.path(), None).unwrap_err();
        assert!(
            err.contains(&exe.path().join("datos").display().to_string()),
            "{err}"
        );
        assert!(err.contains("extráelo primero a una carpeta"), "{err}");
    }
}
