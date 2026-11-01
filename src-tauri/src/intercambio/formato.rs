//! Archivo `.boldo`: cabecera en claro y contenido cifrado por bloques.
//!
//! `BOLDO` · versión (1) · memoria, pasadas e hilos de Argon2id (u32 LE) · sal (16) · nonce (19) · bloques.
//! Cada bloque es XChaCha20-Poly1305 con la construcción STREAM: nonce = los 19 de la cabecera + contador (u32 BE) +
//! 1 si es el último. La cabecera entera va como dato autenticado: cambiar, quitar o reordenar cualquier byte falla.
use crate::respaldos::Fallo;
use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;

const MAGIA: &[u8; 5] = b"BOLDO";
const VERSION_FORMATO: u8 = 1;
const SAL: usize = 16;
const PREFIJO_NONCE: usize = 19;
const CABECERA: usize = MAGIA.len() + 1 + 12 + SAL + PREFIJO_NONCE;
const BLOQUE: usize = 1 << 20;
const ETIQUETA: usize = 16;
const MEMORIA_KIB: u32 = 64 * 1024;
const PASADAS: u32 = 3;
const HILOS: u32 = 1;
/// Tope del archivo: se comprueba antes de leerlo o de derivar la clave.
pub const MAX_ARCHIVO: u64 = 2 << 30;
/// 20 caracteres de 30 posibles, unos 98 bits. Crockford base32 sin 0 ni 1 (que ya no trae O, I ni L).
const ALFABETO: &[u8; 30] = b"23456789ABCDEFGHJKMNPQRSTVWXYZ";
const LARGO_CODIGO: usize = 20;

/// Un solo mensaje para código incorrecto, archivo alterado o que no es un `.boldo`.
fn no_abre() -> Fallo {
    Fallo::de("no_abre", "")
}

/// Código de un solo uso, en grupos de 4. Nunca se guarda ni se escribe en un registro.
pub fn generar_codigo() -> Result<String, Fallo> {
    let mut codigo = String::with_capacity(LARGO_CODIGO + 4);
    let mut azar = [0u8; 64];
    let mut n = 0;
    while n < LARGO_CODIGO {
        getrandom::fill(&mut azar).map_err(|e| Fallo::de("fallo", e))?;
        // 240 = 30 * 8: se descarta lo demás para que todos los caracteres sean igual de probables
        for b in azar.iter().filter(|b| **b < 240) {
            if n == LARGO_CODIGO {
                break;
            }
            if n > 0 && n % 4 == 0 {
                codigo.push('-');
            }
            codigo.push(ALFABETO[*b as usize % 30] as char);
            n += 1;
        }
    }
    Ok(codigo)
}

/// El código tal como lo escriben o lo pegan: sin importar mayúsculas ni lo que no sea letra o número.
fn normalizar(codigo: &str) -> Option<String> {
    let limpio: String = codigo
        .chars()
        .filter(|c| c.is_alphanumeric())
        .map(|c| c.to_ascii_uppercase())
        .collect();
    (limpio.len() == LARGO_CODIGO && limpio.bytes().all(|b| ALFABETO.contains(&b)))
        .then_some(limpio)
}

fn cifrador(codigo: &str, sal: &[u8], m: u32, t: u32, p: u32) -> Result<XChaCha20Poly1305, Fallo> {
    let params = Params::new(m, t, p, Some(32)).map_err(|_| no_abre())?;
    let mut clave = [0u8; 32];
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(codigo.as_bytes(), sal, &mut clave)
        .map_err(|_| no_abre())?;
    XChaCha20Poly1305::new_from_slice(&clave).map_err(|_| no_abre())
}

fn nonce(prefijo: &[u8], contador: u32, ultimo: bool) -> XNonce {
    let mut n = [0u8; 24];
    n[..PREFIJO_NONCE].copy_from_slice(prefijo);
    n[PREFIJO_NONCE..23].copy_from_slice(&contador.to_be_bytes());
    n[23] = u8::from(ultimo);
    n.into()
}

