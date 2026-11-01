//! Exportar e importar archivos `.boldo`. Todo el cifrado y la lectura del archivo ocurren aquí; no usa el camino de SQL
//! de la interfaz (`db::consultar`, `db::lote`) y la interfaz nunca envía una ruta.
pub mod alcance;
pub mod formato;
pub mod fusion;
pub mod validar;

use crate::db;
use crate::respaldos::{self, Fallo};
use fusion::Informe;
use rusqlite::{Connection, OpenFlags, TransactionBehavior};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use validar::MetaArchivo;

/// Copia en claro de una base, dentro de `datos/`. Se borra al soltarla; si la app se cierra de golpe, la borra
/// `respaldos::limpiar_parciales` al volver a abrir.
#[derive(Debug)]
pub struct Temporal(PathBuf);

impl Temporal {
    pub fn nuevo(datos: &Path, etiqueta: &str) -> Self {
        let azar = uuid::Uuid::now_v7().simple().to_string();
        Temporal(datos.join(format!("boldo-{etiqueta}-{azar}.db.tmp")))
    }

    pub fn ruta(&self) -> &Path {
        &self.0
    }
}

impl Drop for Temporal {
    fn drop(&mut self) {
        let _ = respaldos::borrar_bd(&self.0);
    }
}

#[derive(Debug)]
pub struct Importacion {
    temporal: Temporal,
    meta: MetaArchivo,
}

/// Lo que hay entre un paso y el siguiente del asistente.
#[derive(Default)]
pub struct Sesiones {
    exportacion: Mutex<Option<Temporal>>,
    archivo: Mutex<Option<PathBuf>>,
    importacion: Mutex<Option<Importacion>>,
    cancelar: AtomicBool,
}

impl Sesiones {
    pub fn empezar(&self) {
        self.cancelar.store(false, Ordering::SeqCst);
    }

    pub fn sigue(&self) -> bool {
        !self.cancelar.load(Ordering::SeqCst)
    }

    /// Detiene lo que esté en curso y borra los temporales. Nada se aplicó todavía.
    pub fn cancelar(&self) {
        self.cancelar.store(true, Ordering::SeqCst);
        self.poner_exportacion(None);
        self.poner_archivo(None);
        drop(tomar(&self.importacion));
    }

    pub fn poner_exportacion(&self, t: Option<Temporal>) {
        *self.exportacion.lock().unwrap_or_else(|p| p.into_inner()) = t;
    }

    pub fn tomar_exportacion(&self) -> Option<Temporal> {
        tomar(&self.exportacion)
    }

    pub fn poner_archivo(&self, ruta: Option<PathBuf>) {
        *self.archivo.lock().unwrap_or_else(|p| p.into_inner()) = ruta;
    }

    pub fn archivo(&self) -> Option<PathBuf> {
        self.archivo
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }

    pub fn poner_importacion(&self, i: Importacion) {
        *self.importacion.lock().unwrap_or_else(|p| p.into_inner()) = Some(i);
    }

    pub fn tomar_importacion(&self) -> Option<Importacion> {
        tomar(&self.importacion)
    }
}

