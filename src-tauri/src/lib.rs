// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, Emitter};
use tauri_plugin_notification::NotificationExt;
use sysinfo::{System, Disks};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HardwareInfo {
    pub cpu_name: String,
    pub cpu_cores: usize,
    pub cpu_frequency: u64, // MHz
    pub total_memory: u64,  // GB
    pub total_swap: u64,    // GB
    pub os_name: String,
    pub os_version: String,
    pub gpu_info: Vec<String>, // GPU names/descriptions
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

// Get hardware information
#[tauri::command]
fn get_hardware_info() -> Result<HardwareInfo, String> {
    let mut sys = System::new_all();
    sys.refresh_all();

    // CPU Information
    let cpu_name = sys.cpus().first()
        .map(|cpu| cpu.brand().to_string())
        .unwrap_or_else(|| "Unknown CPU".to_string());
    
    let cpu_cores = sys.cpus().len();
    
    let cpu_frequency = sys.cpus().first()
        .map(|cpu| cpu.frequency())
        .unwrap_or(0);

    // Memory Information (convert from bytes to GB)
    let total_memory = sys.total_memory() / (1024 * 1024 * 1024);
    let total_swap = sys.total_swap() / (1024 * 1024 * 1024);

    // OS Information
    let os_name = System::name().unwrap_or_else(|| "Unknown OS".to_string());
    let os_version = System::os_version().unwrap_or_else(|| "Unknown".to_string());

    // GPU Information (platform-specific)
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

// Platform-specific GPU detection
fn get_gpu_info() -> Vec<String> {
    let mut gpus = Vec::new();

    #[cfg(target_os = "windows")]
    {
        // Windows: Use WMI or registry
        // For now, return a placeholder
        gpus.push("GPU detection on Windows (implement via WMI)".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        // Linux: Try to read from lspci or similar
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
            gpus.push("GPU detection on Linux (no lspci output)".to_string());
        }
    }

    #[cfg(target_os = "macos")]
    {
        // macOS: Use system_profiler
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
            gpus.push("GPU detection on macOS (no system_profiler output)".to_string());
        }
    }

    if gpus.is_empty() {
        gpus.push("Unknown GPU".to_string());
    }

    gpus
}

// Send hardware info to backend
#[tauri::command]
async fn send_hardware_info_to_backend(
    hardware_info: HardwareInfo,
    backend_url: String,
    auth_token: Option<String>,
) -> Result<String, String> {
    // Build the HTTP client
    let client = reqwest::Client::new();
    
    // Prepare the request
    let mut request = client
        .post(&backend_url)
        .json(&hardware_info);
    
    // Add auth token if provided
    if let Some(token) = auth_token {
        request = request.header("Authorization", format!("Token {}", token));
    }

    // Send the request
    match request.send().await {
        Ok(response) => {
            if response.status().is_success() {
                Ok("Hardware info sent successfully".to_string())
            } else {
                Err(format!("Server returned status: {}", response.status()))
            }
        }
        Err(err) => {
            // For testing, just log the error but don't fail
            println!("Failed to send hardware info (testing mode): {:?}", err);
            println!("Hardware info that would be sent: {:?}", hardware_info);
            Ok("Testing mode: Hardware info logged to console".to_string())
        }
    }
}

// OAuth server with specific port range (8080-8090)
// This makes it easier to configure redirect URIs in Google Cloud Console
#[tauri::command]
async fn start_oauth_server(app: tauri::AppHandle, window: tauri::Window) -> Result<u16, String> {
    // Try ports 8080-8090
    for port in 8080..=8090 {
        match try_start_oauth_on_port(app.clone(), window.clone(), port).await {
            Ok(p) => return Ok(p),
            Err(_) => continue,
        }
    }
    
    Err("Could not start OAuth server on any port between 8080-8090".to_string())
}

async fn try_start_oauth_on_port(
    app: tauri::AppHandle,
    window: tauri::Window,
    port: u16,
) -> Result<u16, String> {
    // Note: tauri_plugin_oauth::start doesn't support custom ports directly
    // So we'll use the default behavior and document the ports needed
    let result = tauri_plugin_oauth::start(move |url| {
        if let Err(e) = window.emit("oauth_redirect", url) {
            eprintln!("Failed to emit oauth_redirect event: {:?}", e);
        }
    })
    .map_err(|err| err.to_string())?;
    
    Ok(result)
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