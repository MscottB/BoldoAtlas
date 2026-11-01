//! Inicio con el sistema: lo que muestra y cambia Configuración. En Windows es el mismo valor de
//! `HKCU\...\CurrentVersion\Run` que escribe la casilla del instalador (`instalador/plantilla.nsi`) y que su
//! desinstalador borra; el estado se lee siempre del sistema, también si el usuario lo apagó en el Administrador
//! de tareas. La portable no lo ofrece: escribiría fuera de su carpeta.

use crate::{actualizar, comandos};
use auto_launch::{AutoLaunch, AutoLaunchBuilder};
use serde::Serialize;
use tauri::{AppHandle, Runtime, State};

/// Con él arranca el sistema la app: abre minimizada (ver `lib.rs`).
pub const ARGUMENTO: &str = "--autostart";

/// Qué se registra para arrancar. El Run de Windows es una línea de comandos: sin comillas, una ruta con espacios
/// probaría antes `C:\Users\Ana.exe`. Un AppImage se registra él mismo: su exe vive en un montaje temporal.
fn ruta_programa(os: &str, exe: &str, appimage: Option<&str>) -> String {
    match (os, appimage) {
        ("windows", _) => format!("\"{exe}\""),
        (_, Some(a)) => a.to_string(),
        _ => exe.to_string(),
    }
}

fn lanzador<R: Runtime>(app: &AppHandle<R>) -> Result<AutoLaunch, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let appimage = std::env::var("APPIMAGE")
        .ok()
        .filter(|_| actualizar::es_appimage());
    let mut b = AutoLaunchBuilder::new();
    b.set_app_name(&app.package_info().name)
        .set_app_path(&ruta_programa(
            std::env::consts::OS,
            &exe.display().to_string(),
            appimage.as_deref(),
        ))
        .set_args(&[ARGUMENTO]);
    // solo este usuario, también si la app corre elevada: es donde mira el desinstalador
    #[cfg(windows)]
    b.set_windows_enable_mode(auto_launch::WindowsEnableMode::CurrentUser);
    b.build().map_err(|e| e.to_string())
}

#[derive(Debug, PartialEq, Serialize)]
pub struct InicioSistema {
    disponible: bool,
    activo: bool,
}

fn portable(estado: &comandos::Estado) -> bool {
    estado.rutas_app().is_some_and(|r| r.portable)
}

#[tauri::command]
pub fn inicio_sistema<R: Runtime>(
    app: AppHandle<R>,
    estado: State<comandos::Estado>,
) -> Result<InicioSistema, String> {
    if portable(&estado) {
        return Ok(InicioSistema {
            disponible: false,
            activo: false,
        });
    }
    let activo = lanzador(&app)?.is_enabled().map_err(|e| e.to_string())?;
    Ok(InicioSistema {
        disponible: true,
        activo,
    })
}

/// Cambia el inicio con el sistema y devuelve cómo quedó de verdad.
#[tauri::command]
pub fn cambiar_inicio_sistema<R: Runtime>(
    app: AppHandle<R>,
    estado: State<comandos::Estado>,
    activo: bool,
) -> Result<InicioSistema, String> {
    if portable(&estado) {
        return Err("La versión portable no se inicia con el sistema.".into());
    }
    let l = lanzador(&app)?;
    if activo { l.enable() } else { l.disable() }.map_err(|e| e.to_string())?;
    Ok(InicioSistema {
        disponible: true,
        activo: l.is_enabled().map_err(|e| e.to_string())?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn en_windows_va_entre_comillas() {
        assert_eq!(
            ruta_programa(
                "windows",
                r"C:\Users\Ana María\BoldoAtlas\boldo-atlas.exe",
                None
            ),
            r#""C:\Users\Ana María\BoldoAtlas\boldo-atlas.exe""#
        );
    }

    #[test]
    fn appimage_se_registra_a_si_mismo() {
        let exe = "/tmp/.mount_BoldoAx/usr/bin/boldo-atlas";
        let appimage = Some("/home/ana/BoldoAtlas.AppImage");
        assert_eq!(
            ruta_programa("linux", exe, appimage),
            "/home/ana/BoldoAtlas.AppImage"
        );
        assert_eq!(
            ruta_programa("linux", "/usr/bin/boldo-atlas", None),
            "/usr/bin/boldo-atlas"
        );
    }
}
