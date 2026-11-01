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
use std::sync::{Mutex, MutexGuard};
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

#[derive(Default)]
struct EstadoSesion {
    trabajo: Option<String>,
    exportacion: Option<Temporal>,
    archivo: Option<PathBuf>,
    importacion: Option<Importacion>,
}

/// Lo que hay entre un paso y el siguiente del asistente, de un solo trabajo a la vez. El identificador lo pone la
/// interfaz: «Guardar» y «Aplicar» solo valen para lo que se revisó, y lo que termina tarde, ya cancelado o reemplazado
/// por otro trabajo, no deja nada.
#[derive(Default)]
pub struct Sesiones(Mutex<EstadoSesion>);

fn no_esta() -> Fallo {
    Fallo::de("desconocido", "")
}

fn cancelado() -> Fallo {
    Fallo::de("cancelado", "")
}

impl Sesiones {
    fn estado(&self) -> MutexGuard<'_, EstadoSesion> {
        self.0.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// Este trabajo pasa a ser el único; lo que hubiera de otro se suelta y sus temporales se borran.
    pub fn empezar(&self, trabajo: &str) {
        *self.estado() = EstadoSesion {
            trabajo: Some(trabajo.to_string()),
            ..Default::default()
        };
    }

    pub fn sigue(&self, trabajo: &str) -> bool {
        self.estado().trabajo.as_deref() == Some(trabajo)
    }

    /// Detiene ese trabajo y borra sus temporales. Si ya hay otro, no le pasa nada.
    pub fn cancelar(&self, trabajo: &str) {
        let mut e = self.estado();
        if e.trabajo.as_deref() == Some(trabajo) {
            *e = EstadoSesion::default();
        }
    }

    /// Al salir de la app.
    pub fn cancelar_todo(&self) {
        *self.estado() = EstadoSesion::default();
    }

    pub fn guardar_exportacion(&self, trabajo: &str, t: Temporal) -> Result<(), Fallo> {
        let mut e = self.estado();
        if e.trabajo.as_deref() != Some(trabajo) {
            return Err(cancelado());
        }
        e.exportacion = Some(t);
        Ok(())
    }

    pub fn tomar_exportacion(&self, trabajo: &str) -> Result<Temporal, Fallo> {
        let mut e = self.estado();
        if e.trabajo.as_deref() != Some(trabajo) {
            return Err(no_esta());
        }
        e.exportacion.take().ok_or_else(no_esta)
    }

    /// Elegir otro archivo deja sin efecto lo que se había revisado.
    pub fn guardar_archivo(&self, trabajo: &str, ruta: PathBuf) -> Result<(), Fallo> {
        let mut e = self.estado();
        if e.trabajo.as_deref() != Some(trabajo) {
            return Err(cancelado());
        }
        e.archivo = Some(ruta);
        e.importacion = None;
        Ok(())
    }

    pub fn archivo(&self, trabajo: &str) -> Result<PathBuf, Fallo> {
        let e = self.estado();
        if e.trabajo.as_deref() != Some(trabajo) {
            return Err(no_esta());
        }
        e.archivo.clone().ok_or_else(no_esta)
    }

    pub fn guardar_importacion(&self, trabajo: &str, i: Importacion) -> Result<(), Fallo> {
        let mut e = self.estado();
        if e.trabajo.as_deref() != Some(trabajo) {
            return Err(cancelado());
        }
        e.importacion = Some(i);
        Ok(())
    }

