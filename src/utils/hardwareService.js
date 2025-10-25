// src/utils/hardwareService.js
// Service for collecting and sending hardware information
import { isTauriEnvironment } from './tauriHelpers';
import api from '../services/api';

// Configuration - Updated to only use the registration endpoint
const HARDWARE_API_CONFIG = {
  endpoint: '/llm_models/register/', // CORRECT Endpoint for registration 
  deregisterEndpoint: '/llm_models/deregister/', // Keep for deregister function
  testingMode: false, // Ensure this is false for real API calls
};

export async function getHardwareInfo() {
  if (!isTauriEnvironment()) {
    // Simplified web fallback
    let gpuInfo = ['Unknown GPU (Web)'];
    try {
        gpuInfo = await getWebGPUInfo();
    } catch (e) {
        console.warn("Could not get WebGL info:", e);
    }
    return {
      cpu_name: 'Web Browser',
      cpu_cores: navigator.hardwareConcurrency || 0,
      cpu_frequency: 0,
      total_memory: navigator.deviceMemory || 0, // GB
      total_swap: 0, // Not available in browser
      os_name: navigator.platform || 'Unknown OS (Web)',
      os_version: navigator.userAgent || 'Unknown User Agent',
      gpu_info: gpuInfo,
    };
  }
  // Tauri environment
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const hardwareInfo = await invoke('get_hardware_info');
    // Ensure GPU info is always an array
    if (typeof hardwareInfo.gpu_info === 'string') {
        hardwareInfo.gpu_info = [hardwareInfo.gpu_info];
    } else if (!Array.isArray(hardwareInfo.gpu_info)) {
        hardwareInfo.gpu_info = ['Invalid GPU data received'];
    }
    return hardwareInfo;
  } catch (error) {
    console.error('Failed to get hardware info via Tauri:', error);
    // Provide a fallback structure on Tauri error
    return {
      cpu_name: 'Unknown CPU (Tauri Error)',
      cpu_cores: 0,
      cpu_frequency: 0,
      total_memory: 0,
      total_swap: 0,
      os_name: 'Unknown OS (Tauri Error)',
      os_version: 'N/A',
      gpu_info: ['GPU detection failed (Tauri Error)'],
    };
  }
}

// Corrected WebGL GPU Info Fetching (No changes needed here)
async function getWebGPUInfo() {
  const gpuInfo = [];
  try {
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(1, 1)
      : document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        if (renderer) gpuInfo.push(`${renderer} (Vendor: ${vendor || 'Unknown'})`);
        else if (vendor) gpuInfo.push(`Unknown Renderer (Vendor: ${vendor})`);
      } else {
        const rendererBasic = gl.getParameter(gl.RENDERER);
        if (rendererBasic) gpuInfo.push(rendererBasic);
      }
    }
  } catch (e) {
    console.warn("WebGL context or parameter fetching failed:", e);
  }

  if (navigator.gpu) {
    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter?.name && !gpuInfo.some(info => info.includes(adapter.name))) {
             gpuInfo.push(`WebGPU Adapter: ${adapter.name}`);
        } else if (adapter) {
             gpuInfo.push('WebGPU Adapter available (name unknown)');
        }
    } catch (e) {
      console.warn("WebGPU adapter request failed:", e);
    }
  }

  if (gpuInfo.length === 0) {
    gpuInfo.push('No GPU information detectable via WebGL/WebGPU');
  }
  return gpuInfo;
}


/**
 * Collect and send hardware info for REGISTRATION directly to the correct endpoint.
 */
