//! Guardar un Excel armado en la ventana (src/features/excel): el diálogo nativo y la escritura quedan en Rust, sin
//! permisos de archivos ni de diálogo para la interfaz, que nunca ve ni envía una ruta.

use crate::comandos::{Estado, abrir_carpeta, dialogo_con, nombre_archivo};
use crate::intercambio;
use crate::respaldos::Fallo;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager, State};

/// El último Excel guardado: su carpeta es la que abre «Abrir carpeta».
#[derive(Default)]
pub struct UltimoExcel(Mutex<Option<PathBuf>>);

#[derive(Debug, Deserialize)]
struct Pedido {
    /// Nombre sugerido en «Guardar como»; quien elige el destino es el usuario.
    nombre: String,
}

/// Cuerpo: 4 bytes (u32, little endian) con el largo del pedido en JSON, el pedido y el libro.
fn desarmar(cuerpo: &[u8]) -> Result<(Pedido, &[u8]), Fallo> {
    let invalido = || Fallo::de("pedido_invalido", "");
    let (largo, resto) = cuerpo.split_first_chunk::<4>().ok_or_else(invalido)?;
    let largo = u32::from_le_bytes(*largo) as usize;
    let (pedido, libro) = resto.split_at_checked(largo).ok_or_else(invalido)?;
    let pedido: Pedido = serde_json::from_slice(pedido).map_err(|_| invalido())?;
    if libro.is_empty() {
        return Err(invalido());
    }
    Ok((pedido, libro))
}

/// Pasando por un nombre aparte: un corte a mitad nunca deja un Excel a medias con ese nombre.
fn escribir(destino: &Path, libro: &[u8]) -> Result<(), Fallo> {
    let mut parcial = destino.as_os_str().to_owned();
    parcial.push(".tmp");
    let parcial = PathBuf::from(parcial);
    let hecho = fs::write(&parcial, libro).and_then(|_| fs::rename(&parcial, destino));
    if hecho.is_err() {
        let _ = fs::remove_file(&parcial);
    }
    Ok(hecho?)
}

/// Pregunta dónde guardar y escribe el libro. Devuelve el nombre del archivo, o None si no se eligió un lugar.
#[tauri::command]
pub async fn excel_guardar(app: AppHandle, request: Request<'_>) -> Result<Option<String>, Fallo> {
    let InvokeBody::Raw(cuerpo) = request.body() else {
        return Err(Fallo::de("pedido_invalido", ""));
    };
    let cuerpo = cuerpo.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (pedido, libro) = desarmar(&cuerpo)?;
        // solo el nombre: lo que venga con carpetas no elige dónde se abre el diálogo
        let sugerido = Path::new(&pedido.nombre)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let Some(destino) = dialogo_con(&app, "Excel", "xlsx")
            .set_file_name(sugerido)
            .blocking_save_file()
            .and_then(|f| f.into_path().ok())
        else {
            return Ok(None);
        };
        let destino = intercambio::con_extension(destino, "xlsx")?;
        escribir(&destino, libro)?;
        let nombre = nombre_archivo(&destino);
        *app.state::<UltimoExcel>()
            .0
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = Some(destino);
        Ok(Some(nombre))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Abre la carpeta del último Excel guardado.
#[tauri::command]
pub fn excel_abrir_carpeta(
    app: AppHandle,
    estado: State<Estado>,
    ultimo: State<UltimoExcel>,
) -> Result<(), Fallo> {
    let carpeta = ultimo
        .0
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .as_deref()
        .and_then(Path::parent)
        .map(Path::to_path_buf)
        .ok_or_else(|| Fallo::de("sin_excel", ""))?;
    abrir_carpeta(&app, estado.rutas()?, &carpeta)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cuerpo(pedido: &str, libro: &[u8]) -> Vec<u8> {
        let mut c = (pedido.len() as u32).to_le_bytes().to_vec();
        c.extend_from_slice(pedido.as_bytes());
        c.extend_from_slice(libro);
        c
    }

    #[test]
    fn desarma_el_pedido_y_el_libro() {
        let c = cuerpo(
            r#"{"nombre":"Organización_2026-11-14_r3.xlsx"}"#,
            b"PK\x03\x04",
        );
        let (p, libro) = desarmar(&c).unwrap();
        assert_eq!(p.nombre, "Organización_2026-11-14_r3.xlsx");
        assert_eq!(libro, b"PK\x03\x04");
    }

    #[test]
    fn rechaza_un_cuerpo_mal_armado() {
        let codigo = |c: &[u8]| desarmar(c).unwrap_err().codigo;
        assert_eq!(codigo(&[1, 0]), "pedido_invalido");
        // el largo dice más de lo que hay: sin desbordar
        assert_eq!(codigo(&[255, 255, 255, 255, b'{']), "pedido_invalido");
        assert_eq!(codigo(&cuerpo("no es json", b"PK")), "pedido_invalido");
        assert_eq!(
            codigo(&cuerpo(r#"{"nombre":"a.xlsx"}"#, b"")),
            "pedido_invalido"
        );
    }

    #[test]
    fn escribe_sin_dejar_el_temporal_y_pisa_lo_que_el_dialogo_pregunto() {
        let d = tempfile::tempdir().unwrap();
        let destino = d.path().join("lista.xlsx");
        fs::write(&destino, "anterior").unwrap();
        escribir(&destino, b"nuevo").unwrap();
        assert_eq!(fs::read(&destino).unwrap(), b"nuevo");
        assert!(!d.path().join("lista.xlsx.tmp").exists());
    }

    #[test]
    fn un_fallo_al_escribir_no_deja_nada() {
        let d = tempfile::tempdir().unwrap();
        let destino = d.path().join("no-existe").join("lista.xlsx");
        assert!(escribir(&destino, b"x").is_err());
        assert!(!destino.exists());
    }
}
