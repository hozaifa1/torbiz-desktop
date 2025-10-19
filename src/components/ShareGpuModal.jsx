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

    // Call the service function which now handles userId internally
    const result = await collectAndSendHardwareInfo(selectedModel);

    if (result.success) {
      setStatus('success');
      setMessage('Your GPU is now successfully registered. You can close this window.');
      // TODO: Potentially store the node_token from result.data if needed for stopping
    } else {
      setStatus('error');
      // Display the specific error message returned by the service
      setMessage(`Registration failed: ${result.message}`);
    }
  };

  const handleStop = () => {
      // TODO: Implement actual backend call to de-register GPU node
      console.log("Stopping GPU Sharing (placeholder - requires backend endpoint and node_token)");
      setStatus('idle');
      setMessage('');
      onClose();
  }

  const handleClose = () => {
    if (status !== 'loading') {
      // Reset state if closing after success/error but before stopping
      if (status === 'success' || status === 'error') {
          setStatus('idle');
          setMessage('');
      }
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="modal-close-btn" onClick={handleClose} disabled={status === 'loading'}>
          <X size={24} />
        </button>

        <h2>Share Your GPU</h2>

        {/* --- Idle or Error State --- */}
        {(status === 'idle' || status === 'error') && (
          <>
            <p>Select a model to host. Your computer will contribute to running this model.</p>
            {status === 'error' && (
              <div className="status-display" style={{ minHeight: 'auto', marginBottom: '1rem', color: '#dc3545', background: '#f8d7da', padding: '0.75rem', borderRadius: '4px', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center'}}>
                    <AlertTriangle size={20} style={{ marginRight: '8px', flexShrink: 0 }}/>
                    <p style={{ margin: 0, color: '#721c24', fontSize: '0.9em' }}>{message}</p>
                </div>
              </div>
            )}
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
              {status === 'error' ? 'Try Sharing Again' : 'Start Sharing'}
            </button>
             {status === 'error' && (
                 <button className="modal-action-btn secondary" onClick={handleClose}>
                     Cancel
                 </button>
             )}
          </>
        )}

        {/* --- Loading State --- */}
        {status === 'loading' && (
          <div className="status-display">
            <Loader size={48} className="spinner" />
            <p>{message}</p>
          </div>
        )}

        {/* --- Success State --- */}
        {status === 'success' && (
          <div className="status-display">
            <CheckCircle size={48} color="#28a745" />
            <p>{message}</p>
            <button className="modal-action-btn secondary" onClick={handleStop}>
                Stop Sharing
            </button>
             <button className="modal-action-btn secondary" onClick={handleClose} style={{marginTop: '0.5rem', backgroundColor: '#6c757d', color: 'white'}}>
                 Close (Keep Sharing)
             </button>
          </div>
        )}

      </div>
    </div>
  );
}

export default ShareGpuModal;