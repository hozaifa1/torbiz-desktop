// src-tauri/src/macos.rs
// macOS-specific setup and utilities

#[cfg(target_os = "macos")]
use std::process::Command;

#[cfg(target_os = "macos")]
use tauri::{Emitter, Manager};

#[cfg(target_os = "macos")]
use crate::wsl::SetupProgress;

#[cfg(target_os = "macos")]
/// Find executable in standard macOS locations
fn find_executable(name: &str, standard_paths: &[&str]) -> Option<String> {
    // Try command name first (checks PATH)
    if Command::new(name).arg("--version").output().is_ok() {
        return Some(name.to_string());
    }
    
    // Try standard locations
    for path in standard_paths {
        let full_path = format!("{}/{}", path, name);
        if Command::new(&full_path).arg("--version").output().is_ok() {
            println!("[MACOS] Found {} at {}", name, full_path);
            return Some(full_path);
        }
    }
    
    None
}

#[cfg(target_os = "macos")]
/// Check if Docker is installed on macOS
pub fn check_docker_installed() -> bool {
    // Check if docker command is available
    if let Ok(output) = Command::new("docker").arg("--version").output() {
        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout);
            println!("[MACOS] Docker found: {}", version.trim());
            return true;
        }
    }
    
    // Check common Docker Desktop locations
    let docker_app_path = "/Applications/Docker.app";
    if std::path::Path::new(docker_app_path).exists() {
        println!("[MACOS] Docker Desktop app found at {}", docker_app_path);
        // Docker might be installed but not running
        return true;
    }
    
    println!("[MACOS] Docker not found");
    false
}

#[cfg(target_os = "macos")]
/// Check if Docker daemon is running
pub fn check_docker_running() -> bool {
    match Command::new("docker").arg("info").output() {
        Ok(output) => {
            if output.status.success() {
                println!("[MACOS] Docker daemon is running");
                true
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                println!("[MACOS] Docker daemon not running: {}", stderr);
                false
            }
        }
        Err(e) => {
            println!("[MACOS] Failed to check Docker status: {}", e);
            false
        }
    }
}

#[cfg(target_os = "macos")]
/// Check if Torbiz Docker image exists
pub fn check_docker_image_exists() -> bool {
    match Command::new("docker")
        .args(&["images", "-q", "torbiz-petals-macos:latest"])
        .output()
    {
        Ok(output) => {
            let result = String::from_utf8_lossy(&output.stdout);
            let exists = !result.trim().is_empty();
            println!("[MACOS] Docker image exists: {}", exists);
            exists
        }
        Err(e) => {
            println!("[MACOS] Failed to check Docker image: {}", e);
            false
        }
    }
}

