// src-tauri/src/hardware.rs
// Hardware information collection and GPU detection

use serde::{Deserialize, Serialize};
use sysinfo::System;

#[cfg(any(target_os = "linux", target_os = "macos"))]
use std::process::Command;

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
pub fn get_hardware_info() -> Result<HardwareInfo, String> {
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

pub fn get_gpu_info() -> Vec<String> {
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
pub fn get_windows_gpu_info() -> Result<Vec<String>, String> {
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

