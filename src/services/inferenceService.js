// src/services/inferenceService.js
// Service for handling inference API calls with streaming support

import api from './api';

/**
 * Stream inference responses from the backend in real-time
 * @param {string} modelId - The model ID to use for inference
 * @param {string} prompt - The user's prompt/question
 * @param {number} userId - The client/user ID
 * @param {Function} onToken - Callback for each token received
 * @param {Function} onComplete - Callback when streaming completes
 * @param {Function} onError - Callback for errors
 * @returns {Function} Abort function to cancel the stream
 */
export async function streamInference(modelId, prompt, userId, onToken, onComplete, onError) {
  const controller = new AbortController();
  const signal = controller.signal;

  try {
    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
      throw new Error('Authentication required. Please log in again.');
    }

    const baseURL = import.meta.env.VITE_API_BASE_URL || 'https://torbiz-backend.vercel.app';
    const url = `${baseURL}/inference/stream/`;

    console.log('[INFERENCE] Starting stream:', { modelId, userId, promptLength: prompt.length });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${authToken}`,
      },
      body: JSON.stringify({
        client: userId,
        question_text: prompt,
        desired_model: modelId,
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[INFERENCE] HTTP error:', response.status, errorText);
      
      if (response.status === 401) {
        throw new Error('Authentication failed. Please log in again.');
      } else if (response.status === 404) {
        throw new Error('Inference endpoint not found. Please check your connection.');
      } else if (response.status === 400) {
        throw new Error('Invalid request. Please check your input.');
      } else {
        throw new Error(`Server error: ${response.status}`);
      }
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let tokenCount = 0;
    
    // Flag to track if the completion signal (data.done=true) was received
    let streamFinishedBySignal = false; 

    console.log('[INFERENCE] Stream started, reading chunks...');
    
    while (true) {
      const { done, value } = await reader.read();

      // 1. Process the incoming value first (even if done is true, it might contain the last chunk)
      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
      }
      
      // 2. Process complete lines (SSE format or newline-delimited JSON)
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          // Handle SSE format (data: {...})
          let jsonStr = line;
          if (line.startsWith('data: ')) {
            jsonStr = line.substring(6);
          }

          const data = JSON.parse(jsonStr);
          
          // Extract and process token FIRST (before checking completion)
          const token = data.token || data.text || data.content || data.delta || '';
          
          if (token) {
            tokenCount++;
            if (tokenCount === 1) {
              console.log('[INFERENCE] First token received');
            }
            if (onToken) {
              onToken(token);
            }
          }

          // Check for completion signal AFTER processing token
          if (data.done === true || data.complete === true || data.finished === true) {
            console.log('[INFERENCE] Received completion signal', { tokenCount });
            
            // Set flag and call onComplete
            streamFinishedBySignal = true;
            if (onComplete) {
              onComplete();
            }
            
            break; // Exit the inner loop immediately
          }

          // Check for error in response
          if (data.error) {
            throw new Error(data.error);
          }

        } catch (parseError) {
          // If it's not JSON, treat the whole line as a token (fallback)
          if (line.trim() && !line.startsWith('data:')) {
            console.warn('[INFERENCE] Non-JSON line received:', line.substring(0, 50));
            if (onToken) {
              onToken(line);
            }
            tokenCount++;
          }
        }
      }

      // Check the flag immediately after the inner loop
      if (streamFinishedBySignal) {
        break; // Exit the outer while (true) loop
      }
      
      // 3. Check for natural stream end (MUST be after processing 'value')
      if (done) {
        console.log('[INFERENCE] Stream completed naturally', { tokenCount });
        
        // <<< ANTI-TRUNCATION FIX: Process any final content left in the buffer >>>
        if (buffer.trim()) {
            console.warn('[INFERENCE] Processing final leftover buffer as token:', buffer.substring(0, 50));
            if (onToken) {
                onToken(buffer);
            }
            tokenCount++;
        }
        
        // Call onComplete only if the signal wasn't received in the last chunk
        if (!streamFinishedBySignal && onComplete) {
            onComplete();
        }

        break; // Exit the outer while (true) loop
      }
    } // End while (true) loop

    // REMOVED redundant onComplete() call here. It is now handled inside the loop.

  } catch (error) {
    console.error('[INFERENCE] Stream error:', error);
    
    if (error.name === 'AbortError') {
      console.log('[INFERENCE] Stream aborted by user');
      // No need to call onError or onComplete for user abort
    } else {
      // Explicitly call onComplete/onError to clean up the UI state
      if (onError) {
        onError(error.message || 'Failed to connect to inference service');
      } else if (onComplete) {
         // Even if there was an error, ensure the UI is un-stuck
         onComplete();
      }
    }
  }

  // Return abort function
  return () => {
    console.log('[INFERENCE] Aborting stream...');
    controller.abort();
  };
}

/**
 * Fallback: Create a regular (non-streaming) inference request
 * @param {string} modelId - The model ID to use for inference
 * @param {string} prompt - The user's prompt/question
 * @param {number} userId - The client/user ID
 * @returns {Promise<string>} The complete response text
 */
export async function createInference(modelId, prompt, userId) {
  try {
    console.log('[INFERENCE] Creating non-streaming inference:', { modelId, userId });

    const response = await api.post('/inference/', {
      client: userId,
      question_text: prompt,
      desired_model: modelId,
    });

    console.log('[INFERENCE] Non-streaming response received:', response.data);

    // Extract answer from response
    const answer = response.data.answer_text || response.data.answer || '';
    
    if (!answer) {
      throw new Error('No response received from the model');
    }

    return answer;

  } catch (error) {
    console.error('[INFERENCE] Non-streaming error:', error);
    
    if (error.response?.status === 401) {
      throw new Error('Authentication failed. Please log in again.');
    } else if (error.response?.status === 404) {
      throw new Error('Model not found or unavailable');
    } else if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    } else {
      throw new Error(error.message || 'Failed to get response from model');
    }
  }
}

/**
 * Get list of available models from the backend
 * @returns {Promise<Array>} Array of model objects
 */
export async function fetchAvailableModels() {
  try {
    console.log('[INFERENCE] Fetching available models...');
    
    const response = await api.get('/llm_models/all-models/');
    console.log('[INFERENCE] Models fetched:', response.data);

    // Handle different response formats
    if (Array.isArray(response.data)) {
      // If it's already an array of model objects or strings
      return response.data.map(model => {
        if (typeof model === 'string') {
          return {
            id: model,
            name: model,
            available: true,
            provider: 'Petals Network',
            description: `${model} hosted on Petals network`,
          };
        }
        return model;
      });
    }

    return [];

  } catch (error) {
    console.error('[INFERENCE] Failed to fetch models:', error);
    throw new Error('Failed to fetch available models');
  }
}

