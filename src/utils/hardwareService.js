// Service for collecting and sending hardware information
import { isTauriEnvironment } from './tauriHelpers';
import api from '../services/api';

// Configuration
const HARDWARE_API_CONFIG = {
  endpoint: '/gpu/list/',
  testingMode: false, // Ensure this is false for real API calls
};

// ... getHardwareInfo() and getWebGPUInfo() remain unchanged ...
export async function getHardwareInfo() {
  if (!isTauriEnvironment()) {
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
  } catch (e) { /* Silent fail */ }
  if (gpuInfo.length === 0) { gpuInfo.push('Unknown GPU (Web)'); }
  return gpuInfo;
}


/**
 * Send hardware information to backend
 * Assumes userId is valid and provided.
 */
export async function sendHardwareInfoToBackend(hardwareInfo, modelName, userId) {

  // --- Removed the early return check for userId ---
  // AuthContext should prevent this function being called without a valid user/userId

  const parsedUserId = parseInt(userId, 10);
  if (isNaN(parsedUserId)) {
      // This should ideally not happen if AuthContext is working correctly
      const errorMsg = `Internal Error: Invalid User ID format detected (${userId}).`;
      console.error('sendHardwareInfoToBackend:', errorMsg);
      return { success: false, message: errorMsg };
  }

  // Transform data to match backend schema
  const payload = {
    user: parsedUserId, // Use parsed integer ID
    model_name: modelName,
    gpu_info: Array.isArray(hardwareInfo.gpu_info)
      ? hardwareInfo.gpu_info.join(', ')
      : String(hardwareInfo.gpu_info || 'Unknown GPU'),
    cpu_name: String(hardwareInfo.cpu_name || 'Unknown CPU'),
    cpu_core: String(hardwareInfo.cpu_cores || 0),
    cpu_frequency: String(hardwareInfo.cpu_frequency || 0),
    total_memory: String(hardwareInfo.total_memory || 0),
    total_swap: String(hardwareInfo.total_swap || 0),
    ram: String(hardwareInfo.total_memory || 0),
    os_name: String(hardwareInfo.os_name || 'Unknown OS'),
    os_version: String(hardwareInfo.os_version || 'Unknown'),
  };

  if (HARDWARE_API_CONFIG.testingMode) {
    console.log('=== HARDWARE INFO (Testing Mode) ===');
    console.log('Payload:', JSON.stringify(payload, null, 2));
    console.log('=====================================');
    await new Promise(resolve => setTimeout(resolve, 500));
    return { success: true, message: 'Testing mode - logged to console' };
  }

  try {
    console.log('Sending hardware info to backend:', payload);
    const response = await api.post(HARDWARE_API_CONFIG.endpoint, payload);
    console.log('Hardware info sent successfully:', response.data);
    return { success: true, message: 'Hardware info sent successfully', data: response.data };
  } catch (error) {
    console.error('Failed to send hardware info:', error.response?.data || error.message);
    const backendError = error.response?.data?.detail || error.response?.data?.error || (typeof error.response?.data === 'string' ? error.response.data : null);
    // Provide a clearer message if it's likely an auth issue triggered deeper
     if (error.response?.status === 401 || error.response?.status === 403) {
         return { success: false, message: 'Authentication failed. Please log out and back in.' };
     }
    return {
      success: false,
      message: backendError || error.message || 'Failed to send hardware info'
    };
  }
}

/**
 * Collect and send hardware info (convenience function)
 * Retrieves userId from localStorage.
 */
export async function collectAndSendHardwareInfo(modelName) {
  try {
    const userId = localStorage.getItem('userId');
    // We now assume userId exists because the user is logged in to reach this point.
    // If it's somehow missing, sendHardwareInfoToBackend will handle the error.
    if (!userId) {
       // This is an unexpected state if the user is logged in.
       console.error("collectAndSendHardwareInfo: userId unexpectedly missing from localStorage for a logged-in user.");
       return {
           success: false,
           message: 'User session error. Please log out and back in.'
       };
    }

    const hardwareInfo = await getHardwareInfo();
    const result = await sendHardwareInfoToBackend(hardwareInfo, modelName, userId);
    return result;
  } catch (error) {
    console.error('Error in collectAndSendHardwareInfo:', error);
    return { success: false, message: error.message || 'An unexpected error occurred.' };
  }
}

// ... configureHardwareAPI and getHardwareAPIConfig remain unchanged ...
export function configureHardwareAPI(endpoint, testingMode = false) {
  HARDWARE_API_CONFIG.endpoint = endpoint;
  HARDWARE_API_CONFIG.testingMode = testingMode;
}
export function getHardwareAPIConfig() {
  return { ...HARDWARE_API_CONFIG };
}