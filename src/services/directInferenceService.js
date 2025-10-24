// src/services/directInferenceService.js
// Direct Petals inference service for testing (bypasses backend)

import { isTauriEnvironment } from '../utils/tauriHelpers';

/**
 * Run direct inference using Petals network (testing mode only)
 * This bypasses the backend and connects directly to Petals DHT
 * 
 * @param {string} modelId - The model ID to use
 * @param {string} prompt - User's prompt
 * @param {Function} onToken - Callback for each token
 * @param {Function} onComplete - Callback when done
 * @param {Function} onError - Callback for errors
 * @returns {Function} Abort function (not implemented for direct mode)
 */
export async function runDirectInference(modelId, prompt, onToken, onComplete, onError, onLog) {
  if (!isTauriEnvironment()) {
    if (onError) {
      onError('Direct inference only works in desktop app');
    }
    return () => {};
  }

  try {
    console.log('[DIRECT-INFERENCE] Starting direct Petals inference...');
    console.log('[DIRECT-INFERENCE] Model:', modelId);
    console.log('[DIRECT-INFERENCE] Prompt:', prompt.substring(0, 50) + '...');

    if (onLog) {
      onLog('🚀 Starting inference with model: ' + modelId);
    }

    const { invoke } = await import('@tauri-apps/api/core');
    
    if (onLog) {
      onLog('📡 Connecting to Petals network...');
    }
    
    // Call the Tauri command (runs in WSL on Windows, native on macOS/Linux)
    let output;
    try {
      output = await invoke('run_petals_inference', {
        modelName: modelId,
        prompt: prompt,
      });
    } catch (invokeError) {
      console.error('[DIRECT-INFERENCE] Invoke error:', invokeError);
      
      // Split multiline errors for better display
      const errorStr = String(invokeError);
      const errorLines = errorStr.split('\n');
      
      if (onLog) {
        onLog('❌ [ERROR] Inference failed:');
        errorLines.forEach(line => {
          if (line.trim()) {
            onLog('  ' + line);
          }
        });
      }
      
      if (onError) {
        onError('Inference failed - check logs for details');
      }
      return () => {};
    }

    console.log('[DIRECT-INFERENCE] Received output from Python script');
    
    // Parse the JSON lines output
    const lines = output.trim().split('\n');
    let tokenCount = 0;
    let hasValidOutput = false;
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Check if line starts with logging prefixes (from Python script)
      if (line.includes('[INFO]') || line.includes('[WARNING]')) {
        if (onLog) {
          onLog('📝 ' + line);
        }
        continue;
      }
      
      if (line.includes('[ERROR]')) {
        if (onLog) {
          onLog('❌ ' + line);
        }
        continue;
      }
      
      try {
        const data = JSON.parse(line);
        hasValidOutput = true;
        
        // Check for status updates with trace info
        if (data.status) {
          const trace = data.trace ? ` [${data.trace}]` : '';
          const statusMessages = {
            'loading_tokenizer': `📥 Loading tokenizer...${trace}`,
            'tokenizer_loaded': `✅ Tokenizer loaded${trace}`,
            'connecting_to_network': `🌐 Connecting to Petals DHT network...${trace}`,
            'querying_dht': `🔍 Querying DHT for available blocks...${trace}`,
            'still_connecting': `⏳ ${data.message || 'Searching for blocks...'}${trace}`,
            'connected': `✅ Connected to Petals network!${trace}`
          };
          if (onLog) {
            const message = statusMessages[data.status] || `📝 ${data.status}${trace}`;
            onLog(message);
          }
          continue;
        }
        
        // Check for error
        if (data.error) {
          console.error('[DIRECT-INFERENCE] Error:', data.error);
          if (onLog) {
            onLog('❌ [ERROR] ' + data.error);
          }
          if (onError) {
            onError(data.error);
          }
          return () => {};
        }
        
        // Check for completion
        if (data.done) {
          console.log('[DIRECT-INFERENCE] Inference complete. Tokens:', tokenCount);
          if (onLog) {
            onLog(`✅ Complete! Generated ${tokenCount} tokens`);
          }
          if (onComplete) {
            onComplete();
          }
          break;
        }
        
        // Process token
        const token = data.token || data.text || '';
        if (token) {
          tokenCount++;
          if (onToken) {
            onToken(token);
          }
        }
        
      } catch (parseError) {
        // Not JSON - might be Python stderr/stdout
        if (line.includes('Traceback') || line.includes('Error') || line.includes('Exception')) {
          console.error('[DIRECT-INFERENCE] Python error:', line);
          if (onLog) {
            onLog('❌ [PYTHON ERROR] ' + line);
          }
        } else if (line.trim() && !line.includes('INFO') && !line.includes('WARNING')) {
          console.warn('[DIRECT-INFERENCE] Non-JSON output:', line);
          if (onLog) {
            onLog('📝 ' + line);
          }
        }
      }
    }
    
    // If no valid output was received, show the raw output for debugging
    if (!hasValidOutput && output.trim()) {
      console.error('[DIRECT-INFERENCE] No valid JSON output received. Raw output:', output);
      if (onLog) {
        onLog('❌ [ERROR] No valid response from Petals. Raw output:');
        const rawLines = output.split('\n').slice(0, 10); // First 10 lines only
        rawLines.forEach(l => l.trim() && onLog('  ' + l));
      }
      if (onError) {
        onError('Petals inference failed. Check logs for details.');
      }
      return () => {};
    }

    console.log('[DIRECT-INFERENCE] Successfully completed inference');

  } catch (error) {
    console.error('[DIRECT-INFERENCE] Error:', error);
    if (onLog) {
      onLog('❌ [ERROR] ' + (error.message || 'Direct inference failed'));
    }
    if (onError) {
      onError(error.message || 'Direct inference failed');
    }
  }

  // Return empty abort function (not implemented for direct mode)
  return () => {
    console.log('[DIRECT-INFERENCE] Abort not implemented for direct mode');
  };
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

