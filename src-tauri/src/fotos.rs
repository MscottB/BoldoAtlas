//! Las fotos de las personas, sin pasar por JSON: el protocolo `foto` las sirve para `<img src>` y dos comandos binarios
//! las leen y las guardan al optimizarlas. La columna guarda solo el base64 (`foto_png` admite PNG, JPEG y WebP).
//! Forma de la URL, que arma `convertFileSrc` en el cliente: `http://foto.localhost/<id>` en Windows y
//! `foto://localhost/<id>` en Linux y macOS.

use crate::comandos::Estado;
use crate::db;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::Deserialize;
use tauri::http::{Method, Response, StatusCode, header};
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager};

pub const ESQUEMA: &str = "foto";

/// Solo un id de persona: letras, números y guiones. Una ruta, un `%` o un id con otra forma no llegan a la base.
fn id_valido(id: &str) -> bool {
    (1..=64).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// El tipo sale de los bytes, nunca de lo que diga el dato guardado: un archivo importado no puede hacer pasar otra cosa
/// (SVG, HTML) por una foto.
fn tipo_de(b: &[u8]) -> Option<&'static str> {
    if b.starts_with(&[0x89, b'P', b'N', b'G']) {
        Some("image/png")
    } else if b.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if b.len() >= 12 && &b[..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

/// Bytes y tipo de lo guardado: solo base64 o, en datos de otra procedencia, un data URL completo.
fn decodificar(guardado: &str) -> Option<(Vec<u8>, &'static str)> {
    let base64 = match guardado.strip_prefix("data:") {
        Some(resto) => resto.split_once(',')?.1,
        None => guardado,
    };
    let bytes = STANDARD.decode(base64).ok()?;
    let tipo = tipo_de(&bytes)?;
    Some((bytes, tipo))
}

/// Sin filtrar por `deleted_at`: «ver a una fecha» muestra también a quienes se eliminaron después.
fn leer(c: &Connection, id: &str) -> Option<(Vec<u8>, &'static str)> {
    if !id_valido(id) {
        return None;
    }
    let guardado: Option<String> = c
        .query_row(
            "SELECT foto_png FROM trabajadores WHERE id = ?1",
            [id],
            |f| f.get(0),
        )
        .optional()
        .ok()??;
    decodificar(&guardado?)
}

fn sin_cuerpo(estado: StatusCode) -> Response<Vec<u8>> {
    let mut r = Response::new(Vec::new());
    *r.status_mut() = estado;
    r
}

/// Sin datos personales en ningún error: ni el id ni el motivo. La URL lleva `?v=<updated_at>`: si la foto cambia, cambia
/// la URL, así que se puede guardar sin caducidad. WebView2 la guarda solo en memoria: medido, no queda copia en su carpeta.
pub fn servir(c: &Connection, metodo: &Method, ruta: &str) -> Response<Vec<u8>> {
    if metodo != Method::GET {
        return sin_cuerpo(StatusCode::METHOD_NOT_ALLOWED);
    }
    let id = ruta.strip_prefix('/').unwrap_or_default();
    if !id_valido(id) {
        return sin_cuerpo(StatusCode::BAD_REQUEST);
    }
    match leer(c, id) {
        Some((bytes, tipo)) => {
            let mut r = Response::new(bytes);
            let h = r.headers_mut();
            h.insert(header::CONTENT_TYPE, header::HeaderValue::from_static(tipo));
            h.insert(
                header::CACHE_CONTROL,
                header::HeaderValue::from_static("private, max-age=31536000, immutable"),
            );
            h.insert(
                header::X_CONTENT_TYPE_OPTIONS,
                header::HeaderValue::from_static("nosniff"),
            );
            r
        }
        None => sin_cuerpo(StatusCode::NOT_FOUND),
    }
}

/// Lo que atiende el protocolo: fuera del hilo principal, como `db_consultar`.
pub fn atender(
    app: AppHandle,
    pedido: tauri::http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    tauri::async_runtime::spawn_blocking(move || {
        let r = app
            .state::<Estado>()
            .con_conexion(|c| Ok::<_, String>(servir(c, pedido.method(), pedido.uri().path())));
        responder.respond(r.unwrap_or_else(|_| sin_cuerpo(StatusCode::SERVICE_UNAVAILABLE)));
    });
}

/// Los bytes de una foto, para optimizarla en la ventana: respuesta binaria, sin JSON.
#[tauri::command]
pub async fn foto_bytes(app: AppHandle, id: String) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<Estado>().con_conexion(|c| {
            leer(c, &id)
                .map(|(bytes, _)| tauri::ipc::Response::new(bytes))
                .ok_or_else(|| "foto_no_disponible".to_string())
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Debug, Deserialize)]
struct FilaLote {
    id: String,
    /// `updated_at` y largo de la foto al leerla: si algo cambió mientras se optimizaba, esa fila no se toca.
    version: String,
    previos: i64,
    largo: usize,
}

#[derive(Debug, Deserialize)]
struct Lote {
    filas: Vec<FilaLote>,
    version_app: String,
}

/// Cuerpo: 4 bytes (u32, little endian) con el largo de la descripción en JSON, la descripción y las imágenes seguidas.
fn desarmar(cuerpo: &[u8]) -> Result<(Lote, &[u8]), String> {
    let invalido = || "lote_invalido".to_string();
    let (largo, resto) = cuerpo.split_first_chunk::<4>().ok_or_else(invalido)?;
    let largo = u32::from_le_bytes(*largo) as usize;
    if largo > resto.len() {
        return Err(invalido());
    }
    let (meta, imagenes) = resto.split_at(largo);
    let lote: Lote = serde_json::from_slice(meta).map_err(|_| invalido())?;
    if lote.filas.iter().map(|f| f.largo).sum::<usize>() != imagenes.len() {
        return Err(invalido());
    }
    Ok((lote, imagenes))
}

/// Un lote, en una transacción. No toca `updated_at`: es la misma foto con menos peso, no un cambio de datos. Si lo tocara,
/// al fusionar con otra copia todas estas personas contarían como lo más reciente y le ganarían a una edición real hecha allá.
/// Devuelve cuántas se escribieron.
fn guardar(c: &mut Connection, cuerpo: &[u8]) -> Result<usize, String> {
    let (lote, mut imagenes) = desarmar(cuerpo)?;
    let tx = c
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let mut escritas = 0;
    for f in &lote.filas {
        let (imagen, resto) = imagenes.split_at(f.largo);
        imagenes = resto;
        if tipo_de(imagen).is_none() {
            return Err("lote_invalido".into());
        }
        escritas += tx
            .execute(
                "UPDATE trabajadores SET foto_png = ?1
                 WHERE id = ?2 AND updated_at = ?3 AND octet_length(foto_png) = ?4",
                params![STANDARD.encode(imagen), f.id, f.version, f.previos],
            )
            .map_err(|e| e.to_string())?;
    }
    if escritas > 0 {
        db::marcar_cambio(&tx, &lote.version_app)?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(escritas)
}

#[tauri::command]
pub async fn fotos_guardar(app: AppHandle, request: Request<'_>) -> Result<usize, String> {
    let InvokeBody::Raw(cuerpo) = request.body() else {
        return Err("lote_invalido".into());
    };
    let cuerpo = cuerpo.clone();
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<Estado>().con_conexion(|c| guardar(c, &cuerpo))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Sin esto, lo que ocupaban las fotos queda como páginas libres y el archivo de la base no baja de tamaño. Con WAL, el
/// VACUUM queda en el -wal: solo el checkpoint recorta el archivo.
fn compactar(c: &Connection) -> rusqlite::Result<()> {
    c.execute_batch("VACUUM")?;
    c.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()))
}

#[tauri::command]
pub async fn fotos_compactar(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<Estado>()
            .con_conexion(|c| compactar(c).map_err(|e| e.to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    const JPEG: &[u8] = &[0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3];

    fn base() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE trabajadores (id TEXT PRIMARY KEY, foto_png TEXT, updated_at TEXT, deleted_at TEXT);
             CREATE TABLE meta (clave TEXT PRIMARY KEY, valor TEXT);
             INSERT INTO meta VALUES ('data_revision', '0');",
        )
        .unwrap();
        c
    }

    fn con_foto(c: &Connection, id: &str, foto: &str) {
        c.execute(
            "INSERT INTO trabajadores (id, foto_png, updated_at) VALUES (?1, ?2, 'v1')",
            [id, foto],
        )
        .unwrap();
    }

    fn lote(filas: &[(&str, &str, i64, &[u8])]) -> Vec<u8> {
        let meta = serde_json::json!({
            "version_app": "1.0",
            "filas": filas.iter().map(|(id, v, p, img)| serde_json::json!(
                { "id": id, "version": v, "previos": p, "largo": img.len() }
            )).collect::<Vec<_>>(),
        })
        .to_string();
        let mut cuerpo = (meta.len() as u32).to_le_bytes().to_vec();
        cuerpo.extend_from_slice(meta.as_bytes());
        for (.., img) in filas {
            cuerpo.extend_from_slice(img);
        }
        cuerpo
    }

    #[test]
    fn sirve_la_foto_con_su_tipo_y_cache_por_version() {
        let c = base();
        con_foto(&c, "ana-1", &STANDARD.encode(JPEG));
        let r = servir(&c, &Method::GET, "/ana-1");
        assert_eq!(r.status(), StatusCode::OK);
        assert_eq!(r.body(), JPEG);
        assert_eq!(r.headers()[header::CONTENT_TYPE], "image/jpeg");
        assert!(
            r.headers()[header::CACHE_CONTROL]
                .to_str()
                .unwrap()
                .contains("immutable")
        );
        assert_eq!(r.headers()[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
    }

    #[test]
    fn tambien_acepta_un_data_url_y_mira_los_bytes_no_el_prefijo() {
        let c = base();
        con_foto(
            &c,
            "dice-png",
            &format!("data:image/png;base64,{}", STANDARD.encode(JPEG)),
        );
        let r = servir(&c, &Method::GET, "/dice-png");
        assert_eq!(r.headers()[header::CONTENT_TYPE], "image/jpeg");
    }

    #[test]
    fn un_id_invalido_no_llega_a_la_base_y_el_error_no_dice_nada() {
        let c = base();
        con_foto(&c, "ana", &STANDARD.encode(JPEG));
        for ruta in [
            "",
            "/",
            "/ana/",
            "/../boldo.db",
            "/..%2Fboldo.db",
            "/ana' OR '1'='1",
            "/ana%00",
            "/a b",
            &format!("/{}", "a".repeat(65)),
        ] {
            let r = servir(&c, &Method::GET, ruta);
            assert_eq!(r.status(), StatusCode::BAD_REQUEST, "{ruta}");
            assert!(r.body().is_empty());
        }
    }

    #[test]
    fn sin_foto_o_con_algo_que_no_es_imagen_no_hay_nada_que_servir() {
        let c = base();
        c.execute(
            "INSERT INTO trabajadores (id, updated_at) VALUES ('sin', 'v1')",
            [],
        )
        .unwrap();
        con_foto(&c, "vacia", "");
        con_foto(&c, "rota", "esto no es base64 !!!");
        con_foto(
            &c,
            "svg",
            &format!(
                "data:image/svg+xml;base64,{}",
                STANDARD.encode("<svg onload='x'/>")
            ),
        );
        for id in ["sin", "vacia", "rota", "svg", "nadie"] {
            let r = servir(&c, &Method::GET, &format!("/{id}"));
            assert_eq!(r.status(), StatusCode::NOT_FOUND, "{id}");
            assert!(r.body().is_empty());
            assert!(r.headers().is_empty());
        }
    }

    #[test]
    fn solo_get() {
        let c = base();
        con_foto(&c, "ana", &STANDARD.encode(JPEG));
        let r = servir(&c, &Method::POST, "/ana");
        assert_eq!(r.status(), StatusCode::METHOD_NOT_ALLOWED);
    }

    #[test]
    fn la_persona_eliminada_sigue_teniendo_foto_para_ver_a_una_fecha() {
        let c = base();
        con_foto(&c, "ida", &STANDARD.encode(JPEG));
        c.execute("UPDATE trabajadores SET deleted_at = 'x'", [])
            .unwrap();
        assert_eq!(servir(&c, &Method::GET, "/ida").status(), StatusCode::OK);
    }

    #[test]
    fn guardar_reemplaza_la_foto_sin_tocar_updated_at() {
        let mut c = base();
        let antes = "x".repeat(10);
        con_foto(&c, "ana", &antes);
        let escritas = guardar(&mut c, &lote(&[("ana", "v1", 10, JPEG)])).unwrap();
        assert_eq!(escritas, 1);
        let (foto, version): (String, String) = c
            .query_row(
                "SELECT foto_png, updated_at FROM trabajadores WHERE id = 'ana'",
                [],
                |f| Ok((f.get(0)?, f.get(1)?)),
            )
            .unwrap();
        assert_eq!(foto, STANDARD.encode(JPEG));
        assert_eq!(version, "v1");
        let revision: String = c
            .query_row(
                "SELECT valor FROM meta WHERE clave = 'data_revision'",
                [],
                |f| f.get(0),
            )
            .unwrap();
        assert_eq!(revision, "1");
    }

    #[test]
    fn guardar_no_pisa_a_quien_cambio_mientras_se_optimizaba() {
        let mut c = base();
        con_foto(&c, "editada", "xxxxxxxxxx");
        con_foto(&c, "otra-foto", "yyyyyyyyyy");
        con_foto(&c, "bien", "zzzzzzzzzz");
        c.execute_batch("UPDATE trabajadores SET updated_at = 'v2' WHERE id = 'editada'; UPDATE trabajadores SET foto_png = 'nueva' WHERE id = 'otra-foto';").unwrap();
        let escritas = guardar(
            &mut c,
            &lote(&[
                ("editada", "v1", 10, JPEG),
                ("otra-foto", "v1", 10, JPEG),
                ("bien", "v1", 10, JPEG),
            ]),
        )
        .unwrap();
        assert_eq!(escritas, 1);
        let foto = |id: &str| -> String {
            c.query_row(
                "SELECT foto_png FROM trabajadores WHERE id = ?1",
                [id],
                |f| f.get(0),
            )
            .unwrap()
        };
        assert_eq!(foto("editada"), "xxxxxxxxxx");
        assert_eq!(foto("otra-foto"), "nueva");
        assert_eq!(foto("bien"), STANDARD.encode(JPEG));
    }

    #[test]
    fn un_lote_mal_armado_o_con_algo_que_no_es_imagen_no_escribe_nada() {
        let mut c = base();
        con_foto(&c, "a", "xxxxxxxxxx");
        con_foto(&c, "b", "yyyyyyyyyy");
        // la primera fila es buena y la segunda no es imagen: se deshace toda la transacción
        assert!(
            guardar(
                &mut c,
                &lote(&[("a", "v1", 10, JPEG), ("b", "v1", 10, b"<svg/>")])
            )
            .is_err()
        );
        let mut sobra = lote(&[("a", "v1", 10, JPEG)]);
        sobra.push(0);
        assert!(guardar(&mut c, &sobra).is_err());
        assert!(guardar(&mut c, &[1, 0]).is_err());
        assert!(guardar(&mut c, &[255, 255, 255, 255, 1]).is_err());
        let foto: String = c
            .query_row(
                "SELECT foto_png FROM trabajadores WHERE id = 'a'",
                [],
                |f| f.get(0),
            )
            .unwrap();
        assert_eq!(foto, "xxxxxxxxxx");
    }

    #[test]
    fn compactar_baja_el_tamano_del_archivo_aun_con_wal() {
        let dir = tempfile::tempdir().unwrap();
        let ruta = dir.path().join("b.db");
        let c = db::abrir(&ruta).unwrap();
        c.execute_batch("CREATE TABLE trabajadores (id TEXT PRIMARY KEY, foto_png TEXT);")
            .unwrap();
        c.execute(
            "INSERT INTO trabajadores VALUES ('a', ?1)",
            ["x".repeat(4_000_000)],
        )
        .unwrap();
        c.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()))
            .unwrap();
        let antes = std::fs::metadata(&ruta).unwrap().len();
        c.execute("UPDATE trabajadores SET foto_png = 'y'", [])
            .unwrap();
        compactar(&c).unwrap();
        assert!(std::fs::metadata(&ruta).unwrap().len() < antes / 10);
    }

    #[test]
    fn un_lote_que_no_escribio_nada_no_cuenta_como_cambio() {
        let mut c = base();
        assert_eq!(
            guardar(&mut c, &lote(&[("nadie", "v1", 10, JPEG)])).unwrap(),
            0
        );
        let revision: String = c
            .query_row(
                "SELECT valor FROM meta WHERE clave = 'data_revision'",
                [],
                |f| f.get(0),
            )
            .unwrap();
        assert_eq!(revision, "0");
    }
}
