//! Guardar un archivo armado en la ventana (el Excel de src/features/excel y las imágenes de src/features/export): el
//! diálogo nativo y la escritura quedan en Rust, sin permisos de archivos ni de diálogo para la interfaz, que nunca ve
//! ni envía una ruta.

use crate::comandos::{Estado, abrir_carpeta, dialogo_con, nombre_archivo};
use crate::intercambio;
use crate::respaldos::Fallo;
use serde::Deserialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager, State};

/// El último archivo guardado: su carpeta es la que abre «Abrir carpeta».
#[derive(Default)]
pub struct UltimoArchivo(Mutex<Option<PathBuf>>);

#[derive(Debug, Deserialize)]
struct Pedido {
    /// Nombre sugerido en «Guardar como»; quien elige el destino es el usuario.
    nombre: String,
    /// Qué se guarda: solo los tipos de `filtro_de`.
    ext: String,
}

/// Lo único que se guarda, con el nombre que ve el usuario en el filtro del diálogo.
fn filtro_de(ext: &str) -> Option<&'static str> {
    match ext {
        "xlsx" => Some("Excel"),
        "png" => Some("PNG"),
        "jpg" => Some("JPG"),
        "svg" => Some("SVG"),
        _ => None,
    }
}

/// Como `intercambio::con_extension`, pero un `.jpeg` ya escrito vale como `jpg`.
fn con_extension_de(destino: PathBuf, ext: &str) -> Result<PathBuf, Fallo> {
    let es_jpeg = ext == "jpg"
        && destino
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("jpeg"));
    if es_jpeg {
        return Ok(destino);
    }
    intercambio::con_extension(destino, ext)
}

/// Cuerpo: 4 bytes (u32, little endian) con el largo del pedido en JSON, el pedido y el contenido del archivo.
fn desarmar(cuerpo: &[u8]) -> Result<(Pedido, &[u8]), Fallo> {
    let invalido = || Fallo::de("pedido_invalido", "");
    let (largo, resto) = cuerpo.split_first_chunk::<4>().ok_or_else(invalido)?;
    let largo = u32::from_le_bytes(*largo) as usize;
    let (pedido, libro) = resto.split_at_checked(largo).ok_or_else(invalido)?;
    let pedido: Pedido = serde_json::from_slice(pedido).map_err(|_| invalido())?;
    if libro.is_empty() || filtro_de(&pedido.ext).is_none() {
        return Err(invalido());
    }
    Ok((pedido, libro))
}

/// Pasando por un nombre aparte: un corte a mitad nunca deja un archivo a medias con ese nombre. El temporal lleva un id
/// nuevo y se crea con `create_new`: nunca pisa (ni borra al fallar) un archivo que ya estuviera.
fn escribir(destino: &Path, libro: &[u8]) -> Result<(), Fallo> {
    let mut parcial = destino.as_os_str().to_owned();
    parcial.push(format!(".{}.tmp", uuid::Uuid::now_v7().simple()));
    let parcial = PathBuf::from(parcial);
    let mut archivo = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&parcial)?;
    let hecho = archivo.write_all(libro);
    drop(archivo); // cerrado antes de renombrar: Windows no renombra un archivo abierto
    let hecho = hecho.and_then(|_| fs::rename(&parcial, destino));
    if hecho.is_err() {
        let _ = fs::remove_file(&parcial);
    }
    Ok(hecho?)
}

