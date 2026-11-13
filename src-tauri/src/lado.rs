//! La otra organización al lado, en solo lectura: un temporal que solo se consulta. Su archivo nunca se abre para escribir.
use crate::comandos::Estado;
use crate::comparar_organizaciones::{Copia, copiar_otra, leer};
use crate::db;
use crate::organizaciones::OTRA_BASE;
use crate::respaldos::Fallo;
use rusqlite::Connection;
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
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
    /// El último pedido: la copia de uno anterior, o de antes de cerrar, no queda al lado aunque termine después.
    pedidos: AtomicU64,
}

/// Lo que tarda, sin candados: la copia y su número de pedido. La deja al lado `dejar`.
struct Copiada {
    pedido: u64,
    copia: Copia,
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

    /// También deja sin efecto las copias que aún no terminan.
    pub fn cerrar(&self) {
        let mut g = self.abierto();
        self.pedidos.fetch_add(1, Ordering::SeqCst);
        *g = None;
    }

    fn pedir(&self) -> u64 {
        self.pedidos.fetch_add(1, Ordering::SeqCst) + 1
    }

    /// Reemplaza la anterior, que se suelta con su temporal, si nadie pidió otra o cerró después. Si no, `cancelado`.
    fn poner(&self, Copiada { pedido, copia }: Copiada) -> Result<InfoLado, Fallo> {
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
        let nuevo = Abierto { conn, copia };
        // con el candado: `cerrar` cuenta su pedido con él tomado
        let mut g = self.abierto();
        if self.pedidos.load(Ordering::SeqCst) != pedido {
            return Err(Fallo::de("cancelado", ""));
        }
        *g = Some(nuevo);
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

/// Copia `otra_id` a un temporal y la deja al lado, si `pedido` sigue siendo el último. `base_id` es la abierta, como en
/// todo comando con datos.
fn lado_en(
    estado: &Estado,
    lado: &Lado,
    pedido: u64,
    base_id: &str,
    otra_id: &str,
    migraciones: &[&str],
) -> Result<InfoLado, Fallo> {
    let copiada = copiar(estado, pedido, base_id, otra_id, migraciones)?;
    dejar(estado, lado, base_id, copiada)
}

fn copiar(
    estado: &Estado,
    pedido: u64,
    base_id: &str,
    otra_id: &str,
    migraciones: &[&str],
) -> Result<Copiada, Fallo> {
    estado.base(base_id)?;
    let (r, e) = estado.entrada(otra_id)?;
    let copia = copiar_otra(r, &e, base_id, migraciones, "lado")?;
    Ok(Copiada { pedido, copia })
}

/// Con `conn` tomado hasta dejarla: un cambio de organización o un eliminar esperan, y lo que cambió mientras se copiaba se
/// nota aquí. Si no queda, su temporal se borra.
fn dejar(estado: &Estado, lado: &Lado, base_id: &str, copiada: Copiada) -> Result<InfoLado, Fallo> {
    estado.con_conexion(base_id, |_| {
        // eliminada mientras se copiaba. Orden de candados: `conn`, luego `lista`, como `cambiar_a`
        estado.entrada(&copiada.copia.id)?;
        lado.poner(copiada)
    })
}

/// En un hilo aparte, como `comparar_organizaciones`: copia el archivo entero de la otra.
#[tauri::command]
pub async fn lado_abrir(
    app: AppHandle,
    base_id: String,
    otra_id: String,
) -> Result<InfoLado, Fallo> {
    // El pedido, al llegar y antes del hilo: un `lado_cerrar` posterior lo deja sin efecto aunque la copia no haya empezado.
    let pedido = app.state::<Lado>().pedir();
    tauri::async_runtime::spawn_blocking(move || {
        lado_en(
            &app.state::<Estado>(),
            &app.state::<Lado>(),
            pedido,
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
            lado_en(
                &self.e,
                &self.lado,
                self.lado.pedir(),
                &self.a.id,
                &self.b.id,
                MIGRACIONES,
            )
            .unwrap()
        }

        pub fn temporales(&self) -> usize {
            std::fs::read_dir(&self.r.datos)
                .unwrap()
                .filter(|x| {
                    x.as_ref()
                        .unwrap()
                        .file_name()
                        .to_string_lossy()
                        .starts_with("boldo-lado-")
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
        let r = lado_en(&d.e, &d.lado, d.lado.pedir(), &d.a.id, &d.a.id, MIGRACIONES);
        assert_eq!(r.unwrap_err().codigo, "misma");
        assert_eq!(d.temporales(), 0);
    }

    #[test]
    fn lado_abrir_desde_otra_base_no_deja_nada() {
        let d = tres("");
        let r = lado_en(&d.e, &d.lado, d.lado.pedir(), &d.c.id, &d.b.id, MIGRACIONES);
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
    fn el_ultimo_pedido_gana_aunque_su_copia_termine_antes() {
        let d = tres("");
        let primero = copiar(&d.e, d.lado.pedir(), &d.a.id, &d.b.id, MIGRACIONES).unwrap();
        let segundo = copiar(&d.e, d.lado.pedir(), &d.a.id, &d.c.id, MIGRACIONES).unwrap();
        dejar(&d.e, &d.lado, &d.a.id, segundo).unwrap();
        let tarde = dejar(&d.e, &d.lado, &d.a.id, primero);
        assert_eq!(tarde.unwrap_err().codigo, "cancelado");
        assert_eq!(d.db_id(&d.c.id).unwrap(), d.c.id);
        assert_eq!(d.db_id(&d.b.id).unwrap_err(), "otra_base");
        assert_eq!(d.temporales(), 1);
    }

    #[test]
    fn cerrar_deja_sin_efecto_la_copia_en_curso() {
        let d = tres("");
        let copiada = copiar(&d.e, d.lado.pedir(), &d.a.id, &d.b.id, MIGRACIONES).unwrap();
        d.lado.cerrar();
        let r = dejar(&d.e, &d.lado, &d.a.id, copiada);
        assert_eq!(r.unwrap_err().codigo, "cancelado");
        assert_eq!(d.db_id(&d.b.id).unwrap_err(), "otra_base");
        assert_eq!(d.temporales(), 0);
    }

    #[test]
    fn eliminada_mientras_se_copiaba_no_queda_al_lado() {
        let d = tres("");
        let copiada = copiar(&d.e, d.lado.pedir(), &d.a.id, &d.b.id, MIGRACIONES).unwrap();
        d.e.eliminar(&d.b.id, false, false, &|| false, MIGRACIONES)
            .unwrap();
        let r = dejar(&d.e, &d.lado, &d.a.id, copiada);
        assert_eq!(r.unwrap_err().codigo, "desconocido");
        assert_eq!(d.db_id(&d.b.id).unwrap_err(), "otra_base");
        assert_eq!(d.temporales(), 0);
    }

    #[test]
    fn cambio_de_base_mientras_se_copiaba_no_deja_nada() {
        let d = tres("");
        let copiada = copiar(&d.e, d.lado.pedir(), &d.a.id, &d.b.id, MIGRACIONES).unwrap();
        d.e.cambiar_a(&d.c.id, &|| false, MIGRACIONES).unwrap();
        let r = dejar(&d.e, &d.lado, &d.a.id, copiada);
        assert_eq!(r.unwrap_err().codigo, "otra_base");
        assert_eq!(d.db_id(&d.b.id).unwrap_err(), "otra_base");
        assert_eq!(d.temporales(), 0);
    }

    #[test]
    fn cerrar_antes_de_empezar_la_copia_la_deja_sin_efecto() {
        // El pedido se toma al llegar el comando, antes del hilo: un cierre que llega después lo cancela aunque la copia
        // aún no empiece.
        let d = tres("");
        let pedido = d.lado.pedir();
        d.lado.cerrar();
        let r = lado_en(&d.e, &d.lado, pedido, &d.a.id, &d.b.id, MIGRACIONES);
        assert_eq!(r.unwrap_err().codigo, "cancelado");
        assert_eq!(d.db_id(&d.b.id).unwrap_err(), "otra_base");
        assert_eq!(d.temporales(), 0);
    }

    #[test]
    fn abrir_otra_reemplaza_la_anterior_y_cerrar_la_suelta() {
        let d = tres("");
        d.abrir_lado();
        lado_en(&d.e, &d.lado, d.lado.pedir(), &d.a.id, &d.c.id, MIGRACIONES).unwrap();
        assert_eq!(d.temporales(), 1);
        assert_eq!(d.db_id(&d.b.id).unwrap_err(), "otra_base");
        assert_eq!(d.db_id(&d.c.id).unwrap(), d.c.id);
        d.lado.cerrar();
        assert_eq!(d.temporales(), 0);
        assert_eq!(d.db_id(&d.c.id).unwrap_err(), "otra_base");
    }
}
