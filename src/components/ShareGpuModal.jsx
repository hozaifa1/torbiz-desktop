import React, { useState } from 'react';
import { collectAndSendHardwareInfo } from '../utils/hardwareService';
import { X, CheckCircle, AlertTriangle, Loader } from 'lucide-react';

// Placeholder model list
const supportedModels = [
  { id: 'Llama-3-70B-Instruct', name: 'Llama 3 70B Instruct', vram: 40 },
  { id: 'Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B Instruct', vram: 48 },
  { id: 'claude-3-opus', name: 'Claude 3 Opus (Placeholder)', vram: 32 },
];

function ShareGpuModal({ isOpen, onClose }) {
  const [selectedModel, setSelectedModel] = useState(supportedModels[0].id);
  const [status, setStatus] = useState('idle'); // idle, loading, success, error
  const [message, setMessage] = useState('');

  const handleShare = async () => {
    setStatus('loading');
    setMessage('Collecting hardware info and registering with the network...');
    
    const authToken = localStorage.getItem('authToken');
    const result = await collectAndSendHardwareInfo(selectedModel, authToken);

    if (result.success) {
      setStatus('success');
      setMessage('Your GPU is now successfully registered with the Torbiz network. You can close this window.');
    } else {
      setStatus('error');
      setMessage(`Registration failed: ${result.message}`);
    }
  };
  
  const handleStop = () => {
      // In a real scenario, this would call the backend to de-register the GPU
      console.log("Stopping GPU Sharing (placeholder)");
      setStatus('idle');
      setMessage('');
      onClose();
  }

  const handleClose = () => {
    if (status !== 'loading') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="modal-close-btn" onClick={handleClose}>
          <X size={24} />
        </button>

        <h2>Share Your GPU</h2>
        
        {status === 'idle' && (
          <>
            <p>Select a model you would like to host. Your computer will contribute to running this model for other users on the network.</p>
            <div className="form-group">
              <label htmlFor="model-select">Choose a model:</label>
              <select 
                id="model-select"
                value={selectedModel} 
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {supportedModels.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name} (Requires ~{model.vram}GB VRAM)
                  </option>
                ))}
              </select>
            </div>
            <button className="modal-action-btn primary" onClick={handleShare}>
              Start Sharing
            </button>
          </>
        )}

        {status === 'loading' && (
          <div className="status-display">
            <Loader size={48} className="spinner" />
            <p>{message}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="status-display">
            <CheckCircle size={48} color="#28a745" />
            <p>{message}</p>
            <button className="modal-action-btn secondary" onClick={handleStop}>
                Stop Sharing
            </button>
          </div>
        )}
        
        {status === 'error' && (
          <div className="status-display">
            <AlertTriangle size={48} color="#dc3545" />
            <p>{message}</p>
            <button className="modal-action-btn primary" onClick={handleShare}>
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ShareGpuModal;