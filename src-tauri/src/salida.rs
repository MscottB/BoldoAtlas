//! Cerrar la ventana (X, Alt+F4, y «Salir» del menú y de la bandeja, que la cierran) pregunta antes de salir. Solo esa
//! acción pasa por `CloseRequested`: restaurar un respaldo (`app.restart`), el reemplazo de la portable (`app.exit`), el
//! instalador (termina el proceso) y el apagado del sistema (`WM_ENDSESSION`) no, y por eso no preguntan.
//!
//! La pregunta la hace la interfaz. Para que cerrar nunca quede bloqueado: mientras la interfaz no avisa que está lista
//! (no cargó o muestra un error) la ventana se cierra sin más y, si no responde al pedido en `ESPERA`, la app sale igual.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;
use tauri::{AppHandle, CloseRequestApi, Emitter, Manager, Runtime, State};

const EVENTO: &str = "cierre-pedido";
const ESPERA: Duration = Duration::from_secs(3);

#[derive(Default)]
pub struct Cierre {
    lista: AtomicBool,
    pedidos: AtomicU64,
    atendidos: AtomicU64,
}

impl Cierre {
    /// Número del pedido, o None si la interfaz no está lista para atenderlo.
    fn pedir(&self) -> Option<u64> {
        self.lista
            .load(Ordering::SeqCst)
            .then(|| self.pedidos.fetch_add(1, Ordering::SeqCst) + 1)
    }

    fn atender(&self) {
        self.atendidos
            .store(self.pedidos.load(Ordering::SeqCst), Ordering::SeqCst);
    }

    fn atendido(&self, pedido: u64) -> bool {
        self.atendidos.load(Ordering::SeqCst) >= pedido
    }
}

pub fn al_pedir_cierre<R: Runtime>(app: &AppHandle<R>, api: &CloseRequestApi) {
    let Some(pedido) = app.state::<Cierre>().pedir() else {
        return;
    };
    if app.emit(EVENTO, ()).is_err() {
        return;
    }
    api.prevent_close();
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(ESPERA);
        if !app.state::<Cierre>().atendido(pedido) {
            app.exit(0);
        }
    });
}

#[tauri::command]
pub fn cierre_listo(cierre: State<Cierre>) {
    cierre.lista.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn cierre_atendido(cierre: State<Cierre>) {
    cierre.atender();
}

/// Sale sin preguntar: ya respondió el usuario, o apagó la pregunta. `RunEvent::Exit` cierra SQLite en orden.
#[tauri::command]
pub fn salir_app<R: Runtime>(app: AppHandle<R>) {
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sin_interfaz_lista_no_hay_a_quien_preguntar() {
        assert_eq!(Cierre::default().pedir(), None);
    }

    #[test]
    fn un_pedido_sin_respuesta_queda_pendiente_hasta_atenderlo() {
        let c = Cierre::default();
        c.lista.store(true, Ordering::SeqCst);
        let primero = c.pedir().unwrap();
        assert!(!c.atendido(primero));
        c.atender();
        assert!(c.atendido(primero));
        // una respuesta anterior no vale por un intento nuevo: si la interfaz dejó de responder, se sale igual
        let segundo = c.pedir().unwrap();
        assert!(!c.atendido(segundo));
    }
}
