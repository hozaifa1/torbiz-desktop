// src/services/localInferenceService.js
// Local inference service using HuggingFace transformers directly (bypasses Petals DHT)

import { isTauriEnvironment } from '../utils/tauriHelpers';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/**
 * Run local inference using HuggingFace transformers directly
 * This bypasses Petals DHT and uses a local model
 * 
 * @param {string} modelId - The model ID (default: TinyLlama/TinyLlama-1.1B-Chat-v1.0)
 * @param {string} prompt - User's prompt
 * @param {Array} conversationHistory - Array of previous messages for context
 * @param {Function} onToken - Callback for each token
 * @param {Function} onComplete - Callback when done
 * @param {Function} onError - Callback for errors
 * @param {Function} onLog - Callback for logs
 * @returns {Function} Abort function
 */
export async function runLocalInference(modelId, prompt, conversationHistory = [], onToken, onComplete, onError, onLog) {
  if (!isTauriEnvironment()) {
    if (onError) {
      onError('Local inference only works in desktop app');
    }
    return () => {};
  }

  try {
    console.log('[LOCAL-INFERENCE] Starting local inference...');
    console.log('[LOCAL-INFERENCE] Model:', modelId);
    console.log('[LOCAL-INFERENCE] Prompt:', prompt.substring(0, 50) + '...');
    console.log('[LOCAL-INFERENCE] History entries:', conversationHistory.length);

    // Set up real-time log listener
    const unlistenLog = await listen('local_inference_log', (event) => {
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
            'loading_model': '📥 Loading model...',
            'loading_tokenizer': '📥 Loading tokenizer...',
            'tokenizer_loaded': '✅ Tokenizer loaded',
            'loading_weights': '⏳ Loading model weights (first time may take a while)...',
            'model_loaded': '✅ Model loaded - ' + (data.message || ''),
            'generating': '🤖 Generating response...'
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
        
        // Handle token streaming FIRST (before checking done flag)
        const token = data.token || data.text || '';
        if (token && onToken) {
          onToken(token);
        }
        
        // Handle completion AFTER processing any final token
        if (data.done) {
          const reason = data.reason || 'unknown';
          if (onLog) onLog(`✅ Complete! (stopped by: ${reason})`);
          
          // Add delay to ensure all React state updates have processed
          setTimeout(() => {
            if (onComplete) onComplete();
            unlistenLog();
          }, 100);
          return;
        }
      } catch (parseError) {
        // Not JSON - show raw line if it looks important
        if (line.includes('Traceback') || line.includes('Error') || line.includes('Exception')) {
          if (onLog) onLog('❌ [PYTHON ERROR] ' + line);
        }
      }
    });

    // Prepare conversation history as JSON string
    const historyJson = JSON.stringify(conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    })));

    // Start inference
    try {
      // Use default TinyLlama if model not specified or is incompatible
      let inferenceModel = modelId;
      
      // If model contains GGUF or seems incompatible, use TinyLlama instead
      if (!modelId || modelId.includes('GGUF') || modelId.includes('gguf')) {
        inferenceModel = 'TinyLlama/TinyLlama-1.1B-Chat-v1.0';
        if (onLog) {
          onLog('ℹ️ Using TinyLlama (original model not compatible with local inference)');
        }
      }
      
      await invoke('run_local_inference', {
        modelName: inferenceModel,
        prompt: prompt,
        conversationHistory: historyJson,
      });
    } catch (invokeError) {
      console.error('[LOCAL-INFERENCE] Invoke error:', invokeError);
      
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
    console.error('[LOCAL-INFERENCE] Error:', error);
    if (onLog) {
      onLog('❌ [ERROR] ' + (error.message || 'Local inference failed'));
    }
    if (onError) {
      onError(error.message || 'Local inference failed');
    }
    return () => {};
  }
}

