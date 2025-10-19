import React, { useState } from 'react';
// *** FIX: Import deregisterGpuNode ***
import { collectAndSendHardwareInfo, deregisterGpuNode } from '../utils/hardwareService';
import { X, CheckCircle, AlertTriangle, Loader, PowerOff } from 'lucide-react'; // Added PowerOff icon

// Placeholder model list (replace with dynamic fetching if needed)
const supportedModels = [
  { id: 'Llama-3-70B-Instruct', name: 'Llama 3 70B Instruct', vram: 40 },
  { id: 'Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B Instruct', vram: 48 },
  { id: 'claude-3-opus', name: 'Claude 3 Opus (Placeholder)', vram: 32 },
];

function ShareGpuModal({ isOpen, onClose }) {
  const [selectedModel, setSelectedModel] = useState(supportedModels[0].id);
  const [status, setStatus] = useState('idle'); // idle, loading-share, success, error-share, loading-stop, error-stop
  const [message, setMessage] = useState('');
  const [nodeToken, setNodeToken] = useState(null); // State to store the node token

  const handleShare = async () => {
    setStatus('loading-share');
    setMessage('Collecting hardware info and registering with the network...');
    setNodeToken(null); // Clear previous token if retrying

    const result = await collectAndSendHardwareInfo(selectedModel);

    if (result.success && result.data?.node_token) {
      setStatus('success');
      setMessage('Your GPU is now registered and sharing. Keep this window open or minimize.');
      setNodeToken(result.data.node_token); // Store the received token
      console.log("GPU Registered. Node Token:", result.data.node_token); // Log token for debugging
    } else if (result.success && !result.data?.node_token) {
        // Handle success case where backend might not return token (should be fixed backend-side ideally)
        setStatus('error-share');
        setMessage('Registration reported success, but no node token received from backend. Cannot stop sharing automatically.');
        console.error("Registration success but missing node_token in response:", result.data);
    }
    else {
      setStatus('error-share');
      setMessage(`Registration failed: ${result.message}`);
    }
  };

  const handleStop = async () => {
    if (!nodeToken) {
        setMessage('No active node token found. Cannot stop sharing automatically.');
        setStatus('error-stop'); // Use a specific error state for stopping issues
        return;
    }

    setStatus('loading-stop');
    setMessage('Attempting to de-register your GPU node...');

    const result = await deregisterGpuNode(nodeToken);

    if (result.success) {
      setStatus('idle'); // Return to idle state after successful stop
      setMessage('GPU sharing stopped successfully.');
      setNodeToken(null); // Clear the token
       // Optionally close modal after successful stop, or let user close manually
       // setTimeout(onClose, 1500); // Close after 1.5 seconds
    } else {
      setStatus('error-stop'); // Stay in success state but show stop error
      setMessage(`Failed to stop sharing: ${result.message}. You might need to restart the application.`);
    }
  };

  const handleClose = () => {
    // Prevent closing while loading share/stop
    if (status !== 'loading-share' && status !== 'loading-stop') {
      // If closing after a failed stop attempt, reset to success state (still sharing)
      if (status === 'error-stop') {
          setStatus('success'); // Revert to showing success message, but with error stop info
          setMessage('Failed to stop sharing automatically. Your GPU might still be registered.');
      }
      // If closing normally or after success/error-share, call onClose
      else {
          onClose();
          // Optionally reset internal state if modal might reopen without unmounting
          // setStatus('idle');
          // setMessage('');
          // setNodeToken(null); // Clear token if closing while successfully sharing
      }
    }
  };

  if (!isOpen) return null;

  const isLoading = status === 'loading-share' || status === 'loading-stop';
  const isSharing = status === 'success' || status === 'error-stop' || status === 'loading-stop'; // Define sharing state

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
              <div className="status-display error"> {/* Added error class */}
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
            <p>{message}</p>
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

        {/* Simple Error Styling */}
        <style jsx>{`
            .status-display.error {
                min-height: auto;
                margin-bottom: 1rem;
                color: #721c24; /* Darker red text */
                background: #f8d7da; /* Light red background */
                padding: 0.75rem;
                border: 1px solid #f5c6cb; /* Reddish border */
                border-radius: 4px;
                text-align: left;
                display: flex;
                align-items: center;
            }
             .status-display.error p {
                 color: #721c24; /* Ensure p tag inherits color */
                 font-size: 0.9em;
                 margin-bottom: 0 !important; /* Override default p margin */
             }
        `}</style>

      </div>
    </div>
  );
}

export default ShareGpuModal;