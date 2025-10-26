// src-tauri/src/lib.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, Emitter};
use tauri_plugin_notification::NotificationExt;
use sysinfo::System;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::{Arc, Mutex};
use std::process::{Child, Command, Stdio};
use tauri::path::BaseDirectory;
use std::path::PathBuf;
use std::io::{BufRead, BufReader};
use std::thread;

// ===== EXISTING STRUCTURES =====
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

pub struct PetalsState {
    process: Arc<Mutex<Option<Child>>>,
    model_name: Arc<Mutex<Option<String>>>,
    node_token: Arc<Mutex<Option<String>>>,
    wsl_setup_complete: Arc<Mutex<bool>>,
    seeder_logs: Arc<Mutex<Vec<String>>>,
}

impl PetalsState {
    pub fn new() -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
            model_name: Arc::new(Mutex::new(None)),
            node_token: Arc::new(Mutex::new(None)),
            wsl_setup_complete: Arc::new(Mutex::new(false)),
            seeder_logs: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

// ===== WSL SETUP STRUCTURES =====
#[derive(Debug, Serialize, Clone)]
pub struct SetupProgress {
    pub stage: String,
    pub message: String,
    pub progress: u8,
}

// ===== EXISTING COMMANDS (UNCHANGED) =====
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
    let cpu_frequency = sys.cpus().first().map(|cpu| cpu.frequency()).unwrap_or(0);
    let total_memory = sys.total_memory() / (1024 * 1024 * 1024);
    let total_swap = sys.total_swap() / (1024 * 1024 * 1024);
    let os_name = System::name().unwrap_or_else(|| "Unknown OS".to_string());
    let os_version = System::os_version().unwrap_or_else(|| "Unknown".to_string());
    let gpu_info = get_gpu_info();

    Ok(HardwareInfo {
        cpu_name, cpu_cores, cpu_frequency, total_memory,
        total_swap, os_name, os_version, gpu_info,
    })
}