fn tomar<T>(m: &Mutex<Option<T>>) -> Option<T> {
    m.lock().unwrap_or_else(|p| p.into_inner()).take()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumenImportacion {
    pub organizacion: String,
    pub parcial: bool,
    pub informe: Informe,
}

fn fecha_y_revision(conn: &Connection) -> Result<(String, String), Fallo> {
    Ok(conn.query_row(
        "SELECT date('now', 'localtime'), COALESCE((SELECT valor FROM meta WHERE clave = 'data_revision'), '0')",
        [],
        |f| Ok((f.get(0)?, f.get(1)?)),
    )?)
}

/// `Organizacion_AAAA-MM-DD_rN.boldo`, sin lo que un sistema de archivos no acepta.
pub fn nombre_sugerido(copia: &Path) -> Result<String, Fallo> {
    let c = validar::solo_lectura(copia)?;
    let organizacion: Option<String> = c
        .query_row(
            "SELECT valor FROM meta WHERE clave = 'org_nombre'",
            [],
            |f| f.get(0),
        )
        .unwrap_or(None);
    let (fecha, revision) = fecha_y_revision(&c)?;
    let limpio: String = organizacion
        .unwrap_or_default()
        .trim()
        .chars()
        .map(|x| if x.is_alphanumeric() { x } else { '_' })
        .collect();
    let base = if limpio.is_empty() {
        "BoldoAtlas"
    } else {
        &limpio
    };
    Ok(format!("{base}_{fecha}_r{revision}.boldo"))
}

/// Cifra a `destino` pasando por un nombre aparte: un corte a mitad nunca deja un `.boldo` a medias con ese nombre.
pub fn guardar(
    copia: &Path,
    destino: &Path,
    seguir: impl FnMut(u64, u64) -> bool,
) -> Result<String, Fallo> {
    let codigo = formato::generar_codigo()?;
    let mut parcial = destino.as_os_str().to_owned();
    parcial.push(".tmp");
    let parcial = PathBuf::from(parcial);
    let hecho = formato::cifrar(copia, &parcial, &codigo, seguir)
        .and_then(|_| fs::rename(&parcial, destino).map_err(Fallo::from));
    if hecho.is_err() {
        let _ = fs::remove_file(&parcial);
    }
    hecho.map(|_| codigo)
}

/// Descifra y revisa. Si el archivo es de un esquema anterior, migra la copia temporal (nunca la base local).
pub fn abrir(
    archivo: &Path,
    datos: &Path,
    codigo: &str,
    migraciones: &[&str],
    seguir: impl FnMut(u64, u64) -> bool,
) -> Result<Importacion, Fallo> {
    let temporal = Temporal::nuevo(datos, "importando");
    formato::descifrar(archivo, temporal.ruta(), codigo, seguir)?;
    let version = validar::revisar(temporal.ruta(), migraciones)?;
    validar::migrar_copia(temporal.ruta(), version, migraciones)?;
    let meta = validar::leer_meta(&validar::solo_lectura(temporal.ruta())?)?;
    Ok(Importacion { temporal, meta })
}

fn ahora(conn: &Connection) -> Result<String, Fallo> {
    Ok(
        conn.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |f| {
            f.get(0)
        })?,
    )
}

/// Qué pasaría al agregar: la pasada completa, deshecha al final.
pub fn revisar(conn: &mut Connection, i: &Importacion) -> Result<ResumenImportacion, Fallo> {
    let imp = validar::solo_lectura(i.temporal.ruta())?;
    let marca = ahora(conn)?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let informe = fusion::fusionar(&tx, &imp, &i.meta, &HashMap::new(), &marca)?;
    drop(tx);
    Ok(ResumenImportacion {
        organizacion: i.meta.organizacion.clone(),
        parcial: i.meta.parcial,
        informe,
    })
}

/// «Agregar lo nuevo»: un respaldo y una sola transacción. Si algo falla, no se escribe nada.
pub fn agregar(
    conn: &mut Connection,
    dir_respaldos: &Path,
    i: &Importacion,
    lugares: &HashMap<String, Option<String>>,
    version_app: &str,
) -> Result<Informe, Fallo> {
    let imp = validar::solo_lectura(i.temporal.ruta())?;
    respaldos::respaldar_antes_de_reemplazar(conn, dir_respaldos, &respaldos::sello_local(conn)?)?;
    let marca = ahora(conn)?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let informe = fusion::fusionar(&tx, &imp, &i.meta, lugares, &marca)?;
    // al importar en una base sin nombre (recién instalada), la organización se llama como la del archivo
    let sin_nombre: bool = tx.query_row(
        "SELECT COALESCE((SELECT valor FROM meta WHERE clave = 'org_nombre'), '') = ''",
        [],
        |f| f.get(0),
    )?;
    if sin_nombre {
        tx.execute(
            "INSERT OR REPLACE INTO meta (clave, valor) VALUES ('org_nombre', ?1)",
            [&i.meta.organizacion],
        )?;
    }
    db::marcar_cambio(&tx, version_app)?;
    tx.commit()?;
    Ok(informe)
}

