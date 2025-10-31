// src-tauri/src/petals.rs
// Petals seeder and inference management

use std::sync::{Arc, Mutex};
use std::process::{Child, Command, Stdio};
use std::io::{BufRead, BufReader};
use std::thread;
use serde_json::json;
use tauri::{Manager, Emitter, path::BaseDirectory};
use tauri_plugin_notification::NotificationExt;

#[cfg(target_os = "windows")]
use crate::wsl::{execute_wsl_command, copy_script_to_wsl};

#[cfg(any(target_os = "windows", target_os = "linux", not(target_os = "macos")))]
use crate::hardware::get_hardware_info;

pub struct PetalsState {
    pub process: Arc<Mutex<Option<Child>>>,
    pub model_name: Arc<Mutex<Option<String>>>,
    pub node_token: Arc<Mutex<Option<String>>>,
    pub wsl_setup_complete: Arc<Mutex<bool>>,
    pub macos_setup_complete: Arc<Mutex<bool>>,
    pub seeder_logs: Arc<Mutex<Vec<String>>>,
}

// NEW: State for managing the inference process
pub struct InferenceState {
    pub process: Arc<Mutex<Option<Child>>>,
}

impl PetalsState {
    pub fn new() -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
            model_name: Arc::new(Mutex::new(None)),
            node_token: Arc::new(Mutex::new(None)),
            wsl_setup_complete: Arc::new(Mutex::new(false)),
            macos_setup_complete: Arc::new(Mutex::new(false)),
            seeder_logs: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

impl InferenceState {
    pub fn new() -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
        }
    }
}