fn get_gpu_info() -> Vec<String> {
    let mut gpus = Vec::new();

    #[cfg(target_os = "windows")]
    {
        match get_windows_gpu_info() {
            Ok(gpu_list) => gpus = if gpu_list.is_empty() { 
                vec!["No GPU detected".to_string()] 
            } else { 
                gpu_list 
            },
            Err(e) => gpus.push(format!("GPU detection failed: {}", e)),
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(output) = Command::new("lspci").arg("-v").output() {
            let output_str = String::from_utf8_lossy(&output.stdout);
            for line in output_str.lines() {
                if line.contains("VGA") || line.contains("3D") || line.contains("Display") {
                    gpus.push(line.trim().to_string());
                }
            }
        }
        if gpus.is_empty() { gpus.push("No GPU detected".to_string()); }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = Command::new("system_profiler").arg("SPDisplaysDataType").output() {
            let output_str = String::from_utf8_lossy(&output.stdout);
            for line in output_str.lines() {
                if line.contains("Chipset Model:") {
                    gpus.push(line.trim().to_string());
                }
            }
        }
        if gpus.is_empty() { gpus.push("No GPU detected".to_string()); }
    }

    if gpus.is_empty() { gpus.push("Unknown GPU".to_string()); }
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

        if results.is_empty() { return Err("No video controllers found.".to_string()); }

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

// ===== WSL HELPER FUNCTIONS =====

#[cfg(target_os = "windows")]
fn check_wsl_installed() -> bool {
    match Command::new("wsl").arg("--status").output() {
        Ok(output) => output.status.success(),
        Err(_) => false,
    }
}

#[cfg(not(target_os = "windows"))]
fn check_wsl_installed() -> bool {
    false
}

#[cfg(target_os = "windows")]
fn install_wsl() -> Result<(), String> {
    println!("[WSL] Installing WSL...");
    
    let output = Command::new("wsl")
        .arg("--install")
        .arg("--no-launch")
        .output()
        .map_err(|e| format!("Failed to execute WSL install command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("WSL installation failed: {}", stderr));
    }

    println!("[WSL] WSL installation completed");
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn install_wsl() -> Result<(), String> {
    Err("WSL installation is only supported on Windows".to_string())
}

#[cfg(target_os = "windows")]
fn execute_wsl_command(command: &str) -> Result<String, String> {
    let mut cmd = Command::new("wsl");
    cmd.arg("-e")
        .arg("bash")
        .arg("-c")
        .arg(command);

    // Hide the console window on Windows
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute WSL command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let error_msg = if !stderr.is_empty() {
            format!("WSL command failed:\nSTDERR: {}\nSTDOUT: {}", stderr, stdout)
        } else if !stdout.is_empty() {
            format!("WSL command failed with output: {}", stdout)
        } else {
            format!("WSL command failed with exit code: {} (no output)", output.status.code().unwrap_or(-1))
        };
        return Err(error_msg);
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg(not(target_os = "windows"))]
fn execute_wsl_command(_command: &str) -> Result<String, String> {
    Err("WSL commands are only supported on Windows".to_string())
}

fn check_wsl_python() -> bool {
    #[cfg(target_os = "windows")]
    {
        match execute_wsl_command("python3 --version") {
            Ok(output) => {
                println!("[WSL] Python check output: {}", output);
                output.contains("Python 3")
            }
            Err(e) => {
                println!("[WSL] Python check failed: {}", e);
                false
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    false
}

fn install_wsl_python() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        println!("[WSL] Installing Python and dependencies...");
        execute_wsl_command("sudo apt-get update")?;
        execute_wsl_command("sudo apt-get install -y python3 python3-pip python3-venv python3-full")?;
        println!("[WSL] Python installation completed");
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    Err("Python installation in WSL is only supported on Windows".to_string())
}

fn check_wsl_petals() -> bool {
    #[cfg(target_os = "windows")]
    {
        // Check if virtual environment exists and petals can be imported
        let venv_check = execute_wsl_command("test -d ~/.torbiz_venv && echo 'exists' || echo 'missing'");
        
        if let Ok(output) = venv_check {
            if output.trim() == "missing" {
                println!("[WSL] Virtual environment not found");
                return false;
            }
        }
        
        // Try to import petals and torch first (core requirements)
        match execute_wsl_command("~/.torbiz_venv/bin/python3 -c 'import petals; import torch; print(\"core_ok\")' 2>/dev/null || echo 'not_found'") {
            Ok(output) => {
                let trimmed = output.trim();
                println!("[WSL] Petals core check output: {}", trimmed);
                if trimmed == "core_ok" {
                    // Core is working, now check if we can import the optional packages
                    match execute_wsl_command("~/.torbiz_venv/bin/python3 -c 'import peft; import accelerate; print(\"extras_ok\")' 2>/dev/null || echo 'extras_missing'") {
                        Ok(extras_output) => {
                            let extras_trimmed = extras_output.trim();
                            println!("[WSL] Petals extras check output: {}", extras_trimmed);
                            if extras_trimmed == "extras_ok" {
                                println!("[WSL] Petals fully installed with all dependencies");
                                true
                            } else {
                                println!("[WSL] Petals core works but missing peft/accelerate - will install them");
                                false
                            }
                        }
                        Err(_) => {
                            println!("[WSL] Petals core works but missing peft/accelerate - will install them");
                            false
                        }
                    }
                } else {
                    println!("[WSL] Petals core not working - needs full installation");
                    false
                }
            }
            Err(e) => {
                println!("[WSL] Petals check failed: {}", e);
                false
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    false
}

fn install_wsl_petals() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Check if venv exists
        let venv_exists = execute_wsl_command("test -d ~/.torbiz_venv && echo 'exists' || echo 'missing'")
            .ok()
            .map(|s| s.trim() == "exists")
            .unwrap_or(false);
        
        if venv_exists {
            // Venv exists - check what's missing and install only what's needed
            println!("[WSL] Checking what packages are missing...");
            
            // Check if core packages work
            let core_works = execute_wsl_command("~/.torbiz_venv/bin/python3 -c 'import petals; import torch; print(\"core_ok\")' 2>/dev/null")
                .map(|output| output.trim() == "core_ok")
                .unwrap_or(false);
            
            if core_works {
                println!("[WSL] Petals core is working, checking for missing extras...");
                
                // Check if extras are missing
                let extras_work = execute_wsl_command("~/.torbiz_venv/bin/python3 -c 'import peft; import accelerate; print(\"extras_ok\")' 2>/dev/null")
                    .map(|output| output.trim() == "extras_ok")
                    .unwrap_or(false);
                
                if !extras_work {
                    println!("[WSL] Installing missing peft and accelerate packages...");
                    execute_wsl_command("~/.torbiz_venv/bin/pip install peft accelerate")?;
                    println!("[WSL] Missing packages installed successfully");
                } else {
                    println!("[WSL] All packages already installed and working");
                }
            } else {
                println!("[WSL] Core packages not working, reinstalling Petals...");
                println!("[WSL] Clearing Python bytecode cache...");
                execute_wsl_command("find ~/.torbiz_venv -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true").ok();
                
                println!("[WSL] Reinstalling Petals (this will install correct transformers version)...");
                execute_wsl_command("~/.torbiz_venv/bin/pip install --force-reinstall git+https://github.com/bigscience-workshop/petals")?;
                println!("[WSL] Petals reinstalled successfully");
            }
        } else {
            // Full installation - create venv and install everything
            println!("[WSL] Setting up Python virtual environment...");
            execute_wsl_command("python3 -m venv ~/.torbiz_venv")?;
            
            println!("[WSL] Upgrading pip...");
            execute_wsl_command("~/.torbiz_venv/bin/pip install --upgrade pip")?;
            
            println!("[WSL] Installing Petals from GitHub (this will take 5-10 minutes and install all dependencies including PyTorch)...");
            println!("[WSL] Please wait, this is downloading large packages (~3GB)...");
            println!("[WSL] Petals will install its own compatible transformers version...");
            execute_wsl_command("~/.torbiz_venv/bin/python -m pip install git+https://github.com/bigscience-workshop/petals")?;
            
            println!("[WSL] Clearing Python bytecode cache...");
            execute_wsl_command("find ~/.torbiz_venv -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true").ok();
        }
        
        println!("[WSL] Verifying installation...");
        let verify_result = execute_wsl_command(
            "~/.torbiz_venv/bin/python3 -c 'import petals; import torch; print(f\"Petals: {petals.__version__}, PyTorch: {torch.__version__}\")'"
        );
        
        match verify_result {
            Ok(output) => println!("[WSL] Installation verified: {}", output.trim()),
            Err(e) => println!("[WSL] Warning: Could not verify installation: {}", e),
        }
        
        println!("[WSL] Petals installation completed");
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    Err("Petals installation in WSL is only supported on Windows".to_string())
}

fn check_wsl_petals_client_only() -> bool {
    #[cfg(target_os = "windows")]
    {
        let venv_check = execute_wsl_command("test -d ~/.torbiz_venv && echo 'exists' || echo 'missing'");
        
        if let Ok(output) = venv_check {
            if output.trim() == "missing" {
                println!("[WSL] Virtual environment not found");
                return false;
            }
        }
        
        // For client mode, only check petals and torch
        match execute_wsl_command("~/.torbiz_venv/bin/python3 -c 'import petals; import torch; print(\"ok\")' 2>/dev/null || echo 'not_found'") {
            Ok(output) => {
                let trimmed = output.trim();
                println!("[WSL] Petals client check: {}", trimmed);
                trimmed == "ok"
            }
            Err(_) => false
        }
    }
    #[cfg(not(target_os = "windows"))]
    false
}

fn install_wsl_petals_client_only() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let venv_exists = execute_wsl_command("test -d ~/.torbiz_venv && echo 'exists' || echo 'missing'")
            .ok()
            .map(|s| s.trim() == "exists")
            .unwrap_or(false);
        
        if !venv_exists {
            println!("[WSL] Setting up Python virtual environment...");
            execute_wsl_command("python3 -m venv ~/.torbiz_venv")?;
            
            println!("[WSL] Upgrading pip...");
            execute_wsl_command("~/.torbiz_venv/bin/pip install --upgrade pip")?;
            
            println!("[WSL] Installing Petals for inference (minimal dependencies)...");
            execute_wsl_command("~/.torbiz_venv/bin/pip install git+https://github.com/bigscience-workshop/petals")?;
        } else {
            // Venv exists - check if Petals is already working
            let petals_works = execute_wsl_command("~/.torbiz_venv/bin/python3 -c 'import petals; import torch; print(\"ok\")' 2>/dev/null")
                .map(|output| output.trim() == "ok")
                .unwrap_or(false);
            
            if petals_works {
                println!("[WSL] Petals client already installed and working");
            } else {
                println!("[WSL] Petals client not working, installing...");
                execute_wsl_command("~/.torbiz_venv/bin/pip install git+https://github.com/bigscience-workshop/petals")?;
            }
        }
        
        println!("[WSL] Petals client installation completed");
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    Err("Petals installation in WSL is only supported on Windows".to_string())
}

/// Copy the Python script to WSL filesystem
#[cfg(target_os = "windows")]
fn copy_script_to_wsl(script_path: &PathBuf) -> Result<String, String> {
    // Read the script content
    let script_content = std::fs::read_to_string(script_path)
        .map_err(|e| format!("Failed to read script: {}", e))?;
    
    // Escape single quotes in the script content
    let escaped_content = script_content.replace("'", "'\\''");
    
    // Write the script to WSL home directory
    let wsl_script_path = "~/run_petals_seeder.py";
    let write_command = format!("cat > {} << 'EOF'\n{}\nEOF", wsl_script_path, escaped_content);
    
    execute_wsl_command(&write_command)?;
    execute_wsl_command(&format!("chmod +x {}", wsl_script_path))?;
    
    println!("[WSL] Script copied to: {}", wsl_script_path);
    Ok(wsl_script_path.to_string())
}

// ===== WSL SETUP COMMAND =====

#[tauri::command]
async fn setup_wsl_environment(
    window: tauri::Window,
) -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    {
        return Err("WSL setup is only needed on Windows. Your system doesn't require it.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let emit_progress = |stage: &str, message: &str, progress: u8| {
            let _ = window.emit("wsl_setup_progress", SetupProgress {
                stage: stage.to_string(),
                message: message.to_string(),
                progress,
            });
        };

        emit_progress("checking_wsl", "Checking WSL installation... (Terminal windows may open/close - this is normal)", 10);
        if !check_wsl_installed() {
            emit_progress("installing_wsl", "Installing WSL (this may take a few minutes). Terminal windows may appear - please don't close them.", 20);
            install_wsl()?;
            
            emit_progress("wsl_installed", "WSL installed. System restart may be required.", 40);
            return Err("WSL has been installed but requires a system restart. Please restart your computer and try again.".to_string());
        }

        emit_progress("checking_python", "Checking Python in WSL... (Terminal windows may flash - this is normal)", 50);
        if !check_wsl_python() {
            emit_progress("installing_python", "Installing Python in WSL... Please wait, terminal windows may appear.", 60);
            install_wsl_python()?;
        }

        emit_progress("checking_petals", "Checking Petals library... (Don't close any terminal windows that appear)", 70);
        let petals_ok = check_wsl_petals();
        
        if !petals_ok {
            emit_progress("installing_petals", "Installing Petals (~3GB download, 5-10 min). Terminal windows will open/close automatically - please wait...", 80);
            install_wsl_petals()?;
        } else {
            println!("[WSL] Petals already installed and working");
        }

        emit_progress("configuring_wsl", "Configuring time synchronization...", 90);
        // WSL auto-syncs time on restart, so just log that it's ready
        println!("[WSL] Time synchronization: WSL will auto-sync time on each start");
        println!("[WSL] Setup completed successfully");

        emit_progress("complete", "WSL environment setup complete! You can now share your GPU.", 100);
        Ok("WSL environment is ready for Petals".to_string())
    }
}

#[tauri::command]
async fn setup_wsl_environment_client(
    window: tauri::Window,
) -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    {
        return Err("WSL setup is only needed on Windows. Your system doesn't require it.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let emit_progress = |stage: &str, message: &str, progress: u8| {
            let _ = window.emit("wsl_setup_progress", SetupProgress {
                stage: stage.to_string(),
                message: message.to_string(),
                progress,
            });
        };

        emit_progress("checking_wsl", "Checking WSL installation... (Terminal windows may open/close - this is normal)", 10);
        if !check_wsl_installed() {
            emit_progress("installing_wsl", "Installing WSL (this may take a few minutes). Terminal windows may appear - please don't close them.", 20);
            install_wsl()?;
            
            emit_progress("wsl_installed", "WSL installed. System restart may be required.", 40);
            return Err("WSL has been installed but requires a system restart. Please restart your computer and try again.".to_string());
        }

        emit_progress("checking_python", "Checking Python in WSL... (Terminal windows may flash - this is normal)", 50);
        if !check_wsl_python() {
            emit_progress("installing_python", "Installing Python in WSL... Please wait, terminal windows may appear.", 60);
            install_wsl_python()?;
        }

        emit_progress("checking_petals", "Checking Petals library for inference... (Don't close any terminal windows that appear)", 70);
        let petals_ok = check_wsl_petals_client_only();
        
        if !petals_ok {
            emit_progress("installing_petals", "Installing Petals for inference (minimal dependencies)...", 80);
            install_wsl_petals_client_only()?;
        } else {
            println!("[WSL] Petals client already installed and working");
        }

        emit_progress("configuring_wsl", "Configuring time synchronization...", 90);
        // WSL auto-syncs time on restart, so just log that it's ready
        println!("[WSL] Time synchronization: WSL will auto-sync time on each start");
        println!("[WSL] Client setup completed successfully");

        emit_progress("complete", "WSL environment setup complete! You can now use Direct Mode.", 100);
        Ok("WSL environment is ready for Petals inference".to_string())
    }
}

// ===== MODIFIED PETALS COMMANDS =====

/// Start the Petals seeder process with proper logging
#[tauri::command]
async fn start_petals_seeder(
    model_name: String,
    node_token: String,
    state: tauri::State<'_, PetalsState>,
    app: tauri::AppHandle,
    hf_token: Option<String>,
) -> Result<String, String> {
    // Check if already running
    {
        let process_guard = state.process.lock().unwrap();
        if process_guard.is_some() {
            return Err("Petals seeder is already running.".to_string());
        }
    }

    #[cfg(target_os = "windows")]
    {
        let wsl_ready = {
            let setup_guard = state.wsl_setup_complete.lock().unwrap();
            *setup_guard
        };

        if !wsl_ready {
            return Err("WSL environment not set up. Please complete WSL setup first.".to_string());
        }

        println!("[PETALS] Starting Petals in WSL...");
        println!("[PETALS] Model: {}", model_name);
        
        // Get the script path from resources
        let script_path = app
            .path()
            .resolve("py/run_petals_seeder.py", BaseDirectory::Resource)
            .map_err(|e| format!("Failed to resolve script path: {}", e))?;

        if !script_path.exists() {
            return Err(format!("Python script not found at: {}", script_path.display()));
        }

        // Copy script to WSL
        let wsl_script_path = copy_script_to_wsl(&script_path)?;
        
        // Restart WSL to force time sync (WSL auto-syncs time on startup)
        println!("[WSL] Restarting WSL to sync time...");
        let _ = Command::new("wsl")
            .arg("--terminate")
            .output(); // Terminate WSL (will auto-restart on next command)
        
        // Small delay to allow WSL to fully terminate
        std::thread::sleep(std::time::Duration::from_millis(500));
        println!("[WSL] Time synchronized via WSL restart");
        
        // Detect if NVIDIA GPU is available
        let has_nvidia_gpu = {
            let sys_info = get_hardware_info();
            match sys_info {
                Ok(info) => {
                    info.gpu_info.iter().any(|gpu| {
                        let gpu_lower = gpu.to_lowercase();
                        gpu_lower.contains("nvidia") || 
                        gpu_lower.contains("geforce") || 
                        gpu_lower.contains("rtx") || 
                        gpu_lower.contains("gtx")
                    })
                },
                Err(_) => false,
            }
        };
        
        let device = if has_nvidia_gpu { "cuda" } else { "cpu" };
        println!("[PETALS] Device selected: {} (NVIDIA GPU detected: {})", device, has_nvidia_gpu);
        
        // For CPU-only mode, uninstall bitsandbytes to prevent import errors
        if !has_nvidia_gpu {
            println!("[WSL] CPU-only mode detected - removing bitsandbytes if installed...");
            execute_wsl_command("~/.torbiz_venv/bin/pip uninstall -y bitsandbytes 2>/dev/null || true").ok();
            println!("[WSL] bitsandbytes removed for CPU compatibility");
        }
        
        // Build the command to run the script in WSL with virtual environment
        let mut command = format!(
            "source ~/.torbiz_venv/bin/activate && python3 {} --model-name '{}' --node-token '{}' --device {} --port 31337",
            wsl_script_path,
            model_name,
            node_token,
            device
        );

        // Add HF token if provided
        if let Some(token) = hf_token {
            command.push_str(&format!(" --hf-token '{}'", token));
        }
        
        // Add error redirection
        command.push_str(" 2>&1");

        println!("[PETALS] Running WSL command: {}", command);

        // Create command and hide console window on Windows
        let mut cmd = Command::new("wsl");
        cmd.arg("-e")
            .arg("bash")
            .arg("-c")
            .arg(&command)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // On Windows, hide the console window using creation flags
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn Petals in WSL: {}", e))?;

        let child_id = child.id();
        println!("[PETALS] Spawned WSL process with PID: {}", child_id);

        // Capture stdout/stderr for logging with error detection
        if let Some(stdout) = child.stdout.take() {
            let logs = state.seeder_logs.clone();
            let app_handle = app.clone();
            thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        println!("[PETALS-OUT] {}", line);
                        
                        // Detect various events in logs
                        let is_error = line.contains("[ERROR]") && !line.contains("triton"); // Ignore triton errors on CPU
                        let is_time_error = line.contains("local time must be within") || line.contains("TIME SYNC ERROR");
                        let is_success = line.contains("✓✓✓ MODEL LOADED SUCCESSFULLY ✓✓✓") 
                            || line.contains("Loaded") && line.contains("block");
                        let is_connecting = line.contains("Connecting to") || line.contains("DHT");
                        let is_announced = line.contains("Announced that blocks") && line.contains("joining");
                        let is_loading = line.contains("Loading") || line.contains("Measuring");
                        
                        // Emit progress events to UI
                        if is_connecting {
                            let _ = app_handle.emit("petals_progress", json!({
                                "stage": "connecting",
                                "message": "Connecting to Petals network..."
                            }));
                        }
                        if is_loading {
                            let _ = app_handle.emit("petals_progress", json!({
                                "stage": "loading",
                                "message": "Loading model blocks..."
                            }));
                        }
                        if is_announced {
                            let _ = app_handle.emit("petals_progress", json!({
                                "stage": "announcing",
                                "message": "Announcing availability to network..."
                            }));
                        }
                        
                        // Store in logs and emit to UI
                        {
                            let mut logs_guard = logs.lock().unwrap();
                            logs_guard.push(line.clone());
                            // Keep only last 200 lines
                            if logs_guard.len() > 200 {
                                logs_guard.remove(0);
                            }
                        }
                        
                        // Emit log line to UI for real-time display
                        let _ = app_handle.emit("petals_log", line.clone());
                        
                        // Emit events after releasing lock
                        if is_time_error {
                            let _ = app_handle.emit("petals_error", 
                                "TIME SYNC ERROR: Your system clock is out of sync. Please restart the app and try again.");
                        } else if is_error {
                            let _ = app_handle.emit("petals_error", line);
                        }
                        if is_success {
                            let _ = app_handle.emit("petals_success", "Model loaded successfully");
                        }
                    }
                }
            });
        }

        {
            let mut process_guard = state.process.lock().unwrap();
            *process_guard = Some(child);

            let mut model_guard = state.model_name.lock().unwrap();
            *model_guard = Some(model_name.clone());

            let mut token_guard = state.node_token.lock().unwrap();
            *token_guard = Some(node_token);
        }

        app.notification()
            .builder()
            .title("Model Sharing Active")
            .body(format!("Now serving {} via WSL ({})", model_name, if has_nvidia_gpu { "GPU" } else { "CPU" }))
            .show()
            .ok();

        Ok(format!("Petals seeder started in WSL for model: {}", model_name))
    }

    #[cfg(not(target_os = "windows"))]
    {
        let python_exe = if cfg!(target_os = "macos") { "python3" } else { "python3" };

        let script_path = app
            .path()
            .resolve("py/run_petals_seeder.py", BaseDirectory::Resource)
            .map_err(|e| format!("Failed to resolve resource path: {}", e))?;

        if !script_path.exists() {
            return Err(format!("Python script not found at: {}", script_path.display()));
        }

        println!("[PETALS] Starting seeder with script: {}", script_path.display());
        println!("[PETALS] Model: {}", model_name);

        // Detect if NVIDIA GPU is available
        let has_nvidia_gpu = {
            let sys_info = get_hardware_info();
            match sys_info {
                Ok(info) => {
                    info.gpu_info.iter().any(|gpu| {
                        let gpu_lower = gpu.to_lowercase();
                        gpu_lower.contains("nvidia") || 
                        gpu_lower.contains("geforce") || 
                        gpu_lower.contains("rtx") || 
                        gpu_lower.contains("gtx")
                    })
                },
                Err(_) => false,
            }
        };
        
        let device = if has_nvidia_gpu { "cuda" } else { "cpu" };
        println!("[PETALS] Device selected: {} (NVIDIA GPU detected: {})", device, has_nvidia_gpu);

        // Build command arguments
        let mut cmd = Command::new(python_exe);
        cmd.arg(script_path.to_str().ok_or("Invalid script path")?)
            .arg("--model-name")
            .arg(&model_name)
            .arg("--node-token")
            .arg(&node_token)
            .arg("--device")
            .arg(device);

        // Add HuggingFace token if provided
        if let Some(token) = hf_token {
            cmd.arg("--hf-token").arg(&token);
            println!("[PETALS] Using provided HuggingFace token");
        }

        cmd.stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn Python process: {}", e))?;

        let child_id = child.id();
        println!("[PETALS] Spawned process with PID: {}", child_id);

        // Capture stdout/stderr for logging with error detection
        if let Some(stdout) = child.stdout.take() {
            let logs = state.seeder_logs.clone();
            let app_handle = app.clone();
            thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        println!("[PETALS-OUT] {}", line);
                        
                        // Detect various events in logs
                        let is_error = line.contains("[ERROR]") && !line.contains("triton");
                        let is_success = line.contains("✓✓✓ MODEL LOADED SUCCESSFULLY ✓✓✓") 
                            || line.contains("Loaded") && line.contains("block");
                        let is_connecting = line.contains("Connecting to") || line.contains("DHT");
                        let is_announced = line.contains("Announced that blocks") && line.contains("joining");
                        let is_loading = line.contains("Loading") || line.contains("Measuring");
                        
                        // Emit progress events to UI
                        if is_connecting {
                            let _ = app_handle.emit("petals_progress", json!({
                                "stage": "connecting",
                                "message": "Connecting to Petals network..."
                            }));
                        }
                        if is_loading {
                            let _ = app_handle.emit("petals_progress", json!({
                                "stage": "loading",
                                "message": "Loading model blocks..."
                            }));
                        }
                        if is_announced {
                            let _ = app_handle.emit("petals_progress", json!({
                                "stage": "announcing",
                                "message": "Announcing availability to network..."
                            }));
                        }
                        
                        // Store in logs and emit to UI
                        {
                            let mut logs_guard = logs.lock().unwrap();
                            logs_guard.push(line.clone());
                            // Keep only last 200 lines
                            if logs_guard.len() > 200 {
                                logs_guard.remove(0);
                            }
                        }
                        
                        // Emit log line to UI for real-time display
                        let _ = app_handle.emit("petals_log", line.clone());
                        
                        // Emit events after releasing lock
                        if is_error {
                            let _ = app_handle.emit("petals_error", line);
                        }
                        if is_success {
                            let _ = app_handle.emit("petals_success", "Model loaded successfully");
                        }
                    }
                }
            });
        }

        {
            let mut process_guard = state.process.lock().unwrap();
            *process_guard = Some(child);

            let mut model_guard = state.model_name.lock().unwrap();
            *model_guard = Some(model_name.clone());

            let mut token_guard = state.node_token.lock().unwrap();
            *token_guard = Some(node_token);
        }

        app.notification()
            .builder()
            .title("Model Sharing Active")
            .body(format!("Now serving {} ({})", model_name, if has_nvidia_gpu { "GPU" } else { "CPU" }))
            .show()
            .ok();

        Ok(format!("Petals seeder started for model: {}", model_name))
    }
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

            #[cfg(unix)]
            {
                use nix::sys::signal::{kill, Signal};
                use nix::unistd::Pid;
                if let Err(e) = kill(Pid::from_raw(child.id() as i32), Signal::SIGTERM) {
                    eprintln!("[PETALS] Failed to send SIGTERM: {}", e);
                }
            }

            #[cfg(windows)]
            {
                // First, try to gracefully terminate the Python process inside WSL
                // Use the node_token to identify the specific process
                let node_token_guard = state.node_token.lock().unwrap();
                if let Some(token) = node_token_guard.as_ref() {
                    println!("[PETALS] Sending graceful shutdown signal to Python process in WSL...");
                    
                    // Find and kill the Python process by matching the node token in command line
                    let kill_cmd = format!(
                        "pkill -TERM -f 'python3.*run_petals_seeder.py.*{}'",
                        &token[..12] // Use first 12 chars of token to match
                    );
                    
                    match execute_wsl_command(&kill_cmd) {
                        Ok(_) => println!("[PETALS] Sent SIGTERM to Python process"),
                        Err(e) => eprintln!("[PETALS] Failed to send SIGTERM: {}", e),
                    }
                    
                    // Give it 3 seconds to shut down gracefully
                    std::thread::sleep(std::time::Duration::from_secs(3));
                    
                    // Check if process is still running
                    let check_cmd = format!(
                        "pgrep -f 'python3.*run_petals_seeder.py.*{}'",
                        &token[..12]
                    );
                    
                    if let Ok(output) = execute_wsl_command(&check_cmd) {
                        if !output.trim().is_empty() {
                            println!("[PETALS] Process still running, forcing kill...");
                            let force_kill_cmd = format!(
                                "pkill -9 -f 'python3.*run_petals_seeder.py.*{}'",
                                &token[..12]
                            );
                            execute_wsl_command(&force_kill_cmd).ok();
                        } else {
                            println!("[PETALS] Process terminated gracefully");
                        }
                    }
                }
                drop(node_token_guard);
                
                // Now kill the WSL wrapper process
                match child.kill() {
                    Ok(_) => println!("[PETALS] Sent kill signal to WSL wrapper process {}", child.id()),
                    Err(e) => eprintln!("[PETALS] Failed to kill WSL wrapper process {}: {}", child.id(), e),
                }
            }

            use std::time::Duration;
            let timeout = Duration::from_secs(5000);
            let start = std::time::Instant::now();

            loop {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        println!("[PETALS] Process exited with status: {}", status);
                        break;
                    }
                    Ok(None) => {
                        if start.elapsed() > timeout {
                            println!("[PETALS] Timeout, forcing kill...");
                            let _ = child.kill();
                            let _ = child.wait();
                            break;
                        }
                        std::thread::sleep(Duration::from_millis(100));
                    }
                    Err(e) => {
                        eprintln!("[PETALS] Error waiting: {}", e);
                        let _ = child.kill();
                        break;
                    }
                }
            }

            // After the wait loop, verify the process is truly dead
            #[cfg(windows)]
            {
                let node_token_guard = state.node_token.lock().unwrap();
                if let Some(token) = node_token_guard.as_ref() {
                    let verify_cmd = format!(
                        "pgrep -f 'python3.*run_petals_seeder.py.*{}'",
                        &token[..12]
                    );
                    
                    if let Ok(output) = execute_wsl_command(&verify_cmd) {
                        if !output.trim().is_empty() {
                            println!("[PETALS] WARNING: Process still running after timeout, forcing kill...");
                            let force_kill = format!(
                                "pkill -9 -f 'python3.*run_petals_seeder.py.*{}'",
                                &token[..12]
                            );
                            execute_wsl_command(&force_kill).ok();
                            std::thread::sleep(std::time::Duration::from_millis(500));
                        }
                    }
                }
                drop(node_token_guard);
            }

            *process_guard = None;
            drop(process_guard);

            {
                let mut model_guard = state.model_name.lock().unwrap();
                *model_guard = None;
                let mut token_guard = state.node_token.lock().unwrap();
                *token_guard = None;
                let mut logs_guard = state.seeder_logs.lock().unwrap();
                logs_guard.clear();
            }

            if let Some(model) = model_name {
                app.notification()
                    .builder()
                    .title("Model Sharing Stopped")
                    .body(format!("Stopped serving {}", model))
                    .show()
                    .ok();
            }

            Ok("Petals seeder stopped successfully".to_string())
        }
        None => Err("No Petals seeder process is running".to_string()),
    }
}

