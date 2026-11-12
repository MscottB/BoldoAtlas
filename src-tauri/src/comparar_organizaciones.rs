//! La otra organización de una comparación, en un temporal: lo que se reescriba después nunca toca su archivo.
// Lo usa el comando de comparar (tarea 4 del plan).
#![expect(dead_code)]
use crate::intercambio::{
    Temporal,
    validar::{migrar_temporal, solo_lectura, solo_lectura_cerrada, version_y_esquema},
};
use crate::organizaciones::{Entrada, base_de, esta_su_archivo, id_del_archivo};
use crate::respaldos::Fallo;
use crate::rutas::Rutas;
use rusqlite::{Connection, OptionalExtension};

#[derive(Debug)]
pub struct Copia {
    pub temporal: Temporal,
    pub id: String,
    /// `origen_db_id` de la otra: si es una importación, de quién vino.
    pub origen: Option<String>,
}

pub fn copiar_otra(
    r: &Rutas,
    e: &Entrada,
    abierta: &str,
    migraciones: &[&str],
) -> Result<Copia, Fallo> {
    if e.id == abierta {
        return Err(Fallo::de("misma", &e.id));
    }
    let bd = base_de(r, e).bd;
    if !esta_su_archivo(e, &bd) {
        return Err(Fallo::de("no_encontrado", bd.display()));
    }
    let version = version_y_esquema(&bd, migraciones)?;
    let temporal = Temporal::nuevo(&r.datos, "comparar");
    // sin bloqueo ni escritura: `solo_lectura_cerrada` no deja `-wal` al lado y, si lo hay, lee lo que tiene sin volcar
    let origen = {
        let c = solo_lectura_cerrada(&bd)?;
        // sin `query_only`: SQLite rechaza `VACUUM INTO` con él. La conexión es `READ_ONLY` y escribe solo en el temporal
        if id_del_archivo(&c)?.as_deref() != Some(e.id.as_str()) {
            return Err(Fallo::de("otro_id", bd.display()));
        }
        let origen = c
            .query_row(
                "SELECT valor FROM meta WHERE clave = 'origen_db_id'",
                [],
                |f| f.get(0),
            )
            .optional()?;
        c.execute("VACUUM INTO ?1", [temporal.ruta().to_string_lossy()])?;
        origen
    };
    migrar_temporal(temporal.ruta(), version, migraciones)?;
    Ok(Copia {
        temporal,
        id: e.id.clone(),
        origen,
    })
}

