// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, Emitter};
use tauri_plugin_notification::NotificationExt;
use sysinfo::{System, Disks};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HardwareInfo {
    pub cpu_name: String,
    pub cpu_cores: usize,
    pub cpu_frequency: u64,
    pub total_memory: u64,
    pub total_swap: u64,
    pub os_name: String,
    pub os_version: String,
    pub gpu_info: Vec<String>,
}

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

#[tauri::command]
fn get_hardware_info() -> Result<HardwareInfo, String> {
    let mut sys = System::new_all();
    sys.refresh_all();

    let cpu_name = sys.cpus().first()
        .map(|cpu| cpu.brand().to_string())
        .unwrap_or_else(|| "Unknown CPU".to_string());
    
    let cpu_cores = sys.cpus().len();
    
    let cpu_frequency = sys.cpus().first()
        .map(|cpu| cpu.frequency())
        .unwrap_or(0);

    let total_memory = sys.total_memory() / (1024 * 1024 * 1024);
    let total_swap = sys.total_swap() / (1024 * 1024 * 1024);

    let os_name = System::name().unwrap_or_else(|| "Unknown OS".to_string());
    let os_version = System::os_version().unwrap_or_else(|| "Unknown".to_string());

    let gpu_info = get_gpu_info();

    Ok(HardwareInfo {
        cpu_name,
        cpu_cores,
        cpu_frequency,
        total_memory,
        total_swap,
        os_name,
        os_version,
        gpu_info,
    })
}

