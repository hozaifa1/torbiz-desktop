// src/components/ShareGpuModal.jsx
import React, { useState } from 'react';
// Import the updated orchestrator function and deregister function
import { collectAndSendHardwareInfo, deregisterGpuNode } from '../utils/hardwareService';
import { X, CheckCircle, AlertTriangle, Loader, PowerOff } from 'lucide-react';

// Placeholder model list (should match models fetched in ChatPage ideally)
const supportedModels = [
  { id: 'Llama-3-70B-Instruct', name: 'Llama 3 70B Instruct', vram: 40 },
  { id: 'Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B Instruct', vram: 48 },
  // Add other models...
];

function ShareGpuModal({ isOpen, onClose }) {
  const [selectedModel, setSelectedModel] = useState(supportedModels[0].id);
  // idle, loading-step1, loading-step2, success, error-share, loading-stop, error-stop
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [nodeToken, setNodeToken] = useState(null); // State to store the node token

  const handleShare = async () => {
    // Indicate start of process
    setStatus('loading-step1'); // Changed from loading-share
    setMessage('Collecting hardware info and creating record...');
    setNodeToken(null); // Clear previous token

    // Call the orchestrator function
    const result = await collectAndSendHardwareInfo(selectedModel);

    // Check for final success and node_token from Step 2
    if (result.success && result.data?.node_token) {
      setStatus('success');
      setMessage('Your GPU is now registered and sharing. Keep this window open or minimize.');
      setNodeToken(result.data.node_token); // Store the received token
      console.log("GPU Registered. Node Token:", result.data.node_token);
    }
    // Handle case where Step 2 succeeded but no token (backend issue)
    else if (result.success && !result.data?.node_token) {
        setStatus('error-share'); // Treat as error if token missing at the end
        setMessage('Registration succeeded, but no node token received from backend. Cannot stop sharing automatically.');
        console.error("Registration final step success but missing node_token:", result.data);
    }
    // Handle failure at either Step 1 or Step 2
    else {
      setStatus('error-share');
      // The message from collectAndSendHardwareInfo already indicates which step failed
      setMessage(`Registration failed: ${result.message}`);
    }
  };

  const handleStop = async () => {
    // Stop logic remains the same
    if (!nodeToken) {
        setMessage('No active node token found. Cannot stop sharing automatically.');
        setStatus('error-stop');
        return;
    }
    setStatus('loading-stop');
    setMessage('Attempting to de-register your GPU node...');
    const result = await deregisterGpuNode(nodeToken);
    if (result.success) {
      setStatus('idle');
      setMessage('GPU sharing stopped successfully.');
      setNodeToken(null);
    } else {
      setStatus('error-stop');
      setMessage(`Failed to stop sharing: ${result.message}. You might need to restart.`);
    }
  };

  const handleClose = () => {
    // Close logic remains the same
    if (status !== 'loading-step1' && status !== 'loading-step2' && status !== 'loading-stop') {
      if (status === 'error-stop') {
          setStatus('success');
          setMessage('Failed to stop sharing automatically. Your GPU might still be registered.');
      }
      else { onClose(); }
    }
  };

  if (!isOpen) return null;

  const isLoading = status === 'loading-step1' || status === 'loading-step2' || status === 'loading-stop';
  const isSharing = status === 'success' || status === 'error-stop' || status === 'loading-stop';

  // Update loading message based on status
  let loadingMessage = 'Processing...';
  if (status === 'loading-step1') loadingMessage = 'Collecting hardware info and creating record...';
  if (status === 'loading-step2') loadingMessage = 'Registering node for model...'; // This status isn't explicitly set currently, but could be added in collectAndSendHardwareInfo
  if (status === 'loading-stop') loadingMessage = 'Attempting to de-register your GPU node...';


  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="modal-close-btn" onClick={handleClose} disabled={isLoading}>
          <X size={24} />
        </button>

        <h2>{isSharing ? 'GPU Sharing Active' : 'Share Your GPU'}</h2>

        {/* --- Idle or Share Error State --- */}
        {(status === 'idle' || status === 'error-share') && (
          <>
            <p>Select a model to host. Your computer will contribute processing power to the Torbiz network for this model.</p>
            {status === 'error-share' && (
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
              {status === 'error-share' ? 'Try Sharing Again' : 'Start Sharing'}
            </button>
             {status === 'error-share' && (
                 <button className="modal-action-btn secondary" onClick={handleClose} disabled={isLoading}>
                     Cancel
                 </button>
             )}
          </>
        )}

        {/* --- Loading State (Sharing or Stopping) --- */}
        {isLoading && (
          <div className="status-display">
            <Loader size={48} className="spinner" />
            <p>{loadingMessage}</p> {/* Use dynamic loading message */}
          </div>
        )}

        {/* --- Success State (Actively Sharing) or Error Stopping --- */}
        {isSharing && status !== 'loading-stop' && (
           <div className="status-display">
             {status === 'success' && <CheckCircle size={48} color="#28a745" />}
             {status === 'error-stop' && <AlertTriangle size={48} color="#dc3545" />}
             <p style={{ color: status === 'error-stop' ? '#dc3545' : 'inherit' }}>{message}</p>
             <button className="modal-action-btn secondary" onClick={handleStop} disabled={isLoading} style={{ backgroundColor: '#dc3545', color: 'white' }}>
                  <PowerOff size={16} style={{ marginRight: '8px' }} /> Stop Sharing
             </button>
             <button className="modal-action-btn secondary" onClick={handleClose} disabled={isLoading}>
                  Close (Keep Sharing)
             </button>
           </div>
        )}

        {/* Error Styling (Keep as is) */}
        <style jsx>{`
            .status-display.error { /* ... */ }
            .status-display.error p { /* ... */ }
        `}</style>

      </div>
    </div>
  );
}

export default ShareGpuModal;