#[tauri::command]
pub async fn start_petals_seeder(
    model_name: String,
    node_token: String,
    state: tauri::State<'_, PetalsState>,
    app: tauri::AppHandle,
    hf_token: Option<String>,
) -> Result<String, String> {
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
        
        let script_path = app
            .path()
            .resolve("py/run_petals_seeder.py", BaseDirectory::Resource)
            .map_err(|e| format!("Failed to resolve script path: {}", e))?;

        if !script_path.exists() {
            return Err(format!("Python script not found at: {}", script_path.display()));
        }

        let wsl_script_path = copy_script_to_wsl(&script_path)?;
        
        println!("[WSL] Restarting WSL to sync time...");
        let _ = Command::new("wsl")
            .arg("--terminate")
            .output();
        
        std::thread::sleep(std::time::Duration::from_millis(500));
        println!("[WSL] Time synchronized via WSL restart");
        
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
        
        if !has_nvidia_gpu {
            println!("[WSL] CPU-only mode detected - removing bitsandbytes if installed...");
            execute_wsl_command("~/.torbiz_venv/bin/pip uninstall -y bitsandbytes 2>/dev/null || true").ok();
            println!("[WSL] bitsandbytes removed for CPU compatibility");
        }
        
        let mut command = format!(
            "source ~/.torbiz_venv/bin/activate && python3 {} --model-name '{}' --node-token '{}' --device {} --port 31337",
            wsl_script_path,
            model_name,
            node_token,
            device
        );

        if let Some(token) = hf_token {
            command.push_str(&format!(" --hf-token '{}'", token));
        }
        
        command.push_str(" 2>&1");

        println!("[PETALS] Running WSL command: {}", command);

        let mut cmd = Command::new("wsl");
        cmd.arg("-e")
            .arg("bash")
            .arg("-c")
            .arg(&command)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

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

        if let Some(stdout) = child.stdout.take() {
            let logs = state.seeder_logs.clone();
            let app_handle = app.clone();
            thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        println!("[PETALS-OUT] {}", line);
                        
                        let is_error = line.contains("[ERROR]") && !line.contains("triton");
                        let is_time_error = line.contains("local time must be within") || line.contains("TIME SYNC ERROR");
                        let is_success = line.contains("✓✓✓ MODEL LOADED SUCCESSFULLY ✓✓✓") 
                            || line.contains("Loaded") && line.contains("block");
                        let is_connecting = line.contains("Connecting to") || line.contains("DHT");
                        let is_announced = line.contains("Announced that blocks") && line.contains("joining");
                        let is_loading = line.contains("Loading") || line.contains("Measuring");
                        
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
                        
                        {
                            let mut logs_guard = logs.lock().unwrap();
                            logs_guard.push(line.clone());
                            if logs_guard.len() > 200 {
                                logs_guard.remove(0);
                            }
                        }
                        
                        let _ = app_handle.emit("petals_log", line.clone());
                        
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

    #[cfg(target_os = "macos")]
    {
        let macos_ready = {
            let setup_guard = state.macos_setup_complete.lock().unwrap();
            *setup_guard
        };

        if !macos_ready {
            return Err("macOS environment not set up. Please complete setup first by clicking the Share GPU button.".to_string());
        }

        // Sync time before starting Petals (similar to WSL restart on Windows)
        println!("[MACOS] Synchronizing system time...");
        #[cfg(target_os = "macos")]
        {
            use crate::macos::sync_macos_time;
            if let Err(e) = sync_macos_time() {
                println!("[MACOS] Time sync warning: {}", e);
                // Continue anyway - don't block startup
            }
        }
        println!("[MACOS] Time synchronization complete");

        println!("[PETALS] Starting Petals on macOS...");
        println!("[PETALS] Model: {}", model_name);

        let script_path = app
            .path()
            .resolve("py/run_petals_seeder.py", BaseDirectory::Resource)
            .map_err(|e| format!("Failed to resolve resource path: {}", e))?;

        if !script_path.exists() {
            return Err(format!("Python script not found at: {}", script_path.display()));
        }

        println!("[PETALS] Starting seeder with script: {}", script_path.display());

        // On macOS, let Petals auto-detect the best device (Metal GPU on Apple Silicon, CPU fallback)
        // Don't force --device cpu, let Petals decide
        println!("[PETALS] Letting Petals auto-detect device (Metal GPU on Apple Silicon, or CPU)");

        let mut cmd = Command::new("python3");
        cmd.arg(script_path.to_str().ok_or("Invalid script path")?)
            .arg("--model-name")
            .arg(&model_name)
            .arg("--node-token")
            .arg(&node_token);

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

        if let Some(stdout) = child.stdout.take() {
            let logs = state.seeder_logs.clone();
            let app_handle = app.clone();
            thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        println!("[PETALS-OUT] {}", line);
                        
                        let is_error = line.contains("[ERROR]") && !line.contains("triton");
                        let is_success = line.contains("✓✓✓ MODEL LOADED SUCCESSFULLY ✓✓✓") 
                            || line.contains("Loaded") && line.contains("block");
                        let is_connecting = line.contains("Connecting to") || line.contains("DHT");
                        let is_announced = line.contains("Announced that blocks") && line.contains("joining");
                        let is_loading = line.contains("Loading") || line.contains("Measuring");
                        
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
                        
                        {
                            let mut logs_guard = logs.lock().unwrap();
                            logs_guard.push(line.clone());
                            if logs_guard.len() > 200 {
                                logs_guard.remove(0);
                            }
                        }
                        
                        let _ = app_handle.emit("petals_log", line.clone());
                        
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
        
        // CRITICAL: Also capture stderr for error messages on macOS
        // This captures Python tracebacks and error messages
        if let Some(stderr) = child.stderr.take() {
            let logs = state.seeder_logs.clone();
            let app_handle = app.clone();
            thread::spawn(move || {
                let reader = BufReader::new(stderr);
                let mut error_buffer = Vec::new(); // Buffer to accumulate multi-line errors
                let mut in_traceback = false;
                
                for line in reader.lines() {
                    if let Ok(line) = line {
                        println!("[PETALS-ERR-MACOS] {}", line);
                        
                        // Detect start of Python traceback
                        if line.contains("Traceback (most recent call last):") {
                            in_traceback = true;
                            error_buffer.clear();
                            error_buffer.push(line.clone());
                        } else if in_traceback {
                            error_buffer.push(line.clone());
                            
                            // Detect end of traceback (usually an exception line without indentation)
                            if !line.starts_with("  ") && !line.starts_with("\t") && 
                               (line.contains("Error:") || line.contains("Exception:") || 
                                line.contains("Error ") || line.ends_with("Error")) {
                                // Emit the full traceback as one error
                                let full_error = error_buffer.join("\n");
                                println!("[PETALS-FULL-ERROR-MACOS]\n{}\n[END-ERROR]", full_error);
                                
                                let _ = app_handle.emit("petals_error", format!(
                                    "Python Error on macOS:\n\n{}\n\nPlease check if all dependencies are installed correctly.",
                                    full_error
                                ));
                                
                                in_traceback = false;
                                error_buffer.clear();
                            }
                        }
                        
                        // Emit all stderr output to UI for visibility
                        let formatted_line = format!("[STDERR] {}", line);
                        let _ = app_handle.emit("petals_log", formatted_line.clone());
                        
                        // Store in logs
                        {
                            let mut logs_guard = logs.lock().unwrap();
                            logs_guard.push(formatted_line);
                            if logs_guard.len() > 500 {  // Increased from 200 to capture full tracebacks
                                logs_guard.remove(0);
                            }
                        }
                        
                        // Detect critical single-line errors (not part of traceback)
                        if !in_traceback && (line.contains("ImportError") || line.contains("ModuleNotFoundError")) {
                            let _ = app_handle.emit("petals_error", format!(
                                "Import Error on macOS: {}\n\nMissing Python dependencies. Please ensure peft and accelerate are installed:\npip install peft accelerate",
                                line
                            ));
                        } else if !in_traceback && (line.contains("401") || line.contains("Unauthorized")) {
                            let _ = app_handle.emit("petals_error", format!(
                                "Authentication Error: {}. This may be due to system time being out of sync. Try restarting the app or manually syncing time in System Preferences > Date & Time.",
                                line
                            ));
                        } else if !in_traceback && line.contains("CUDA") {
                            // CUDA errors on macOS are expected (no NVIDIA GPU)
                            println!("[PETALS-MACOS] CUDA-related message (expected on Mac): {}", line);
                        }
                    }
                }
                
                // If we still have an incomplete error buffer at end of stream, emit it
                if !error_buffer.is_empty() {
                    let full_error = error_buffer.join("\n");
                    println!("[PETALS-INCOMPLETE-ERROR-MACOS]\n{}\n[END-ERROR]", full_error);
                    let _ = app_handle.emit("petals_error", format!(
                        "Incomplete Error on macOS:\n\n{}\n\nThe process may have terminated unexpectedly.",
                        full_error
                    ));
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
            .body(format!("Now serving {} on macOS", model_name))
            .show()
            .ok();

        Ok(format!("Petals seeder started for model: {}", model_name))
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let python_exe = "python3";

        let script_path = app
            .path()
            .resolve("py/run_petals_seeder.py", BaseDirectory::Resource)
            .map_err(|e| format!("Failed to resolve resource path: {}", e))?;

        if !script_path.exists() {
            return Err(format!("Python script not found at: {}", script_path.display()));
        }

        println!("[PETALS] Starting seeder with script: {}", script_path.display());
        println!("[PETALS] Model: {}", model_name);

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

        let mut cmd = Command::new(python_exe);
        cmd.arg(script_path.to_str().ok_or("Invalid script path")?)
            .arg("--model-name")
            .arg(&model_name)
            .arg("--node-token")
            .arg(&node_token)
            .arg("--device")
            .arg(device);

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

        if let Some(stdout) = child.stdout.take() {
            let logs = state.seeder_logs.clone();
            let app_handle = app.clone();
            thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        println!("[PETALS-OUT] {}", line);
                        
                        let is_error = line.contains("[ERROR]") && !line.contains("triton");
                        let is_success = line.contains("✓✓✓ MODEL LOADED SUCCESSFULLY ✓✓✓") 
                            || line.contains("Loaded") && line.contains("block");
                        let is_connecting = line.contains("Connecting to") || line.contains("DHT");
                        let is_announced = line.contains("Announced that blocks") && line.contains("joining");
                        let is_loading = line.contains("Loading") || line.contains("Measuring");
                        
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
                        
                        {
                            let mut logs_guard = logs.lock().unwrap();
                            logs_guard.push(line.clone());
                            if logs_guard.len() > 200 {
                                logs_guard.remove(0);
                            }
                        }
                        
                        let _ = app_handle.emit("petals_log", line.clone());
                        
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

#[tauri::command]
pub async fn stop_petals_seeder(
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
                let node_token_guard = state.node_token.lock().unwrap();
                if let Some(token) = node_token_guard.as_ref() {
                    println!("[PETALS] Sending graceful shutdown signal to Python process in WSL...");
                    
                    let kill_cmd = format!(
                        "pkill -TERM -f 'python3.*run_petals_seeder.py.*{}'",
                        &token[..12]
                    );
                    
                    match execute_wsl_command(&kill_cmd) {
                        Ok(_) => println!("[PETALS] Sent SIGTERM to Python process"),
                        Err(e) => eprintln!("[PETALS] Failed to send SIGTERM: {}", e),
                    }
                    
                    std::thread::sleep(std::time::Duration::from_secs(3));
                    
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
pub async fn is_petals_seeder_running(state: tauri::State<'_, PetalsState>) -> Result<bool, String> {
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
pub async fn get_petals_seeder_info(state: tauri::State<'_, PetalsState>) -> Result<Option<String>, String> {
    if !is_petals_seeder_running(state.clone()).await? {
        Ok(None)
    } else {
        let model_guard = state.model_name.lock().unwrap();
        Ok(model_guard.clone())
    }
}

#[tauri::command]
pub async fn get_petals_seeder_logs(state: tauri::State<'_, PetalsState>) -> Result<Vec<String>, String> {
    let logs_guard = state.seeder_logs.lock().unwrap();
    Ok(logs_guard.clone())
}

#[tauri::command]
pub async fn mark_wsl_setup_complete(state: tauri::State<'_, PetalsState>) -> Result<(), String> {
    let mut setup_guard = state.wsl_setup_complete.lock().unwrap();
    *setup_guard = true;
    Ok(())
}

#[tauri::command]
pub async fn mark_macos_setup_complete(state: tauri::State<'_, PetalsState>) -> Result<(), String> {
    let mut setup_guard = state.macos_setup_complete.lock().unwrap();
    *setup_guard = true;
    Ok(())
}

#[tauri::command]
pub async fn check_petals_inference_ready() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use crate::wsl::{check_wsl_installed, check_wsl_petals_client_only};
        
        if !check_wsl_installed() {
            return Ok(false);
        }
        
        let petals_ready = check_wsl_petals_client_only();
        Ok(petals_ready)
    }
    
    #[cfg(target_os = "macos")]
    {
        use crate::macos::check_petals_installed;
        println!("[MACOS] Checking if Petals is ready for inference...");
        Ok(check_petals_installed())
    }
    
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        match Command::new("python3")
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

#[tauri::command]
pub async fn run_local_inference(
    model_name: String,
    prompt: String,
    conversation_history: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use crate::wsl::execute_wsl_command;
        
        println!("[LOCAL-INFERENCE] Running local inference in WSL...");
        println!("[LOCAL-INFERENCE] Model: {}", model_name);
        println!("[LOCAL-INFERENCE] Prompt length: {}", prompt.len());
        
        let script_path = app
            .path()
            .resolve("py/run_local_inference.py", BaseDirectory::Resource)
            .map_err(|e| format!("Failed to resolve script path: {}", e))?;

        if !script_path.exists() {
            return Err(format!("Python script not found at: {}", script_path.display()));
        }

        println!("[LOCAL-INFERENCE] Reading script from: {}", script_path.display());
        let script_content = std::fs::read_to_string(&script_path)
            .map_err(|e| format!("Failed to read script: {}", e))?;
        
        let escaped_content = script_content.replace("'", "'\\''");
        let wsl_script_path = "~/run_local_inference.py";
        let write_command = format!("cat > {} << 'EOF'\n{}\nEOF", wsl_script_path, escaped_content);
        
        println!("[LOCAL-INFERENCE] Writing script to WSL...");
        execute_wsl_command(&write_command)
            .map_err(|e| format!("Failed to copy script to WSL: {}", e))?;
        
        execute_wsl_command(&format!("chmod +x {}", wsl_script_path))
            .map_err(|e| format!("Failed to chmod script: {}", e))?;
        
        let escaped_prompt = prompt.replace("'", "'\\''");
        let escaped_history = conversation_history.replace("'", "'\\''");
        
        let command = format!(
            "source ~/.torbiz_venv/bin/activate && python3 -u {} --model-name '{}' --prompt '{}' --conversation-history '{}' --stream --max-tokens 512 2>&1",
            wsl_script_path,
            model_name,
            escaped_prompt,
            escaped_history
        );

        let mut cmd = Command::new("wsl");
        cmd.arg("-e")
            .arg("bash")
            .arg("-c")
            .arg(&command)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

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
        println!("[LOCAL-INFERENCE] Spawned process with PID: {}", child_id);

        if let Some(stdout) = child.stdout.take() {
            let app_handle = app.clone();
            thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        let _ = app_handle.emit("local_inference_log", line);
                    }
                }
            });
        }

        Ok("Local inference started".to_string())
    }

    #[cfg(target_os = "macos")]
    {
        println!("[LOCAL-INFERENCE] Running local inference on macOS...");
        println!("[LOCAL-INFERENCE] Model: {}", model_name);
        println!("[LOCAL-INFERENCE] Prompt length: {}", prompt.len());

        let script_path = app
            .path()
            .resolve("py/run_local_inference.py", BaseDirectory::Resource)
            .map_err(|e| format!("Failed to resolve resource path: {}", e))?;

        if !script_path.exists() {
            return Err(format!("Python script not found at: {}", script_path.display()));
        }

        println!("[LOCAL-INFERENCE] Running with script: {}", script_path.display());

        let mut cmd = Command::new("python3");
        cmd.arg(script_path.to_str().ok_or("Invalid script path")?)
            .arg("--model-name")
            .arg(&model_name)
            .arg("--prompt")
            .arg(&prompt)
            .arg("--conversation-history")
            .arg(&conversation_history)
            .arg("--stream")
            .arg("--max-tokens")
            .arg("512")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn inference process: {}", e))?;

        let child_id = child.id();
        println!("[LOCAL-INFERENCE] Spawned process with PID: {}", child_id);

        if let Some(stdout) = child.stdout.take() {
            let app_handle = app.clone();
            thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        let _ = app_handle.emit("local_inference_log", line);
                    }
                }
            });
        }

        Ok("Local inference started".to_string())
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        println!("[LOCAL-INFERENCE] Running local inference on Linux...");
        println!("[LOCAL-INFERENCE] Model: {}", model_name);
        println!("[LOCAL-INFERENCE] Prompt length: {}", prompt.len());

        let script_path = app
            .path()
            .resolve("py/run_local_inference.py", BaseDirectory::Resource)
            .map_err(|e| format!("Failed to resolve resource path: {}", e))?;

        if !script_path.exists() {
            return Err(format!("Python script not found at: {}", script_path.display()));
        }

        println!("[LOCAL-INFERENCE] Running with script: {}", script_path.display());

        let mut cmd = Command::new("python3");
        cmd.arg(script_path.to_str().ok_or("Invalid script path")?)
            .arg("--model-name")
            .arg(&model_name)
            .arg("--prompt")
            .arg(&prompt)
            .arg("--conversation-history")
            .arg(&conversation_history)
            .arg("--stream")
            .arg("--max-tokens")
            .arg("512")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn inference process: {}", e))?;

        let child_id = child.id();
        println!("[LOCAL-INFERENCE] Spawned process with PID: {}", child_id);

        if let Some(stdout) = child.stdout.take() {
            let app_handle = app.clone();
            thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        let _ = app_handle.emit("local_inference_log", line);
                    }
                }
            });
        }

        Ok("Local inference started".to_string())
    }
}

