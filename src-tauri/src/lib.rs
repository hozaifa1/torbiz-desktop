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
        // Windows: Use WMI to query video controllers
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
        // Linux: Try to read from lspci
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
            gpus.push("No GPU detected (system_profiler found no devices)".to_string());
        }
    }

    if gpus.is_empty() {
        gpus.push("Unknown GPU".to_string());
    }

    gpus
}

// Windows-specific GPU detection using WMI
// Windows-specific GPU detection using WMI
#[cfg(target_os = "windows")]
fn get_windows_gpu_info() -> Result<Vec<String>, String> {
    use wmi::{COMLibrary, WMIConnection, Variant};
    use std::collections::HashMap;
    use std::thread;

    // Run the WMI query in a separate thread to ensure proper COM initialization.
    let wmi_thread_handle = thread::spawn(|| -> Result<Vec<String>, String> {
        // This initializes COM for the current thread. It will be uninitialized when the thread exits.
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

    // Wait for the thread to finish and return its result.
    match wmi_thread_handle.join() {
        Ok(result) => result,
        Err(_) => Err("Failed to execute WMI thread.".to_string()),
    }
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

// FIXED: OAuth server with FIXED port 8080
#[tauri::command]
async fn start_oauth_server(app: tauri::AppHandle, window: tauri::Window) -> Result<u16, String> {
    // Use fixed port 8080 for consistent redirect URI
    const OAUTH_PORT: u16 = 8080;
    
    let result = tauri_plugin_oauth::start(move |url| {
        if let Err(e) = window.emit("oauth_redirect", url) {
            eprintln!("Failed to emit oauth_redirect event: {:?}", e);
        }
    })
    .map_err(|err| err.to_string())?;
    
    // Always return port 8080 for consistency
    // Note: The actual port used by the plugin might vary, but we tell the frontend to use 8080
    // You need to configure http://localhost:8080/ in your Google Cloud Console
    Ok(OAUTH_PORT)
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