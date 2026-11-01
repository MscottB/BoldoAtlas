//! Qué pasa al cerrar: preguntar, dejar en la bandeja o salir. Solo la X, Alt+F4 y «Salir» del menú y de la bandeja pasan
//! por `CloseRequested`. Restaurar un respaldo (`app.restart`), el reemplazo de la portable y el actualizador (`app.exit`),
//! el instalador (Restart Manager: `RmForceShutdown`, que llega como `WM_ENDSESSION`) y el apagado del sistema
//! (`WM_ENDSESSION`) no, y por eso cierran de verdad, sin preguntar y aunque la preferencia sea la bandeja.
//!
//! Lo decide la interfaz. Para que cerrar nunca quede bloqueado: mientras la interfaz no avisa que está lista (no cargó o
//! muestra un error) la ventana se cierra sin más y, si no responde en `ESPERA` (diálogo a la vista o ventana oculta), la
//! app sale igual: una ventana colgada no se oculta. Abrir y «Salir» de la bandeja se atienden aquí, porque con la
//! interfaz colgada su JavaScript ya no corre.
//!
//! Dejar en la bandeja solo vale para un cierre del usuario. En Windows, un `WM_CLOSE` de otro programa llega igual que la
//! X; lo que los separa es que la X y Alt+F4 entran antes como `WM_SYSCOMMAND`/`SC_CLOSE`. Sin eso se trata como «Salir» y,
//! con la ventana ya oculta, sale sin más: ahí no hay a quién preguntarle y el otro programa quedaría esperando.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;
use tauri::{AppHandle, CloseRequestApi, Emitter, Manager, Runtime, State};

const EVENTO: &str = "cierre-pedido";
const ESPERA: Duration = Duration::from_secs(3);
const VENTANA: &str = "main";

#[derive(Default)]
pub struct Cierre {
    lista: AtomicBool,
    pedidos: AtomicU64,
    atendidos: AtomicU64,
    /// «Salir» del menú o de la bandeja: se gasta en el `CloseRequested` que provoca.
    salir: AtomicBool,
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
    let cierre = app.state::<Cierre>();
    let salir = cierre.salir.swap(false, Ordering::SeqCst);
    let del_usuario = x_de_la_ventana::pulsada();
    let oculta = app
        .get_webview_window(VENTANA)
        .is_some_and(|v| v.is_visible().is_ok_and(|visible| !visible));
    if !salir && !del_usuario && oculta {
        api.prevent_close();
        return app.exit(0);
    }
    let Some(pedido) = cierre.pedir() else {
        return;
    };
    if app.emit(EVENTO, salir || !del_usuario).is_err() {
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

/// Trae la ventana al frente, también si está minimizada u oculta en la bandeja.
pub fn mostrar<R: Runtime>(app: &AppHandle<R>) {
    if let Some(v) = app.get_webview_window(VENTANA) {
        let _ = v.unminimize();
        let _ = v.show();
        let _ = v.set_focus();
    }
}

#[tauri::command]
pub fn cierre_listo(cierre: State<Cierre>) {
    cierre.lista.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn cierre_atendido(cierre: State<Cierre>) {
    cierre.atender();
}

/// «Salir» del menú y de la bandeja: el camino de la X, pero nunca termina en la bandeja.
#[tauri::command]
pub fn pedir_salida<R: Runtime>(app: AppHandle<R>) {
    app.state::<Cierre>().salir.store(true, Ordering::SeqCst);
    if !app
        .get_webview_window(VENTANA)
        .is_some_and(|v| v.close().is_ok())
    {
        app.exit(0);
    }
}

/// Oculta la ventana sin salir. Si no se puede ocultar, sale: nunca queda algo a la vista que no responda a cerrar.
#[tauri::command]
pub fn ocultar_en_bandeja<R: Runtime>(app: AppHandle<R>, cierre: State<Cierre>) {
    cierre.atender();
    if !app
        .get_webview_window(VENTANA)
        .is_some_and(|v| v.hide().is_ok())
    {
        app.exit(0);
    }
}

/// Sale sin preguntar: ya respondió el usuario, o eligió no preguntar. `RunEvent::Exit` cierra SQLite en orden.
#[tauri::command]
pub fn salir_app<R: Runtime>(app: AppHandle<R>) {
    app.exit(0);
}

#[cfg(windows)]
pub mod x_de_la_ventana {
    use std::cell::Cell;
    use std::ffi::c_void;

    const WM_SYSCOMMAND: u32 = 0x0112;
    const SC_CLOSE: usize = 0xF060;
    const ID: usize = 1;

    type Hwnd = *mut c_void;
    type Subclase = unsafe extern "system" fn(Hwnd, u32, usize, isize, usize, usize) -> isize;

    #[link(name = "comctl32")]
    unsafe extern "system" {
        fn SetWindowSubclass(ventana: Hwnd, subclase: Subclase, id: usize, datos: usize) -> i32;
        fn DefSubclassProc(ventana: Hwnd, mensaje: u32, w: usize, l: isize) -> isize;
    }

    thread_local!(static PULSADA: Cell<bool> = const { Cell::new(false) });

    /// Si el `CloseRequested` en curso viene de la X o de Alt+F4 (corre dentro de `SC_CLOSE`, en el mismo hilo).
    pub fn pulsada() -> bool {
        PULSADA.get()
    }

    /// Sin esto (no se pudo instalar) `pulsada` da false: cerrar nunca termina en la bandeja, que es lo seguro.
    pub fn vigilar<R: tauri::Runtime>(ventana: &tauri::WebviewWindow<R>) {
        if let Ok(hwnd) = ventana.hwnd() {
            // SAFETY: la ventana existe y la subclase solo marca `PULSADA` y sigue con el procedimiento original
            unsafe { SetWindowSubclass(hwnd.0, subclase, ID, 0) };
        }
    }

    unsafe extern "system" fn subclase(
        ventana: Hwnd,
        mensaje: u32,
        w: usize,
        l: isize,
        _id: usize,
        _datos: usize,
    ) -> isize {
        // los 4 bits bajos de wParam son de uso interno del sistema
        let cerrar = mensaje == WM_SYSCOMMAND && w & 0xFFF0 == SC_CLOSE;
        if cerrar {
            PULSADA.set(true);
        }
        // SAFETY: son los argumentos recibidos, tal como pide la API
        let r = unsafe { DefSubclassProc(ventana, mensaje, w, l) };
        if cerrar {
            PULSADA.set(false);
        }
        r
    }
}

/// Fuera de Windows no hay `WM_CLOSE` de otros programas: lo que no es «Salir» es la X.
#[cfg(not(windows))]
pub mod x_de_la_ventana {
    pub fn pulsada() -> bool {
        true
    }
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
