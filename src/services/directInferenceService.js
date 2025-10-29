// src/services/directInferenceService.js
// Direct Petals inference service for testing (bypasses backend)

import { isTauriEnvironment } from '../utils/tauriHelpers';

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
 * @returns {Function} Abort function (not implemented for direct mode)
 */
export async function runDirectInference(modelId, prompt, conversationHistory = [], onToken, onComplete, onError, onLog) {
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

    const { invoke } = await import('@tauri-apps/api/core');
    const { listen } = await import('@tauri-apps/api/event');

    // Set up real-time log listener
    const unlistenLog = await listen('petals_inference_log', (event) => {
      const line = event.payload;
      
      // Check for Python logging prefixes
      if (line.includes('[INFO]') || line.includes('[WARNING]')) {
        if (onLog) onLog('📝 ' + line);
        return;
      }
      
      if (line.includes('[ERROR]')) {
        if (onLog) onLog('❌ ' + line);
        return;
      }
      
      // Try parsing as JSON
      try {
        const data = JSON.parse(line);
        
        // Handle status updates
        if (data.status) {
          const statusMessages = {
            'loading_tokenizer': '📥 Loading tokenizer...',
            'tokenizer_loaded': '✅ Tokenizer loaded',
            'connecting_to_network': '🌐 Connecting to Petals DHT network...',
            'querying_dht': '🔍 Querying DHT for available blocks...',
            'still_connecting': `⏳ ${data.message || 'Searching for blocks...'}`,
            'connected': '✅ Connected to Petals network!'
          };
          if (onLog && statusMessages[data.status]) {
            onLog(statusMessages[data.status]);
          }
          return;
        }
        
        // Handle errors
        if (data.error) {
          if (onLog) onLog('❌ [ERROR] ' + data.error);
          if (onError) onError(data.error);
          unlistenLog();
          return;
        }
        
        // Handle completion
        if (data.done) {
          if (onLog) onLog('✅ Complete!');
          if (onComplete) onComplete();
          unlistenLog();
          return;
        }
        
        // Handle token streaming
        const token = data.token || data.text || '';
        if (token && onToken) {
          onToken(token);
        }
      } catch (parseError) {
        // Not JSON - show raw line if it looks important
        if (line.includes('Traceback') || line.includes('Error') || line.includes('Exception')) {
          if (onLog) onLog('❌ [PYTHON ERROR] ' + line);
        }
      }
    });

    // Start inference (returns immediately now)
    try {
      // Build prompt with conversation context
      let systemPrompt = '';
      
      if (conversationHistory.length > 0) {
        // Include conversation history for context (last 6 messages = 3 exchanges)
        systemPrompt = '### System:\nYou are a helpful AI assistant.\n\n';
        
        for (const msg of conversationHistory.slice(-6)) {
          if (msg.role === 'user') {
            systemPrompt += `### User:\n${msg.content}\n\n`;
          } else if (msg.role === 'assistant') {
            systemPrompt += `### Assistant:\n${msg.content}\n\n`;
          }
        }
        
        // Add current prompt
        systemPrompt += `### User:\n${prompt}\n\n### Assistant:\n`;
      } else {
        // Simple format for first message
        systemPrompt = `### System:
You are a helpful AI assistant.

### User:
${prompt}

### Assistant:
`;
      }
      
      await invoke('run_petals_inference', {
        modelName: modelId,
        prompt: systemPrompt,
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
      unlistenLog();
      return () => {};
    }

    // Return cleanup function
    return () => {
      unlistenLog();
    };

  } catch (error) {
    console.error('[DIRECT-INFERENCE] Error:', error);
    if (onLog) {
      onLog('❌ [ERROR] ' + (error.message || 'Direct inference failed'));
    }
    if (onError) {
      onError(error.message || 'Direct inference failed');
    }
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

