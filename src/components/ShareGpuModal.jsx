// src/components/ShareGpuModal.jsx
import React, { useState, useEffect } from 'react';
import { collectAndSendHardwareInfo, deregisterGpuNode } from '../utils/hardwareService';
import { X, CheckCircle, AlertTriangle, Loader, PowerOff, Download } from 'lucide-react';
import { isTauriEnvironment } from '../utils/tauriHelpers';

// Latest Petals-supported models (October 2025)
// Source: Petals v2.2.0 release & official site (https://petals.dev, https://github.com/bigscience-workshop/petals)

const supportedModels = [
  // Popular LLaMA-family models
  { id: 'petals-team/StableBeluga2', name: 'StableBeluga2 7B', vram: 8 },
  { id: 'meta-llama/Llama-2-70b-chat-hf', name: 'LLaMA 2 70B Chat', vram: 40 },
  { id: 'enoch/llama-65b-hf', name: 'LLaMA 65B', vram: 35 },
  { id: 'meta-llama/Meta-Llama-3.1-8B', name: 'LLaMA 3.1 8B', vram: 10 },
  { id: 'meta-llama/Meta-Llama-3.1-405B', name: 'LLaMA 3.1 405B (Distributed)', vram: 80 },

  // Falcon models
  { id: 'tiiuae/falcon-40b-instruct', name: 'Falcon 40B Instruct', vram: 40 },
  { id: 'tiiuae/falcon-180b-chat', name: 'Falcon 180B Chat', vram: 80 },

  // BLOOM family
  { id: 'bigscience/bloom', name: 'BLOOM 176B', vram: 40 },
  { id: 'bigscience/bloomz-petals', name: 'BLOOMZ 176B (Instruction-Tuned)', vram: 40 },

  // Mixtral (Mixture-of-Experts)
  { id: 'mistralai/Mixtral-8x22B', name: 'Mixtral 8x22B', vram: 50 },

  // Small models suitable for hosting on low-VRAM GPUs (~2 GB)
  { id: 'google/gemma-2-2b', name: 'Gemma 2 2B (Google)', vram: 2 },
  { id: 'google/gemma-1.1-2b-it', name: 'Gemma 1.1 2B Instruct', vram: 2 },
  { id: 'Qwen/Qwen2-1.5B-Instruct', name: 'Qwen2 1.5B Instruct', vram: 2 },
  { id: 'stabilityai/StableLM-2-1_6B', name: 'StableLM 2 1.6B', vram: 2 },
  { id: 'indexai/index-1.9b', name: 'Index 1.9B Small', vram: 2 },
  { id: 'microsoft/phi-3-mini-3.8b', name: 'Phi-3 Mini 3.8B', vram: 2 },
  { id: 'microsoft/phi-2', name: 'Phi-2 Small (1.3B)', vram: 1.5 },
  { id: 'TinyLlama/TinyLlama-1.1B', name: 'TinyLlama 1.1B Base', vram: 2 },
  { id: 'TinyLlama/TinyLlama-1.1B-Chat-v1.0', name: 'TinyLlama 1.1B Chat', vram: 2 }

];

