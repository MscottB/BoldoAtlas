mod actualizar;
mod comandos;
mod comparar_organizaciones;
mod db;
mod fotos;
mod inicio;
mod intercambio;
mod organizaciones;
mod respaldos;
mod rutas;
mod salida;

use tauri::Manager;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // antes del Builder: la portable ajusta el entorno del proceso y aún no hay otros hilos
    let estado = comandos::Estado::iniciar();
    let webview = estado.dir_webview();
    let rutas_app = estado.rutas_app().cloned();
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
            salida::mostrar(app);
        }));
    }
    app.plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(estado)
        .manage(actualizar::Actualizador::default())
        .manage(salida::Cierre::default())
        .manage(intercambio::Sesiones::default())
        .manage(comparar_organizaciones::Comparaciones::default())
        .register_asynchronous_uri_scheme_protocol(fotos::ESQUEMA, |ctx, pedido, responder| {
            fotos::atender(ctx.app_handle().clone(), pedido, responder)
        })
        .on_page_load(|ventana, carga| {
            ventana
                .state::<intercambio::Sesiones>()
                .al_cargar_pagina(carga.event());
            // recargar la página suelta la comparación y su temporal, como a las sesiones
            if carga.event() == tauri::webview::PageLoadEvent::Started {
                ventana
                    .state::<comparar_organizaciones::Comparaciones>()
                    .cerrar();
            }
            if carga.event() == tauri::webview::PageLoadEvent::Finished {
                salida::mostrar_al_arrancar(ventana.app_handle());
            }
        })
        .on_window_event(|ventana, evento| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = evento {
                salida::al_pedir_cierre(ventana.app_handle(), api);
            }
        })
        // Abrir y Salir del icono se atienden aquí: con la interfaz colgada, su JavaScript ya no corre
        .on_menu_event(|app, evento| match evento.id().as_ref() {
            "abrir" => salida::mostrar(app),
            "salir" => salida::pedir_salida(app.clone()),
            _ => {}
        })
        .on_tray_icon_event(|app, evento| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = evento
            {
                salida::mostrar(app);
            }
        })
        .setup(move |app| {
            // la base también abre aquí: una segunda instancia no espera el bloqueo ni migra antes de traer al frente la ventana
            app.state::<comandos::Estado>().abrir_inicial();
            // en setup y no al iniciar: una segunda instancia sale en el plugin de arriba, antes de llegar aquí, y no le
            // borra a la primera las copias con que está trabajando
            if let Some(r) = rutas_app {
                respaldos::limpiar_parciales(&r.datos, Some(&r.bd));
                respaldos::limpiar_parciales(&r.respaldos, None);
                organizaciones::limpiar_carpetas(&r);
                // temporales de una actualización anterior, en otro hilo: ya en setup, con el entorno ajustado
                actualizar::limpiar_al_iniciar(r.datos);
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
            // maximizada en la pantalla principal: con el tamaño fijo de tauri.conf.json, una pantalla pequeña o con
            // escalado la dejaba con una parte afuera. Restaurarla la deja en esa pantalla, con ese tamaño.
            if let Some(pantalla) = app.primary_monitor()? {
                let origen = pantalla
                    .position()
                    .to_logical::<f64>(pantalla.scale_factor());
                ventana = ventana.position(origen.x, origen.y);
            }
            // arrancada por el sistema no le quita el foco a lo que el usuario abre al iniciar sesión; minimizada
            // y no oculta, porque no siempre hay bandeja desde donde volver
            let por_el_sistema = std::env::args().any(|a| a == inicio::ARGUMENTO);
            ventana = ventana.maximized(true);
            // abierta a mano se muestra al cargar la página: sin pantalla blanca, ya dice «Iniciando…»
            ventana = if por_el_sistema {
                ventana.focused(false)
            } else {
                ventana.visible(false)
            };
            let ventana = ventana.build()?;
            // el fondo antes de pintar. El tema elegido en la app no se conoce aquí: a lo sumo un instante con el del sistema
            let oscuro = ventana.theme().is_ok_and(|t| t == tauri::Theme::Dark);
            let fondo = if oscuro { 10 } else { 240 };
            let _ =
                ventana.set_background_color(Some(tauri::window::Color(fondo, fondo, fondo, 255)));
            if por_el_sistema {
                let _ = ventana.minimize();
            } else {
                // si la página nunca termina de cargar, la ventana aparece igual: oculta parecería que la app no abrió
                let app = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(5));
                    salida::mostrar_al_arrancar(&app);
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            comandos::info_app,
            comandos::listar_organizaciones,
            comandos::abrir_organizacion,
            comandos::crear_organizacion,
            comandos::sincronizar_organizacion,
            comandos::agregar_archivo_organizacion,
            comandos::confirmar_archivo_organizacion,
            comandos::quitar_organizacion,
            comandos::eliminar_organizacion,
            comandos::color_organizacion,
            comandos::listar_eliminadas,
            comandos::borrar_eliminada,
            comandos::restaurar_eliminada,
            comandos::db_consultar,
            comandos::db_lote,
            fotos::foto_bytes,
            fotos::fotos_guardar,
            fotos::fotos_compactar,
            comandos::listar_respaldos,
            comandos::respaldar_ahora,
            comandos::respaldar_antes_de_optimizar,
            comandos::restaurar_respaldo,
            comandos::abrir_carpeta_respaldos,
            comandos::info_proyecto,
            comandos::abrir_carpeta_datos,
            comandos::exportar_preparar,
            comandos::exportar_elegir_destino,
            comandos::exportar_guardar,
            comandos::importar_elegir,
            comandos::importar_abrir,
            comandos::importar_agregar,
            comandos::importar_reemplazar,
            comandos::importar_como_nueva,
            comandos::importar_comparar,
            comandos::importar_volver,
            comandos::revision_resumen,
            comandos::revision_pagina,
            comandos::revision_detalle,
            comandos::revision_decidir,
            comandos::revision_masivo,
            comandos::revision_verificar,
            comandos::revision_bloqueos,
            comandos::revision_opciones,
            comandos::revision_aplicar,
            comandos::intercambio_cancelar,
            comandos::comparar_organizaciones,
            comandos::comparacion_pagina,
            comandos::comparacion_detalle,
            comandos::comparacion_cancelar,
            comandos::comparacion_cerrar,
            actualizar::buscar_actualizacion,
            actualizar::instalar_actualizacion,
            actualizar::cancelar_actualizacion,
            actualizar::bandeja_disponible,
            inicio::inicio_sistema,
            inicio::cambiar_inicio_sistema,
            salida::cierre_listo,
            salida::cierre_atendido,
            salida::pedir_salida,
            salida::ocultar_en_bandeja,
            salida::salir_app
        ])
        .build(contexto)
        .expect("error while building tauri application")
        .run(|app, evento| {
            // cierre ordenado de SQLite (sin -wal/-shm sobrantes); no espera más de 3 s a un respaldo en curso
            if let tauri::RunEvent::Exit = evento {
                app.state::<comandos::Estado>()
                    .cerrar_ordenado(std::time::Duration::from_secs(3));
                // las copias en claro de un exportar o importar sin terminar no se quedan
                app.state::<intercambio::Sesiones>().cancelar_todo();
                app.state::<comparar_organizaciones::Comparaciones>()
                    .cerrar();
            }
            // el Dock de macOS: abrir la app ya abierta no pasa por la instancia única
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = evento {
                salida::mostrar(app);
            }
        });
}
