// src/utils/hardwareService.js
import { isTauriEnvironment } from './tauriHelpers';
import api from '../services/api'; // Ensure this includes CSRF handling and withCredentials: true

// Configuration
const HARDWARE_API_CONFIG = {
  // Endpoint for creating the initial hardware record
  createGpuEndpoint: '/gpu/list/',
  // Endpoint for registering the node *for a specific model* and getting the node_token
  registerNodeEndpoint: '/llm_models/register/',
  // Endpoint for de-registration (uses node_token)
  deregisterNodeEndpoint: '/llm_models/deregister/',
  testingMode: false,
};

// getHardwareInfo and getWebGPUInfo functions remain the same...
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
    if (typeof hardwareInfo.gpu_info === 'string') {
        hardwareInfo.gpu_info = [hardwareInfo.gpu_info];
    } else if (!Array.isArray(hardwareInfo.gpu_info)) {
        hardwareInfo.gpu_info = ['Invalid GPU data received'];
    }
    return hardwareInfo;
  } catch (error) {
    console.error('Failed to get hardware info via Tauri:', error);
    return {
      cpu_name: 'Unknown CPU (Tauri Error)', cpu_cores: 0, cpu_frequency: 0,
      total_memory: 0, total_swap: 0, os_name: 'Unknown OS (Tauri Error)',
      os_version: 'N/A', gpu_info: ['GPU detection failed (Tauri Error)'],
    };
  }
}

async function getWebGPUInfo() {
  const gpuInfo = [];
  try {
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
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
  } catch (e) { console.warn("WebGL context failed:", e); }
  if (navigator.gpu) {
    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter?.name && !gpuInfo.some(info => info.includes(adapter.name))) {
             gpuInfo.push(`WebGPU Adapter: ${adapter.name}`);
        } else if (adapter) { gpuInfo.push('WebGPU Adapter available'); }
    } catch (e) { console.warn("WebGPU request failed:", e); }
  }
  if (gpuInfo.length === 0) { gpuInfo.push('No GPU info via WebGL/WebGPU'); }
  return gpuInfo;
}


/**
 * STEP 1: Create the GPU hardware record in the backend.
 * POSTs hardware details to /gpu/list/
 * Expects a response containing the created record's 'id'.
 */
async function createGpuRecord(hardwareInfo, userId) {
  const parsedUserId = parseInt(userId, 10);
  if (isNaN(parsedUserId)) {
    return { success: false, message: `Invalid User ID (${userId})` };
  }

  const payload = {
    user: parsedUserId,
    gpu_info: Array.isArray(hardwareInfo.gpu_info) ? hardwareInfo.gpu_info.join('; ') : String(hardwareInfo.gpu_info || 'Unknown GPU'),
    cpu_name: String(hardwareInfo.cpu_name || 'Unknown CPU'),
    cpu_core: String(Number.isInteger(hardwareInfo.cpu_cores) ? hardwareInfo.cpu_cores : 0),
    cpu_frequency: String(Number.isFinite(hardwareInfo.cpu_frequency) ? Math.round(hardwareInfo.cpu_frequency) : 0),
    total_memory: String(Number.isFinite(hardwareInfo.total_memory) ? hardwareInfo.total_memory : 0),
    total_swap: String(Number.isFinite(hardwareInfo.total_swap) ? hardwareInfo.total_swap : 0),
    ram: String(Number.isFinite(hardwareInfo.total_memory) ? hardwareInfo.total_memory : 0),
    os_name: String(hardwareInfo.os_name || 'Unknown OS'),
    os_version: String(hardwareInfo.os_version || 'Unknown'),
  };

  if (HARDWARE_API_CONFIG.testingMode) { /* ... keep testing mode logic ... */ }

  try {
    console.log(`[Step 1] Sending hardware info to ${HARDWARE_API_CONFIG.createGpuEndpoint}:`, payload);
    const response = await api.post(HARDWARE_API_CONFIG.createGpuEndpoint, payload);
    console.log('[Step 1] Hardware record created response:', response.data);

    if (response.data?.id) {
      return { success: true, message: 'Hardware record created.', data: response.data };
    } else {
      // If backend returns 2xx but no ID, treat as failure for this step
      return { success: false, message: 'Hardware record created, but backend did not return an ID.', data: response.data };
    }
  } catch (error) {
    console.error('[Step 1] Failed to create hardware record:', error);
    let errorMessage = 'Failed to create hardware record.';
    // ... (keep detailed error message parsing from previous response) ...
    if (error.response) {
        const backendError = error.response.data;
        if (typeof backendError === 'string') { errorMessage = backendError; }
        else if (backendError && typeof backendError === 'object') { errorMessage = backendError.detail || backendError.error || backendError.message || JSON.stringify(backendError); }
        else { errorMessage = `Server responded with status ${error.response.status}.`; }
        if (error.response.status === 401) { errorMessage = 'Authentication failed. Please check credentials.'; }
        else if (error.response.status === 403) { errorMessage = 'Permission denied for creating hardware record. Check CSRF/CORS or user permissions.'; }
    } else if (error.request) { errorMessage = 'Could not connect to server.'; }
    else { errorMessage = `Unexpected error: ${error.message}`; }
    return { success: false, message: errorMessage };
  }
}

