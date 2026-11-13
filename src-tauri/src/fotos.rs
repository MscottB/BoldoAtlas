//! Las fotos de las personas, sin pasar por JSON: el protocolo `foto` las sirve para `<img src>` y dos comandos binarios
//! las leen y las guardan al optimizarlas. La columna guarda solo el base64 (`foto_png` admite PNG, JPEG y WebP).
//! Forma de la URL, que arma `convertFileSrc` en el cliente: `http://foto.localhost/<baseId>/<id>` en Windows y
//! `foto://localhost/<baseId>/<id>` en Linux y macOS.

use crate::comandos::Estado;
use crate::db;
use crate::lado::{Lado, leer_en};
use crate::organizaciones::{OTRA_BASE, es_id_valido};
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

/// Sin datos personales en ningún error: ni el id ni el motivo. La URL lleva `?v=<updated_at>`: al editar una foto cambia la
/// URL, así que se puede guardar sin caducidad. Optimizar no toca `updated_at`: hasta reiniciar puede verse la copia anterior
/// en memoria, que es la misma imagen. En WebView2 no quedó copia en su carpeta (60 fotos); en WebKit no está comprobado.
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

/// La ruta es `/<baseId>/<id>`. Solo responde con los datos de la base abierta o de la de al lado: la foto de otra base es un
/// 404 (sin `Cache-Control`, para que nada de ella quede guardado) y sin base abierta, un 503.
pub fn respuesta_de(
    estado: &Estado,
    lado: &Lado,
    metodo: &Method,
    ruta: &str,
) -> Response<Vec<u8>> {
    if metodo != Method::GET {
        return sin_cuerpo(StatusCode::METHOD_NOT_ALLOWED);
    }
    let Some((base_id, id)) = ruta.strip_prefix('/').and_then(|r| r.split_once('/')) else {
        return sin_cuerpo(StatusCode::BAD_REQUEST);
    };
    if !es_id_valido(base_id) {
        return sin_cuerpo(StatusCode::BAD_REQUEST);
    }
    // `servir` quiere `/<id>` y revisa que sea solo un id
    let r = leer_en(estado, lado, base_id, |c| {
        Ok(servir(c, metodo, &format!("/{id}")))
    });
    match r {
        Ok(r) => r,
        Err(e) if e == OTRA_BASE => sin_cuerpo(StatusCode::NOT_FOUND),
        Err(_) => sin_cuerpo(StatusCode::SERVICE_UNAVAILABLE),
    }
}

/// Lo que atiende el protocolo: fuera del hilo principal, como `db_consultar`.
pub fn atender(
    app: AppHandle,
    pedido: tauri::http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    tauri::async_runtime::spawn_blocking(move || {
        responder.respond(respuesta_de(
            &app.state::<Estado>(),
            &app.state::<Lado>(),
            pedido.method(),
            pedido.uri().path(),
        ));
    });
}

