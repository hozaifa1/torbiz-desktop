// src-tauri/src/lib.rs
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, Emitter};
use tauri_plugin_notification::NotificationExt;
use sysinfo::System;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::process::{Child, Command, Stdio};
// --- START ADDITION ---
use tauri::path::BaseDirectory; // Import BaseDirectory for resource resolution
use std::path::PathBuf;
// --- END ADDITION ---

// ===== EXISTING CODE - DO NOT MODIFY (HardwareInfo, greet, show_notification, get_hardware_info, get_gpu_info, get_windows_gpu_info, start_oauth_server) =====

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
async fn start_oauth_server(_app: tauri::AppHandle, window: tauri::Window) -> Result<u16, String> {
    const OAUTH_PORT: u16 = 8080;

    let _result = tauri_plugin_oauth::start(move |url| {
        if let Err(e) = window.emit("oauth_redirect", url) {
            eprintln!("Failed to emit oauth_redirect event: {:?}", e);
        }
    })
    .map_err(|err| err.to_string())?;

    Ok(OAUTH_PORT)
}

// ===== END OF EXISTING CODE =====


// ===== NEW CODE FOR PETALS INTEGRATION =====

/// State to manage the Petals seeder process
pub struct PetalsState {
    process: Arc<Mutex<Option<Child>>>,
    model_name: Arc<Mutex<Option<String>>>,
    node_token: Arc<Mutex<Option<String>>>,
}

impl PetalsState {
    pub fn new() -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
            model_name: Arc::new(Mutex::new(None)),
            node_token: Arc::new(Mutex::new(None)),
        }
    }
}

/// Start the Petals seeder process
#[tauri::command]
async fn start_petals_seeder(
    model_name: String,
    node_token: String,
    state: tauri::State<'_, PetalsState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    // Check if a process is already running
    {
        let process_guard = state.process.lock().unwrap();
        if process_guard.is_some() {
            return Err("Petals seeder is already running. Stop it first before starting a new one.".to_string());
        }
    }

    // Get the Python executable path
    let python_exe = if cfg!(target_os = "windows") {
        "python"
    } else {
        "python3"
    };

    // --- START MODIFICATION ---
    // Resolve the path to the bundled Python script
    let script_path = app
        .path()
        .resolve("py/run_petals_seeder.py", BaseDirectory::Resource) // Use BaseDirectory::Resource
        .map_err(|e| format!("Failed to resolve resource path: {}", e))?;
    // --- END MODIFICATION ---

    // Verify the script exists
    if !script_path.exists() {
        return Err(format!(
            "Python script not found at resolved path: {}. Ensure it's listed in tauri.conf.json resources.",
            script_path.display()
        ));
    }

    println!("[PETALS] Starting seeder with script: {}", script_path.display());
    println!("[PETALS] Model: {}", model_name);
    println!("[PETALS] Token: {}...{}", &node_token[..10.min(node_token.len())],
             if node_token.len() > 20 { &node_token[node_token.len()-10..] } else { "" });

    // Spawn the Python process
    let child = Command::new(python_exe)
        .arg(script_path.to_str().ok_or("Invalid script path format")?) // Convert PathBuf to &str
        .arg("--model-name")
        .arg(&model_name)
        .arg("--node-token")
        .arg(&node_token)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn Python process: {}. Make sure Python 3 is installed and in PATH.", e))?;

    let child_id = child.id();
    println!("[PETALS] Spawned process with PID: {}", child_id);

    // Store the process, model name, and token in state
    {
        let mut process_guard = state.process.lock().unwrap();
        *process_guard = Some(child);

        let mut model_guard = state.model_name.lock().unwrap();
        *model_guard = Some(model_name.clone());

        let mut token_guard = state.node_token.lock().unwrap();
        *token_guard = Some(node_token);
    }

    // Send success notification
    app.notification()
        .builder()
        .title("GPU Sharing Active")
        .body(format!("Now serving {} to the network", model_name))
        .show()
        .ok();

    Ok(format!("Petals seeder started successfully for model: {}", model_name))
}


