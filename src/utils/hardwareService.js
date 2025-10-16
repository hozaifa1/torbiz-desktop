// Service for collecting and sending hardware information
import { isTauriEnvironment } from './tauriHelpers';
import api from '../services/api';

// Configuration
const HARDWARE_API_CONFIG = {
  endpoint: '/gpu/list/', // Using your actual backend endpoint
  testingMode: true, // Set to true to log to console instead of sending to backend
};

/**
 * Get hardware information from the system
 */
export async function getHardwareInfo() {
  if (!isTauriEnvironment()) {
    // Web environment - collect basic browser info
    return {
      cpu_name: 'Web Browser',
      cpu_cores: navigator.hardwareConcurrency || 0,
      cpu_frequency: 0,
      total_memory: navigator.deviceMemory ? navigator.deviceMemory * 1024 : 0,
      total_swap: 0,
      os_name: navigator.platform,
      os_version: navigator.userAgent,
      gpu_info: await getWebGPUInfo(),
    };
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const hardwareInfo = await invoke('get_hardware_info');
    return hardwareInfo;
  } catch (error) {
    console.error('Failed to get hardware info:', error);
    throw error;
  }
}

/**
 * Get GPU information in web environment
 */
async function getWebGPUInfo() {
  const gpuInfo = [];
  
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        gpuInfo.push(renderer);
      }
    }
  } catch (e) {
    // Silent fail
  }

  if (gpuInfo.length === 0) {
    gpuInfo.push('Unknown GPU (Web)');
  }

  return gpuInfo;
}

/**
 * Send hardware information to backend
 * Now includes model_name
 */
export async function sendHardwareInfoToBackend(hardwareInfo, modelName, authToken = null) {
  // Transform data to match backend schema
  const payload = {
    model_name: modelName, // Add model name to payload
    gpu_info: Array.isArray(hardwareInfo.gpu_info) 
      ? hardwareInfo.gpu_info.join(', ') 
      : String(hardwareInfo.gpu_info || 'Unknown GPU'),
    cpu_name: String(hardwareInfo.cpu_name || 'Unknown CPU'),
    cpu_core: String(hardwareInfo.cpu_cores || 0),
    cpu_frequency: String(hardwareInfo.cpu_frequency || 0),
    total_memory: String(hardwareInfo.total_memory || 0),
    total_swap: String(hardwareInfo.total_swap || 0),
    ram: String(hardwareInfo.total_memory || 0), // Backend has separate 'ram' field
    os_name: String(hardwareInfo.os_name || 'Unknown OS'),
    os_version: String(hardwareInfo.os_version || 'Unknown'),
  };

  if (HARDWARE_API_CONFIG.testingMode) {
    console.log('=== HARDWARE INFO (Testing Mode) ===');
    console.log('Payload to be sent to', HARDWARE_API_CONFIG.endpoint);
    console.log(JSON.stringify(payload, null, 2));
    console.log('=====================================');
    // Simulate a successful API call in testing mode
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay
    return { success: true, message: 'Testing mode - logged to console' };
  }

  try {
    console.log('Sending hardware info to backend:', payload);
    const response = await api.post(HARDWARE_API_CONFIG.endpoint, payload);
    console.log('Hardware info sent successfully:', response.data);
    return { success: true, message: 'Hardware info sent successfully', data: response.data };
  } catch (error) {
    console.error('Failed to send hardware info:', error.response?.data || error.message);
    return { 
      success: false, 
      message: error.response?.data?.detail || error.message || 'Failed to send hardware info'
    };
  }
}

/**
 * Collect and send hardware info (convenience function)
 * Now includes model_name
 */
export async function collectAndSendHardwareInfo(modelName, authToken = null) {
  try {
    const hardwareInfo = await getHardwareInfo();
    const result = await sendHardwareInfoToBackend(hardwareInfo, modelName, authToken);
    return result;
  } catch (error) {
    console.error('Error in collectAndSendHardwareInfo:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Update the API configuration
 */
export function configureHardwareAPI(endpoint, testingMode = false) {
  HARDWARE_API_CONFIG.endpoint = endpoint;
  HARDWARE_API_CONFIG.testingMode = testingMode;
}

/**
 * Get current configuration
 */
export function getHardwareAPIConfig() {
  return { ...HARDWARE_API_CONFIG };
}