/// Los bytes de una foto, para optimizarla en la ventana: respuesta binaria, sin JSON.
#[tauri::command]
pub async fn foto_bytes(
    app: AppHandle,
    base_id: String,
    id: String,
) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<Estado>().con_conexion(&base_id, |c| {
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
    base_id: String,
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
    // sin desbordar: con panic = "abort", un largo enorme cerraría la app
    let suma = lote
        .filas
        .iter()
        .try_fold(0usize, |s, f| s.checked_add(f.largo));
    if suma != Some(imagenes.len()) {
        return Err(invalido());
    }
    Ok((lote, imagenes))
}

/// Un lote, en una transacción. No toca `updated_at`: es la misma foto con menos peso, no un cambio de datos. Si lo tocara,
/// al fusionar con otra copia todas estas personas contarían como lo más reciente y le ganarían a una edición real hecha allá.
/// Devuelve cuántas se escribieron.
fn escribir_lote(c: &mut Connection, lote: &Lote, mut imagenes: &[u8]) -> Result<usize, String> {
    let tx = c
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let mut escritas = 0;
    for f in &lote.filas {
        let (imagen, resto) = imagenes.split_at_checked(f.largo).ok_or("lote_invalido")?;
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

/// La base va en el cuerpo porque el comando recibe bytes, no argumentos.
fn guardar_lote(estado: &Estado, cuerpo: &[u8]) -> Result<usize, String> {
    let (lote, imagenes) = desarmar(cuerpo)?;
    estado.con_conexion(&lote.base_id, |c| escribir_lote(c, &lote, imagenes))
}

#[tauri::command]
pub async fn fotos_guardar(app: AppHandle, request: Request<'_>) -> Result<usize, String> {
    let InvokeBody::Raw(cuerpo) = request.body() else {
        return Err("lote_invalido".into());
    };
    let cuerpo = cuerpo.clone();
    tauri::async_runtime::spawn_blocking(move || guardar_lote(&app.state::<Estado>(), &cuerpo))
        .await
        .map_err(|e| e.to_string())?
}

/// Sin esto, lo que ocupaban las fotos queda como páginas libres y el archivo de la base no baja de tamaño. Con WAL, el
/// VACUUM queda en el -wal: solo el checkpoint recorta el archivo.
fn compactar(c: &Connection) -> rusqlite::Result<()> {
    c.execute_batch("VACUUM")?;
    c.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()))
}

/// Solo en la abierta: con el id de la de al lado da `otra_base`.
fn compactar_en(estado: &Estado, base_id: &str) -> Result<(), String> {
    estado.con_conexion(base_id, |c| compactar(c).map_err(|e| e.to_string()))
}

#[tauri::command]
pub async fn fotos_compactar(app: AppHandle, base_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || compactar_en(&app.state::<Estado>(), &base_id))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organizaciones::Base;

    const JPEG: &[u8] = &[0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3];

    /// Lo mismo que `guardar_lote`, sin pasar por el seguro: estas pruebas miran solo la escritura.
    fn guardar(c: &mut Connection, cuerpo: &[u8]) -> Result<usize, String> {
        let (lote, imagenes) = desarmar(cuerpo)?;
        escribir_lote(c, &lote, imagenes)
    }

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
        lote_de("A", filas)
    }

    fn lote_de(base_id: &str, filas: &[(&str, &str, i64, &[u8])]) -> Vec<u8> {
        let meta = serde_json::json!({
            "base_id": base_id,
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
    fn un_lote_con_otra_base_no_escribe() {
        let dir = tempfile::tempdir().unwrap();
        let c = base();
        con_foto(&c, "ana", "xxxxxxxxxx");
        let abierta = Base {
            id: "B".into(),
            bd: dir.path().join("b.db"),
            respaldos: dir.path().to_path_buf(),
        };
        let e = Estado::de_prueba(Some(c), Some(abierta), None);
        // el lote dice «A» y está abierta «B»
        let cuerpo = lote(&[("ana", "v1", 10, JPEG)]);
        assert_eq!(guardar_lote(&e, &cuerpo).unwrap_err(), "otra_base");
        let foto: String = e
            .con_conexion("B", |c| {
                c.query_row("SELECT foto_png FROM trabajadores", [], |f| f.get(0))
                    .map_err(|x| x.to_string())
            })
            .unwrap();
        assert_eq!(foto, "xxxxxxxxxx");
        // un cuerpo mal armado sigue siendo eso
        assert_eq!(guardar_lote(&e, &[1, 0]).unwrap_err(), "lote_invalido");
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

    const BASE_A: &str = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
    const BASE_B: &str = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c";

    /// Una base abierta con id `BASE_A` y la foto de `ana`; con `abierta` en falso, sin base abierta.
    fn estado_con_foto(abierta: bool) -> Estado {
        let c = base();
        con_foto(&c, "ana", &STANDARD.encode(JPEG));
        let base = abierta.then(|| Base {
            id: BASE_A.into(),
            bd: Default::default(),
            respaldos: Default::default(),
        });
        Estado::de_prueba(abierta.then_some(c), base, None)
    }

    #[test]
    fn foto_con_su_base_se_sirve() {
        let e = estado_con_foto(true);
        let r = respuesta_de(
            &e,
            &Lado::default(),
            &Method::GET,
            &format!("/{BASE_A}/ana"),
        );
        assert_eq!(r.status(), StatusCode::OK);
        assert_eq!(r.body().as_slice(), JPEG);
        assert!(
            r.headers()[header::CACHE_CONTROL]
                .to_str()
                .unwrap()
                .contains("immutable")
        );
    }

    #[test]
    fn foto_de_a_con_b_abierta_da_404() {
        let e = estado_con_foto(true);
        let r = respuesta_de(
            &e,
            &Lado::default(),
            &Method::GET,
            &format!("/{BASE_B}/ana"),
        );
        assert_eq!(r.status(), StatusCode::NOT_FOUND);
        assert!(r.body().is_empty());
        assert!(r.headers().get(header::CACHE_CONTROL).is_none());
    }

    #[test]
    fn ruta_sin_base_da_400() {
        let e = estado_con_foto(true);
        for ruta in [
            "/ana",
            "/",
            "",
            "/../x/ana",
            "/a/b/c",
            &format!("/{BASE_A}"),
        ] {
            let r = respuesta_de(&e, &Lado::default(), &Method::GET, ruta);
            assert_eq!(r.status(), StatusCode::BAD_REQUEST, "{ruta}");
            assert!(r.body().is_empty());
        }
        // la base va bien, el resto no es un id
        let r = respuesta_de(
            &e,
            &Lado::default(),
            &Method::GET,
            &format!("/{BASE_A}/ana/otro"),
        );
        assert_eq!(r.status(), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn con_la_base_cerrada_da_503() {
        let e = estado_con_foto(false);
        let r = respuesta_de(
            &e,
            &Lado::default(),
            &Method::GET,
            &format!("/{BASE_A}/ana"),
        );
        assert_eq!(r.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert!(r.body().is_empty());
    }

    #[test]
    fn la_ruta_con_base_tambien_es_solo_get() {
        let e = estado_con_foto(true);
        let r = respuesta_de(
            &e,
            &Lado::default(),
            &Method::POST,
            &format!("/{BASE_A}/ana"),
        );
        assert_eq!(r.status(), StatusCode::METHOD_NOT_ALLOWED);
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
    fn largos_que_desbordan_o_no_caben_no_cierran_la_app() {
        let mut c = base();
        con_foto(&c, "a", "xxxxxxxxxx");
        let armar = |largos: &[usize], imagenes: &[u8]| {
            let filas: Vec<_> = largos
                .iter()
                .map(|l| serde_json::json!({ "id": "a", "version": "v1", "previos": 10, "largo": l }))
                .collect();
            let meta = serde_json::json!({ "base_id": "A", "version_app": "1", "filas": filas })
                .to_string();
            let mut cuerpo = (meta.len() as u32).to_le_bytes().to_vec();
            cuerpo.extend_from_slice(meta.as_bytes());
            cuerpo.extend_from_slice(imagenes);
            cuerpo
        };
        // la suma da la vuelta y coincide con lo que hay: sin `checked_add` pasaría y `split_at` entraría en pánico
        let cuerpo = armar(&[usize::MAX, 8], JPEG);
        assert_eq!(guardar(&mut c, &cuerpo).unwrap_err(), "lote_invalido");
        let cuerpo = armar(&[usize::MAX], JPEG);
        assert_eq!(guardar(&mut c, &cuerpo).unwrap_err(), "lote_invalido");
    }

    const FECHA: &str = "2026-11-01T12:00:00.000Z";

    /// B con la foto de `ana`, que no está en A ni en C.
    fn tres_con_foto() -> crate::lado::prueba::Tres {
        crate::lado::prueba::tres(&format!(
            "INSERT INTO trabajadores (id, nombre, foto_png, created_at, updated_at)
             VALUES ('ana', 'Ana', '{}', '{FECHA}', '{FECHA}');",
            STANDARD.encode(JPEG)
        ))
    }

    #[test]
    fn foto_del_lado_se_sirve_y_la_de_otra_base_da_404() {
        let d = tres_con_foto();
        d.abrir_lado();
        let pedir = |base: &str| respuesta_de(&d.e, &d.lado, &Method::GET, &format!("/{base}/ana"));
        let r = pedir(&d.b.id);
        assert_eq!(r.status(), StatusCode::OK);
        assert_eq!(r.body().as_slice(), JPEG);
        for otra in [&d.c.id, &d.a.id] {
            let r = pedir(otra);
            assert_eq!(r.status(), StatusCode::NOT_FOUND, "{otra}");
            assert!(r.headers().get(header::CACHE_CONTROL).is_none());
        }
        d.lado.cerrar();
        assert_eq!(pedir(&d.b.id).status(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn lado_no_escribe() {
        let d = tres_con_foto();
        let bd = crate::organizaciones::ruta_de(&d.r, &d.b);
        let (antes, fecha) = (
            std::fs::read(&bd).unwrap(),
            std::fs::metadata(&bd).unwrap().modified().unwrap(),
        );
        d.abrir_lado();
        let id = d.b.id.as_str();
        // `db_lote`, `fotos_guardar` y `fotos_compactar` solo pasan por la abierta
        let lote_bd = crate::comandos::db_lote_en(&d.e, id, &[], "t");
        assert_eq!(lote_bd.unwrap_err(), "otra_base");
        let cuerpo = lote_de(id, &[("ana", FECHA, 10, JPEG)]);
        assert_eq!(guardar_lote(&d.e, &cuerpo).unwrap_err(), "otra_base");
        assert_eq!(compactar_en(&d.e, id).unwrap_err(), "otra_base");
        // `db_consultar` sí llega al lado, y ahí nada escribe
        let insertar = "INSERT INTO meta (clave, valor) VALUES ('x', 'y')";
        let consultada =
            crate::lado::leer_en(&d.e, &d.lado, id, |c| db::consultar(c, insertar, &[]));
        assert!(consultada.is_err());
        let solo_consulta = d.lado.con_lectura(id, |c| {
            assert!(c.execute(insertar, []).is_err());
            c.pragma_query_value(None, "query_only", |f| f.get::<_, i64>(0))
                .map_err(|e| e.to_string())
        });
        assert_eq!(solo_consulta.unwrap(), 1);
        d.lado.cerrar();
        assert_eq!(std::fs::read(&bd).unwrap(), antes);
        assert_eq!(std::fs::metadata(&bd).unwrap().modified().unwrap(), fecha);
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