/// Stop the Petals seeder process
#[tauri::command]
async fn stop_petals_seeder(
    state: tauri::State<'_, PetalsState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let model_name = {
        let model_guard = state.model_name.lock().unwrap();
        model_guard.clone()
    };

    let mut process_guard = state.process.lock().unwrap();

    match process_guard.as_mut() {
        Some(child) => {
            println!("[PETALS] Stopping seeder process...");

            // Try graceful shutdown first
            #[cfg(unix)]
            {
                use nix::sys::signal::{kill, Signal};
                use nix::unistd::Pid;
                // Send SIGTERM for graceful shutdown
                if let Err(e) = kill(
                    Pid::from_raw(child.id() as i32),
                    Signal::SIGTERM
                ) {
                    eprintln!("[PETALS] Failed to send SIGTERM: {}", e);
                }
            }

            #[cfg(windows)]
            {
                // On Windows, just kill the process
                 match child.kill() {
                    Ok(_) => println!("[PETALS] Sent kill signal to process {}", child.id()),
                    Err(e) => eprintln!("[PETALS] Failed to kill process {}: {}", child.id(), e),
                }
            }

            // Wait for the process to exit (with timeout)
            use std::time::Duration;
            let timeout = Duration::from_secs(5);
            let start = std::time::Instant::now();

            loop {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        println!("[PETALS] Process exited with status: {}", status);
                        break;
                    }
                    Ok(None) => {
                        if start.elapsed() > timeout {
                            println!("[PETALS] Timeout waiting for graceful shutdown, forcing kill...");
                           match child.kill() { // Attempt kill again on timeout
                                Ok(_) => println!("[PETALS] Sent force kill signal to process {}", child.id()),
                                Err(e) => eprintln!("[PETALS] Failed to force kill process {}: {}", child.id(), e),
                            }
                            match child.wait() { // Wait after force kill
                                Ok(status) => println!("[PETALS] Process exited after force kill with status: {}", status),
                                Err(e) => eprintln!("[PETALS] Error waiting after force kill: {}", e),
                            }
                            break;
                        }
                        std::thread::sleep(Duration::from_millis(100));
                    }
                    Err(e) => {
                        eprintln!("[PETALS] Error waiting for process: {}", e);
                        // Attempt to kill if waiting failed, maybe the process is already gone but handle is stale?
                        let _ = child.kill();
                        break;
                    }
                }
            }


            // Clear the state
            *process_guard = None;
            drop(process_guard); // Release the lock

            {
                let mut model_guard = state.model_name.lock().unwrap();
                *model_guard = None;

                let mut token_guard = state.node_token.lock().unwrap();
                *token_guard = None;
            }

            // Send notification
            if let Some(model) = model_name {
                app.notification()
                    .builder()
                    .title("GPU Sharing Stopped")
                    .body(format!("Stopped serving {}", model))
                    .show()
                    .ok();
            }

            Ok("Petals seeder stopped successfully".to_string())
        }
        None => Err("No Petals seeder process is currently running".to_string()),
    }
}


/// Check if Petals seeder is currently running
#[tauri::command]
async fn is_petals_seeder_running(
    state: tauri::State<'_, PetalsState>,
) -> Result<bool, String> {
    let mut process_guard = state.process.lock().unwrap();
    match process_guard.as_mut() {
        Some(child) => {
            // Check if the process has already exited
            match child.try_wait() {
                Ok(Some(_status)) => {
                    // Process exited, clear the state
                    *process_guard = None;
                    drop(process_guard); // Release lock before modifying other state parts
                     {
                        let mut model_guard = state.model_name.lock().unwrap();
                        *model_guard = None;
                        let mut token_guard = state.node_token.lock().unwrap();
                        *token_guard = None;
                    }
                    Ok(false) // Not running anymore
                }
                Ok(None) => Ok(true), // Still running
                Err(e) => {
                    eprintln!("[PETALS] Error checking process status: {}", e);
                     // Assume it might still be running, or failed to check
                    Ok(true) // Safer to assume running if check fails
                }
            }
        }
        None => Ok(false), // Not running
    }
}


/// Get information about the currently running Petals seeder
#[tauri::command]
async fn get_petals_seeder_info(
    state: tauri::State<'_, PetalsState>,
) -> Result<Option<String>, String> {
    // First, check if it's actually running
     if !is_petals_seeder_running(state.clone()).await? {
        Ok(None)
    } else {
        let model_guard = state.model_name.lock().unwrap();
        Ok(model_guard.clone())
    }
}


// ===== END OF NEW CODE =====

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_oauth::init())
        .manage(PetalsState::new()) // Add Petals state management
        .invoke_handler(tauri::generate_handler![
            greet,
            show_notification,
            start_oauth_server,
            get_hardware_info,
            // New Petals commands
            start_petals_seeder,
            stop_petals_seeder,
            is_petals_seeder_running,
            get_petals_seeder_info,
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