/// «Reemplazar todo»: solo con archivos completos. Lo de la exportación se quita de la copia, que pasa a ser la base local.
pub fn reemplazar(
    conexion: &mut Option<Connection>,
    bd: &Path,
    dir_respaldos: &Path,
    i: &Importacion,
    migraciones: &[&str],
) -> Result<(), Fallo> {
    if i.meta.parcial {
        return Err(Fallo::de("solo_completo", ""));
    }
    let c = validar::abrir_no_confiable(i.temporal.ruta(), OpenFlags::SQLITE_OPEN_READ_WRITE)?;
    c.execute(
        "DELETE FROM meta WHERE clave IN ('alcance', 'raices', 'origen_db_id')",
        [],
    )?;
    c.close().map_err(|(_, e)| e)?;
    respaldos::reemplazar_antes_respaldando(
        conexion,
        bd,
        dir_respaldos,
        i.temporal.ruta(),
        migraciones,
    )
}

#[cfg(test)]
pub mod prueba {
    use crate::db;
    use rusqlite::Connection;

    pub const TIPO: &str = "00000000-0000-7000-8000-000000000001";

    pub fn contiene(b: &[u8], aguja: &[u8]) -> bool {
        b.windows(aguja.len()).any(|w| w == aguja)
    }

    /// Una organización con una rama («rama», con «hija») y lo que apunta afuera de ella.
    pub fn base_con_datos() -> (tempfile::TempDir, Connection) {
        let dir = tempfile::tempdir().unwrap();
        let mut c = db::abrir(&dir.path().join("origen.db")).unwrap();
        db::migrar(&mut c, dir.path()).unwrap();
        db::asegurar_meta(&c).unwrap();
        let x = "'x', 'x'";
        c.execute_batch(&format!(
            "
            INSERT INTO meta (clave, valor) VALUES ('org_nombre', 'Mi Org / SA');
            INSERT INTO unidades (id, tipo_id, nombre, parent_id, created_at, updated_at) VALUES
              ('raiz', '{TIPO}', 'Raíz', NULL, {x}),
              ('rama', '{TIPO}', 'Rama', 'raiz', {x}),
              ('hija', '{TIPO}', 'Hija', 'rama', {x}),
              ('otra', '{TIPO}', 'UnidadFuera', 'raiz', {x});
            INSERT INTO unidades (id, tipo_id, nombre, parent_id, created_at, updated_at, deleted_at) VALUES
              ('borrada', '{TIPO}', 'Borrada', 'rama', 'x', 'x', 'y');
            INSERT INTO cargos (id, nombre, created_at, updated_at) VALUES
              ('cargo-a', 'Jefe', {x}), ('cargo-b', 'CargoFuera', {x});
            INSERT INTO sedes (id, nombre, created_at, updated_at) VALUES
              ('sede-a', 'Sede A', {x}), ('sede-b', 'SedeFuera', {x});
            INSERT INTO leyendas (id, nombre, color, created_at, updated_at) VALUES
              ('ley-a', 'Crítico', '#ff0000', {x}), ('ley-b', 'LeyendaFuera', '#00ff00', {x});
            INSERT INTO trabajadores (id, nombre, correo, sede_id, created_at, updated_at) VALUES
              ('ana', 'Ana', 'ana@x.cl', 'sede-a', {x}),
              ('bruno', 'Bruno', 'bruno@x.cl', NULL, {x}),
              ('fuera', 'PersonaFuera', 'fuera@x.cl', 'sede-b', {x});
            INSERT INTO trabajadores (id, nombre, created_at, updated_at, deleted_at) VALUES
              ('muerta', 'PersonaBorrada', 'x', 'x', 'y');
            INSERT INTO puestos (id, unidad_id, cargo_id, leyenda_id, created_at, updated_at) VALUES
              ('p-rama', 'rama', 'cargo-a', 'ley-a', {x}),
              ('p-hija', 'hija', 'cargo-a', NULL, {x}),
              ('p-fuera', 'otra', 'cargo-b', 'ley-b', {x});
            UPDATE unidades SET jefe_puesto_id = 'p-fuera' WHERE id = 'rama';
            INSERT INTO asignaciones (id, puesto_id, trabajador_id, tipo, desde, created_at, updated_at) VALUES
              ('as-rama', 'p-rama', 'ana', 'titular', '2020-01-01', {x}),
              ('as-hija', 'p-hija', 'bruno', 'titular', '2020-01-01', {x}),
              ('as-fuera', 'p-fuera', 'fuera', 'titular', '2020-01-01', {x});
            INSERT INTO asignaciones (id, puesto_id, trabajador_id, tipo, desde, created_at, updated_at, deleted_at) VALUES
              ('as-muerta', 'p-rama', 'muerta', 'reemplazo', '2020-01-01', 'x', 'x', 'y');
            INSERT INTO conexiones (id, origen_id, destino_id, created_at, updated_at) VALUES
              ('x-dentro', 'rama', 'hija', {x}),
              ('x-corte', 'hija', 'otra', {x});
            INSERT INTO etiquetas (id, nombre, color, created_at, updated_at) VALUES
              ('et-a', 'Etiqueta A', '#000000', {x}), ('et-b', 'EtiquetaFuera', '#000000', {x});
            INSERT INTO unidad_etiquetas (id, unidad_id, etiqueta_id, created_at, updated_at) VALUES
              ('ue-a', 'rama', 'et-a', {x}), ('ue-b', 'otra', 'et-b', {x});
            INSERT INTO procesos (id, unidad_id, nombre, created_at, updated_at) VALUES
              ('pr-a', 'rama', 'Proceso A', {x}), ('pr-b', 'otra', 'ProcesoFuera', {x});
            INSERT INTO actividades (id, proceso_id, nombre, created_at, updated_at) VALUES
              ('ac-a', 'pr-a', 'Actividad A', {x}), ('ac-b', 'pr-b', 'ActividadFuera', {x});
            INSERT INTO actividad_roles (id, actividad_id, trabajador_id, rol, created_at, updated_at) VALUES
              ('rol-dentro', 'ac-a', 'ana', 'R', {x}),
              ('rol-corte', 'ac-a', 'fuera', 'C', {x}),
              ('rol-fuera', 'ac-b', 'fuera', 'R', {x});
            INSERT INTO subarboles_guardados (id, unidad_id, created_at, updated_at) VALUES
              ('sub-a', 'rama', {x}), ('sub-b', 'otra', {x});
            INSERT INTO vistas (id, arbol_id, nombre, config, created_at, updated_at) VALUES
              ('vis-sub', 'sub-a', 'Vista A', '{{}}', {x}),
              ('vis-otra', 'sub-b', 'VistaFuera', '{{}}', {x}),
              ('vis-global', NULL, 'VistaGlobal', '{{}}', {x});
            "
        ))
        .unwrap();
        (dir, c)
    }
}