/**
 * STEP 2: Register the GPU node for a specific model.
 * POSTs to /llm_models/register/ using the ID from Step 1.
 * Expects a response containing the 'node_token'.
 *
 * !!! IMPORTANT: The exact payload structure MUST be confirmed with the backend developer !!!
 * Assuming it needs gpu record 'id', 'model_name', and potentially 'user' ID again.
 */
async function registerNodeForModel(gpuRecordId, modelName, userId) {
  const parsedUserId = parseInt(userId, 10); // Ensure userId is passed if needed
  if (isNaN(parsedUserId)) {
      return { success: false, message: `Invalid User ID (${userId})` };
  }

  // *** ASSUMED PAYLOAD - VERIFY WITH BACKEND ***
  const payload = {
    // Assuming backend needs the ID of the GPU record created in step 1
    // The key name 'gpu_id', 'gpu', or 'hardware_id' needs confirmation.
    gpu_record_id: gpuRecordId, // Or whatever the backend key is
    model_name: modelName,
    user: parsedUserId, // Send user ID again if backend requires it here too
  };

  if (HARDWARE_API_CONFIG.testingMode) { /* ... keep testing mode logic ... */ }

  try {
    console.log(`[Step 2] Registering node for model to ${HARDWARE_API_CONFIG.registerNodeEndpoint}:`, payload);
    const response = await api.post(HARDWARE_API_CONFIG.registerNodeEndpoint, payload);
    console.log('[Step 2] Node registration response:', response.data);

    // This is where we expect the node_token
    if (response.data?.node_token) {
      return { success: true, message: 'Node registered successfully.', data: response.data };
    } else {
      console.warn('[Step 2] Node registration succeeded, but backend did not return node_token.');
      return { success: false, message: 'Node registration succeeded, but no node_token received.', data: response.data };
    }
  } catch (error) {
    console.error('[Step 2] Failed to register node:', error);
    let errorMessage = 'Failed to register node for model.';
    // ... (keep detailed error message parsing from previous response) ...
     if (error.response) {
        const backendError = error.response.data;
        if (typeof backendError === 'string') { errorMessage = backendError; }
        else if (backendError && typeof backendError === 'object') { errorMessage = backendError.detail || backendError.error || backendError.message || JSON.stringify(backendError); }
        else { errorMessage = `Server responded with status ${error.response.status}.`; }
        if (error.response.status === 401) { errorMessage = 'Authentication failed. Please check credentials.'; }
        else if (error.response.status === 403) { errorMessage = 'Permission denied for node registration. Check CSRF/CORS or user permissions.'; }
    } else if (error.request) { errorMessage = 'Could not connect to server.'; }
    else { errorMessage = `Unexpected error: ${error.message}`; }
    return { success: false, message: errorMessage };
  }
}

/**
 * Orchestrates the two-step registration process.
 */