#[tauri::command]
async fn is_petals_seeder_running(state: tauri::State<'_, PetalsState>) -> Result<bool, String> {
    let mut process_guard = state.process.lock().unwrap();
    match process_guard.as_mut() {
        Some(child) => {
            match child.try_wait() {
                Ok(Some(_)) => {
                    *process_guard = None;
                    drop(process_guard);
                    {
                        let mut model_guard = state.model_name.lock().unwrap();
                        *model_guard = None;
                        let mut token_guard = state.node_token.lock().unwrap();
                        *token_guard = None;
                    }
                    Ok(false)
                }
                Ok(None) => Ok(true),
                Err(_) => Ok(true),
            }
        }
        None => Ok(false),
    }
}

#[tauri::command]
async fn get_petals_seeder_info(state: tauri::State<'_, PetalsState>) -> Result<Option<String>, String> {
    if !is_petals_seeder_running(state.clone()).await? {
        Ok(None)
    } else {
        let model_guard = state.model_name.lock().unwrap();
        Ok(model_guard.clone())
    }
}

/// Get recent seeder logs
#[tauri::command]
async fn get_petals_seeder_logs(state: tauri::State<'_, PetalsState>) -> Result<Vec<String>, String> {
    let logs_guard = state.seeder_logs.lock().unwrap();
    Ok(logs_guard.clone())
}