#[cfg(test)]
mod tests {
    use super::prueba::*;
    use super::*;
    use db::MIGRACIONES;

    const SIGUE: fn(u64, u64) -> bool = |_, _| true;

    /// Solo los temporales: las demás cosas de la carpeta no importan aquí.
    fn temporales(dir: &Path) -> Vec<String> {
        fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .filter(|n| n.contains(".tmp"))
            .collect()
    }

    /// `(carpeta, base de destino, respaldos)`
    fn destino() -> (tempfile::TempDir, PathBuf, PathBuf, Connection) {
        let dir = tempfile::tempdir().unwrap();
        let respaldos = dir.path().join("respaldos");
        fs::create_dir_all(&respaldos).unwrap();
        let bd = dir.path().join("boldo.db");
        let mut c = db::abrir(&bd).unwrap();
        db::migrar(&mut c, &respaldos).unwrap();
        db::asegurar_meta(&c).unwrap();
        (dir, bd, respaldos, c)
    }

    fn exportar(origen: &Connection, dir: &Path, raices: Option<&[String]>) -> (PathBuf, String) {
        let copia = alcance::copiar(origen, dir).unwrap();
        let (t, _) = alcance::preparar(copia, dir, raices).unwrap();
        let archivo = dir.join(nombre_sugerido(t.ruta()).unwrap());
        let codigo = guardar(t.ruta(), &archivo, SIGUE).unwrap();
        (archivo, codigo)
    }

