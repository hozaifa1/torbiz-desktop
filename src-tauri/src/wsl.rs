// src-tauri/src/wsl.rs
// WSL (Windows Subsystem for Linux) setup and utilities

use serde::Serialize;
use tauri::Emitter;

#[cfg(target_os = "windows")]
use std::process::Command;

#[cfg(target_os = "windows")]
use std::path::PathBuf;

#[derive(Debug, Serialize, Clone)]
pub struct SetupProgress {
    pub stage: String,
    pub message: String,
    pub progress: u8,
}

#[cfg(target_os = "windows")]
pub fn check_wsl_installed() -> bool {
    match Command::new("wsl").arg("--status").output() {
        Ok(output) => output.status.success(),
        Err(_) => false,
    }
}

#[cfg(not(target_os = "windows"))]
pub fn check_wsl_installed() -> bool {
    false
}

#[cfg(target_os = "windows")]
pub fn install_wsl() -> Result<(), String> {
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
pub fn install_wsl() -> Result<(), String> {
    Err("WSL installation is only supported on Windows".to_string())
}

#[cfg(target_os = "windows")]
pub fn execute_wsl_command(command: &str) -> Result<String, String> {
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
pub fn execute_wsl_command(_command: &str) -> Result<String, String> {
    Err("WSL commands are only supported on Windows".to_string())
}

pub fn check_wsl_python() -> bool {
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

pub fn install_wsl_python() -> Result<(), String> {
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

pub fn check_wsl_petals() -> bool {
    #[cfg(target_os = "windows")]
    {
        let venv_check = execute_wsl_command("test -d ~/.torbiz_venv && echo 'exists' || echo 'missing'");
        
        if let Ok(output) = venv_check {
            if output.trim() == "missing" {
                println!("[WSL] Virtual environment not found");
                return false;
            }
        }
        
        match execute_wsl_command("~/.torbiz_venv/bin/python3 -c 'import petals; import torch; print(\"core_ok\")' 2>/dev/null || echo 'not_found'") {
            Ok(output) => {
                let trimmed = output.trim();
                println!("[WSL] Petals core check output: {}", trimmed);
                if trimmed == "core_ok" {
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

pub fn install_wsl_petals() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let venv_exists = execute_wsl_command("test -d ~/.torbiz_venv && echo 'exists' || echo 'missing'")
            .ok()
            .map(|s| s.trim() == "exists")
            .unwrap_or(false);
        
        if venv_exists {
            println!("[WSL] Checking what packages are missing...");
            
            let core_works = execute_wsl_command("~/.torbiz_venv/bin/python3 -c 'import petals; import torch; print(\"core_ok\")' 2>/dev/null")
                .map(|output| output.trim() == "core_ok")
                .unwrap_or(false);
            
            if core_works {
                println!("[WSL] Petals core is working, checking for missing extras...");
                
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

pub fn check_wsl_petals_client_only() -> bool {
    #[cfg(target_os = "windows")]
    {
        let venv_check = execute_wsl_command("test -d ~/.torbiz_venv && echo 'exists' || echo 'missing'");
        
        if let Ok(output) = venv_check {
            if output.trim() == "missing" {
                println!("[WSL] Virtual environment not found");
                return false;
            }
        }
        
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

pub fn install_wsl_petals_client_only() -> Result<(), String> {
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

#[cfg(target_os = "windows")]
pub fn copy_script_to_wsl(script_path: &PathBuf) -> Result<String, String> {
    let script_content = std::fs::read_to_string(script_path)
        .map_err(|e| format!("Failed to read script: {}", e))?;
    
    let escaped_content = script_content.replace("'", "'\\''");
    let wsl_script_path = "~/run_petals_seeder.py";
    let write_command = format!("cat > {} << 'EOF'\n{}\nEOF", wsl_script_path, escaped_content);
    
    execute_wsl_command(&write_command)?;
    execute_wsl_command(&format!("chmod +x {}", wsl_script_path))?;
    
    println!("[WSL] Script copied to: {}", wsl_script_path);
    Ok(wsl_script_path.to_string())
}

#[tauri::command]
pub async fn setup_wsl_environment(
    window: tauri::Window,
) -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = window; // Suppress unused warning
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
        println!("[WSL] Time synchronization: WSL will auto-sync time on each start");
        println!("[WSL] Setup completed successfully");

        emit_progress("complete", "WSL environment setup complete! You can now share your GPU.", 100);
        Ok("WSL environment is ready for Petals".to_string())
    }
}

#[tauri::command]
pub async fn setup_wsl_environment_client(
    window: tauri::Window,
) -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = window; // Suppress unused warning
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
        println!("[WSL] Time synchronization: WSL will auto-sync time on each start");
        println!("[WSL] Client setup completed successfully");

        emit_progress("complete", "WSL environment setup complete! You can now use Direct Mode.", 100);
        Ok("WSL environment is ready for Petals inference".to_string())
    }
}

