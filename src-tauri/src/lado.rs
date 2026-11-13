//! La otra organización al lado, en solo lectura: un temporal que solo se consulta. Su archivo nunca se abre para escribir.
use crate::comandos::Estado;
use crate::comparar_organizaciones::{Copia, copiar_otra, leer};
use crate::db;
use crate::organizaciones::OTRA_BASE;
use crate::respaldos::Fallo;
use rusqlite::Connection;
use serde::Serialize;
use std::sync::{Mutex, MutexGuard};
use tauri::{AppHandle, Manager, State};

/// `conn` va primero: se cierra antes de que `copia` borre su archivo, que en Windows no se borra abierto.
struct Abierto {
    conn: Connection,
    copia: Copia,
}

/// Una a la vez. Las escrituras siguen yendo solo por la abierta: con el id de esta dan `otra_base`.
#[derive(Default)]
pub struct Lado {
    abierto: Mutex<Option<Abierto>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InfoLado {
    pub id: String,
    /// Las vivas: sin `deleted_at`.
    pub personas: u64,
    pub unidades: u64,
}

impl Lado {
    fn abierto(&self) -> MutexGuard<'_, Option<Abierto>> {
        self.abierto.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// Con la conexión de solo lectura, si `id` es el de la copia. Si no, `otra_base`.
    pub fn con_lectura<T>(
        &self,
        id: &str,
        f: impl FnOnce(&Connection) -> Result<T, String>,
    ) -> Result<T, String> {
        match self.abierto().as_ref() {
            Some(a) if a.copia.id == id => f(&a.conn),
            _ => Err(OTRA_BASE.into()),
        }
    }

    /// Suelta la copia, y borra su temporal, si `id` es el de ella.
    pub fn soltar_si(&self, id: &str) {
        let mut g = self.abierto();
        if g.as_ref().is_some_and(|a| a.copia.id == id) {
            *g = None;
        }
    }

    pub fn cerrar(&self) {
        *self.abierto() = None;
    }