    fn cuenta(c: &Connection, tabla: &str) -> i64 {
        c.query_row(&format!("SELECT count(*) FROM {tabla}"), [], |f| f.get(0))
            .unwrap()
    }

    #[test]
    fn el_nombre_sugerido_no_lleva_caracteres_problematicos() {
        let (d, origen) = base_con_datos();
        let copia = alcance::copiar(&origen, d.path()).unwrap();
        let n = nombre_sugerido(copia.ruta()).unwrap();
        assert!(n.starts_with("Mi_Org___SA_"), "{n}");
        assert!(n.ends_with("_r0.boldo"), "{n}");
    }

    #[test]
    fn ida_y_vuelta_completa_y_reemplazar() {
        let (d, origen) = base_con_datos();
        let (archivo, codigo) = exportar(&origen, d.path(), None);
        assert!(
            temporales(d.path()).is_empty(),
            "{:?}",
            temporales(d.path())
        );

        let (dd, bd, respaldos, conn) = destino();
        conn.execute_batch(&format!(
            "INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES ('local', '{TIPO}', 'Local', 'x', 'x');"
        ))
        .unwrap();
        let i = abrir(&archivo, dd.path(), &codigo, MIGRACIONES, SIGUE).unwrap();
        assert!(!i.meta.parcial);
        let mut slot = Some(conn);
        reemplazar(&mut slot, &bd, &respaldos, &i, MIGRACIONES).unwrap();
        drop(i);
        assert!(
            slot.is_none(),
            "la conexión queda cerrada hasta el reinicio"
        );
        assert!(temporales(dd.path()).is_empty());

        let c = db::abrir(&bd).unwrap();
        for t in ["unidades", "trabajadores", "puestos", "vistas"] {
            assert_eq!(cuenta(&c, t), cuenta(&origen, t), "{t}");
        }
        let locales: i64 = c
            .query_row(
                "SELECT count(*) FROM unidades WHERE id = 'local'",
                [],
                |f| f.get(0),
            )
            .unwrap();
        assert_eq!(locales, 0);
        // lo de la exportación no se queda en la base
        let marcas: i64 = c
            .query_row(
                "SELECT count(*) FROM meta WHERE clave IN ('alcance', 'raices', 'origen_db_id')",
                [],
                |f| f.get(0),
            )
            .unwrap();
        assert_eq!(marcas, 0);
        // se puede volver atrás
        assert!(
            respaldos::listar(&respaldos)
                .unwrap()
                .iter()
                .any(|r| r.reemplazo && r.legible)
        );
    }