/// Solo el arnés de CI: con `BOLDO_GUARDAR_EN` (que pone él al lanzar la app; la ventana no puede fijar variables del
/// proceso) se guarda ahí, sin «Guardar como». Vale solo en una portable y con una carpeta que ya exista dentro de su
/// `datos/`; fuera de eso se rechaza, no se cae al diálogo. Sin la variable, `Ok(None)`: el diálogo de siempre.
fn destino_de_prueba(
    variable: Option<std::ffi::OsString>,
    rutas: Option<&crate::rutas::Rutas>,
    sugerido: &str,
) -> Result<Option<PathBuf>, Fallo> {
    let Some(variable) = variable else {
        return Ok(None);
    };
    let rechazo = || Fallo::de("destino_de_prueba_invalido", "");
    let rutas = rutas.filter(|r| r.portable).ok_or_else(rechazo)?;
    let carpeta = fs::canonicalize(variable).map_err(|_| rechazo())?;
    let datos = fs::canonicalize(&rutas.datos).map_err(|_| rechazo())?;
    if carpeta == datos || !carpeta.starts_with(&datos) || sugerido.is_empty() {
        return Err(rechazo());
    }
    Ok(Some(carpeta.join(sugerido)))
}

/// Pregunta dónde guardar y escribe el archivo. Devuelve su nombre, o None si no se eligió un lugar.
#[tauri::command]
pub async fn archivo_guardar(
    app: AppHandle,
    request: Request<'_>,
) -> Result<Option<String>, Fallo> {
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
        let de_prueba = destino_de_prueba(
            std::env::var_os("BOLDO_GUARDAR_EN"),
            app.state::<Estado>().rutas_app(),
            &sugerido,
        )?;
        let Some(destino) = de_prueba.or_else(|| {
            dialogo_con(
                &app,
                filtro_de(&pedido.ext).unwrap_or_default(),
                &pedido.ext,
            )
            .set_file_name(sugerido)
            .blocking_save_file()
            .and_then(|f| f.into_path().ok())
        }) else {
            return Ok(None);
        };
        let destino = con_extension_de(destino, &pedido.ext)?;
        escribir(&destino, libro)?;
        let nombre = nombre_archivo(&destino);
        *app.state::<UltimoArchivo>()
            .0
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = Some(destino);
        Ok(Some(nombre))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Abre la carpeta del último archivo guardado.
#[tauri::command]
pub fn archivo_abrir_carpeta(
    app: AppHandle,
    estado: State<Estado>,
    ultimo: State<UltimoArchivo>,
) -> Result<(), Fallo> {
    let carpeta = ultimo
        .0
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .as_deref()
        .and_then(Path::parent)
        .map(Path::to_path_buf)
        .ok_or_else(|| Fallo::de("sin_archivo", ""))?;
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
            r#"{"nombre":"Organización_2026-11-14_r3.xlsx","ext":"xlsx"}"#,
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
            codigo(&cuerpo(r#"{"nombre":"a.xlsx","ext":"xlsx"}"#, b"")),
            "pedido_invalido"
        );
    }

    #[test]
    fn guardar_rechaza_otra_extension() {
        for ext in ["exe", "", "PNG", "xlsx.exe"] {
            let c = cuerpo(&format!(r#"{{"nombre":"a","ext":"{ext}"}}"#), b"x");
            assert_eq!(desarmar(&c).unwrap_err().codigo, "pedido_invalido", "{ext}");
        }
        for ext in ["xlsx", "png", "jpg", "svg"] {
            let c = cuerpo(&format!(r#"{{"nombre":"a","ext":"{ext}"}}"#), b"x");
            assert!(desarmar(&c).is_ok(), "{ext}");
        }
    }

    #[test]
    fn destino_de_prueba_solo_con_la_variable_y_dentro_de_datos() {
        let exe = tempfile::tempdir().unwrap();
        let datos = exe.path().join("datos");
        let dentro = datos.join("imagenes");
        fs::create_dir_all(&dentro).unwrap();
        let rutas = |portable| crate::rutas::Rutas {
            datos: datos.clone(),
            bd: datos.join("boldo.db"),
            respaldos: datos.join("respaldos"),
            escenarios: datos.join("escenarios"),
            portable,
        };
        let con = |v: &Path, r: Option<&crate::rutas::Rutas>| {
            destino_de_prueba(Some(v.as_os_str().to_owned()), r, "a.svg")
        };
        // sin la variable: el diálogo de siempre
        assert_eq!(
            destino_de_prueba(None, Some(&rutas(true)), "a.svg").unwrap(),
            None
        );
        assert_eq!(destino_de_prueba(None, None, "a.svg").unwrap(), None);
        // dentro de datos/ de una portable: se guarda ahí
        let ok = con(&dentro, Some(&rutas(true))).unwrap().unwrap();
        assert_eq!(ok.file_name().unwrap(), "a.svg");
        assert!(ok.starts_with(fs::canonicalize(&dentro).unwrap()));
        // fuera, la propia datos/, una carpeta que no existe, una instalada o sin rutas: se rechaza
        let fuera = tempfile::tempdir().unwrap();
        for (v, r) in [
            (fuera.path(), Some(rutas(true))),
            (datos.as_path(), Some(rutas(true))),
            (&datos.join("falta"), Some(rutas(true))),
            (&dentro.join("..").join(".."), Some(rutas(true))),
            (dentro.as_path(), Some(rutas(false))),
            (dentro.as_path(), None),
        ] {
            let e = con(v, r.as_ref()).unwrap_err();
            assert_eq!(e.codigo, "destino_de_prueba_invalido", "{v:?}");
        }
    }

    #[test]
    fn guardar_deja_un_jpeg_como_jpg() {
        let d = tempfile::tempdir().unwrap();
        let jpeg = con_extension_de(d.path().join("x.JPEG"), "jpg").unwrap();
        assert_eq!(jpeg.file_name().unwrap(), "x.JPEG");
        let otro = con_extension_de(d.path().join("x.png"), "jpg").unwrap();
        assert_eq!(otro.file_name().unwrap(), "x.png.jpg");
    }

    #[test]
    fn guardar_corrige_la_extension() {
        let d = tempfile::tempdir().unwrap();
        let destino = intercambio::con_extension(d.path().join("a.svg"), "png").unwrap();
        assert_eq!(destino.file_name().unwrap(), "a.svg.png");
        // ya con la extensión (en cualquier caso): se deja como está
        let ya = intercambio::con_extension(d.path().join("b.PNG"), "png").unwrap();
        assert_eq!(ya.file_name().unwrap(), "b.PNG");
    }

    /// Lo que hay en la carpeta, sin contar `destino`.
    fn otros(d: &Path) -> Vec<String> {
        let mut v: Vec<String> = fs::read_dir(d)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        v.sort();
        v
    }

    #[test]
    fn escribe_sin_dejar_el_temporal_y_pisa_lo_que_el_dialogo_pregunto() {
        let d = tempfile::tempdir().unwrap();
        let destino = d.path().join("lista.xlsx");
        fs::write(&destino, "anterior").unwrap();
        escribir(&destino, b"nuevo").unwrap();
        assert_eq!(fs::read(&destino).unwrap(), b"nuevo");
        assert_eq!(otros(d.path()), ["lista.xlsx"]);
    }

    #[test]
    fn no_toca_un_archivo_del_usuario_con_el_nombre_del_temporal() {
        let d = tempfile::tempdir().unwrap();
        let destino = d.path().join("lista.xlsx");
        let suyo = d.path().join("lista.xlsx.tmp");
        fs::write(&suyo, "del usuario").unwrap();
        escribir(&destino, b"nuevo").unwrap();
        assert_eq!(fs::read(&suyo).unwrap(), b"del usuario");
        assert_eq!(fs::read(&destino).unwrap(), b"nuevo");
        assert_eq!(otros(d.path()), ["lista.xlsx", "lista.xlsx.tmp"]);
    }

    #[test]
    fn si_falla_al_renombrar_borra_el_temporal_y_deja_el_destino_como_estaba() {
        // el temporal se escribe bien, pero en el destino hay una carpeta: renombrar falla
        let d = tempfile::tempdir().unwrap();
        let destino = d.path().join("lista.xlsx");
        fs::create_dir(&destino).unwrap();
        assert!(escribir(&destino, b"x").is_err());
        assert!(destino.is_dir());
        assert_eq!(otros(d.path()), ["lista.xlsx"]);
    }
}
