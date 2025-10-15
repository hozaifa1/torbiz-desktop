// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, Emitter};
use tauri_plugin_notification::NotificationExt;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn show_notification(app: tauri::AppHandle, title: String, body: String) {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .unwrap();
}

// ADD THIS: Command to start OAuth server
#[tauri::command]
async fn start_oauth_server(app: tauri::AppHandle, window: tauri::Window) -> Result<u16, String> {
    println!("=== START_OAUTH_SERVER CALLED ===");
    
    // Test notification
    app.notification()
        .builder()
        .title("OAuth Starting")
        .body("Starting OAuth server...")
        .show()
        .ok();
    
    let result = tauri_plugin_oauth::start(move |url| {
        println!("OAuth redirect received: {}", url);
        if let Err(e) = window.emit("oauth_redirect", url) {
            eprintln!("Failed to emit oauth_redirect event: {:?}", e);
        }
    })
    .map_err(|err| {
        eprintln!("Failed to start OAuth server: {:?}", err);
        err.to_string()
    });
    
    if let Ok(port) = &result {
        println!("OAuth server started on port: {}", port);
    }
    
    result
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_oauth::init()) // ADD THIS
        .invoke_handler(tauri::generate_handler![
            greet, 
            show_notification,
            start_oauth_server  // ADD THIS
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