export async function collectAndSendHardwareInfo(modelName) {
  if (!modelName) {
    return { success: false, message: 'Model name must be specified.' };
  }
  const userId = localStorage.getItem('userId');
  if (!userId) {
    return { success: false, message: 'User session error. Please log out and back in.' };
  }

  try {
    // --- Step 1: Create GPU Record ---
    console.log("[Orchestrator] Starting Step 1: Collect hardware info and create record...");
    const hardwareInfo = await getHardwareInfo();
    console.log("[Orchestrator] Hardware info collected:", hardwareInfo);
    const createResult = await createGpuRecord(hardwareInfo, userId);

    if (!createResult.success || !createResult.data?.id) {
      console.error("[Orchestrator] Step 1 failed or missing ID:", createResult.message);
      // Return the error from step 1
      return { success: false, message: `Step 1 Failed: ${createResult.message}`, data: createResult.data };
    }

    const gpuRecordId = createResult.data.id;
    console.log(`[Orchestrator] Step 1 successful. GPU Record ID: ${gpuRecordId}`);

    // --- Step 2: Register Node for Model ---
    console.log(`[Orchestrator] Starting Step 2: Register node for model ${modelName}...`);
    const registerResult = await registerNodeForModel(gpuRecordId, modelName, userId);

    // The final result includes the node_token (if successful)
    if (!registerResult.success) {
        console.error("[Orchestrator] Step 2 failed:", registerResult.message);
        return { success: false, message: `Step 2 Failed: ${registerResult.message}`, data: registerResult.data };
    }

    console.log("[Orchestrator] Step 2 successful. Node Token received.");
    // Return the successful result from step 2, which should contain the node_token
    return registerResult;

  } catch (error) {
    // Catch any unexpected errors during orchestration
    console.error('[Orchestrator] Error during registration process:', error);
    return { success: false, message: error.message || 'An unexpected error occurred during the registration process.' };
  }
}

// deregisterGpuNode function remains the same (uses node_token)
export async function deregisterGpuNode(nodeToken) {
  if (!nodeToken) {
    return { success: false, message: 'Node token is missing. Cannot de-register.' };
  }
  if (HARDWARE_API_CONFIG.testingMode) { /* ... keep testing mode logic ... */ }

  try {
    console.log(`Sending de-registration request to ${HARDWARE_API_CONFIG.deregisterNodeEndpoint} for token: ${nodeToken}`);
    const response = await api.delete(HARDWARE_API_CONFIG.deregisterNodeEndpoint, {
        data: { node_token: nodeToken }
    });
    console.log('De-registration successful:', response.data);
    return { success: true, message: 'GPU node successfully de-registered.' };
  } catch (error) {
    console.error('Failed to de-register GPU node:', error);
    let errorMessage = 'Failed to de-register GPU node.';
    // ... (keep detailed error message parsing) ...
     if (error.response) {
        const backendError = error.response.data;
        if (typeof backendError === 'string') { errorMessage = backendError; }
        else if (backendError?.error === "node_token is required for de-registration.") { errorMessage = "Node token was missing or invalid for de-registration."; }
        else if (backendError && typeof backendError === 'object') { errorMessage = backendError.detail || backendError.error || backendError.message || JSON.stringify(backendError); }
        else { errorMessage = `Server responded with status ${error.response.status}.`; }
        if (error.response.status === 401) { errorMessage = 'Authentication failed.'; }
        else if (error.response.status === 403) { errorMessage = 'Permission denied for de-registration.'; }
    } else if (error.request) { errorMessage = 'Could not connect to server.'; }
    else { errorMessage = `Unexpected error: ${error.message}`; }
    return { success: false, message: errorMessage };
  }
}

// configureHardwareAPI and getHardwareAPIConfig remain the same
export function configureHardwareAPI(createEndpoint, registerEndpoint, deregEndpoint, testingMode = false) {
  if (createEndpoint) HARDWARE_API_CONFIG.createGpuEndpoint = createEndpoint;
  if (registerEndpoint) HARDWARE_API_CONFIG.registerNodeEndpoint = registerEndpoint;
  if (deregEndpoint) HARDWARE_API_CONFIG.deregisterNodeEndpoint = deregEndpoint;
  HARDWARE_API_CONFIG.testingMode = testingMode;
  console.log("Hardware API Config updated:", HARDWARE_API_CONFIG);
}

export function getHardwareAPIConfig() {
  return { ...HARDWARE_API_CONFIG };
}