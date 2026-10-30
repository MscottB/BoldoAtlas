mod comandos;
mod db;
mod rutas;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(comandos::Estado::iniciar())
        .invoke_handler(tauri::generate_handler![
            comandos::info_app,
            comandos::db_consultar,
            comandos::db_lote
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