#[tauri::command]
async fn mark_wsl_setup_complete(state: tauri::State<'_, PetalsState>) -> Result<(), String> {
    let mut setup_guard = state.wsl_setup_complete.lock().unwrap();
    *setup_guard = true;
    Ok(())
}

// ===== DIRECT PETALS INFERENCE COMMANDS =====

/// Check if Petals environment is ready for direct inference
#[tauri::command]
async fn check_petals_inference_ready() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        // On Windows, check if WSL and Petals are set up
        if !check_wsl_installed() {
            return Ok(false);
        }
        
        // Check if Petals is installed in WSL (client-only for direct inference)
        let petals_ready = check_wsl_petals_client_only();
        Ok(petals_ready)
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        // On macOS/Linux, check if Petals is installed in system Python
        let python_exe = if cfg!(target_os = "macos") { "python3" } else { "python3" };
        
        match Command::new(python_exe)
            .arg("-c")
            .arg("import petals; import torch; print('ok')")
            .output()
        {
            Ok(output) => {
                let result = String::from_utf8_lossy(&output.stdout);
                Ok(result.trim() == "ok")
            }
            Err(_) => Ok(false),
        }
    }
}

/// Run direct Petals inference for testing (bypasses backend)
#[tauri::command]
async fn run_petals_inference(
    model_name: String,
    prompt: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        println!("[INFERENCE] Running direct Petals inference in WSL...");
        println!("[INFERENCE] Model: {}", model_name);
        println!("[INFERENCE] Prompt length: {}", prompt.len());
        
        // Get the script path from resources
        let script_path = app
            .path()
            .resolve("py/run_petals_inference.py", BaseDirectory::Resource)
            .map_err(|e| format!("Failed to resolve script path: {}", e))?;

        if !script_path.exists() {
            return Err(format!("Python script not found at: {}", script_path.display()));
        }

        // Copy script to WSL
        println!("[INFERENCE] Reading script from: {}", script_path.display());
        let script_content = std::fs::read_to_string(&script_path)
            .map_err(|e| format!("Failed to read script: {}", e))?;
        
        println!("[INFERENCE] Script size: {} bytes", script_content.len());
        let escaped_content = script_content.replace("'", "'\\''");
        let wsl_script_path = "~/run_petals_inference.py";
        let write_command = format!("cat > {} << 'EOF'\n{}\nEOF", wsl_script_path, escaped_content);
        
        println!("[INFERENCE] Writing script to WSL...");
        execute_wsl_command(&write_command)
            .map_err(|e| format!("Failed to copy script to WSL: {}", e))?;
        
        println!("[INFERENCE] Setting execute permissions...");
        execute_wsl_command(&format!("chmod +x {}", wsl_script_path))
            .map_err(|e| format!("Failed to chmod script: {}", e))?;
        
        // Escape the prompt for shell
        let escaped_prompt = prompt.replace("'", "'\\''");
        
        // First check if venv exists
        println!("[INFERENCE] Checking if venv exists...");
        match execute_wsl_command("test -d ~/.torbiz_venv && echo 'exists' || echo 'missing'") {
            Ok(result) => println!("[INFERENCE] Venv check: {}", result.trim()),
            Err(e) => println!("[INFERENCE] Venv check failed: {}", e),
        }
        
        // Build the inference command - KEEP stderr to see errors, add timeout
        // Add -u flag to Python for unbuffered output
        let command = format!(
            "source ~/.torbiz_venv/bin/activate && python3 -u {} --model-name '{}' --prompt '{}' --stream --timeout 500 2>&1",
            wsl_script_path,
            model_name,
            escaped_prompt
        );

        // Create command and hide console window
        let mut cmd = Command::new("wsl");
        cmd.arg("-e")
            .arg("bash")
            .arg("-c")
            .arg(&command)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // On Windows, hide the console window using creation flags
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn inference process: {}", e))?;

        let child_id = child.id();
        println!("[INFERENCE] Spawned process with PID: {}", child_id);

        // Capture stdout for real-time log streaming
        if let Some(stdout) = child.stdout.take() {
            let app_handle = app.clone();
            thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        // Emit each log line in real-time
                        let _ = app_handle.emit("petals_inference_log", line);
                    }
                }
            });
        }

        Ok("Inference started".to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let python_exe = if cfg!(target_os = "macos") { "python3" } else { "python3" };

        let script_path = app
            .path()
            .resolve("py/run_petals_inference.py", BaseDirectory::Resource)
            .map_err(|e| format!("Failed to resolve resource path: {}", e))?;

        if !script_path.exists() {
            return Err(format!("Python script not found at: {}", script_path.display()));
        }

        println!("[INFERENCE] Running with script: {}", script_path.display());
        println!("[INFERENCE] Model: {}", model_name);

        let mut cmd = Command::new(python_exe);
        cmd.arg(script_path.to_str().ok_or("Invalid script path")?)
            .arg("--model-name")
            .arg(&model_name)
            .arg("--prompt")
            .arg(&prompt)
            .arg("--stream")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn inference process: {}", e))?;

        let child_id = child.id();
        println!("[INFERENCE] Spawned process with PID: {}", child_id);

        // Capture stdout for real-time log streaming
        if let Some(stdout) = child.stdout.take() {
            let app_handle = app.clone();
            thread::spawn(move || {
                let reader = BufReader::new(stjdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        // Emit each log line in real-time
                        let _ = app_handle.emit("petals_inference_log", line);
                    }
                }
            });
        }

        Ok("Inference started".to_string())
    }
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
            mark_wsl_setup_complete,
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