export async function collectAndSendHardwareInfo(modelName) { // modelName is required
  if (!modelName) {
      console.error("collectAndSendHardwareInfo: modelName is required.");
      return { success: false, message: 'Model name must be specified.' };
  }
  try {
    const userId = localStorage.getItem('userId');
    if (!userId) {
       console.error("collectAndSendHardwareInfo: userId missing from localStorage.");
       return { success: false, message: 'User session error. Please log out and back in.' };
    }

    const parsedUserId = parseInt(userId, 10);
    if (isNaN(parsedUserId)) {
        const errorMsg = `Internal Error: Invalid User ID format detected (${userId}). Cannot send hardware info.`;
        console.error('collectAndSendHardwareInfo:', errorMsg);
        return { success: false, message: errorMsg };
    }

    console.log("Collecting hardware info...");
    const hardwareInfo = await getHardwareInfo();
    console.log("Hardware info collected:", hardwareInfo);

    // --- Prepare the CORRECT payload for /llm_models/register/ ---
    const payload = {
      user: parsedUserId, // Send user ID
      model_name: modelName, // Send selected model name
      // Include all required hardware fields
      gpu_info: Array.isArray(hardwareInfo.gpu_info) ? hardwareInfo.gpu_info.join('; ') : String(hardwareInfo.gpu_info || 'Unknown GPU'),
      cpu_name: String(hardwareInfo.cpu_name || 'Unknown CPU'),
      cpu_core: Number.isInteger(hardwareInfo.cpu_cores) ? hardwareInfo.cpu_cores : 0,
      cpu_frequency: Number.isFinite(hardwareInfo.cpu_frequency) ? Math.round(hardwareInfo.cpu_frequency) : 0,
      total_memory: Number.isFinite(hardwareInfo.total_memory) ? hardwareInfo.total_memory : 0,
      total_swap: Number.isFinite(hardwareInfo.total_swap) ? hardwareInfo.total_swap : 0,
      ram: Number.isFinite(hardwareInfo.total_memory) ? hardwareInfo.total_memory : 0, // 'ram' seems redundant but include based on error
      os_name: String(hardwareInfo.os_name || 'Unknown OS'),
      os_version: String(hardwareInfo.os_version || 'Unknown'),
    };
    // --- End Payload Preparation ---


    if (HARDWARE_API_CONFIG.testingMode) {
      console.log('=== HARDWARE INFO (Testing Mode - Registration) ===');
      console.log('Endpoint:', HARDWARE_API_CONFIG.endpoint);
      console.log('Payload:', JSON.stringify(payload, null, 2));
      console.log('===================================================');
      await new Promise(resolve => setTimeout(resolve, 500));
      const success = Math.random() > 0.1;
      return {
          success: success,
          message: success ? 'Testing mode - logged (Simulated Success)' : 'Testing mode - logged (Simulated Failure)',
          data: success ? { node_token: `test-token-${Date.now()}` } : null
       };
    }

    // --- Send to the CORRECT registration endpoint ---
    try {
      console.log(`Sending hardware info for registration to ${HARDWARE_API_CONFIG.endpoint}:`, payload);
      const response = await api.post(HARDWARE_API_CONFIG.endpoint, payload); // Use the configured registration endpoint
      console.log('Hardware info registered successfully, response:', response.data);

      if (!response.data?.node_token) {
          console.warn('Backend did not return a node_token on registration.');
      }
      return { success: true, message: 'Hardware info registered successfully.', data: response.data }; // Return full response data
    } catch (error) {
      console.error('Failed to send hardware info for registration:', error);
      let errorMessage = 'Failed to register hardware.';
      if (error.response) {
          const backendError = error.response.data;
          // Log the raw backend error for more detailed debugging
          console.error("Backend Error Response:", backendError);
          if (typeof backendError === 'string') { errorMessage = backendError; }
          else if (backendError && typeof backendError === 'object') {
             // Try to format the error object more readably
             errorMessage = Object.entries(backendError)
                .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
                .join('; ');
             // Fallback if formatting fails
             if (!errorMessage) {
                 errorMessage = backendError.detail || backendError.error || backendError.message || JSON.stringify(backendError);
             }
          }
          else { errorMessage = `Server responded with status ${error.response.status}.`; }
          if (error.response.status === 401 || error.response.status === 403) { errorMessage = 'Authentication failed. Please ensure you are logged in.'; }
      } else if (error.request) { errorMessage = 'Could not connect to the server. Please check your network connection.'; }
      else { errorMessage = `An unexpected error occurred: ${error.message}`; }
      return { success: false, message: errorMessage };
    }
    // --- End Send Logic ---

  } catch (error) {
    console.error('Error in collectAndSendHardwareInfo:', error);
    return { success: false, message: error.message || 'An unexpected error occurred while collecting or sending hardware info.' };
  }
}


