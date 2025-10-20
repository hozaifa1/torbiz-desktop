// src/components/ShareGpuModal.jsx
import React, { useState } from 'react';
import { collectAndSendHardwareInfo, deregisterGpuNode } from '../utils/hardwareService';
import { X, CheckCircle, AlertTriangle, Loader, PowerOff } from 'lucide-react';
import { isTauriEnvironment } from '../utils/tauriHelpers';

// Placeholder model list (should match models fetched in ChatPage ideally)
const supportedModels = [
  { id: 'Llama-3-70B-Instruct', name: 'Llama 3 70B Instruct', vram: 40 },
  { id: 'Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B Instruct', vram: 48 },
  // Add other models...
];

function ShareGpuModal({ isOpen, onClose }) {
  const [selectedModel, setSelectedModel] = useState(supportedModels[0].id);
  // Status states:
  // idle, loading-register, loading-seeder, success, error-register, error-seeder, loading-stop, error-stop
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [nodeToken, setNodeToken] = useState(null);

  const handleShare = async () => {
    // Step 1: Register hardware and get node token
    setStatus('loading-register');
    setMessage('Registering your GPU with the network...');
    setNodeToken(null);

    const registrationResult = await collectAndSendHardwareInfo(selectedModel);

    if (!registrationResult.success || !registrationResult.data?.node_token) {
      setStatus('error-register');
      if (registrationResult.success && !registrationResult.data?.node_token) {
        setMessage('Registration succeeded, but no node token received. Cannot start Petals seeder.');
      } else {
        setMessage(`Registration failed: ${registrationResult.message}`);
      }
      return;
    }

    const receivedToken = registrationResult.data.node_token;
    setNodeToken(receivedToken);
    console.log("GPU Registered. Node Token:", receivedToken);

    // Step 2: Start Petals seeder (only in Tauri environment)
    if (!isTauriEnvironment()) {
      setStatus('success');
      setMessage('GPU registered successfully. (Petals seeder only works in desktop app)');
      console.log("[SHARE-GPU] Web environment detected, skipping Petals seeder");
      return;
    }

    setStatus('loading-seeder');
    setMessage('Starting Petals seeder process...');

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      
      const seederResult = await invoke('start_petals_seeder', {
        modelName: selectedModel,
        nodeToken: receivedToken
      });

      console.log("[SHARE-GPU] Petals seeder started:", seederResult);
      setStatus('success');
      setMessage('Your GPU is now actively serving the network. Keep this window open or minimize it.');
      
    } catch (error) {
      console.error("[SHARE-GPU] Failed to start Petals seeder:", error);
      setStatus('error-seeder');
      setMessage(`Petals seeder failed to start: ${error}. Your GPU is registered but not serving yet.`);
    }
  };

  const handleStop = async () => {
    if (!nodeToken) {
      setMessage('No active node token found. Cannot stop sharing automatically.');
      setStatus('error-stop');
      return;
    }

    setStatus('loading-stop');
    setMessage('Stopping Petals seeder and de-registering GPU...');

    // Step 1: Stop Petals seeder (only in Tauri environment)
    if (isTauriEnvironment()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const stopResult = await invoke('stop_petals_seeder');
        console.log("[SHARE-GPU] Petals seeder stopped:", stopResult);
      } catch (error) {
        console.error("[SHARE-GPU] Failed to stop Petals seeder:", error);
        // Continue to de-register even if seeder stop fails
      }
    }

    // Step 2: De-register from backend
    const deregisterResult = await deregisterGpuNode(nodeToken);
    
    if (deregisterResult.success) {
      setStatus('idle');
      setMessage('GPU sharing stopped successfully.');
      setNodeToken(null);
    } else {
      setStatus('error-stop');
      setMessage(`Failed to de-register: ${deregisterResult.message}. The seeder has stopped, but backend may still show you as active.`);
    }
  };

  const handleClose = () => {
    if (status !== 'loading-register' && status !== 'loading-seeder' && status !== 'loading-stop') {
      if (status === 'error-stop') {
        setStatus('success');
        setMessage('Failed to stop automatically. Your GPU might still be registered.');
      } else {
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  const isLoading = status === 'loading-register' || status === 'loading-seeder' || status === 'loading-stop';
  const isSharing = status === 'success' || status === 'error-stop' || status === 'loading-stop' || status === 'error-seeder';

  // Dynamic loading message
  let loadingMessage = 'Processing...';
  if (status === 'loading-register') loadingMessage = 'Registering your GPU with the network...';
  if (status === 'loading-seeder') loadingMessage = 'Starting Petals seeder process...';
  if (status === 'loading-stop') loadingMessage = 'Stopping seeder and de-registering...';

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="modal-close-btn" onClick={handleClose} disabled={isLoading}>
          <X size={24} />
        </button>

        <h2>{isSharing ? 'GPU Sharing Active' : 'Share Your GPU'}</h2>

        {/* Idle or Registration Error State */}
        {(status === 'idle' || status === 'error-register') && (
          <>
            <p>Select a model to host. Your computer will contribute processing power to the Torbiz network for this model.</p>
            {status === 'error-register' && (
              <div className="status-display error">
                <AlertTriangle size={20} style={{ marginRight: '8px', flexShrink: 0 }}/>
                <p style={{ margin: 0 }}>{message}</p>
              </div>
            )}
            <div className="form-group">
              <label htmlFor="model-select">Choose model to host:</label>
              <select
                id="model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={isLoading}
              >
                {supportedModels.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name} (~{model.vram}GB VRAM Req.)
                  </option>
                ))}
              </select>
            </div>
            <button className="modal-action-btn primary" onClick={handleShare} disabled={isLoading}>
              {status === 'error-register' ? 'Try Sharing Again' : 'Start Sharing'}
            </button>
            {status === 'error-register' && (
              <button className="modal-action-btn secondary" onClick={handleClose} disabled={isLoading}>
                Cancel
              </button>
            )}
          </>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="status-display">
            <Loader size={48} className="spinner" />
            <p>{loadingMessage}</p>
          </div>
        )}

        {/* Success or Error State (Actively Sharing or Seeder Error) */}
        {isSharing && status !== 'loading-stop' && (
          <div className="status-display">
            {status === 'success' && <CheckCircle size={48} color="#28a745" />}
            {(status === 'error-stop' || status === 'error-seeder') && <AlertTriangle size={48} color="#dc3545" />}
            <p style={{ color: (status === 'error-stop' || status === 'error-seeder') ? '#dc3545' : 'inherit' }}>
              {message}
            </p>
            <button 
              className="modal-action-btn secondary" 
              onClick={handleStop} 
              disabled={isLoading} 
              style={{ backgroundColor: '#dc3545', color: 'white' }}
            >
              <PowerOff size={16} style={{ marginRight: '8px' }} /> Stop Sharing
            </button>
            <button className="modal-action-btn secondary" onClick={handleClose} disabled={isLoading}>
              {status === 'success' ? 'Close (Keep Sharing)' : 'Close'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ShareGpuModal;