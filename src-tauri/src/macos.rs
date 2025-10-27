// src-tauri/src/macos.rs
// macOS-specific setup and utilities

#[cfg(target_os = "macos")]
use std::process::Command;

use tauri::Emitter;
use crate::wsl::SetupProgress;

#[cfg(target_os = "macos")]
pub fn check_python3_installed() -> bool {
    match Command::new("python3").arg("--version").output() {
        Ok(output) => {
            if output.status.success() {
                let version_str = String::from_utf8_lossy(&output.stdout);
                println!("[MACOS] Python version: {}", version_str.trim());
                if let Some(version) = version_str.split_whitespace().nth(1) {
                    if let Some(minor) = version.split('.').nth(1) {
                        if let Ok(minor_num) = minor.parse::<u32>() {
                            return minor_num >= 10;
                        }
                    }
                }
                true
            } else {
                false
            }
        }
        Err(_) => false,
    }
}

#[cfg(target_os = "macos")]
pub fn check_homebrew_installed() -> bool {
    match Command::new("brew").arg("--version").output() {
        Ok(output) => output.status.success(),
        Err(_) => false,
    }
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
    println!("[MACOS] Installing Petals...");
    
    let output = Command::new("python3")
        .arg("-m")
        .arg("pip")
        .arg("install")
        .arg("--upgrade")
        .arg("git+https://github.com/bigscience-workshop/petals")
        .output()
        .map_err(|e| format!("Failed to run pip install: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Petals installation failed: {}", stderr));
    }
    
    println!("[MACOS] Petals installed successfully");
    Ok(())
}

#[tauri::command]
pub async fn setup_macos_environment(
    window: tauri::Window,
) -> Result<String, String> {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window; // Suppress unused warning
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

        emit_progress("checking_homebrew", "Checking Homebrew installation...", 10);
        
        if !check_homebrew_installed() {
            emit_progress("homebrew_missing", "Homebrew not found", 15);
            return Err("Homebrew is required but not installed. Please install Homebrew from https://brew.sh and try again.".to_string());
        }
        
        println!("[MACOS] Homebrew is installed");
        emit_progress("homebrew_ok", "Homebrew found", 20);

        emit_progress("checking_python", "Checking Python installation...", 30);
        
        if !check_python3_installed() {
            emit_progress("installing_python", "Installing Python 3 via Homebrew...", 40);
            
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
        
        emit_progress("python_ok", "Python 3 ready", 50);

        emit_progress("checking_petals", "Checking Petals installation...", 60);
        
        if !check_petals_installed() {
            emit_progress("installing_petals", "Installing Petals library (this may take 5-10 minutes)...", 70);
            
            install_petals_macos()?;
            
            emit_progress("verifying_petals", "Verifying Petals installation...", 90);
            
            if !check_petals_installed() {
                return Err("Petals installation completed but verification failed. Please restart the app.".to_string());
            }
        }
        
        emit_progress("complete", "macOS environment ready for Petals!", 100);
        Ok("macOS environment is ready for Petals".to_string())
    }
}

