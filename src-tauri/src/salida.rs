//! Qué pasa al cerrar: preguntar, dejar en la bandeja o salir. Solo la X, Alt+F4, un `WM_CLOSE` y «Salir» del menú y de la
//! bandeja pasan por `CloseRequested`. Restaurar un respaldo (`app.restart`), el reemplazo de la portable y el actualizador
//! (`app.exit`), el instalador y el desinstalador (Restart Manager: `RmForceShutdown`, que llega como `WM_ENDSESSION`) y el
//! apagado del sistema (`WM_ENDSESSION`) no, y por eso cierran de verdad, sin preguntar y aunque la preferencia sea la bandeja.
//!
//! Lo decide la interfaz. Para que cerrar nunca quede bloqueado: mientras la interfaz no avisa que está lista (no cargó o
//! muestra un error) la ventana se cierra sin más y, si no responde en `ESPERA` (diálogo a la vista o ventana oculta), la
//! app sale igual: una ventana colgada no se oculta. Abrir y «Salir» de la bandeja se atienden aquí, porque con la
//! interfaz colgada su JavaScript ya no corre. Con la ventana ya oculta, un cierre que no es «Salir» no viene del usuario
//! (no hay X que pulsar): sale sin más, sin preguntarle a nadie ni dejar esperando al programa que lo pidió.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;
use tauri::{AppHandle, CloseRequestApi, Emitter, Manager, Runtime, State};

const EVENTO: &str = "cierre-pedido";
const ESPERA: Duration = Duration::from_secs(3);
const VENTANA: &str = "main";

#[derive(Debug, PartialEq)]
enum Pedido {
    /// Ventana oculta y no es «Salir»: nadie pulsó la X.
    SalirYa,
    /// La interfaz no está lista: no hay a quién preguntarle, la ventana se cierra.
    CerrarSinMas,
    /// Le toca decidir a la interfaz, que debe responder en `ESPERA`. `salir`: nunca termina en la bandeja.
    Interfaz { numero: u64, salir: bool },
}

#[derive(Default)]
pub struct Cierre {
    lista: AtomicBool,
    pedidos: AtomicU64,
    atendidos: AtomicU64,
    /// «Salir» del menú o de la bandeja: se gasta en el `CloseRequested` que provoca.
    salir: AtomicBool,
}

impl Cierre {
    /// Clasifica un `CloseRequested`. El aviso de «Salir» se gasta aquí, pase lo que pase.
    fn pedido(&self, oculta: bool) -> Pedido {
        let salir = self.salir.swap(false, Ordering::SeqCst);
        if !salir && oculta {
            return Pedido::SalirYa;
        }
        if !self.lista.load(Ordering::SeqCst) {
            return Pedido::CerrarSinMas;
        }
        let numero = self.pedidos.fetch_add(1, Ordering::SeqCst) + 1;
        Pedido::Interfaz { numero, salir }
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
    let oculta = app
        .get_webview_window(VENTANA)
        .is_some_and(|v| v.is_visible().is_ok_and(|visible| !visible));
    match app.state::<Cierre>().pedido(oculta) {
        Pedido::SalirYa => {
            api.prevent_close();
            app.exit(0);
        }
        Pedido::CerrarSinMas => {}
        Pedido::Interfaz { numero, salir } => {
            if app.emit(EVENTO, salir).is_err() {
                return;
            }
            api.prevent_close();
            let app = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(ESPERA);
                if !app.state::<Cierre>().atendido(numero) {
                    app.exit(0);
                }
            });
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn lista() -> Cierre {
        let c = Cierre::default();
        c.lista.store(true, Ordering::SeqCst);
        c
    }

    #[test]
    fn sin_interfaz_lista_la_ventana_se_cierra_sin_mas() {
        assert_eq!(Cierre::default().pedido(false), Pedido::CerrarSinMas);
    }

    #[test]
    fn con_la_ventana_oculta_un_cierre_que_no_es_salir_sale_ya() {
        assert_eq!(lista().pedido(true), Pedido::SalirYa);
        assert_eq!(Cierre::default().pedido(true), Pedido::SalirYa);
    }

    #[test]
    fn la_x_le_pregunta_a_la_interfaz() {
        assert_eq!(
            lista().pedido(false),
            Pedido::Interfaz {
                numero: 1,
                salir: false
            }
        );
    }

    #[test]
    fn salir_pasa_por_la_interfaz_tambien_oculta_y_se_gasta_una_vez() {
        let c = lista();
        c.salir.store(true, Ordering::SeqCst);
        assert_eq!(
            c.pedido(true),
            Pedido::Interfaz {
                numero: 1,
                salir: true
            }
        );
        assert_eq!(c.pedido(true), Pedido::SalirYa);
        c.salir.store(true, Ordering::SeqCst);
        assert_eq!(
            c.pedido(false),
            Pedido::Interfaz {
                numero: 2,
                salir: true
            }
        );
        assert_eq!(
            c.pedido(false),
            Pedido::Interfaz {
                numero: 3,
                salir: false
            }
        );
    }

    #[test]
    fn un_salir_sin_interfaz_lista_no_queda_pendiente() {
        let c = Cierre::default();
        c.salir.store(true, Ordering::SeqCst);
        assert_eq!(c.pedido(false), Pedido::CerrarSinMas);
        c.lista.store(true, Ordering::SeqCst);
        assert_eq!(
            c.pedido(false),
            Pedido::Interfaz {
                numero: 1,
                salir: false
            }
        );
    }

    #[test]
    fn un_pedido_sin_respuesta_queda_pendiente_hasta_atenderlo() {
        let c = lista();
        c.pedido(false);
        assert!(!c.atendido(1));
        c.atender();
        assert!(c.atendido(1));
        // una respuesta anterior no vale por un intento nuevo: si la interfaz dejó de responder, se sale igual
        c.pedido(false);
        assert!(!c.atendido(2));
    }
}