/// Tamaño del `.boldo` para un contenido de `bytes`.
pub fn tamano_cifrado(bytes: u64) -> u64 {
    CABECERA as u64 + (bytes.div_ceil(BLOQUE as u64).max(1)) * ETIQUETA as u64 + bytes
}

/// `seguir(hecho, total)` informa el avance; si devuelve false, se detiene con el fallo `cancelado`.
pub fn cifrar(
    origen: &Path,
    destino: &Path,
    codigo: &str,
    mut seguir: impl FnMut(u64, u64) -> bool,
) -> Result<(), Fallo> {
    let total = fs::metadata(origen)?.len();
    if tamano_cifrado(total) > MAX_ARCHIVO {
        return Err(Fallo::de("muy_grande", ""));
    }
    let mut azar = [0u8; SAL + PREFIJO_NONCE];
    getrandom::fill(&mut azar).map_err(|e| Fallo::de("fallo", e))?;
    let (sal, prefijo) = azar.split_at(SAL);

    let mut cabecera = Vec::with_capacity(CABECERA);
    cabecera.extend_from_slice(MAGIA);
    cabecera.push(VERSION_FORMATO);
    for v in [MEMORIA_KIB, PASADAS, HILOS] {
        cabecera.extend_from_slice(&v.to_le_bytes());
    }
    cabecera.extend_from_slice(&azar);
    let codigo = normalizar(codigo).ok_or_else(no_abre)?;
    let c = cifrador(&codigo, sal, MEMORIA_KIB, PASADAS, HILOS)?;

    let mut entrada = File::open(origen)?;
    let mut salida = File::create(destino)?;
    salida.write_all(&cabecera)?;
    let mut bloque = vec![0u8; BLOQUE];
    let (mut hecho, mut contador) = (0u64, 0u32);
    loop {
        if !seguir(hecho, total) {
            return Err(Fallo::de("cancelado", ""));
        }
        let n = (total - hecho).min(BLOQUE as u64) as usize;
        entrada.read_exact(&mut bloque[..n])?;
        hecho += n as u64;
        let ultimo = hecho == total;
        let cifrado = c
            .encrypt(
                &nonce(prefijo, contador, ultimo),
                Payload {
                    msg: &bloque[..n],
                    aad: &cabecera,
                },
            )
            .map_err(|_| Fallo::de("fallo", "cifrado"))?;
        salida.write_all(&cifrado)?;
        contador += 1;
        if ultimo {
            salida.sync_all()?;
            return Ok(());
        }
    }
}

