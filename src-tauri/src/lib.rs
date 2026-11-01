mod actualizar;
mod comandos;
mod db;
mod respaldos;
mod rutas;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // antes del Builder: la portable ajusta el entorno del proceso y aún no hay otros hilos
    let estado = comandos::Estado::iniciar();
    let webview = estado.dir_webview();
    if let Some(r) = estado.rutas_app() {
        actualizar::limpiar_al_iniciar(r.datos.clone());
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(estado)
        .manage(actualizar::Actualizador::default())
        .setup(move |app| {
            // la ventana se crea aquí y no desde tauri.conf.json ("create": false) para que la portable
            // guarde el perfil del WebView en datos/ y no en %LOCALAPPDATA%
            let mut ventana = tauri::WebviewWindowBuilder::from_config(
                app.handle(),
                &app.config().app.windows[0],
            )?;
            if let Some(dir) = webview {
                ventana = ventana.data_directory(dir);
            }
            ventana.build()?;
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
            actualizar::cancelar_actualizacion
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, evento| {
            // cierre ordenado de SQLite (sin -wal/-shm sobrantes); no espera más de 3 s a un respaldo en curso
            if let tauri::RunEvent::Exit = evento {
                app.state::<comandos::Estado>()
                    .cerrar_ordenado(std::time::Duration::from_secs(3));
            }
        });
}