function ShareGpuModal({ isOpen, onClose }) {
  const [selectedModel, setSelectedModel] = useState(supportedModels[0].id);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [nodeToken, setNodeToken] = useState(null);
  const [isWindows, setIsWindows] = useState(false);
  const [wslSetupProgress, setWslSetupProgress] = useState({ stage: '', message: '', progress: 0 });
  const [wslSetupComplete, setWslSetupComplete] = useState(false);

  useEffect(() => {
    // Detect Windows
    const checkPlatform = async () => {
      if (isTauriEnvironment()) {
        try {
          const osModule = await import('@tauri-apps/plugin-os');
          const platformName = await osModule.platform();
          console.log('[PLATFORM] Detected platform:', platformName);
          setIsWindows(platformName === 'windows');
        } catch (error) {
          console.error('[PLATFORM] Failed to detect platform:', error);
          // Fallback: check user agent
          const isWindowsFallback = navigator.userAgent.includes('Windows');
          console.log('[PLATFORM] Fallback detection, Windows:', isWindowsFallback);
          setIsWindows(isWindowsFallback);
        }
      }
    };
    checkPlatform();
  }, []);

  useEffect(() => {
    // Listen for WSL setup progress
    if (!isTauriEnvironment()) return;

    let unlisten;
    const setupListener = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen('wsl_setup_progress', (event) => {
          console.log('[WSL-SETUP] Progress:', event.payload);
          setWslSetupProgress(event.payload);
        });
      } catch (error) {
        console.error('[WSL-SETUP] Failed to setup listener:', error);
      }
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleWslSetup = async () => {
    if (!isTauriEnvironment()) return;

    setStatus('wsl-setup');
    setMessage('Setting up WSL environment for Petals...');
    setWslSetupProgress({ stage: 'starting', message: 'Initializing...', progress: 0 });

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      
      const result = await invoke('setup_wsl_environment');
      console.log('[WSL-SETUP] Setup completed:', result);
      
      // Mark setup as complete
      await invoke('mark_wsl_setup_complete');
      setWslSetupComplete(true);
      
      setStatus('wsl-ready');
      setMessage('WSL environment is ready! You can now start sharing your GPU.');
      
    } catch (error) {
      console.error('[WSL-SETUP] Setup failed:', error);
      setStatus('wsl-error');
      
      if (error.includes('restart')) {
        setMessage('WSL has been installed but requires a system restart. Please restart your computer and try again.');
      } else {
        setMessage(`WSL setup failed: ${error}`);
      }
    }
  };

  const handleShare = async () => {
    // Step 0: On Windows, ensure WSL is set up first
    if (isWindows && !wslSetupComplete) {
      await handleWslSetup();
      return;
    }

    // Step 1: Register hardware
    setStatus('loading-register');
    setMessage('Registering your GPU with the network...');
    setNodeToken(null);

    const registrationResult = await collectAndSendHardwareInfo(selectedModel);

    if (!registrationResult.success || !registrationResult.data?.node_token) {
      setStatus('error-register');
      if (registrationResult.success && !registrationResult.data?.node_token) {
        setMessage('Registration succeeded, but no node token received.');
      } else {
        setMessage(`Registration failed: ${registrationResult.message}`);
      }
      return;
    }

    const receivedToken = registrationResult.data.node_token;
    setNodeToken(receivedToken);
    console.log("GPU Registered. Node Token:", receivedToken);

    // Step 2: Start Petals seeder
    if (!isTauriEnvironment()) {
      setStatus('success');
      setMessage('GPU registered successfully. (Petals seeder only works in desktop app)');
      return;
    }

    setStatus('loading-seeder');
    setMessage('Starting Petals seeder...');

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      
      const seederResult = await invoke('start_petals_seeder', {
        modelName: selectedModel,
        nodeToken: receivedToken
      });

      console.log("[SHARE-GPU] Petals seeder started:", seederResult);
      setStatus('success');
      setMessage(`Your GPU is now serving ${supportedModels.find(m => m.id === selectedModel)?.name || selectedModel} to the Petals network!`);
      
    } catch (error) {
      console.error("[SHARE-GPU] Failed to start Petals seeder:", error);
      setStatus('error-seeder');
      setMessage(`Failed to start Petals: ${error}`);
    }
  };

  const handleStop = async () => {
    if (!nodeToken) {
      setMessage('No active node token found.');
      setStatus('error-stop');
      return;
    }

    setStatus('loading-stop');
    setMessage('Stopping Petals seeder...');

    if (isTauriEnvironment()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const stopResult = await invoke('stop_petals_seeder');
        console.log("[SHARE-GPU] Petals stopped:", stopResult);
      } catch (error) {
        console.error("[SHARE-GPU] Failed to stop Petals:", error);
      }
    }

    const deregisterResult = await deregisterGpuNode(nodeToken);
    
    if (deregisterResult.success) {
      setStatus('idle');
      setMessage('GPU sharing stopped successfully.');
      setNodeToken(null);
    } else {
      setStatus('error-stop');
      setMessage(`Failed to de-register: ${deregisterResult.message}`);
    }
  };

  const handleClose = () => {
    if (status !== 'loading-register' && status !== 'loading-seeder' && 
        status !== 'loading-stop' && status !== 'wsl-setup') {
      if (status === 'error-stop') {
        setStatus('success');
      } else {
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  const isLoading = status === 'loading-register' || status === 'loading-seeder' || 
                    status === 'loading-stop' || status === 'wsl-setup';
  const isSharing = status === 'success' || status === 'error-stop' || 
                    status === 'loading-stop' || status === 'error-seeder';

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="modal-close-btn" onClick={handleClose} disabled={isLoading}>
          <X size={24} />
        </button>

        <h2>
          {status === 'wsl-setup' ? 'Setting Up Environment' : 
           status === 'wsl-ready' ? 'Environment Ready' :
           isSharing ? 'GPU Sharing Active' : 'Share Your GPU'}
        </h2>

        {/* WSL Setup Required */}
        {isWindows && !wslSetupComplete && status === 'idle' && (
          <>
            <div style={{
              backgroundColor: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '6px',
              padding: '1rem',
              marginBottom: '1rem',
              textAlign: 'left'
            }}>
              <h4 style={{ margin: '0 0 0.5rem 0', color: '#856404' }}>
                <Download size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                First-Time Setup Required
              </h4>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9em', color: '#856404' }}>
                To run Petals on Windows, we need to set up a Linux environment (WSL). This is a one-time process that will:
              </p>
              <ul style={{ margin: '0 0 0.5rem 0', paddingLeft: '1.5rem', fontSize: '0.85em', color: '#856404' }}>
                <li>Install Windows Subsystem for Linux (if needed)</li>
                <li>Set up Python and required libraries</li>
                <li>Install the Petals framework</li>
              </ul>
              <p style={{ margin: '0', fontSize: '0.85em', color: '#856404' }}>
                This may take 5-10 minutes depending on your internet connection.
              </p>
            </div>
            <button 
              className="modal-action-btn primary" 
              onClick={handleWslSetup}
              style={{ marginBottom: '0.5rem' }}
            >
              <Download size={16} style={{ marginRight: '8px' }} />
              Start Setup
            </button>
            <button className="modal-action-btn secondary" onClick={handleClose}>
              Cancel
            </button>
          </>
        )}

        {/* WSL Setup in Progress */}
        {status === 'wsl-setup' && (
          <div className="status-display">
            <Loader size={48} className="spinner" />
            <p style={{ fontWeight: '600', marginTop: '1rem', marginBottom: '0.5rem' }}>
              {wslSetupProgress.stage === 'complete' ? 'Setup Complete!' : 'Setting Up Environment...'}
            </p>
            <p style={{ fontSize: '0.9em', color: '#666' }}>{wslSetupProgress.message}</p>
            
            {/* Progress Bar */}
            <div style={{
              width: '100%',
              height: '8px',
              backgroundColor: '#e0e0e0',
              borderRadius: '4px',
              overflow: 'hidden',
              marginTop: '1rem'
            }}>
              <div style={{
                width: `${wslSetupProgress.progress}%`,
                height: '100%',
                backgroundColor: '#1a73e8',
                transition: 'width 0.3s ease'
              }} />
            </div>
            <p style={{ fontSize: '0.8em', color: '#888', marginTop: '0.5rem' }}>
              {wslSetupProgress.progress}% Complete
            </p>
          </div>
        )}

        {/* WSL Setup Complete */}
        {status === 'wsl-ready' && (
          <>
            <div className="status-display">
              <CheckCircle size={48} color="#28a745" />
              <p style={{ color: '#28a745', marginTop: '1rem' }}>{message}</p>
            </div>
            <p style={{ fontSize: '0.9em', color: '#666', marginBottom: '1rem' }}>
              Select a model to host on the Petals network:
            </p>
            <div className="form-group">
              <label htmlFor="model-select">Choose model:</label>
              <select
                id="model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {supportedModels.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name} (~{model.vram}GB VRAM)
                  </option>
                ))}
              </select>
            </div>
            <button className="modal-action-btn primary" onClick={handleShare}>
              Start Sharing
            </button>
            <button className="modal-action-btn secondary" onClick={handleClose}>
              Cancel
            </button>
          </>
        )}

        {/* WSL Setup Error */}
        {status === 'wsl-error' && (
          <>
            <div className="status-display error">
              <AlertTriangle size={20} style={{ marginRight: '8px', flexShrink: 0 }}/>
              <p style={{ margin: 0 }}>{message}</p>
            </div>
            <button className="modal-action-btn secondary" onClick={() => setStatus('idle')}>
              Try Again
            </button>
            <button className="modal-action-btn secondary" onClick={handleClose}>
              Cancel
            </button>
          </>
        )}

        {/* Idle State (non-Windows or WSL already set up) */}
        {(status === 'idle' && (!isWindows || wslSetupComplete)) || status === 'error-register' && (
          <>
            <p>Select a model to host. Your computer will contribute processing power to the Petals network.</p>
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
                    {model.name} (~{model.vram}GB VRAM)
                  </option>
                ))}
              </select>
            </div>
            <button className="modal-action-btn primary" onClick={handleShare} disabled={isLoading}>
              {status === 'error-register' ? 'Try Again' : 'Start Sharing'}
            </button>
            {status === 'error-register' && (
              <button className="modal-action-btn secondary" onClick={handleClose}>
                Cancel
              </button>
            )}
          </>
        )}

        {/* Loading States */}
        {isLoading && status !== 'wsl-setup' && (
          <div className="status-display">
            <Loader size={48} className="spinner" />
            <p>
              {status === 'loading-register' && 'Registering your GPU...'}
              {status === 'loading-seeder' && 'Starting Petals seeder...'}
              {status === 'loading-stop' && 'Stopping seeder...'}
            </p>
          </div>
        )}

        {/* Success/Sharing State */}
        {isSharing && status !== 'loading-stop' && (
          <div className="status-display">
            {status === 'success' && <CheckCircle size={48} color="#28a745" />}
            {(status === 'error-stop' || status === 'error-seeder') && 
              <AlertTriangle size={48} color="#dc3545" />}
            <p style={{ 
              color: (status === 'error-stop' || status === 'error-seeder') ? '#dc3545' : 'inherit',
              marginTop: '1rem'
            }}>
              {message}
            </p>
            {status === 'success' && (
              <div style={{
                backgroundColor: '#e6f4ea',
                padding: '0.75rem',
                borderRadius: '6px',
                marginTop: '1rem',
                fontSize: '0.9em'
              }}>
                <p style={{ margin: 0, color: '#1e8e3e' }}>
                  ✓ Your GPU is contributing to the decentralized AI network
                </p>
              </div>
            )}
            <button 
              className="modal-action-btn secondary" 
              onClick={handleStop} 
              disabled={isLoading} 
              style={{ 
                backgroundColor: '#dc3545', 
                color: 'white',
                marginTop: '1rem'
              }}
            >
              <PowerOff size={16} style={{ marginRight: '8px' }} /> 
              Stop Sharing
            </button>
            <button 
              className="modal-action-btn secondary" 
              onClick={handleClose} 
              disabled={isLoading}
            >
              {status === 'success' ? 'Close' : 'Close'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ShareGpuModal;