// NEW: Command to stop a running inference process
#[tauri::command]
pub async fn stop_petals_inference(
    state: tauri::State<'_, InferenceState>,
) -> Result<String, String> {
    let mut process_guard = state.process.lock().unwrap();
    if let Some(mut child) = process_guard.take() { // .take() removes the value, leaving None
        println!("[INFERENCE] Stopping inference process with PID: {}", child.id());
        
        match child.kill() {
            Ok(_) => {
                child.wait().ok(); // Clean up zombie process to prevent it from becoming a zombie
                println!("[INFERENCE] Process stopped successfully.");
                Ok("Inference process stopped.".to_string())
            }
            Err(e) => {
                eprintln!("[INFERENCE] Failed to kill process: {}", e);
                Err(format!("Failed to stop inference process: {}", e))
            }
        }
    } else {
        println!("[INFERENCE] No inference process was running to stop.");
        Ok("No inference process was running.".to_string())
    }
}

#[tauri::command]
pub async fn run_petals_inference(
    model_name: String,
    prompt: String,
    conversation_history: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, InferenceState>,
) -> Result<String, String> {
    // Stop any previously running inference process
    {
        let mut process_guard = state.process.lock().unwrap();
        if let Some(mut child) = process_guard.take() {
            println!("[INFERENCE] Stopping previous inference process with PID: {}", child.id());
            child.kill().ok();
            child.wait().ok();
        }
    }
    #[cfg(target_os = "macos")]
    {
        println!("[INFERENCE] Running direct Petals inference on macOS...");
        println!("[INFERENCE] Model: {}", model_name);
        println!("[INFERENCE] Prompt length: {}", prompt.len());

        let script_path = app
            .path()
            .resolve("py/run_petals_inference.py", BaseDirectory::Resource)
            .map_err(|e| format!("Failed to resolve resource path: {}", e))?;

        if !script_path.exists() {
            return Err(format!("Python script not found at: {}", script_path.display()));
        }

        println!("[INFERENCE] Running with script: {}", script_path.display());

        let mut cmd = Command::new("python3");
        cmd.arg(script_path.to_str().ok_or("Invalid script path")?)
            .arg("--model-name")
            .arg(&model_name)
            .arg("--prompt")
            .arg(&prompt)
            .arg("--conversation-history")
            .arg(&conversation_history)
            .arg("--stream")
            .arg("--timeout")
            .arg("500")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn inference process: {}", e))?;

        let child_id = child.id();
        println!("[INFERENCE] Spawned process with PID: {}", child_id);

        if let Some(stdout) = child.stdout.take() {
            let app_handle = app.clone();
            thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        let _ = app_handle.emit("petals_inference_log", line);
                    }
                }
            });
        }

        // Store the new child process
        let mut process_guard = state.process.lock().unwrap();
        *process_guard = Some(child);

        Ok("Inference started".to_string())
    }

    #[cfg(target_os = "windows")]
    {
        use crate::wsl::execute_wsl_command;
        
        println!("[INFERENCE] Running direct Petals inference in WSL...");
        println!("[INFERENCE] Model: {}", model_name);
        println!("[INFERENCE] Prompt length: {}", prompt.len());
        
        let script_path = app
            .path()
            .resolve("py/run_petals_inference.py", BaseDirectory::Resource)
            .map_err(|e| format!("Failed to resolve script path: {}", e))?;

        if !script_path.exists() {
            return Err(format!("Python script not found at: {}", script_path.display()));
        }

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
        
        let escaped_prompt = prompt.replace("'", "'\\''");
        let escaped_history = conversation_history.replace("'", "'\\''");
        
        println!("[INFERENCE] Checking if venv exists...");
        match execute_wsl_command("test -d ~/.torbiz_venv && echo 'exists' || echo 'missing'") {
            Ok(result) => println!("[INFERENCE] Venv check: {}", result.trim()),
            Err(e) => println!("[INFERENCE] Venv check failed: {}", e),
        }
        
        let command = format!(
            "source ~/.torbiz_venv/bin/activate && python3 -u {} --model-name '{}' --prompt '{}' --conversation-history '{}' --stream --timeout 500 2>&1",
            wsl_script_path,
            model_name,
            escaped_prompt,
            escaped_history
        );

        let mut cmd = Command::new("wsl");
        cmd.arg("-e")
            .arg("bash")
            .arg("-c")
            .arg(&command)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

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

        if let Some(stdout) = child.stdout.take() {
            let app_handle = app.clone();
            thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        let _ = app_handle.emit("petals_inference_log", line);
                    }
                }
            });
        }

        // Store the new child process
        let mut process_guard = state.process.lock().unwrap();
        *process_guard = Some(child);

        Ok("Inference started".to_string())
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        println!("[INFERENCE] Running direct Petals inference on Linux...");
        println!("[INFERENCE] Model: {}", model_name);
        println!("[INFERENCE] Prompt length: {}", prompt.len());

        let script_path = app
            .path()
            .resolve("py/run_petals_inference.py", BaseDirectory::Resource)
            .map_err(|e| format!("Failed to resolve resource path: {}", e))?;

        if !script_path.exists() {
            return Err(format!("Python script not found at: {}", script_path.display()));
        }

        println!("[INFERENCE] Running with script: {}", script_path.display());

        let mut cmd = Command::new("python3");
        cmd.arg(script_path.to_str().ok_or("Invalid script path")?)
            .arg("--model-name")
            .arg(&model_name)
            .arg("--prompt")
            .arg(&prompt)
            .arg("--conversation-history")
            .arg(&conversation_history)
            .arg("--stream")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn inference process: {}", e))?;

        let child_id = child.id();
        println!("[INFERENCE] Spawned process with PID: {}", child_id);

        if let Some(stdout) = child.stdout.take() {
            let app_handle = app.clone();
            thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        let _ = app_handle.emit("petals_inference_log", line);
                    }
                }
            });
        }

        // Store the new child process
        let mut process_guard = state.process.lock().unwrap();
        *process_guard = Some(child);

        Ok("Inference started".to_string())
    }
}

