mod actualizar;
mod comandos;
mod db;
mod inicio;
mod respaldos;
mod rutas;
mod salida;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // antes del Builder: la portable ajusta el entorno del proceso y aún no hay otros hilos
    let estado = comandos::Estado::iniciar();
    let webview = estado.dir_webview();
    let datos = estado.rutas_app().map(|r| r.datos.clone());
    let mut contexto = tauri::generate_context!();
    if let Some(r) = estado.rutas_app().filter(|r| r.portable) {
        let id = rutas::identificador_portable(&contexto.config().identifier, &r.datos);
        contexto.config_mut().identifier = id;
    }
    let mut app = tauri::Builder::default();
    // el primero: una segunda instancia cierra antes de crear nada. Arrancar con el sistema con la app ya abierta no
    // la interrumpe; abrirla a mano la trae al frente. Sin carpeta de datos no se sabe si es portable y solo muestra
    // el motivo («extrae el zip primero»): sin instancia única, para no irse a la ventana de otra copia sin decirlo.
    if estado.rutas_app().is_some() {
        app = app.plugin(tauri_plugin_single_instance::init(|app, args, _| {
            if args.iter().any(|a| a == inicio::ARGUMENTO) {
                return;
            }
            if let Some(v) = app.get_webview_window("main") {
                let _ = v.unminimize();
                let _ = v.show();
                let _ = v.set_focus();
            }
        }));
    }
    app.plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(estado)
        .manage(actualizar::Actualizador::default())
        .manage(salida::Cierre::default())
        .on_window_event(|ventana, evento| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = evento {
                salida::al_pedir_cierre(ventana.app_handle(), api);
            }
        })
        .setup(move |app| {
            // temporales de una actualización anterior, en otro hilo: ya en setup, con el entorno ajustado
            if let Some(datos) = datos {
                actualizar::limpiar_al_iniciar(datos);
            }
            // la ventana se crea aquí y no desde tauri.conf.json ("create": false) para que la portable
            // guarde el perfil del WebView en datos/ y no en %LOCALAPPDATA%
            let mut ventana = tauri::WebviewWindowBuilder::from_config(
                app.handle(),
                &app.config().app.windows[0],
            )?;
            if let Some(dir) = webview {
                ventana = ventana.data_directory(dir);
            }
            // arrancada por el sistema no le quita el foco a lo que el usuario abre al iniciar sesión; minimizada
            // y no oculta, porque cerrar la ventana cierra la app y no siempre hay bandeja desde donde volver
            let por_el_sistema = std::env::args().any(|a| a == inicio::ARGUMENTO);
            if por_el_sistema {
                ventana = ventana.focused(false);
            }
            let ventana = ventana.build()?;
            if por_el_sistema {
                let _ = ventana.minimize();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            comandos::info_app,
            comandos::db_consultar,
            comandos::db_lote,
            comandos::listar_respaldos,
            comandos::respaldar_ahora,
            comandos::respaldar_antes_de_reemplazar,
            comandos::restaurar_respaldo,
            comandos::abrir_carpeta_respaldos,
            comandos::info_proyecto,
            comandos::abrir_carpeta_datos,
            actualizar::buscar_actualizacion,
            actualizar::instalar_actualizacion,
            actualizar::cancelar_actualizacion,
            actualizar::bandeja_disponible,
            inicio::inicio_sistema,
            inicio::cambiar_inicio_sistema,
            salida::cierre_listo,
            salida::cierre_atendido,
            salida::salir_app
        ])
        .build(contexto)
        .expect("error while building tauri application")
        .run(|app, evento| {
            // cierre ordenado de SQLite (sin -wal/-shm sobrantes); no espera más de 3 s a un respaldo en curso
            if let tauri::RunEvent::Exit = evento {
                app.state::<comandos::Estado>()
                    .cerrar_ordenado(std::time::Duration::from_secs(3));
            }
        });
}