    /// Reemplaza la anterior, que se suelta con su temporal.
    fn poner(&self, copia: Copia) -> Result<InfoLado, Fallo> {
        let conn = leer(&copia)?;
        let (personas, unidades) = conn.query_row(
            "SELECT (SELECT count(*) FROM trabajadores WHERE deleted_at IS NULL),
                    (SELECT count(*) FROM unidades WHERE deleted_at IS NULL)",
            [],
            |f| Ok((f.get::<_, i64>(0)? as u64, f.get::<_, i64>(1)? as u64)),
        )?;
        let info = InfoLado {
            id: copia.id.clone(),
            personas,
            unidades,
        };
        *self.abierto() = Some(Abierto { conn, copia });
        Ok(info)
    }
}

/// La abierta primero: un id que es el de ella nunca va al lado. Si no es la abierta ni la del lado, `otra_base`.
pub fn leer_en<T>(
    estado: &Estado,
    lado: &Lado,
    id: &str,
    f: impl Fn(&Connection) -> Result<T, String>,
) -> Result<T, String> {
    match estado.con_conexion(id, |c| f(c)) {
        Err(e) if e == OTRA_BASE => lado.con_lectura(id, f),
        r => r,
    }
}

/// Copia `otra_id` a un temporal y la deja al lado. `base_id` es la abierta, como en todo comando con datos.
fn lado_en(
    estado: &Estado,
    lado: &Lado,
    base_id: &str,
    otra_id: &str,
    migraciones: &[&str],
) -> Result<InfoLado, Fallo> {
    estado.base(base_id)?;
    let (r, e) = estado.entrada(otra_id)?;
    let copia = copiar_otra(r, &e, base_id, migraciones)?;
    // con `conn` tomado hasta dejarla: un cambio de organización espera, y una pedida desde la anterior no queda
    estado.con_conexion(base_id, |_| lado.poner(copia))
}

/// En un hilo aparte, como `comparar_organizaciones`: copia el archivo entero de la otra.
#[tauri::command]
pub async fn lado_abrir(
    app: AppHandle,
    base_id: String,
    otra_id: String,
) -> Result<InfoLado, Fallo> {
    tauri::async_runtime::spawn_blocking(move || {
        lado_en(
            &app.state::<Estado>(),
            &app.state::<Lado>(),
            &base_id,
            &otra_id,
            db::MIGRACIONES,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Suelta la copia y borra su temporal.
#[tauri::command]
pub fn lado_cerrar(lado: State<Lado>) {
    lado.cerrar();
}

/// Tres organizaciones en una carpeta temporal, con A abierta: las pruebas nunca tocan los datos reales.
#[cfg(test)]
pub(crate) mod prueba {
    use super::*;
    use crate::db::MIGRACIONES;
    use crate::organizaciones::prueba::{escribir, interna, rutas};
    use crate::organizaciones::{Entrada, ruta_de};
    use crate::rutas::Rutas;
    use std::time::Duration;

    pub struct Tres {
        pub _exe: tempfile::TempDir,
        pub r: Rutas,
        pub e: Estado,
        pub lado: Lado,
        pub a: Entrada,
        pub b: Entrada,
        pub c: Entrada,
    }

    /// `sql_b` se ejecuta en el archivo de B antes de abrir nada.
    pub fn tres(sql_b: &str) -> Tres {
        let (_exe, r) = rutas();
        let (a, b, c) = (
            interna(&r, "2026"),
            interna(&r, "2020"),
            interna(&r, "2019"),
        );
        let conn = db::abrir(&ruta_de(&r, &b)).unwrap();
        conn.execute_batch(sql_b).unwrap();
        conn.close().unwrap();
        escribir(&r, vec![a.clone(), b.clone(), c.clone()]);
        let e = Estado::de_prueba(None, None, Some(r.clone()));
        e.abrir_inicial_con(Duration::ZERO, MIGRACIONES);
        Tres {
            _exe,
            r,
            e,
            lado: Lado::default(),
            a,
            b,
            c,
        }
    }

    impl Tres {
        /// B al lado, pedida desde A.
        pub fn abrir_lado(&self) -> InfoLado {
            lado_en(&self.e, &self.lado, &self.a.id, &self.b.id, MIGRACIONES).unwrap()
        }

        pub fn temporales(&self) -> usize {
            std::fs::read_dir(&self.r.datos)
                .unwrap()
                .filter(|x| {
                    x.as_ref()
                        .unwrap()
                        .file_name()
                        .to_string_lossy()
                        .starts_with("boldo-comparar-")
                })
                .count()
        }

        /// El `db_id` de la base con que responde `id`.
        pub fn db_id(&self, id: &str) -> Result<String, String> {
            leer_en(&self.e, &self.lado, id, |c| {
                let filas = db::consultar(c, "SELECT valor FROM meta WHERE clave = 'db_id'", &[])?;
                Ok(filas[0]["valor"].as_str().unwrap().to_string())
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::prueba::tres;
    use super::*;
    use crate::db::MIGRACIONES;

    const FECHA: &str = "2026-11-01T12:00:00.000Z";
    const GERENCIA: &str = "00000000-0000-7000-8000-000000000001";

    #[test]
    fn lado_abrir_consigo_misma_da_misma() {
        let d = tres("");
        let r = lado_en(&d.e, &d.lado, &d.a.id, &d.a.id, MIGRACIONES);
        assert_eq!(r.unwrap_err().codigo, "misma");
        assert_eq!(d.temporales(), 0);
    }

    #[test]
    fn lado_abrir_desde_otra_base_no_deja_nada() {
        let d = tres("");
        let r = lado_en(&d.e, &d.lado, &d.c.id, &d.b.id, MIGRACIONES);
        assert_eq!(r.unwrap_err().codigo, "otra_base");
        assert_eq!(
            d.lado.con_lectura(&d.b.id, |_| Ok(())).unwrap_err(),
            "otra_base"
        );
        assert_eq!(d.temporales(), 0);
    }

    #[test]
    fn info_cuenta_solo_lo_vivo() {
        let d = tres(&format!(
            "INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES
               ('u1', '{GERENCIA}', 'Viva', '{FECHA}', '{FECHA}');
             INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at, deleted_at) VALUES
               ('u2', '{GERENCIA}', 'Borrada', '{FECHA}', '{FECHA}', '{FECHA}');
             INSERT INTO trabajadores (id, nombre, created_at, updated_at) VALUES
               ('t1', 'Ana', '{FECHA}', '{FECHA}'), ('t2', 'Beto', '{FECHA}', '{FECHA}');
             INSERT INTO trabajadores (id, nombre, created_at, updated_at, deleted_at) VALUES
               ('t3', 'Caro', '{FECHA}', '{FECHA}', '{FECHA}');"
        ));
        let info = d.abrir_lado();
        assert_eq!(
            (info.id.as_str(), info.unidades, info.personas),
            (d.b.id.as_str(), 1, 2)
        );
    }

    #[test]
    fn abrir_otra_reemplaza_la_anterior_y_cerrar_la_suelta() {
        let d = tres("");
        d.abrir_lado();
        lado_en(&d.e, &d.lado, &d.a.id, &d.c.id, MIGRACIONES).unwrap();
        assert_eq!(d.temporales(), 1);
        assert_eq!(d.db_id(&d.b.id).unwrap_err(), "otra_base");
        assert_eq!(d.db_id(&d.c.id).unwrap(), d.c.id);
        d.lado.cerrar();
        assert_eq!(d.temporales(), 0);
        assert_eq!(d.db_id(&d.c.id).unwrap_err(), "otra_base");
    }
}