#[cfg(target_os = "macos")]
/// Build Docker image for Torbiz Petals
pub fn build_docker_image(project_root: &str) -> Result<(), String> {
    println!("[MACOS] Building Docker image for Torbiz Petals...");
    println!("[MACOS] This may take 5-10 minutes on first run...");
    
    let output = Command::new("docker")
        .args(&[
            "build",
            "-f", "Dockerfile.macos",
            "-t", "torbiz-petals-macos:latest",
            project_root
        ])
        .output()
        .map_err(|e| format!("Failed to run docker build: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("Docker build failed:\nSTDERR: {}\nSTDOUT: {}", stderr, stdout));
    }
    
    println!("[MACOS] Docker image built successfully");
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn check_python3_installed() -> bool {
    let python_paths = vec![
        "python3",                      // Try PATH first
        "/opt/homebrew/bin/python3",    // Apple Silicon Homebrew
        "/usr/local/bin/python3",       // Intel Homebrew
        "/usr/bin/python3",             // System Python
    ];
    
    for python_cmd in python_paths {
        if let Ok(output) = Command::new(python_cmd).arg("--version").output() {
            if output.status.success() {
                let version_str = String::from_utf8_lossy(&output.stdout);
                println!("[MACOS] Found Python at {}: {}", python_cmd, version_str.trim());
                
                // Check if Python 3.10 or later
                if let Some(version) = version_str.split_whitespace().nth(1) {
                    if let Some(minor) = version.split('.').nth(1) {
                        if let Ok(minor_num) = minor.parse::<u32>() {
                            if minor_num >= 10 {
                                return true;
                            }
                        }
                    }
                }
                return true; // Accept any Python 3.x if version parsing fails
            }
        }
    }
    
    println!("[MACOS] Python 3 not found in any standard location");
    false
}

#[cfg(target_os = "macos")]
pub fn check_homebrew_installed() -> bool {
    // Try standard command first
    if let Ok(output) = Command::new("brew").arg("--version").output() {
        if output.status.success() {
            return true;
        }
    }
    
    // Try Apple Silicon location
    if let Ok(output) = Command::new("/opt/homebrew/bin/brew").arg("--version").output() {
        if output.status.success() {
            println!("[MACOS] Found Homebrew at /opt/homebrew/bin/brew");
            return true;
        }
    }
    
    // Try Intel Mac location
    if let Ok(output) = Command::new("/usr/local/bin/brew").arg("--version").output() {
        if output.status.success() {
            println!("[MACOS] Found Homebrew at /usr/local/bin/brew");
            return true;
        }
    }
    
    println!("[MACOS] Homebrew not found in any standard location");
    false
}

#[cfg(target_os = "macos")]
pub fn check_petals_installed() -> bool {
    match Command::new("python3")
        .arg("-c")
        .arg("import petals; import torch; print('ok')")
        .output()
    {
        Ok(output) => {
            let result = String::from_utf8_lossy(&output.stdout);
            println!("[MACOS] Petals check: {}", result.trim());
            result.trim() == "ok"
        }
        Err(e) => {
            println!("[MACOS] Petals check failed: {}", e);
            false
        }
    }
}

#[cfg(target_os = "macos")]
pub fn install_petals_macos() -> Result<(), String> {
    println!("[MACOS] Installing Petals and dependencies for GPU sharing...");
    
    // Find python3 executable
    let python_paths = vec![
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
    ];
    
    let python_cmd = find_executable("python3", &python_paths)
        .ok_or("Python 3 not found in any standard location")?;
    
    println!("[MACOS] Using Python at: {}", python_cmd);
    
    // Install Petals (this installs PyTorch and transformers too)
    println!("[MACOS] Step 1/2: Installing Petals core...");
    let output = Command::new(&python_cmd)
        .arg("-m")
        .arg("pip")
        .arg("install")
        .arg("--upgrade")
        .arg("git+https://github.com/bigscience-workshop/petals")
        .output()
        .map_err(|e| format!("Failed to run pip install: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("Petals installation failed:\nSTDERR: {}\nSTDOUT: {}", stderr, stdout));
    }
    
    println!("[MACOS] Petals core installed successfully");
    
    // Install additional dependencies required for GPU sharing (hosting models)
    // These are required by run_petals_seeder.py but not by run_petals_inference.py
    println!("[MACOS] Step 2/2: Installing GPU sharing dependencies (peft, accelerate)...");
    let deps_output = Command::new(&python_cmd)
        .arg("-m")
        .arg("pip")
        .arg("install")
        .arg("--upgrade")
        .arg("peft")
        .arg("accelerate")
        .output()
        .map_err(|e| format!("Failed to install dependencies: {}", e))?;
    
    if !deps_output.status.success() {
        let stderr = String::from_utf8_lossy(&deps_output.stderr);
        let _stdout = String::from_utf8_lossy(&deps_output.stdout);
        println!("[MACOS] Warning: Some dependencies failed to install: {}", stderr);
        // Don't fail here - peft/accelerate might already be installed via Petals
    } else {
        println!("[MACOS] GPU sharing dependencies installed successfully");
    }
    
    // Verify installation
    println!("[MACOS] Verifying complete installation...");
    let verify_output = Command::new(&python_cmd)
        .arg("-c")
        .arg("import petals; import torch; import peft; import accelerate; print('all_ok')")
        .output()
        .map_err(|e| format!("Failed to verify installation: {}", e))?;
    
    let verify_result = String::from_utf8_lossy(&verify_output.stdout);
    if verify_result.trim() == "all_ok" {
        println!("[MACOS] All dependencies verified successfully");
    } else {
        println!("[MACOS] Warning: Some dependencies may not be fully installed");
        println!("[MACOS] Verification output: {}", verify_result);
        let stderr = String::from_utf8_lossy(&verify_output.stderr);
        if !stderr.is_empty() {
            println!("[MACOS] Verification errors: {}", stderr);
        }
    }
    
    println!("[MACOS] Petals installation completed");
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn sync_macos_time() -> Result<(), String> {
    println!("[MACOS] Synchronizing system time with NTP server...");
    
    // Try to sync time using sntp
    // First attempt: without sudo (may work if time daemon is already running)
    let output = Command::new("sntp")
        .arg("-sS")
        .arg("time.apple.com")
        .output();
    
    match output {
        Ok(result) => {
            if result.status.success() {
                println!("[MACOS] Time synchronized successfully");
                Ok(())
            } else {
                // If it failed, it might be a permission issue
                let stderr = String::from_utf8_lossy(&result.stderr);
                println!("[MACOS] Time sync warning: {}", stderr);
                
                // Don't fail - continue anyway and let Petals/AWS handle it
                // User might have correct time already
                println!("[MACOS] Continuing despite sync warning...");
                Ok(())
            }
        }
        Err(e) => {
            // Command not found or other error - don't fail
            println!("[MACOS] Could not run sntp: {}. Continuing anyway...", e);
            Ok(())
        }
    }
}

#[tauri::command]
pub async fn setup_macos_environment(
    window: tauri::Window,
    app: tauri::AppHandle,
) -> Result<String, String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window; // Suppress unused warning
        let _ = app; // Suppress unused warning
        return Err("macOS setup is only for macOS devices.".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        let emit_progress = |stage: &str, message: &str, progress: u8| {
            let _ = window.emit("wsl_setup_progress", SetupProgress {
                stage: stage.to_string(),
                message: message.to_string(),
                progress,
            });
        };

        emit_progress("checking_docker", "Checking Docker installation...", 10);
        
        if !check_docker_installed() {
            emit_progress("docker_missing", "Docker not found", 15);
            return Err(format!(
                "Docker is required for GPU sharing on macOS but not found.\n\n\
                Please install Docker Desktop from:\n\
                https://www.docker.com/products/docker-desktop\n\n\
                After installing Docker Desktop:\n\
                1. Open Docker Desktop app\n\
                2. Wait for it to start (whale icon in menu bar)\n\
                3. Click 'Share GPU' again\n\n\
                Note: Direct inference will still work without Docker."
            ));
        }
        
        println!("[MACOS] Docker is installed");
        emit_progress("docker_ok", "Docker found", 25);

        emit_progress("checking_docker_running", "Checking if Docker is running...", 30);
        
        if !check_docker_running() {
            emit_progress("docker_not_running", "Docker daemon not running", 35);
            return Err(format!(
                "Docker is installed but not running.\n\n\
                Please start Docker Desktop:\n\
                1. Open Docker Desktop app from Applications\n\
                2. Wait for the whale icon to appear in menu bar\n\
                3. Click 'Share GPU' again\n\n\
                Note: Direct inference will still work without Docker."
            ));
        }
        
        println!("[MACOS] Docker daemon is running");
        emit_progress("docker_running", "Docker is running", 40);

        emit_progress("checking_python", "Checking Python for direct inference...", 50);
        
        // Install Python for direct inference (not GPU sharing)
        if !check_python3_installed() {
            emit_progress("checking_homebrew", "Need Homebrew to install Python...", 55);
            
            if !check_homebrew_installed() {
                return Err(format!(
                    "Homebrew is required to install Python for direct inference.\n\
                    Please install it from https://brew.sh\n\n\
                    GPU sharing will use Docker (already set up),\n\
                    but direct inference needs Python installed on your system."
                ));
            }
            
            emit_progress("installing_python", "Installing Python 3 via Homebrew...", 60);
            
            let python_install = Command::new("brew")
                .arg("install")
                .arg("python@3.11")
                .output()
                .map_err(|e| format!("Failed to install Python: {}", e))?;
            
            if !python_install.status.success() {
                let stderr = String::from_utf8_lossy(&python_install.stderr);
                return Err(format!("Python installation failed: {}", stderr));
            }
            
            println!("[MACOS] Python installed successfully");
        }
        
        emit_progress("python_ok", "Python 3 ready for inference", 70);

        emit_progress("checking_petals", "Checking Petals for direct inference...", 75);
        
        // Install Petals for direct inference (client-only, no peft/accelerate needed)
        if !check_petals_installed() {
            emit_progress("installing_petals", "Installing Petals for direct inference (3-5 minutes)...", 80);
            
            install_petals_macos()?;
            
            emit_progress("verifying_petals", "Verifying Petals installation...", 85);
            
            if !check_petals_installed() {
                println!("[MACOS-SETUP] Petals verification failed, but continuing (Docker will handle GPU sharing)");
            }
        }
        
        emit_progress("checking_docker_image", "Checking Docker image for GPU sharing...", 88);
        
        // Get project root directory
        let project_root = app.path()
            .app_config_dir()
            .map_err(|e| format!("Failed to get app directory: {}", e))?
            .parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
            .ok_or("Failed to determine project root")?
            .to_str()
            .ok_or("Invalid project root path")?;
        
        if !check_docker_image_exists() {
            emit_progress("building_docker_image", "Building Docker image (5-10 minutes, one-time setup)...", 90);
            
            build_docker_image(project_root)?;
            
            emit_progress("docker_image_ready", "Docker image built successfully", 95);
        } else {
            println!("[MACOS] Docker image already exists");
            emit_progress("docker_image_ready", "Docker image ready", 95);
        }
        
        // Sync time before completing setup
        emit_progress("sync_time", "Synchronizing system time...", 97);
        if let Err(e) = sync_macos_time() {
            println!("[MACOS-SETUP] Time sync warning: {}", e);
            // Don't fail setup for this
        }
        
        emit_progress("complete", "macOS environment ready! GPU sharing will use Docker.", 100);
        Ok("macOS environment is ready. GPU sharing will run in Docker container.".to_string())
    }
}

