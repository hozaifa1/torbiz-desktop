// Service for collecting and sending hardware information
import { isTauriEnvironment } from './tauriHelpers';

// Configuration - Update this when backend is ready
const HARDWARE_API_CONFIG = {
  // Set this to your backend API endpoint when ready
  endpoint: 'http://torbiz-backend.vercel.app/gpu/list/',
  
  // For testing, set this to true to log to console instead of sending
  testingMode: false,
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
      total_memory: navigator.deviceMemory ? navigator.deviceMemory * 1024 : 0, // Convert GB to MB
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
    // Try WebGL
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
 */
export async function sendHardwareInfoToBackend(hardwareInfo, authToken = null) {
  if (!isTauriEnvironment()) {
    // In web environment, use fetch
    if (HARDWARE_API_CONFIG.testingMode) {
      console.log('=== HARDWARE INFO (Testing Mode) ===');
      console.log(JSON.stringify(hardwareInfo, null, 2));
      console.log('=====================================');
      return { success: true, message: 'Testing mode - logged to console' };
    }

    try {
      const response = await fetch(HARDWARE_API_CONFIG.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken && { 'Authorization': `Token ${authToken}` }),
        },
        body: JSON.stringify(hardwareInfo),
      });

      if (response.ok) {
        return { success: true, message: 'Hardware info sent successfully' };
      } else {
        throw new Error(`Server returned status: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to send hardware info:', error);
      throw error;
    }
  }

  // Tauri environment
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    
    const endpoint = HARDWARE_API_CONFIG.testingMode 
      ? 'http://localhost:9999/test' // Fake endpoint for testing
      : HARDWARE_API_CONFIG.endpoint;

    const result = await invoke('send_hardware_info_to_backend', {
      hardwareInfo,
      backendUrl: endpoint,
      authToken,
    });

    return { success: true, message: result };
  } catch (error) {
    console.error('Failed to send hardware info:', error);
    throw error;
  }
}

/**
 * Collect and send hardware info (convenience function)
 */
export async function collectAndSendHardwareInfo(authToken = null) {
  try {
    const hardwareInfo = await getHardwareInfo();
    const result = await sendHardwareInfoToBackend(hardwareInfo, authToken);
    return result;
  } catch (error) {
    console.error('Error in collectAndSendHardwareInfo:', error);
    throw error;
  }
}

/**
 * Update the API configuration
 * Call this function when you want to switch from testing mode to production
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