    pub fn tomar_importacion(&self, trabajo: &str) -> Result<Importacion, Fallo> {
        let mut e = self.estado();
        if e.trabajo.as_deref() != Some(trabajo) {
            return Err(no_esta());
        }
        e.importacion.take().ok_or_else(no_esta)
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumenImportacion {
    pub organizacion: String,
    pub parcial: bool,
    /// None si la revisión falló: «Agregar» no se ofrece, pero un archivo completo y válido se puede reemplazar igual.
    pub informe: Option<Informe>,
}

/// Lo que quedó en `meta` al reemplazar: nada más que lo que la app escribe y lee.
const META_CONOCIDAS: &[&str] = &[
    "org_nombre",
    "logo_png",
    "db_id",
    "db_creada",
    "data_revision",
    "app_version_ultima",
];

/// Con la extensión puesta. Si hubo que agregarla, el diálogo preguntó por otro nombre: lo que ya tenga este no se pisa.
pub fn con_extension(destino: PathBuf) -> Result<PathBuf, Fallo> {
    if destino
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("boldo"))
    {
        return Ok(destino);
    }
    let mut con = destino.into_os_string();
    con.push(".boldo");
    let con = PathBuf::from(con);
    if con.exists() {
        return Err(Fallo::de("ya_existe", ""));
    }
    Ok(con)
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
    let pasada = (|| {
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        fusion::fusionar(&tx, &imp, &i.meta, &HashMap::new(), &marca)
    })();
    Ok(ResumenImportacion {
        organizacion: i.meta.organizacion.clone(),
        parcial: i.meta.parcial,
        informe: pasada.ok(),
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
    db::marcar_cambio(&tx, version_app)?;
    tx.commit()?;
    Ok(informe)
}

/// «Reemplazar todo»: solo con archivos completos. De `meta` queda solo lo conocido, porque la copia pasa a ser la base local.
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
    let lista = vec!["?"; META_CONOCIDAS.len()].join(", ");
    c.execute(
        &format!("DELETE FROM meta WHERE clave NOT IN ({lista})"),
        rusqlite::params_from_iter(META_CONOCIDAS),
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
            INSERT INTO trabajadores (id, nombre, correo, created_at, updated_at) VALUES
              ('yanoesta', 'PersonaYaNoEsta', 'yanoesta@x.cl', {x});
            INSERT INTO asignaciones (id, puesto_id, trabajador_id, tipo, desde, hasta, motivo, created_at, updated_at) VALUES
              ('as-ana-antes', 'p-hija', 'ana', 'titular', '2010-01-01', '2015-01-01', NULL, {x}),
              ('as-yanoesta', 'p-hija', 'yanoesta', 'titular', '2015-01-01', '2020-01-01', 'motivo-yanoesta', {x});
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
        let previa = vista.informe.expect("la revisión pasa");
        assert!(previa.ramas[0].pide_lugar);
        assert_eq!(previa.nombre_heredado.as_deref(), Some("Mi Org / SA"));

        let hecho = agregar(&mut conn, &respaldos, &i, &HashMap::new(), "1.2.3").unwrap();
        assert_eq!(cuenta(&conn, "unidades"), 2);
        assert_eq!(cuenta(&conn, "trabajadores"), 2);
        let por = |inf: &Informe| -> Vec<i64> { inf.tablas.iter().map(|t| t.nuevas).collect() };
        assert_eq!(por(&hecho), por(&previa));
        assert_eq!(hecho.nombre_heredado.as_deref(), Some("Mi Org / SA"));
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
        s.empezar("t1");
        assert!(s.sigue("t1"));
        s.guardar_exportacion("t1", t).unwrap();
        // cancelar otro trabajo no le hace nada
        s.cancelar("otro");
        assert!(s.sigue("t1") && ruta.exists());
        s.cancelar("t1");
        assert!(!s.sigue("t1"));
        assert!(!ruta.exists());
    }

    fn importacion(d: &Path, o: &Connection, destino: &Path) -> Importacion {
        let (archivo, codigo) = exportar(o, d, None);
        abrir(&archivo, destino, &codigo, MIGRACIONES, SIGUE).unwrap()
    }

    #[test]
    fn cancelar_y_reabrir_nunca_aplica_otro_archivo() {
        let (d, origen) = base_con_datos();
        let (dd, _bd, respaldos, mut conn) = destino();
        let s = Sesiones::default();

        // el trabajo A se cancela mientras está en curso, y se empieza B con otro archivo
        s.empezar("A");
        let a = importacion(d.path(), &origen, dd.path());
        let ruta_a = a.temporal.ruta().to_path_buf();
        s.cancelar("A");
        s.empezar("B");
        s.guardar_archivo("B", d.path().join("otro.boldo")).unwrap();
        let b = importacion(d.path(), &origen, dd.path());
        let ruta_b = b.temporal.ruta().to_path_buf();
        s.guardar_importacion("B", b).unwrap();

        // A termina tarde: no deja nada, y su temporal se borra
        assert_eq!(
            s.guardar_importacion("A", a).unwrap_err().codigo,
            "cancelado"
        );
        assert!(!ruta_a.exists());
        assert!(ruta_b.exists());
        // aplicar lo de A no toca lo de B
        assert_eq!(s.tomar_importacion("A").unwrap_err().codigo, "desconocido");
        assert_eq!(s.archivo("A").unwrap_err().codigo, "desconocido");
        let i = s.tomar_importacion("B").unwrap();
        assert_eq!(i.temporal.ruta(), ruta_b);
        agregar(&mut conn, &respaldos, &i, &HashMap::new(), "1").unwrap();

        // la exportación sigue la misma regla, y lo ya tomado no se puede aplicar dos veces
        assert_eq!(s.tomar_importacion("B").unwrap_err().codigo, "desconocido");
        s.empezar("C");
        let t = Temporal::nuevo(dd.path(), "exportando");
        fs::write(t.ruta(), "x").unwrap();
        s.guardar_exportacion("C", t).unwrap();
        assert_eq!(s.tomar_exportacion("B").unwrap_err().codigo, "desconocido");
        s.tomar_exportacion("C").unwrap();
        let tarde = Temporal::nuevo(dd.path(), "exportando");
        assert_eq!(
            s.guardar_exportacion("B", tarde).unwrap_err().codigo,
            "cancelado"
        );
    }

    #[test]
    fn empezar_otro_trabajo_borra_los_temporales_del_anterior() {
        let (dd, ..) = destino();
        let s = Sesiones::default();
        s.empezar("A");
        let t = Temporal::nuevo(dd.path(), "exportando");
        fs::write(t.ruta(), "x").unwrap();
        let ruta = t.ruta().to_path_buf();
        s.guardar_exportacion("A", t).unwrap();
        s.empezar("B");
        assert!(!ruta.exists());
    }

    #[test]
    fn un_fallo_de_la_revision_no_impide_reemplazar_con_un_archivo_valido() {
        let (d, origen) = base_con_datos();
        let (dd, bd, respaldos, mut conn) = destino();
        // una base local con una referencia rota: agregar no pasaría su comprobación final
        conn.execute_batch(&format!(
            "PRAGMA foreign_keys = OFF;
             INSERT INTO unidades (id, tipo_id, nombre, parent_id, created_at, updated_at)
               VALUES ('rota', '{TIPO}', 'Rota', 'nadie', 'x', 'x');
             PRAGMA foreign_keys = ON;"
        ))
        .unwrap();
        let i = importacion(d.path(), &origen, dd.path());
        let r = revisar(&mut conn, &i).unwrap();
        assert!(r.informe.is_none());
        let mut slot = Some(conn);
        reemplazar(&mut slot, &bd, &respaldos, &i, MIGRACIONES).unwrap();
    }

    #[test]
    fn reemplazar_conserva_solo_las_claves_conocidas_de_meta() {
        let (_d, archivo, codigo) =
            hostil("INSERT INTO meta (clave, valor) VALUES ('ajena', 'x');");
        let (dd, bd, respaldos, conn) = destino();
        let i = abrir(&archivo, dd.path(), &codigo, MIGRACIONES, SIGUE).unwrap();
        let mut slot = Some(conn);
        reemplazar(&mut slot, &bd, &respaldos, &i, MIGRACIONES).unwrap();
        let c = db::abrir(&bd).unwrap();
        let claves: Vec<String> = c
            .prepare("SELECT clave FROM meta")
            .unwrap()
            .query_map([], |f| f.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert!(
            claves.iter().all(|k| META_CONOCIDAS.contains(&k.as_str())),
            "{claves:?}"
        );
        assert!(claves.iter().any(|k| k == "org_nombre"));
    }

    #[test]
    fn agregar_la_extension_no_pisa_un_archivo_que_el_dialogo_no_pregunto() {
        let d = tempfile::tempdir().unwrap();
        let sin = d.path().join("copia");
        assert_eq!(
            con_extension(sin.clone()).unwrap(),
            d.path().join("copia.boldo")
        );
        fs::write(d.path().join("copia.boldo"), "mío").unwrap();
        assert_eq!(con_extension(sin).unwrap_err().codigo, "ya_existe");
        // si ya venía con la extensión, el diálogo sí preguntó
        let con = d.path().join("copia.BOLDO");
        assert_eq!(con_extension(con.clone()).unwrap(), con);
    }

    #[test]
    fn exportar_rechaza_una_base_que_no_se_podria_importar() {
        let (d, origen) = base_con_datos();
        origen
            .execute(
                "UPDATE trabajadores SET nombre = ?1 WHERE id = 'ana'",
                ["x".repeat(2000)],
            )
            .unwrap();
        let copia = alcance::copiar(&origen, d.path()).unwrap();
        let e = alcance::preparar(copia, d.path(), None).unwrap_err();
        assert_eq!(e.codigo, "muy_pesado");
        assert!(temporales(d.path()).is_empty());
    }
}

#[cfg(test)]
mod revision_22a {
    use super::prueba::*;
    use super::*;
    use db::MIGRACIONES;
    const COD: &str = "K7QM-2XRP-9DWN-H4TB-V3CJ";
    const CAB: usize = 53;
    const BLO: usize = (1 << 20) + 16;
    fn completa(d: &Path, o: &Connection) -> Temporal {
        let c = alcance::copiar(o, d).unwrap();
        alcance::preparar(c, d, None).unwrap().0
    }
    fn abre(dir: &Path, b: &[u8]) -> Result<Vec<u8>, Fallo> {
        let (a, s) = (dir.join("t.boldo"), dir.join("t.out"));
        fs::write(&a, b).unwrap();
        formato::descifrar(&a, &s, COD, |_, _| true)?;
        Ok(fs::read(s).unwrap())
    }
    fn cifra(dir: &Path, claro: &[u8], n: &str) -> Vec<u8> {
        let (a, s) = (dir.join("c.in"), dir.join(n));
        fs::write(&a, claro).unwrap();
        formato::cifrar(&a, &s, COD, |_, _| true).unwrap();
        fs::read(s).unwrap()
    }

    #[test]
    fn t_tamper_bloques() {
        let d = tempfile::tempdir().unwrap();
        let claro = vec![7u8; 3 * (1 << 20) + 5];
        let f = cifra(d.path(), &claro, "a");
        assert_eq!(abre(d.path(), &f).unwrap(), claro);
        let (h, c) = f.split_at(CAB);
        let (b0, b1, b2, b3) = (
            &c[..BLO],
            &c[BLO..2 * BLO],
            &c[2 * BLO..3 * BLO],
            &c[3 * BLO..],
        );
        let casos: Vec<(&str, Vec<u8>)> = vec![
            ("duplicado", [h, b0, b0, b1, b2, b3].concat()),
            ("quitado medio", [h, b0, b2, b3].concat()),
            ("quitado ultimo", [h, b0, b1, b2].concat()),
            ("anexado", [h, b0, b1, b2, b3, b3].concat()),
            ("basura al final", [h, b0, b1, b2, b3, &[0u8; 16]].concat()),
            ("ultimo primero", [h, b3, b1, b2, b0].concat()),
        ];
        for (n, b) in casos {
            assert_eq!(abre(d.path(), &b).unwrap_err().codigo, "no_abre", "{n}");
        }
        // empalme entre archivos con el MISMO codigo
        let g = cifra(d.path(), &claro, "b");
        assert_ne!(&f[..CAB], &g[..CAB]);
        let mezcla = [&g[..CAB], &f[CAB..]].concat();
        assert_eq!(
            abre(d.path(), &mezcla).unwrap_err().codigo,
            "no_abre",
            "cabecera ajena"
        );
        let mezcla = [&f[..CAB + BLO], &g[CAB + BLO..]].concat();
        assert_eq!(
            abre(d.path(), &mezcla).unwrap_err().codigo,
            "no_abre",
            "bloques ajenos"
        );
        // multiplo exacto cortado en el borde: el penultimo no lleva la marca de ultimo
        let e = cifra(d.path(), &vec![1u8; 2 << 20], "e");
        assert_eq!(e.len(), CAB + 2 * BLO);
        assert_eq!(
            abre(d.path(), &e[..CAB + BLO]).unwrap_err().codigo,
            "no_abre",
            "borde"
        );
        // vacio: quitar la etiqueta
        let v = cifra(d.path(), b"", "v");
        assert_eq!(v.len(), CAB + 16);
        assert_eq!(abre(d.path(), &v).unwrap(), b"");
        assert_eq!(abre(d.path(), &v[..CAB]).unwrap_err().codigo, "no_abre");
    }

    #[test]
    fn t_crlf_contra_lf() {
        let (d, o) = base_con_datos();
        let t = completa(d.path(), &o);
        println!("este build tiene CRLF: {}", MIGRACIONES[0].contains("\r\n"));
        let otro = if MIGRACIONES[0].contains("\r\n") {
            MIGRACIONES[0].replace("\r\n", "\n")
        } else {
            MIGRACIONES[0].replace('\n', "\r\n")
        };
        let r = validar::revisar(t.ruta(), &[otro.as_str()]);
        println!("revisar con el otro fin de linea: {r:?}");
        assert!(r.is_ok(), "{:?}", r.err());
    }

    #[test]
    fn t_cabecera_wal_hostil() {
        let (d, o) = base_con_datos();
        let t = completa(d.path(), &o);
        let mut b = fs::read(t.ruta()).unwrap();
        println!("cabecera 18,19 = {},{}", b[18], b[19]);
        b[18] = 2;
        b[19] = 2;
        fs::write(t.ruta(), &b).unwrap();
        let r = validar::revisar(t.ruta(), MIGRACIONES);
        println!("revisar WAL: {r:?}");
        let lado: Vec<String> = fs::read_dir(d.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        println!("{lado:?}");
        drop(t);
        let lado: Vec<String> = fs::read_dir(d.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .filter(|n| n.contains(".tmp"))
            .collect();
        assert!(lado.is_empty(), "{lado:?}");
    }

    #[test]
    fn t_union_mantenedor_con_tildes() {
        let (d, o) = base_con_datos();
        o.execute_batch(
            "INSERT INTO cargos (id, nombre, created_at, updated_at) VALUES ('c-t', 'GERENCIA DE ADMINISTRACIÓN', 'x', 'x');
             UPDATE puestos SET cargo_id = 'c-t' WHERE id = 'p-rama';",
        )
        .unwrap();
        let dir = tempfile::tempdir().unwrap();
        let mut dst = db::abrir(&dir.path().join("b.db")).unwrap();
        db::migrar(&mut dst, dir.path()).unwrap();
        db::asegurar_meta(&dst).unwrap();
        dst.execute_batch(
            "INSERT INTO cargos (id, nombre, created_at, updated_at) VALUES ('c-l', 'Gerencia de Administración', 'x', 'x');",
        )
        .unwrap();
        let t = completa(d.path(), &o);
        let imp = validar::solo_lectura(t.ruta()).unwrap();
        let meta = validar::leer_meta(&imp).unwrap();
        let tx = dst.transaction().unwrap();
        fusion::fusionar(&tx, &imp, &meta, &HashMap::new(), "z").unwrap();
        let n: i64 = tx
            .query_row(
                "SELECT count(*) FROM cargos WHERE nombre LIKE '%ADMINISTRACI%'",
                [],
                |f| f.get(0),
            )
            .unwrap();
        println!("cargos con ese nombre tras importar (LIKE sin tilde): {n}");
        assert_eq!(n, 1, "se duplico el valor de mantenedor");
    }
}