    #[test]
    fn ida_y_vuelta_parcial_y_agregar() {
        let (d, origen) = base_con_datos();
        let (archivo, codigo) = exportar(&origen, d.path(), Some(&["rama".into()]));

        let (dd, _bd, respaldos, mut conn) = destino();
        let i = abrir(&archivo, dd.path(), &codigo, MIGRACIONES, SIGUE).unwrap();
        assert!(i.meta.parcial);
        // la vista previa dice lo mismo que después se hace, y no escribe
        let vista = revisar(&mut conn, &i).unwrap();
        assert_eq!(vista.organizacion, "Mi Org / SA");
        assert_eq!(cuenta(&conn, "unidades"), 0);
        assert!(vista.informe.ramas[0].pide_lugar);

        let hecho = agregar(&mut conn, &respaldos, &i, &HashMap::new(), "1.2.3").unwrap();
        assert_eq!(cuenta(&conn, "unidades"), 2);
        assert_eq!(cuenta(&conn, "trabajadores"), 2);
        let por = |inf: &Informe| -> Vec<i64> { inf.tablas.iter().map(|t| t.nuevas).collect() };
        assert_eq!(por(&hecho), por(&vista.informe));
        let revision: String = conn
            .query_row(
                "SELECT valor FROM meta WHERE clave = 'data_revision'",
                [],
                |f| f.get(0),
            )
            .unwrap();
        assert_eq!(revision, "1", "una revisión por importación");
        let nombre: String = conn
            .query_row(
                "SELECT valor FROM meta WHERE clave = 'org_nombre'",
                [],
                |f| f.get(0),
            )
            .unwrap();
        assert_eq!(
            nombre, "Mi Org / SA",
            "una base sin nombre toma el del archivo"
        );
        assert!(
            respaldos::listar(&respaldos)
                .unwrap()
                .iter()
                .any(|r| r.reemplazo),
            "siempre un respaldo antes de aplicar"
        );
    }

    #[test]
    fn reemplazar_solo_acepta_archivos_completos() {
        let (d, origen) = base_con_datos();
        let (archivo, codigo) = exportar(&origen, d.path(), Some(&["rama".into()]));
        let (dd, bd, respaldos, conn) = destino();
        let i = abrir(&archivo, dd.path(), &codigo, MIGRACIONES, SIGUE).unwrap();
        let mut slot = Some(conn);
        let e = reemplazar(&mut slot, &bd, &respaldos, &i, MIGRACIONES).unwrap_err();
        assert_eq!(e.codigo, "solo_completo");
        assert!(slot.is_some());
        assert!(respaldos::listar(&respaldos).unwrap().is_empty());
    }

    #[test]
    fn un_fallo_al_abrir_no_deja_temporales_ni_toca_la_base() {
        let (d, origen) = base_con_datos();
        let (archivo, codigo) = exportar(&origen, d.path(), None);
        let (dd, _bd, _respaldos, conn) = destino();

        // código incorrecto
        let mal = codigo.replace(|c: char| c != '-', "2");
        let e = abrir(&archivo, dd.path(), &mal, MIGRACIONES, SIGUE).unwrap_err();
        assert_eq!(e.codigo, "no_abre");
        assert!(temporales(dd.path()).is_empty());

        // alterado a mitad de un bloque: ya se escribió algo del temporal
        let mut b = fs::read(&archivo).unwrap();
        let ultimo = b.len() - 1;
        b[ultimo] ^= 1;
        let alterado = d.path().join("alterado.boldo");
        fs::write(&alterado, &b).unwrap();
        let e = abrir(&alterado, dd.path(), &codigo, MIGRACIONES, SIGUE).unwrap_err();
        assert_eq!(e.codigo, "no_abre");
        assert!(temporales(dd.path()).is_empty());

        // cancelado
        let e = abrir(&archivo, dd.path(), &codigo, MIGRACIONES, |_, _| false).unwrap_err();
        assert_eq!(e.codigo, "cancelado");
        assert!(temporales(dd.path()).is_empty());

        assert_eq!(cuenta(&conn, "unidades"), 0);
    }

