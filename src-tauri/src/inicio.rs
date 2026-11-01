//! Inicio con el sistema: lo que muestra y cambia Configuración. Es el mismo valor de
//! `HKCU\...\CurrentVersion\Run` que escribe la casilla del instalador (`instalador/plantilla.nsi`) y que su
//! desinstalador borra; el estado se lee siempre del registro, también si el usuario lo apagó en el Administrador
//! de tareas. Por ahora solo en Windows: en macOS y Linux nadie lo ha probado. La portable no lo ofrece porque
//! escribiría fuera de su carpeta.

use crate::comandos;
use serde::Serialize;
use tauri::{AppHandle, Runtime, State};

/// Con él arranca el sistema la app: abre minimizada (ver `lib.rs`).
pub const ARGUMENTO: &str = "--autostart";

#[cfg(windows)]
mod registro {
    use windows_registry::CURRENT_USER;

    const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    /// Lo que anota el Administrador de tareas al apagar o encender una entrada de Run.
    const APROBADO: &str =
        r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";

    /// El primer byte es impar cuando está apagado (02 y 06 encendido, 03 y 07 apagado).
    pub fn apagado_en_administrador(valor: &[u8]) -> bool {
        valor.first().is_some_and(|b| b & 1 == 1)
    }

    /// Las comillas importan: Run es una línea de comandos y, sin ellas, una ruta con espacios probaría antes
    /// `C:\Users\Ana.exe`.
    pub fn comando(exe: &str) -> String {
        format!("\"{exe}\" {}", super::ARGUMENTO)
    }

    pub fn activo(nombre: &str) -> bool {
        let registrado = CURRENT_USER
            .open(RUN)
            .and_then(|k| k.get_string(nombre))
            .is_ok();
        let apagado = CURRENT_USER
            .open(APROBADO)
            .and_then(|k| k.get_value(nombre))
            .is_ok_and(|v| apagado_en_administrador(&v));
        registrado && !apagado
    }

    fn quitar(clave: &str, nombre: &str) -> Result<(), String> {
        // sin la clave tampoco hay valor que quitar
        let Ok(k) = CURRENT_USER.options().read().write().open(clave) else {
            return Ok(());
        };
        if k.get_value(nombre).is_ok() {
            k.remove_value(nombre).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    /// Queda sin lo que hubiera anotado el Administrador de tareas: la casilla manda.
    pub fn cambiar(nombre: &str, activo: bool) -> Result<(), String> {
        quitar(APROBADO, nombre)?;
        if !activo {
            return quitar(RUN, nombre);
        }
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        CURRENT_USER
            .create(RUN)
            .and_then(|k| k.set_string(nombre, comando(&exe.display().to_string())))
            .map_err(|e| e.to_string())
    }
}

#[cfg(not(windows))]
mod registro {
    pub fn activo(_: &str) -> bool {
        false
    }
    pub fn cambiar(_: &str, _: bool) -> Result<(), String> {
        Err("Solo disponible en Windows.".into())
    }
}

/// Por qué no se ofrece: «sistema» fuera de Windows, «portable» en la portable. Si la app no pudo saber dónde están
/// sus datos, se trata como portable: una abierta desde un zip no debe escribir en el registro.
fn motivo(windows: bool, portable: Option<bool>) -> Option<&'static str> {
    if !windows {
        Some("sistema")
    } else if portable.unwrap_or(true) {
        Some("portable")
    } else {
        None
    }
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InicioSistema {
    activo: bool,
    no_disponible: Option<&'static str>,
}

fn motivo_de(estado: &comandos::Estado) -> Option<&'static str> {
    motivo(cfg!(windows), estado.rutas_app().map(|r| r.portable))
}

#[tauri::command]
pub fn inicio_sistema<R: Runtime>(
    app: AppHandle<R>,
    estado: State<comandos::Estado>,
) -> InicioSistema {
    let no_disponible = motivo_de(&estado);
    InicioSistema {
        activo: no_disponible.is_none() && registro::activo(&app.package_info().name),
        no_disponible,
    }
}

/// Cambia el inicio con el sistema y devuelve cómo quedó de verdad.
#[tauri::command]
pub fn cambiar_inicio_sistema<R: Runtime>(
    app: AppHandle<R>,
    estado: State<comandos::Estado>,
    activo: bool,
) -> Result<InicioSistema, String> {
    if let Some(m) = motivo_de(&estado) {
        return Err(format!("No disponible: {m}"));
    }
    let nombre = &app.package_info().name;
    registro::cambiar(nombre, activo)?;
    Ok(InicioSistema {
        activo: registro::activo(nombre),
        no_disponible: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solo_se_ofrece_instalada_en_windows() {
        assert_eq!(motivo(true, Some(false)), None);
        assert_eq!(motivo(true, Some(true)), Some("portable"));
        // sin saber dónde están los datos, como portable
        assert_eq!(motivo(true, None), Some("portable"));
        assert_eq!(motivo(false, Some(false)), Some("sistema"));
        assert_eq!(motivo(false, Some(true)), Some("sistema"));
    }

    #[cfg(windows)]
    #[test]
    fn la_ruta_va_entre_comillas() {
        assert_eq!(
            registro::comando(r"C:\Users\Ana María\BoldoAtlas\boldo-atlas.exe"),
            r#""C:\Users\Ana María\BoldoAtlas\boldo-atlas.exe" --autostart"#
        );
    }

    #[cfg(windows)]
    #[test]
    fn apagado_en_el_administrador_de_tareas() {
        assert!(!registro::apagado_en_administrador(&[
            2, 0, 0, 0, 0, 0, 0, 0
        ]));
        assert!(!registro::apagado_en_administrador(&[
            6, 0, 0, 0, 0, 0, 0, 0
        ]));
        assert!(registro::apagado_en_administrador(&[
            3, 0, 0, 0, 1, 2, 3, 4
        ]));
        assert!(registro::apagado_en_administrador(&[
            7, 0, 0, 0, 1, 2, 3, 4
        ]));
        assert!(!registro::apagado_en_administrador(&[]));
    }
}