fn get_gpu_info() -> Vec<String> {
    let mut gpus = Vec::new();

    #[cfg(target_os = "windows")]
    {
        match get_windows_gpu_info() {
            Ok(gpu_list) => {
                if !gpu_list.is_empty() {
                    gpus = gpu_list;
                } else {
                    gpus.push("No GPU detected".to_string());
                }
            }
            Err(e) => {
                eprintln!("Failed to detect GPU on Windows: {}", e);
                gpus.push(format!("GPU detection failed: {}", e));
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(output) = std::process::Command::new("lspci")
            .arg("-v")
            .output() 
        {
            let output_str = String::from_utf8_lossy(&output.stdout);
            for line in output_str.lines() {
                if line.contains("VGA") || line.contains("3D") || line.contains("Display") {
                    gpus.push(line.trim().to_string());
                }
            }
        }
        
        if gpus.is_empty() {
            gpus.push("No GPU detected (lspci found no devices)".to_string());
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("system_profiler")
            .arg("SPDisplaysDataType")
            .output()
        {
            let output_str = String::from_utf8_lossy(&output.stdout);
            for line in output_str.lines() {
                if line.contains("Chipset Model:") {
                    gpus.push(line.trim().to_string());
                }
            }
        }

        if gpus.is_empty() {
            gpus.push("No GPU detected (system_profiler found no devices)".to_string());
        }
    }

    if gpus.is_empty() {
        gpus.push("Unknown GPU".to_string());
    }

    gpus
}

#[cfg(target_os = "windows")]
fn get_windows_gpu_info() -> Result<Vec<String>, String> {
    use wmi::{COMLibrary, WMIConnection, Variant};
    use std::collections::HashMap;
    use std::thread;

    let wmi_thread_handle = thread::spawn(|| -> Result<Vec<String>, String> {
        let com_con = COMLibrary::new().map_err(|e| format!("Failed to initialize COM: {}", e))?;
        let wmi_con = WMIConnection::new(com_con).map_err(|e| format!("Failed to connect to WMI: {}", e))?;

        let results: Vec<HashMap<String, Variant>> = wmi_con
            .raw_query("SELECT Name, AdapterRAM FROM Win32_VideoController")
            .map_err(|e| format!("WMI query failed: {}", e))?;

        if results.is_empty() {
            return Err("No video controllers found.".to_string());
        }

        let mut gpu_list = Vec::new();
        for gpu in results {
            if let Some(Variant::String(name)) = gpu.get("Name") {
                let mut gpu_info = name.clone();
                
                if let Some(ram_variant) = gpu.get("AdapterRAM") {
                    let ram_bytes = match ram_variant {
                        Variant::UI4(ram) => Some(*ram as u64),
                        Variant::UI8(ram) => Some(*ram),
                        _ => None,
                    };
                    
                    if let Some(ram) = ram_bytes {
                        if ram > 0 {
                            let vram_gb = ram as f64 / (1024.0 * 1024.0 * 1024.0);
                            gpu_info.push_str(&format!(" ({:.1} GB VRAM)", vram_gb));
                        }
                    }
                }
                gpu_list.push(gpu_info);
            }
        }
        Ok(gpu_list)
    });

    match wmi_thread_handle.join() {
        Ok(result) => result,
        Err(_) => Err("Failed to execute WMI thread.".to_string()),
    }
}

#[tauri::command]
async fn send_hardware_info_to_backend(
    hardware_info: HardwareInfo,
    backend_url: String,
    auth_token: Option<String>,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    
    let mut request = client
        .post(&backend_url)
        .json(&hardware_info);
    
    if let Some(token) = auth_token {
        request = request.header("Authorization", format!("Token {}", token));
    }

    match request.send().await {
        Ok(response) => {
            if response.status().is_success() {
                Ok("Hardware info sent successfully".to_string())
            } else {
                Err(format!("Server returned status: {}", response.status()))
            }
        }
        Err(err) => {
            println!("Failed to send hardware info (testing mode): {:?}", err);
            println!("Hardware info that would be sent: {:?}", hardware_info);
            Ok("Testing mode: Hardware info logged to console".to_string())
        }
    }
}

// NEW APPROACH: Start local HTTP server on port 8080 that proxies to the OAuth plugin
#[tauri::command]
async fn start_oauth_server(window: tauri::Window) -> Result<u16, String> {
    use tokio::net::TcpListener;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    
    println!("[RUST-OAUTH] Starting OAuth flow...");
    
    // First, start the actual OAuth plugin server
    let oauth_port = tauri_plugin_oauth::start({
        let window_clone = window.clone();
        move |url| {
            println!("[RUST-OAUTH-PLUGIN] Received redirect at plugin port: {}", url);
            if let Err(e) = window_clone.emit("oauth_redirect", url) {
                eprintln!("[RUST-OAUTH-PLUGIN] Failed to emit event: {:?}", e);
            }
        }
    })
    .map_err(|e| format!("Failed to start OAuth plugin: {}", e))?;
    
    println!("[RUST-OAUTH] OAuth plugin started on port: {}", oauth_port);
    
    // Now start a proxy server on port 8080 that forwards to the OAuth plugin
    tokio::spawn(async move {
        match TcpListener::bind("127.0.0.1:8080").await {
            Ok(listener) => {
                println!("[RUST-OAUTH-PROXY] Proxy server listening on port 8080, forwarding to {}", oauth_port);
                
                loop {
                    match listener.accept().await {
                        Ok((mut socket, addr)) => {
                            println!("[RUST-OAUTH-PROXY] Received connection from {}", addr);
                            
                            // Read the request
                            let mut buffer = vec![0u8; 4096];
                            match socket.read(&mut buffer).await {
                                Ok(n) => {
                                    let request = String::from_utf8_lossy(&buffer[..n]);
                                    println!("[RUST-OAUTH-PROXY] Request: {}", request.lines().next().unwrap_or(""));
                                    
                                    // Extract the URL path and query
                                    if let Some(line) = request.lines().next() {
                                        if let Some(path_and_query) = line.split_whitespace().nth(1) {
                                            // Forward to OAuth plugin AND emit event
                                            let full_url = format!("http://localhost:{}{}", oauth_port, path_and_query);
                                            println!("[RUST-OAUTH-PROXY] Forwarding to: {}", full_url);
                                            
                                            // Emit the redirect event directly
                                            if let Err(e) = window.emit("oauth_redirect", full_url.clone()) {
                                                eprintln!("[RUST-OAUTH-PROXY] Failed to emit event: {:?}", e);
                                            } else {
                                                println!("[RUST-OAUTH-PROXY] Successfully emitted oauth_redirect event");
                                            }
                                            
                                            // Send success response
                                            let response = "HTTP/1.1 200 OK\r\n\
                                                          Content-Type: text/html\r\n\
                                                          Connection: close\r\n\
                                                          \r\n\
                                                          <html><body>\
                                                          <h2>Authentication Successful!</h2>\
                                                          <p>You can close this window and return to the app.</p>\
                                                          <script>window.close();</script>\
                                                          </body></html>";
                                            
                                            let _ = socket.write_all(response.as_bytes()).await;
                                        }
                                    }
                                }
                                Err(e) => eprintln!("[RUST-OAUTH-PROXY] Failed to read from socket: {}", e),
                            }
                        }
                        Err(e) => eprintln!("[RUST-OAUTH-PROXY] Failed to accept connection: {}", e),
                    }
                }
            }
            Err(e) => {
                eprintln!("[RUST-OAUTH-PROXY] Failed to bind to port 8080: {}", e);
                eprintln!("[RUST-OAUTH-PROXY] Make sure port 8080 is not in use by another application");
            }
        }
    });
    
    // Return port 8080 to the frontend (the proxy port, not the OAuth plugin port)
    println!("[RUST-OAUTH] Returning port 8080 to frontend");
    Ok(8080)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_oauth::init())
        .invoke_handler(tauri::generate_handler![
            greet, 
            show_notification,
            start_oauth_server,
            get_hardware_info,
            send_hardware_info_to_backend,
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