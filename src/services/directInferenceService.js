// src/services/directInferenceService.js
// Direct Petals inference service for testing (bypasses backend)

import { isTauriEnvironment } from '../utils/tauriHelpers';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/**
 * Run direct inference using Petals network (testing mode only)
 * This bypasses the backend and connects directly to Petals DHT
 * 
 * @param {string} modelId - The model ID to use
 * @param {string} prompt - User's prompt
 * @param {Array} conversationHistory - Array of previous messages for context
 * @param {Function} onToken - Callback for each token
 * @param {Function} onComplete - Callback when done
 * @param {Function} onError - Callback for errors
 * @param {Function} onLog - Callback for logs
 * @returns {Promise<Function>} Abort function to cancel the stream
 */
export async function runDirectInference(modelId, prompt, conversationHistory, onToken, onComplete, onError, onLog) {
  console.log('[DIRECT-INFERENCE] Starting direct inference stream...', { modelId, promptLength: prompt.length, historyLength: conversationHistory.length });

  let unlisten;
  let streamCompleted = false; // Flag to prevent multiple completions

  try {
    // Set up an event listener for logs/tokens from the Rust backend
    unlisten = await listen('petals_inference_log', (event) => {
      const logLine = event.payload;
      
      if (onLog) {
        onLog(logLine);
      }

      try {
        // Attempt to parse the line as JSON
        const data = JSON.parse(logLine);

        // Handle status updates and logs
        if (data.status) {
          console.log(`[DIRECT-INFERENCE-STATUS] ${data.status}: ${data.message || ''}`);
          if (onLog) {
            onLog(`[${data.status}] ${data.message || ''}`);
          }
          return; // Don't process status messages as tokens
        }

        // Handle errors
        if (data.error) {
          console.error('[DIRECT-INFERENCE-ERROR] Received error in stream:', data.error);
          if (onError && !streamCompleted) {
            onError(data.error);
            streamCompleted = true;
          }
          if (unlisten) unlisten();
          return;
        }

        // Handle token streaming FIRST (before checking done flag)
        if (data.token) {
          if (onToken) {
            onToken(data.token);
          }
        }

        // Handle stream completion signal AFTER processing any final token
        if (data.done === true) {
          console.log('[DIRECT-INFERENCE] Stream completion signal received.');
          if (onComplete && !streamCompleted) {
            onComplete();
            streamCompleted = true;
          }
          if (unlisten) unlisten();
        }

      } catch (e) {
        // If it's not JSON, it might be a raw log message
        console.warn('[DIRECT-INFERENCE] Non-JSON log:', logLine.substring(0, 100));
      }
    });

    // Invoke the Rust command to start the Python script
    await invoke('run_petals_inference', {
      modelName: modelId,
      prompt: prompt,
      conversationHistory: JSON.stringify(conversationHistory), // Pass history
    });

    // Return an abort function that the UI can call
    return () => {
      console.log('[DIRECT-INFERENCE] Aborting stream...');
      if (unlisten) {
        unlisten(); // Stop listening to events
      }
      // Call the new backend command to kill the Python process
      invoke('stop_petals_inference').catch(console.error);
    };

  } catch (error) {
    console.error('[DIRECT-INFERENCE] Failed to invoke Tauri command:', error);
    if (onError) {
      onError(error.message || 'Failed to start direct inference');
    }
    if (unlisten) {
      unlisten();
    }
    // Return a no-op function if setup fails
    return () => {};
  }
}

/**
 * Check if Petals environment is ready for direct inference
 * This calls the Rust backend to verify Petals installation
 */
export async function checkPetalsEnvironment() {
  if (!isTauriEnvironment()) {
    return {
      ready: false,
      needsSetup: false,
      platform: 'web',
      message: 'Direct inference only works in desktop app'
    };
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    
    // Detect platform
    const userAgent = navigator.userAgent;
    const isWindows = userAgent.includes('Windows');
    const isMac = userAgent.includes('Mac');
    const isLinux = userAgent.includes('Linux') && !userAgent.includes('Android');
    
    // Call Rust backend to check if Petals is actually installed
    const isPetalsReady = await invoke('check_petals_inference_ready');
    
    if (isPetalsReady) {
      return {
        ready: true,
        needsSetup: false,
        platform: isWindows ? 'windows' : (isMac ? 'macos' : 'linux'),
        message: 'Petals environment ready for inference'
      };
    } else {
      // Petals not installed - provide platform-specific guidance
      let setupMessage = '';
      
      if (isWindows) {
        setupMessage = 'WSL and Petals not installed. Click "Share GPU" to set up WSL environment, then try again.';
      } else if (isMac) {
        setupMessage = 'Petals not installed. Install with: pip install git+https://github.com/bigscience-workshop/petals';
      } else {
        setupMessage = 'Petals not installed. Install with: pip install git+https://github.com/bigscience-workshop/petals';
      }
      
      return {
        ready: false,
        needsSetup: true,
        platform: isWindows ? 'windows' : (isMac ? 'macos' : 'linux'),
        message: setupMessage
      };
    }
    
  } catch (error) {
    console.error('[PETALS-CHECK] Error checking environment:', error);
    return {
      ready: false,
      needsSetup: false,
      platform: 'unknown',
      message: `Environment check failed: ${error.message}`
    };
  }
}