    /// Un archivo bien cifrado cuyo contenido arma quien lo envía.
    fn hostil(sql: &str) -> (tempfile::TempDir, PathBuf, String) {
        let (d, origen) = base_con_datos();
        let copia = alcance::copiar(&origen, d.path()).unwrap();
        let (t, _) = alcance::preparar(copia, d.path(), None).unwrap();
        Connection::open(t.ruta())
            .unwrap()
            .execute_batch(sql)
            .unwrap();
        let archivo = d.path().join("hostil.boldo");
        let codigo = guardar(t.ruta(), &archivo, SIGUE).unwrap();
        (d, archivo, codigo)
    }

    #[test]
    fn base_con_trigger_o_tabla_extra_se_rechaza_y_borra_el_temporal() {
        for sql in [
            "CREATE TRIGGER t AFTER INSERT ON meta BEGIN DELETE FROM unidades; END;",
            "CREATE TABLE extra (x);",
        ] {
            let (_d, archivo, codigo) = hostil(sql);
            let (dd, ..) = destino();
            let e = abrir(&archivo, dd.path(), &codigo, MIGRACIONES, SIGUE).unwrap_err();
            assert_eq!(e.codigo, "contenido_invalido", "{sql}");
            assert!(temporales(dd.path()).is_empty(), "{sql}");
        }
    }

    #[test]
    fn version_mas_nueva_se_rechaza_con_su_mensaje() {
        let (_d, archivo, codigo) = hostil("PRAGMA user_version = 99;");
        let (dd, ..) = destino();
        let e = abrir(&archivo, dd.path(), &codigo, MIGRACIONES, SIGUE).unwrap_err();
        assert_eq!(e.codigo, "esquema_nuevo");
        assert!(temporales(dd.path()).is_empty());
    }

    #[test]
    fn un_archivo_de_esquema_anterior_entra_migrado() {
        let (d, origen) = base_con_datos();
        let (archivo, codigo) = exportar(&origen, d.path(), None);
        let dos = [MIGRACIONES[0], "CREATE TABLE extra (x INTEGER);"];
        let (dd, ..) = destino();
        let i = abrir(&archivo, dd.path(), &codigo, &dos, SIGUE).unwrap();
        let v: i64 = validar::solo_lectura(i.temporal.ruta())
            .unwrap()
            .pragma_query_value(None, "user_version", |f| f.get(0))
            .unwrap();
        assert_eq!(v, 2);
    }

    #[test]
    fn los_temporales_que_queden_los_borra_limpiar_parciales() {
        let (dd, ..) = destino();
        let t = Temporal::nuevo(dd.path(), "importando");
        fs::write(t.ruta(), "x").unwrap();
        let mut journal = t.ruta().as_os_str().to_owned();
        journal.push("-journal");
        fs::write(&journal, "x").unwrap();
        std::mem::forget(t); // lo que deja un cierre de golpe
        fs::write(dd.path().join("otro.tmp"), "x").unwrap();
        respaldos::limpiar_parciales(dd.path());
        assert_eq!(temporales(dd.path()), ["otro.tmp"]);
        assert!(dd.path().join("boldo.db").exists());
    }

    #[test]
    fn un_cierre_a_mitad_de_guardar_no_deja_el_archivo_final() {
        let (d, origen) = base_con_datos();
        let copia = alcance::copiar(&origen, d.path()).unwrap();
        let destino = d.path().join("a.boldo");
        let e = guardar(copia.ruta(), &destino, |_, _| false).unwrap_err();
        assert_eq!(e.codigo, "cancelado");
        assert!(!destino.exists());
        assert!(!d.path().join("a.boldo.tmp").exists());
    }

    #[test]
    fn cancelar_borra_los_temporales_de_la_sesion() {
        let (dd, ..) = destino();
        let s = Sesiones::default();
        let t = Temporal::nuevo(dd.path(), "exportando");
        fs::write(t.ruta(), "x").unwrap();
        let ruta = t.ruta().to_path_buf();
        s.poner_exportacion(Some(t));
        s.empezar();
        assert!(s.sigue());
        s.cancelar();
        assert!(!s.sigue());
        assert!(!ruta.exists());
    }
}