/**
 * Send request to DE-REGISTER a GPU node from the backend
 */
export async function deregisterGpuNode(nodeToken) {
  if (!nodeToken) {
    console.error('deregisterGpuNode: nodeToken is required.');
    return { success: false, message: 'Node token is missing. Cannot de-register.' };
  }

  if (HARDWARE_API_CONFIG.testingMode) {
    console.log('=== HARDWARE INFO (Testing Mode - De-registration) ===');
    console.log('Endpoint:', HARDWARE_API_CONFIG.deregisterEndpoint);
    console.log('Node Token:', nodeToken);
    console.log('======================================================');
    await new Promise(resolve => setTimeout(resolve, 300));
    // Simulate potential success/failure in testing mode
    const success = Math.random() > 0.1; // 90% chance of success
    return {
        success: success,
        message: success ? 'Testing mode - Node de-registered (Simulated Success)' : 'Testing mode - De-registration failed (Simulated Failure)'
     };
  }

  try {
    console.log(`Sending de-registration request to ${HARDWARE_API_CONFIG.deregisterEndpoint} for token: ${nodeToken}`);
    // API docs indicate node_token is required[cite: 936], likely in the body for DELETE
    const response = await api.delete(HARDWARE_API_CONFIG.deregisterEndpoint, {
        data: { node_token: nodeToken } // Sending token in request body
    });
    console.log('De-registration successful:', response.data);
    return { success: true, message: 'GPU node successfully de-registered.' };
  } catch (error) {
    console.error('Failed to de-register GPU node:', error);
    let errorMessage = 'Failed to de-register GPU node.';
    
    if (error.response) {
      const status = error.response.status;
      const backendError = error.response.data;
      
      // Check for the specific backend bug (500 error with ValueError)
      if (status === 500 && (
        typeof backendError === 'string' && backendError.includes('needs to have a value for field')
      )) {
        errorMessage = 'Backend error (known bug). Node will auto-expire from network.';
        console.warn('[DEREGISTER] Hit known backend bug - node.delete() before accessing models_served');
      } else if (typeof backendError === 'string') {
        errorMessage = backendError;
      } else if (backendError?.error === "node_token is required for de-registration.") {
        errorMessage = "Node token was missing or invalid.";
      } else if (backendError && typeof backendError === 'object') {
        errorMessage = backendError.detail || backendError.error || backendError.message || JSON.stringify(backendError);
      } else {
        errorMessage = `Server responded with status ${status}.`;
      }
      
      if (status === 401 || status === 403) {
        errorMessage = 'Authentication failed. Please ensure you are logged in.';
      } else if (status === 404) {
        errorMessage = 'Node not found. It may have already been de-registered.';
      }
    } else if (error.request) {
      errorMessage = 'Could not connect to the server.';
    } else {
      errorMessage = `An unexpected error occurred: ${error.message}`;
    }
    
    return { success: false, message: errorMessage };
  }
}

// Configure registration, de-registration endpoints, and testing mode
export function configureHardwareAPI(regEndpoint, deregEndpoint, testingMode = false) {
  if (regEndpoint) {
    HARDWARE_API_CONFIG.endpoint = regEndpoint;
  }
  if (deregEndpoint) {
    HARDWARE_API_CONFIG.deregisterEndpoint = deregEndpoint;
  }
  HARDWARE_API_CONFIG.testingMode = testingMode;
  console.log("Hardware API Config updated:", HARDWARE_API_CONFIG);
}

// Get the current config
export function getHardwareAPIConfig() {
  return { ...HARDWARE_API_CONFIG };
}

// Remove the old sendHardwareInfoToBackend and registerNodeForModel functions as they are now consolidated into collectAndSendHardwareInfo