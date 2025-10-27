// src-tauri/src/oauth.rs
// OAuth authentication server

#[tauri::command]
pub async fn start_oauth_server(_app: tauri::AppHandle, window: tauri::Window) -> Result<u16, String> {
    const MIN_PORT: u16 = 8000;
    const MAX_PORT: u16 = 8010;

    for port in MIN_PORT..=MAX_PORT {
        let config = tauri_plugin_oauth::OauthConfig {
            ports: Some(vec![port]),
            response: None,
        };
        let window_clone = window.clone();
        
        match tauri_plugin_oauth::start_with_config(config, move |url| {
            if let Err(e) = window_clone.emit("oauth_redirect", url) {
                eprintln!("Failed to emit oauth_redirect event: {:?}", e);
            }
        }) {
            Ok(result) => {
                println!("OAuth server started on port: {}", result);
                return Ok(result);
            }
            Err(e) => {
                eprintln!("Failed to start OAuth server on port {}: {}", port, e);
                continue;
            }
        }
    }
    Err("Failed to find an available port for OAuth server".to_string())
}