/// Valida la cabecera (límites antes de usar los parámetros) y descifra a `destino`. El archivo no es confiable: todo lo
/// que no autentica da el mismo fallo `no_abre`.
pub fn descifrar(
    origen: &Path,
    destino: &Path,
    codigo: &str,
    mut seguir: impl FnMut(u64, u64) -> bool,
) -> Result<(), Fallo> {
    let largo = fs::metadata(origen)?.len();
    if largo > MAX_ARCHIVO {
        return Err(Fallo::de("muy_grande", ""));
    }
    let codigo = normalizar(codigo).ok_or_else(no_abre)?;
    if largo < (CABECERA + ETIQUETA) as u64 {
        return Err(no_abre());
    }
    let mut entrada = File::open(origen)?;
    let mut cabecera = [0u8; CABECERA];
    entrada.read_exact(&mut cabecera)?;
    let param = |i: usize| {
        let b = &cabecera[MAGIA.len() + 1 + i * 4..MAGIA.len() + 1 + (i + 1) * 4];
        u32::from_le_bytes([b[0], b[1], b[2], b[3]])
    };
    let (m, t, p) = (param(0), param(1), param(2));
    if &cabecera[..MAGIA.len()] != MAGIA
        || cabecera[MAGIA.len()] != VERSION_FORMATO
        || !(8 * 1024..=256 * 1024).contains(&m)
        || !(1..=10).contains(&t)
        || !(1..=4).contains(&p)
    {
        return Err(no_abre());
    }
    let (sal, prefijo) = cabecera[MAGIA.len() + 13..].split_at(SAL);
    let c = cifrador(&codigo, sal, m, t, p)?;

    let mut salida = File::create(destino)?;
    let mut bloque = vec![0u8; BLOQUE + ETIQUETA];
    let total = largo - CABECERA as u64;
    let (mut hecho, mut contador) = (0u64, 0u32);
    loop {
        if !seguir(hecho, total) {
            return Err(Fallo::de("cancelado", ""));
        }
        let n = (total - hecho).min((BLOQUE + ETIQUETA) as u64) as usize;
        entrada.read_exact(&mut bloque[..n])?;
        hecho += n as u64;
        let ultimo = hecho == total;
        let claro = c
            .decrypt(
                &nonce(prefijo, contador, ultimo),
                Payload {
                    msg: &bloque[..n],
                    aad: &cabecera,
                },
            )
            .map_err(|_| no_abre())?;
        salida.write_all(&claro)?;
        contador += 1;
        if ultimo {
            salida.sync_all()?;
            return Ok(());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    const CODIGO: &str = "K7QM-2XRP-9DWN-H4TB-V3CJ";

    fn cifrado(contenido: &[u8]) -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let (claro, boldo) = (dir.path().join("claro"), dir.path().join("a.boldo"));
        fs::write(&claro, contenido).unwrap();
        cifrar(&claro, &boldo, CODIGO, |_, _| true).unwrap();
        (dir, boldo)
    }

    fn abrir(boldo: &Path, codigo: &str) -> Result<Vec<u8>, Fallo> {
        let salida = boldo.with_extension("salida");
        descifrar(boldo, &salida, codigo, |_, _| true)?;
        Ok(fs::read(salida).unwrap())
    }

    #[test]
    fn el_codigo_tiene_20_caracteres_sin_confusos_en_grupos_de_4() {
        let a = generar_codigo().unwrap();
        assert_eq!(a.len(), 24, "{a}");
        assert!(a.split('-').all(|g| g.len() == 4), "{a}");
        assert!(!a.contains(['0', '1', 'O', 'I', 'L', 'U']), "{a}");
        assert_ne!(a, generar_codigo().unwrap());
        assert!(normalizar(&a).is_some());
        assert_eq!(
            normalizar(&a.to_lowercase().replace('-', " ")),
            normalizar(&a)
        );
        // pegado desde un correo, con guiones tipográficos o comillas
        assert_eq!(
            normalizar(&format!("«{}»\n", a.replace('-', "–"))),
            normalizar(&a)
        );
        // el alfabeto se sigue exigiendo
        assert_eq!(normalizar("0000-0000-0000-0000-0000"), None);
        assert_eq!(normalizar("ÁÁÁÁ-2222-2222-2222-2222"), None);
    }

    #[test]
    fn ida_y_vuelta_en_tamanos_de_borde() {
        for n in [0, 1, BLOQUE - 1, BLOQUE, BLOQUE + 1, 2 * BLOQUE] {
            let contenido: Vec<u8> = (0..n).map(|i| i as u8).collect();
            let (_d, boldo) = cifrado(&contenido);
            assert_eq!(
                fs::metadata(&boldo).unwrap().len(),
                tamano_cifrado(n as u64)
            );
            assert_eq!(abrir(&boldo, CODIGO).unwrap(), contenido, "{n}");
        }
    }

    #[test]
    fn la_cabecera_solo_lleva_lo_necesario_y_lo_demas_va_cifrado() {
        let (_d, boldo) = cifrado(b"Mi Organizacion SA");
        let b = fs::read(&boldo).unwrap();
        assert_eq!(&b[..5], b"BOLDO");
        assert_eq!(b[5], 1);
        // Argon2id: 64 MiB, 3 pasadas, 1 hilo
        assert_eq!(&b[6..10], (64u32 * 1024).to_le_bytes());
        assert_eq!(&b[10..14], 3u32.to_le_bytes());
        assert_eq!(&b[14..18], 1u32.to_le_bytes());
        assert!(!b.windows(5).any(|w| w == b"Organ"));
        assert_eq!(b.len(), CABECERA + 16 + 18);
    }

    #[test]
    fn codigo_incorrecto_y_archivo_alterado_dan_el_mismo_fallo() {
        let (_d, boldo) = cifrado(&vec![7u8; BLOQUE + 10]);
        assert_eq!(
            abrir(&boldo, "K7QM-2XRP-9DWN-H4TB-V3CK")
                .unwrap_err()
                .codigo,
            "no_abre"
        );
        // un código que ni siquiera tiene la forma correcta
        assert_eq!(abrir(&boldo, "hola").unwrap_err().codigo, "no_abre");
        let original = fs::read(&boldo).unwrap();
        // cada byte de la cabecera y una muestra del contenido, incluidos el primero y el último
        let muestra = (0..CABECERA).chain([CABECERA, CABECERA + BLOQUE, original.len() - 1]);
        for i in muestra {
            let mut b = original.clone();
            b[i] ^= 1;
            fs::write(&boldo, &b).unwrap();
            assert_eq!(
                abrir(&boldo, CODIGO).unwrap_err().codigo,
                "no_abre",
                "byte {i}"
            );
        }
        // cortado: al final y justo en el borde de un bloque
        for largo in [original.len() - 1, CABECERA + BLOQUE + ETIQUETA, 3] {
            fs::write(&boldo, &original[..largo]).unwrap();
            assert_eq!(
                abrir(&boldo, CODIGO).unwrap_err().codigo,
                "no_abre",
                "{largo}"
            );
        }
        // bloques intercambiados: el contador los delata
        let (a, b) = original[CABECERA..].split_at(BLOQUE + ETIQUETA);
        fs::write(&boldo, [&original[..CABECERA], b, a].concat()).unwrap();
        assert_eq!(abrir(&boldo, CODIGO).unwrap_err().codigo, "no_abre");
    }

    #[test]
    fn parametros_absurdos_se_rechazan_antes_de_usarlos() {
        let (_d, boldo) = cifrado(b"x");
        let original = fs::read(&boldo).unwrap();
        for (i, valor) in [
            (0, u32::MAX),
            (0, 1),
            (0, 256 * 1024 + 1),
            (1, u32::MAX),
            (1, 0),
            (2, u32::MAX),
            (2, 0),
        ] {
            let mut b = original.clone();
            b[6 + i * 4..10 + i * 4].copy_from_slice(&valor.to_le_bytes());
            fs::write(&boldo, &b).unwrap();
            let t = Instant::now();
            assert_eq!(abrir(&boldo, CODIGO).unwrap_err().codigo, "no_abre");
            // rechazado sin derivar: reservar 4 TiB o dar 4 mil millones de pasadas no terminaría
            assert!(t.elapsed().as_millis() < 50, "{i} {valor}");
        }
    }

    #[test]
    fn un_archivo_demasiado_grande_se_rechaza_sin_leerlo() {
        let dir = tempfile::tempdir().unwrap();
        let grande = dir.path().join("g.boldo");
        File::create(&grande)
            .unwrap()
            .set_len(MAX_ARCHIVO + 1)
            .unwrap();
        assert_eq!(
            descifrar(&grande, &dir.path().join("s"), CODIGO, |_, _| true)
                .unwrap_err()
                .codigo,
            "muy_grande"
        );
    }

    #[test]
    fn cancelar_detiene_el_cifrado_y_el_descifrado() {
        let (d, boldo) = cifrado(b"x");
        let salida = d.path().join("s");
        let e = cifrar(&boldo, &salida, CODIGO, |_, _| false).unwrap_err();
        assert_eq!(e.codigo, "cancelado");
        let e = descifrar(&boldo, &salida, CODIGO, |_, _| false).unwrap_err();
        assert_eq!(e.codigo, "cancelado");
    }
}