/// Solo para mirar: aunque el temporal se abra para escribir más adelante, esta conexión no puede.
pub fn leer(copia: &Copia) -> Result<Connection, Fallo> {
    let c = solo_lectura(copia.temporal.ruta())?;
    c.pragma_update(None, "query_only", true)?;
    Ok(c)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{self, MIGRACIONES};
    use crate::organizaciones::{
        ESPERA_CAMBIO, bloquear,
        prueba::{crear, entrada, escribir, rutas, sin_rastros},
    };
    use crate::respaldos::con_sufijo;
    use std::path::PathBuf;

    /// Otra organización en una carpeta externa del temporal, con ese esquema.
    fn otra(r: &Rutas, migraciones: &[&str]) -> (Entrada, PathBuf) {
        let bd = r.datos.join("afuera").join("otra.db");
        let id = crear(&bd, "Otra", migraciones);
        (entrada(&id, &bd.to_string_lossy(), true, ""), bd)
    }

    fn copiar(r: &Rutas, e: &Entrada) -> Result<Copia, Fallo> {
        copiar_otra(r, e, "la-abierta", MIGRACIONES)
    }

    #[test]
    fn copiar_otra_no_toca_el_original() {
        let (_exe, r) = rutas();
        let (e, bd) = otra(&r, MIGRACIONES);
        escribir(&r, vec![e.clone()]);
        let antes = std::fs::read(&bd).unwrap();
        let fecha = std::fs::metadata(&bd).unwrap().modified().unwrap();
        let copia = copiar(&r, &e).unwrap();
        assert_eq!(copia.id, e.id);
        drop(copia);
        assert_eq!(std::fs::read(&bd).unwrap(), antes);
        assert_eq!(std::fs::metadata(&bd).unwrap().modified().unwrap(), fecha);
        sin_rastros(&bd);
        assert!(!con_sufijo(&bd, ".bloqueo").exists());
    }

    #[test]
    fn con_otra_copia_escribiendo_ve_lo_del_wal() {
        let (_exe, r) = rutas();
        let (e, bd) = otra(&r, MIGRACIONES);
        let c = db::abrir(&bd).unwrap();
        c.pragma_update(None, "wal_autocheckpoint", 0).unwrap();
        c.execute(
            "INSERT INTO meta (clave, valor) VALUES ('sin_volcar', 'si')",
            [],
        )
        .unwrap();
        let _bloqueo = bloquear(&bd, ESPERA_CAMBIO).unwrap();
        assert!(con_sufijo(&bd, "-wal").exists());
        let copia = copiar(&r, &e).unwrap();
        let visto: String = leer(&copia)
            .unwrap()
            .query_row(
                "SELECT valor FROM meta WHERE clave = 'sin_volcar'",
                [],
                |f| f.get(0),
            )
            .unwrap();
        assert_eq!(visto, "si");
    }

    #[test]
    fn esquema_antiguo_se_migra_solo_en_el_temporal() {
        let (_exe, r) = rutas();
        let anterior = MIGRACIONES.len() - 1;
        let (e, bd) = otra(&r, &MIGRACIONES[..anterior]);
        let copia = copiar(&r, &e).unwrap();
        let temporal = copia.temporal.ruta().to_path_buf();
        let version = |ruta: &std::path::Path| -> i64 {
            crate::intercambio::validar::solo_lectura(ruta)
                .unwrap()
                .pragma_query_value(None, "user_version", |f| f.get(0))
                .unwrap()
        };
        assert_eq!(version(&temporal), MIGRACIONES.len() as i64);
        assert_eq!(version(&bd), anterior as i64);
        drop(copia);
        assert!(!temporal.exists());
    }

    #[test]
    fn esquema_nuevo_no_se_compara() {
        let (_exe, r) = rutas();
        let (e, bd) = otra(&r, MIGRACIONES);
        rusqlite::Connection::open(&bd)
            .unwrap()
            .pragma_update(None, "user_version", 99)
            .unwrap();
        assert_eq!(copiar(&r, &e).unwrap_err().codigo, "esquema_nuevo");
    }

    #[test]
    fn archivo_ausente_da_no_encontrado() {
        let (_exe, r) = rutas();
        let (e, bd) = otra(&r, MIGRACIONES);
        std::fs::remove_file(&bd).unwrap();
        assert_eq!(copiar(&r, &e).unwrap_err().codigo, "no_encontrado");
    }

    #[test]
    fn otro_db_id_da_otro_id() {
        let (_exe, r) = rutas();
        let (mut e, _) = otra(&r, MIGRACIONES);
        e.id = "no-es-el-del-archivo".into();
        assert_eq!(copiar(&r, &e).unwrap_err().codigo, "otro_id");
    }

    #[test]
    fn consigo_misma_da_misma() {
        let (_exe, r) = rutas();
        let (e, _) = otra(&r, MIGRACIONES);
        assert_eq!(
            copiar_otra(&r, &e, &e.id, MIGRACIONES).unwrap_err().codigo,
            "misma"
        );
    }

    #[test]
    fn leer_no_deja_escribir() {
        let (_exe, r) = rutas();
        let (e, _) = otra(&r, MIGRACIONES);
        let copia = copiar(&r, &e).unwrap();
        let c = leer(&copia).unwrap();
        assert!(
            c.execute("INSERT INTO meta (clave, valor) VALUES ('x', 'y')", [])
                .is_err()
        );
    }
}
