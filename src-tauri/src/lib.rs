// src-tauri/src/lib.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod hardware;
mod oauth;
mod wsl;
mod macos;
mod petals;

use hardware::get_hardware_info;
use oauth::start_oauth_server;
use wsl::{setup_wsl_environment, setup_wsl_environment_client};
use macos::setup_macos_environment;
use petals::{
    PetalsState, start_petals_seeder, stop_petals_seeder, 
    is_petals_seeder_running, get_petals_seeder_info, 
    get_petals_seeder_logs, mark_wsl_setup_complete, 
    mark_macos_setup_complete, check_petals_inference_ready, 
    run_petals_inference
};

// ===== SIMPLE UTILITY COMMANDS =====
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn show_notification(app: tauri::AppHandle, title: String, body: String) {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .unwrap();
}

// ===== MAIN ENTRY POINT =====

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_oauth::init())
        .manage(PetalsState::new())
        .invoke_handler(tauri::generate_handler![
            greet,
            show_notification,
            start_oauth_server,
            get_hardware_info,
            setup_wsl_environment,
            setup_wsl_environment_client,
            setup_macos_environment,
            mark_wsl_setup_complete,
            mark_macos_setup_complete,
            start_petals_seeder,
            stop_petals_seeder,
            is_petals_seeder_running,
            get_petals_seeder_info,
            get_petals_seeder_logs,
            check_petals_inference_ready,
            run_petals_inference,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
