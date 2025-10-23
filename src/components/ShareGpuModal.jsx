// src/components/ShareGpuModal.jsx
import React, { useState, useEffect } from 'react';
import { collectAndSendHardwareInfo, deregisterGpuNode } from '../utils/hardwareService';
import { getHardwareInfo } from '../utils/hardwareService';
import { X, CheckCircle, AlertTriangle, Loader, PowerOff, Download, Info } from 'lucide-react';
import { isTauriEnvironment } from '../utils/tauriHelpers';

// Enhanced model metadata with shard information
const supportedModels = [
  // Small models (1-2 shards, suitable for low VRAM)
  { 
    id: 'google/gemma-2-2b', 
    name: 'Gemma 2 2B', 
    totalShards: 1,
    vramPerShard: 2.0,
    totalModelSize: 2.0,
    description: 'Lightweight Google model, runs on single GPU'
  },
  { 
    id: 'TinyLlama/TinyLlama-1.1B-Chat-v1.0', 
    name: 'TinyLlama 1.1B Chat', 
    totalShards: 1,
    vramPerShard: 1.5,
    totalModelSize: 1.5,
    description: 'Ultra-lightweight chat model'
  },
  { 
    id: 'microsoft/phi-3-mini-3.8b', 
    name: 'Phi-3 Mini 3.8B', 
    totalShards: 2,
    vramPerShard: 2.0,
    totalModelSize: 4.0,
    description: 'Efficient small model from Microsoft'
  },
  
  // Medium models (4-8 shards)
  { 
    id: 'petals-team/StableBeluga2', 
    name: 'StableBeluga2 7B', 
    totalShards: 4,
    vramPerShard: 2.5,
    totalModelSize: 8.0,
    description: 'Popular 7B parameter model, distributed across 4 shards'
  },
  { 
    id: 'meta-llama/Meta-Llama-3.1-8B', 
    name: 'LLaMA 3.1 8B', 
    totalShards: 4,
    vramPerShard: 3.0,
    totalModelSize: 10.0,
    description: 'Meta\'s efficient 8B model'
  },
  
  // Large models (16-32 shards)
  { 
    id: 'tiiuae/falcon-40b-instruct', 
    name: 'Falcon 40B Instruct', 
    totalShards: 16,
    vramPerShard: 3.0,
    totalModelSize: 40.0,
    description: 'Large instruction-tuned model, 16 shards'
  },
  { 
    id: 'meta-llama/Llama-2-70b-chat-hf', 
    name: 'LLaMA 2 70B Chat', 
    totalShards: 28,
    vramPerShard: 3.5,
    totalModelSize: 70.0,
    description: 'Very large chat model, requires network participation'
  },
  { 
    id: 'bigscience/bloom', 
    name: 'BLOOM 176B', 
    totalShards: 64,
    vramPerShard: 3.0,
    totalModelSize: 176.0,
    description: 'Massive multilingual model, 64 shards across network'
  },
  
  // Extreme scale models
  { 
    id: 'tiiuae/falcon-180b-chat', 
    name: 'Falcon 180B Chat', 
    totalShards: 72,
    vramPerShard: 3.0,
    totalModelSize: 180.0,
    description: 'One of the largest open models, 72 shards'
  },
  { 
    id: 'meta-llama/Meta-Llama-3.1-405B', 
    name: 'LLaMA 3.1 405B', 
    totalShards: 144,
    vramPerShard: 3.5,
    totalModelSize: 405.0,
    description: 'Ultra-large distributed model, 144 shards'
  },
];

// Helper to calculate how many shards a GPU can host
function calculateHostableShards(gpuVramGB, vramPerShard) {
  if (!gpuVramGB || gpuVramGB <= 0) return 0;
  const usableVram = Math.max(0, gpuVramGB - 0.5);
  return Math.floor(usableVram / vramPerShard);
}

// Helper to extract VRAM from GPU info string
// Helper to extract VRAM from GPU info string - GET THE MAXIMUM VRAM
function extractVramFromGpuInfo(gpuInfoArray) {
  if (!Array.isArray(gpuInfoArray) || gpuInfoArray.length === 0) {
    return null;
  }
  
  const vramPatterns = [
    /(\d+(?:\.\d+)?)\s*GB\s*VRAM/i,
    /\((\d+(?:\.\d+)?)\s*GB\)/i,
    /(\d+(?:\.\d+)?)\s*GB/i,
  ];
  
  let maxVram = 0;
  let foundAny = false;
  
  // Check ALL GPUs and find the maximum VRAM
  for (const gpuString of gpuInfoArray) {
    for (const pattern of vramPatterns) {
      const match = gpuString.match(pattern);
      if (match && match[1]) {
        const vram = parseFloat(match[1]);
        if (vram > maxVram) {
          maxVram = vram;
          foundAny = true;
          console.log(`[GPU-VRAM] Found ${vram}GB in: ${gpuString}`);
        }
      }
    }
  }
  
  return foundAny ? maxVram : null;
}

function ShareGpuModal({ isOpen, onClose }) {
  const [selectedModel, setSelectedModel] = useState(supportedModels[0].id);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [nodeToken, setNodeToken] = useState(null);
  const [activeModelId, setActiveModelId] = useState(null); // Track actively shared model
  const [isWindows, setIsWindows] = useState(false);
  const [wslSetupProgress, setWslSetupProgress] = useState({ stage: '', message: '', progress: 0 });
  const [wslSetupComplete, setWslSetupComplete] = useState(false);
  const [gpuVram, setGpuVram] = useState(null);
  const [hardwareInfo, setHardwareInfo] = useState(null);
  const [showShardInfo, setShowShardInfo] = useState(false);
  const [seederLogs, setSeederLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [seederError, setSeederError] = useState(null);
  const [hasNvidiaGpu, setHasNvidiaGpu] = useState(false);

  // Reset only UI transient state, preserve sharing state
  const resetModalState = () => {
    // Only reset if not actively sharing
    if (status !== 'success') {
      setSelectedModel(supportedModels[0].id);
      setStatus('idle');
      setMessage('');
      setNodeToken(null);
      setActiveModelId(null);
    }
    setWslSetupProgress({ stage: '', message: '', progress: 0 });
    setShowShardInfo(false);
  };

  // Check if currently sharing when modal opens
  useEffect(() => {
    const checkSharingStatus = async () => {
      if (!isOpen || !isTauriEnvironment()) return;
      
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const isRunning = await invoke('is_petals_seeder_running');
        
        if (isRunning) {
          // Get the model that's currently being shared
          const modelInfo = await invoke('get_petals_seeder_info');
          
          if (modelInfo) {
            console.log('[MODAL] Detected active sharing:', modelInfo);
            setActiveModelId(modelInfo);
            setSelectedModel(modelInfo);
            setStatus('success');
            
            const model = supportedModels.find(m => m.id === modelInfo);
            if (model && gpuVram !== null) {
              const hostableShards = calculateHostableShards(gpuVram, model.vramPerShard);
              let msg = `Currently sharing ${model.name}`;
              if (hostableShards !== null) {
                if (hostableShards >= model.totalShards) {
                  msg += ` (hosting all ${model.totalShards} shards)`;
                } else if (hostableShards === 1) {
                  msg += ` (hosting 1 of ${model.totalShards} shards)`;
                } else {
                  msg += ` (hosting ~${hostableShards} of ${model.totalShards} shards)`;
                }
              }
              setMessage(msg);
            } else {
              setMessage(`Currently sharing ${model?.name || modelInfo}`);
            }
            // Set a placeholder token since we're already sharing
            setNodeToken('active');
          }
        }
      } catch (error) {
        console.error('[MODAL] Failed to check sharing status:', error);
      }
    };

    if (isOpen) {
      checkSharingStatus();
    }
  }, [isOpen, gpuVram]);

  // Detect platform and GPU
  useEffect(() => {
    const checkPlatformAndGpu = async () => {
      if (isTauriEnvironment()) {
        try {
          const osModule = await import('@tauri-apps/plugin-os');
          const platformName = await osModule.platform();
          console.log('[PLATFORM] Detected platform:', platformName);
          setIsWindows(platformName === 'windows');
        } catch (error) {
          console.error('[PLATFORM] Failed to detect platform:', error);
          const isWindowsFallback = navigator.userAgent.includes('Windows');
          console.log('[PLATFORM] Fallback detection, Windows:', isWindowsFallback);
          setIsWindows(isWindowsFallback);
        }
      }
      
      // Check for NVIDIA GPU
      try {
        const info = await getHardwareInfo();
        setHardwareInfo(info);
        const vram = extractVramFromGpuInfo(info.gpu_info);
        console.log('[GPU-VRAM] Detected max GPU VRAM:', vram, 'GB');
        setGpuVram(vram);
        
        // Check if any GPU is NVIDIA
        const hasNvidia = info.gpu_info.some(gpu => 
          gpu.toLowerCase().includes('nvidia') || gpu.toLowerCase().includes('geforce') || gpu.toLowerCase().includes('rtx') || gpu.toLowerCase().includes('gtx')
        );
        setHasNvidiaGpu(hasNvidia);
        console.log('[GPU-CHECK] Has NVIDIA GPU:', hasNvidia);
      } catch (error) {
        console.error('[GPU-CHECK] Failed:', error);
      }
    };
    checkPlatformAndGpu();
  }, []);

  // Fetch hardware info and extract VRAM
  // useEffect(() => {
  //   const fetchHardwareInfo = async () => {
  //     try {
  //       console.log('[GPU-VRAM] Fetching hardware info...');
  //       const info = await getHardwareInfo();
  //       setHardwareInfo(info);
        
  //       const vram = extractVramFromGpuInfo(info.gpu_info);
  //       console.log('[GPU-VRAM] Extracted VRAM:', vram, 'GB from:', info.gpu_info);
  //       setGpuVram(vram);
  //     } catch (error) {
  //       console.error('[GPU-VRAM] Failed to fetch hardware info:', error);
  //     }
  //   };

  //   if (isOpen) {
  //     fetchHardwareInfo();
  //   }
  // }, [isOpen]);

  // Listen for WSL setup progress
  useEffect(() => {
    if (!isTauriEnvironment()) return;

    let unlistenProgress, unlistenError, unlistenSuccess;
    const setupListeners = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        
        // WSL setup progress
        unlistenProgress = await listen('wsl_setup_progress', (event) => {
          console.log('[WSL-SETUP] Progress:', event.payload);
          setWslSetupProgress(event.payload);
        });
        
        // Petals error detection
        unlistenError = await listen('petals_error', (event) => {
          console.error('[PETALS-ERROR]', event.payload);
          setSeederError(event.payload);
          setStatus('error-seeder');
          setMessage('Petals failed to start. Please check the error details below.');
        });
        
        // Petals success detection
        unlistenSuccess = await listen('petals_success', (event) => {
          console.log('[PETALS-SUCCESS]', event.payload);
          setSeederError(null);
          // Success is already set by the main handler
        });
      } catch (error) {
        console.error('[EVENT-LISTENERS] Failed to setup:', error);
      }
    };

    setupListeners();

    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenError) unlistenError();
      if (unlistenSuccess) unlistenSuccess();
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

    // Get selected model info
    const modelInfo = supportedModels.find(m => m.id === selectedModel);
    if (!modelInfo) {
      setStatus('error-register');
      setMessage('Invalid model selected.');
      return;
    }

    // Step 1: Validate GPU capability
    if (gpuVram !== null) {
      const hostableShards = calculateHostableShards(gpuVram, modelInfo.vramPerShard);
      
      if (hostableShards === 0) {
        setStatus('error-register');
        setMessage(
          `Your GPU (${gpuVram.toFixed(1)}GB VRAM) cannot host any shard of ${modelInfo.name}. ` +
          `Each shard requires ${modelInfo.vramPerShard}GB VRAM. ` +
          `Please select a model with lower VRAM requirements.`
        );
        return;
      }
      
      console.log(`[GPU-VALIDATION] GPU can host ${hostableShards} of ${modelInfo.totalShards} shards`);
    } else {
      console.warn('[GPU-VALIDATION] Could not determine GPU VRAM, proceeding without validation');
    }

    // Step 2: Register hardware
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

    // *** ADD THIS: Extract hardware info from the registration process ***
    if (!hardwareInfo) {
      try {
        const info = await getHardwareInfo();
        setHardwareInfo(info);
        const vram = extractVramFromGpuInfo(info.gpu_info);
        console.log('[SHARE-GPU] Hardware info from registration:', info);
        console.log('[SHARE-GPU] Detected max GPU VRAM:', vram, 'GB');
        setGpuVram(vram);
      } catch (error) {
        console.error('[SHARE-GPU] Failed to get hardware info:', error);
      }
    }

    // Step 3: Start Petals seeder
    if (!isTauriEnvironment()) {
      const hostableShards = gpuVram 
        ? calculateHostableShards(gpuVram, modelInfo.vramPerShard) 
        : '?';
      
      setStatus('success');
      setActiveModelId(selectedModel);
      setMessage(
        `GPU registered successfully for ${modelInfo.name}. ` +
        (gpuVram ? `Your GPU can host approximately ${hostableShards} of ${modelInfo.totalShards} shards. ` : '') +
        `(Petals seeder only works in desktop app)`
      );
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
      
      setStatus('loading-seeder-verify');
      setMessage('Waiting for Petals to connect (this may take 2-5 minutes)...');
      
      // Wait for actual success event or timeout after 5 minutes
      const startTime = Date.now();
      const timeout = 5 * 60 * 1000; // 5 minutes
      
      while (Date.now() - startTime < timeout) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Check every 2 seconds
        
        // Check if process is still running
        const isRunning = await invoke('is_petals_seeder_running');
        if (!isRunning) {
          throw new Error('Seeder process stopped unexpectedly. Please check the error details.');
        }
        
        // If seederError was set by event listener, break
        if (seederError) {
          throw new Error('Seeder encountered an error during startup.');
        }
        
        // Check logs for success marker
        const logs = await invoke('get_petals_seeder_logs');
        if (logs.some(log => log.includes('✓✓✓ MODEL LOADED SUCCESSFULLY ✓✓✓'))) {
          console.log("[SHARE-GPU] Seeder verified - model loaded successfully");
          break;
        }
      }
      
      // If we timeout, still show a message but don't fail
      if (Date.now() - startTime >= timeout) {
        console.warn("[SHARE-GPU] Timeout waiting for model load, but process is running");
      }

      // Calculate and show shard contribution info
      const hostableShards = gpuVram
        ? calculateHostableShards(gpuVram, modelInfo.vramPerShard)
        : null;

      let successMessage = `Successfully sharing ${modelInfo.name}`; // Define here

      if (hostableShards !== null) {
        if (hostableShards >= modelInfo.totalShards) {
          successMessage += ` (hosting all ${modelInfo.totalShards} shards)`;
        } else if (hostableShards === 1) {
          successMessage += ` (hosting 1 of ${modelInfo.totalShards} shards)`;
        } else {
          successMessage += ` (hosting ~${hostableShards} of ${modelInfo.totalShards} shards)`;
        }
      }

      // More detailed success message with network info
      successMessage += '. Note: It may take 2-5 minutes for your node to be discoverable on the Petals network.';

      // *** FIX: Move these lines INSIDE the try block ***
      setStatus('success');
      setActiveModelId(selectedModel);
      setMessage(successMessage); // Now successMessage is defined

    } catch (error) {
      console.error("[SHARE-GPU] Failed to start Petals seeder:", error);
      setStatus('error-seeder');
      setMessage(`Failed to start Petals: ${error.message || error}. Check console for details.`);
      // *** REMOVE these lines from here if they were misplaced ***
      // setStatus('success');
      // setActiveModelId(selectedModel);
      // setMessage(successMessage); // successMessage wouldn't be defined here anyway in case of error
    }

    // *** REMOVE these lines from here ***
    // setStatus('success');
    // setActiveModelId(selectedModel);
    // setMessage(successMessage); // THIS IS LINE 455 - successMessage might not be defined here if an error occurred

  }; // end of handleShare

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
      setActiveModelId(null);
    } else {
      setStatus('error-stop');
      setMessage(`Failed to de-register: ${deregisterResult.message}`);
    }
  };

  const fetchSeederLogs = async () => {
  if (!isTauriEnvironment()) return;
  
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const logs = await invoke('get_petals_seeder_logs');
    setSeederLogs(logs);
    setShowLogs(true);
    console.log('[SEEDER-LOGS]', logs);
  } catch (error) {
    console.error('[SEEDER-LOGS] Failed to fetch logs:', error);
  }
};

  const handleClose = () => {
    if (status !== 'loading-register' && status !== 'loading-seeder' && 
        status !== 'loading-stop' && status !== 'wsl-setup') {
      if (status === 'error-stop') {
        setStatus('success');
      } else if (status !== 'success') {
        // Only reset if not actively sharing
        resetModalState();
      }
      onClose();
    }
  };

  if (!isOpen) return null;

  const isLoading = status === 'loading-register' || status === 'loading-seeder' || 
                    status === 'loading-seeder-verify' || status === 'loading-stop' || status === 'wsl-setup';
  const isSharing = status === 'success' || status === 'error-stop' || 
                    status === 'loading-stop' || status === 'error-seeder' || status === 'loading-seeder-verify';

  // Get selected model info for display
  const selectedModelInfo = supportedModels.find(m => m.id === selectedModel);
  const hostableShards = (selectedModelInfo && gpuVram !== null) 
    ? calculateHostableShards(gpuVram, selectedModelInfo.vramPerShard)
    : null;

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
            {!hasNvidiaGpu && (
              <div style={{
                backgroundColor: '#f8d7da',
                border: '1px solid #f5c6cb',
                borderRadius: '6px',
                padding: '1rem',
                marginBottom: '1rem',
                textAlign: 'left'
              }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#721c24' }}>
                  <AlertTriangle size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                  No NVIDIA GPU Detected
                </h4>
                <p style={{ margin: '0', fontSize: '0.9em', color: '#721c24' }}>
                  Petals requires an NVIDIA GPU for best performance. Your system appears to have {hardwareInfo?.gpu_info?.[0] || 'a non-NVIDIA GPU'}. You can still proceed, but performance will be limited (CPU-only mode).
                </p>
              </div>
            )}
            
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
                To run Petals on Windows, we need to set up a Linux environment (WSL). This is a one-time process that will take 5-10 minutes.
              </p>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85em', color: '#856404', fontStyle: 'italic' }}>
                ⚠️ During setup, you may see terminal windows opening and closing automatically. This is normal - please don't close them manually.
              </p>
              <p style={{ margin: '0', fontSize: '0.85em', color: '#856404' }}>
                The app will download ~3GB of packages. Please ensure you have a stable internet connection.
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
            <p style={{ fontSize: '0.9em', color: '#333', marginBottom: '1rem' }}>{wslSetupProgress.message}</p>
            
            {/* Keep warning visible during entire setup */}
            {wslSetupProgress.stage !== 'complete' && (
              <div style={{
                backgroundColor: '#fff3cd',
                border: '1px solid #ffc107',
                borderRadius: '6px',
                padding: '0.75rem',
                marginBottom: '1rem',
                fontSize: '0.85em',
                textAlign: 'left'
              }}>
                <p style={{ margin: '0 0 0.5rem 0', fontWeight: '500', color: '#856404' }}>
                  ⚠️ Please wait - do not close the app
                </p>
                <p style={{ margin: '0 0 0.3rem 0', color: '#856404' }}>
                  • Terminal windows may open/close automatically - this is normal
                </p>
                <p style={{ margin: '0 0 0.3rem 0', color: '#856404' }}>
                  • Downloading ~3GB of packages
                </p>
                <p style={{ margin: '0', color: '#856404' }}>
                  • Estimated time: 5-10 minutes
                </p>
              </div>
            )}
            
            <div style={{
              width: '100%',
              height: '8px',
              backgroundColor: '#e0e0e0',
              borderRadius: '4px',
              overflow: 'hidden',
              marginTop: '0.5rem'
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

        {/* Idle State - Model Selection */}
        {(status === 'idle' || status === 'wsl-ready' || status === 'error-register') && (!isWindows || wslSetupComplete) && (
          <>
            {/* Info banner about Petals sharding */}
            <div style={{
              backgroundColor: '#e8f4fd',
              border: '1px solid #b3d9f2',
              borderRadius: '6px',
              padding: '0.75rem',
              marginBottom: '1rem',
              fontSize: '0.85em',
              color: '#1565c0'
            }}>
              <strong>How Petals Works:</strong> Large AI models are split into shards distributed across the network. 
              Even GPUs with limited VRAM can contribute by hosting one or more shards.
            </div>

            {status === 'error-register' && (
              <div className="status-display error">
                <AlertTriangle size={20} style={{ marginRight: '8px', flexShrink: 0 }}/>
                <p style={{ margin: 0 }}>{message}</p>
              </div>
            )}

            {/* GPU VRAM Info */}
            {gpuVram !== null && (
              <div style={{
                backgroundColor: '#f0f2f5',
                padding: '0.75rem',
                borderRadius: '6px',
                marginBottom: '1rem',
                fontSize: '0.9em'
              }}>
                <strong>Your GPU:</strong> {gpuVram.toFixed(1)}GB VRAM detected
              </div>
            )}

            <div className="form-group">
              <label htmlFor="model-select">Choose model to host:</label>
              <select
                id="model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={isLoading}
                style={{ marginBottom: '0.5rem' }}
              >
                {supportedModels.map(model => {
                  const canHost = gpuVram !== null 
                    ? calculateHostableShards(gpuVram, model.vramPerShard) > 0
                    : true;
                  
                  return (
                    <option 
                      key={model.id} 
                      value={model.id}
                      disabled={!canHost}
                      style={{
                        backgroundColor: canHost ? '#ffffff' : '#f5f5f5',
                        color: canHost ? '#000000' : '#999999',
                        fontWeight: canHost ? '500' : '400',
                      }}
                    >
                      {canHost ? '✓ ' : '✗ '}
                      {model.name} ({model.totalShards} shards, {model.vramPerShard}GB/shard)
                      {!canHost && ' - Insufficient VRAM'}
                    </option>
                  );
                })}
              </select>

              {/* Shard info for selected model */}
              {selectedModelInfo && (
                <div style={{
                  backgroundColor: '#f8f9fa',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.85em',
                  border: '1px solid #dee2e6'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ marginBottom: '0.5rem' }}>
                        <strong>{selectedModelInfo.name}</strong>
                      </div>
                      <div style={{ color: '#666', marginBottom: '0.25rem' }}>
                        • Total size: {selectedModelInfo.totalModelSize}GB
                      </div>
                      <div style={{ color: '#666', marginBottom: '0.25rem' }}>
                        • Shards: {selectedModelInfo.totalShards} total
                      </div>
                      <div style={{ color: '#666', marginBottom: '0.25rem' }}>
                        • VRAM per shard: {selectedModelInfo.vramPerShard}GB
                      </div>
                      {hostableShards !== null && (
                        <div style={{ 
                          marginTop: '0.5rem', 
                          padding: '0.5rem',
                          backgroundColor: hostableShards > 0 ? '#d4edda' : '#f8d7da',
                          borderRadius: '4px',
                          color: hostableShards > 0 ? '#155724' : '#721c24',
                          fontWeight: '500'
                        }}>
                          {hostableShards > 0 ? (
                            <>✓ Your GPU can host ~{hostableShards} shard{hostableShards !== 1 ? 's' : ''}</>
                          ) : (
                            <>✗ Your GPU cannot host any shard of this model</>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setShowShardInfo(!showShardInfo)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        color: '#1a73e8'
                      }}
                      title="Show more info"
                    >
                      <Info size={18} />
                    </button>
                  </div>

                  {showShardInfo && (
                    <div style={{
                      marginTop: '0.75rem',
                      paddingTop: '0.75rem',
                      borderTop: '1px solid #dee2e6',
                      fontSize: '0.9em',
                      color: '#495057'
                    }}>
                      <p style={{ margin: '0 0 0.5rem 0' }}>{selectedModelInfo.description}</p>
                      {hostableShards !== null && hostableShards > 0 && hostableShards < selectedModelInfo.totalShards && (
                        <p style={{ margin: 0, fontStyle: 'italic' }}>
                          You'll be contributing a partial hosting ({Math.round((hostableShards / selectedModelInfo.totalShards) * 100)}% of model capacity). 
                          The network combines contributions from multiple hosts to serve the full model.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button 
              className="modal-action-btn primary" 
              onClick={handleShare} 
              disabled={isLoading || (hostableShards !== null && hostableShards === 0)}
            >
              {status === 'error-register' ? 'Try Again' : 'Start Sharing'}
            </button>
            <button className="modal-action-btn secondary" onClick={handleClose}>
              Cancel
            </button>
          </>
        )}

        {/* WSL Error */}
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

        {/* Loading States */}
        {(isLoading || status === 'loading-seeder-verify') && status !== 'wsl-setup' && (
          <div className="status-display">
            <Loader size={48} className="spinner" />
            <p style={{ marginTop: '1rem', fontWeight: '600' }}>
              {status === 'loading-register' && 'Registering your GPU...'}
              {status === 'loading-seeder' && 'Starting Petals seeder...'}
              {status === 'loading-seeder-verify' && 'Connecting to Petals network...'}
              {status === 'loading-stop' && 'Stopping seeder...'}
            </p>
            {status === 'loading-seeder-verify' && (
              <p style={{ fontSize: '0.85em', color: '#666', marginTop: '0.5rem' }}>
                This may take 2-5 minutes. The model is downloading and connecting to peers...
              </p>
            )}
          </div>
        )}

        {/* Success/Sharing State */}
        {isSharing && status !== 'loading-stop' && (
          <div className="status-display">
            {status === 'success' && !seederError && <CheckCircle size={48} color="#28a745" />}
            {(status === 'error-stop' || status === 'error-seeder' || seederError) && 
              <AlertTriangle size={48} color="#dc3545" />}
            
            {/* Show seeder error prominently */}
            {seederError && (
              <div style={{
                backgroundColor: '#f8d7da',
                border: '1px solid #f5c6cb',
                borderRadius: '6px',
                padding: '1rem',
                marginTop: '1rem',
                marginBottom: '1rem',
                textAlign: 'left',
                width: '100%'
              }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#721c24' }}>
                  <AlertTriangle size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                  Petals Failed to Start
                </h4>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85em', color: '#721c24' }}>
                  {seederError.includes('device') ? 'The model configuration is incompatible. This may be because:' :
                   seederError.includes('CUDA') || seederError.includes('GPU') ? 'GPU error occurred:' :
                   'An error occurred:'}
                </p>
                <div style={{
                  backgroundColor: '#fff',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.75em',
                  fontFamily: 'monospace',
                  color: '#333',
                  maxHeight: '100px',
                  overflow: 'auto',
                  marginBottom: '0.5rem'
                }}>
                  {seederError}
                </div>
                {!hasNvidiaGpu && (
                  <p style={{ margin: '0', fontSize: '0.85em', color: '#721c24', fontStyle: 'italic' }}>
                    💡 Tip: Petals requires an NVIDIA GPU. Your system has {hardwareInfo?.gpu_info?.[0] || 'a non-NVIDIA GPU'}, which may cause compatibility issues.
                  </p>
                )}
              </div>
            )}
            
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
                fontSize: '0.9em',
                textAlign: 'left'
              }}>
                <p style={{ margin: '0 0 0.5rem 0', color: '#1e8e3e', fontWeight: '500' }}>
                  ✓ Your GPU is contributing to the decentralized AI network
                </p>
                {status === 'success' && (
  <div style={{
    backgroundColor: '#e6f4ea',
    padding: '0.75rem',
    borderRadius: '6px',
    marginTop: '1rem',
    fontSize: '0.9em',
    textAlign: 'left'
  }}>
    <p style={{ margin: '0 0 0.5rem 0', color: '#1e8e3e', fontWeight: '500' }}>
      ✓ Your GPU is contributing to the decentralized AI network
    </p>
    {selectedModelInfo && hostableShards !== null && (
      <p style={{ margin: 0, color: '#1e8e3e', fontSize: '0.95em' }}>
        Hosting capacity: ~{hostableShards} of {selectedModelInfo.totalShards} shards 
        ({Math.round((hostableShards / selectedModelInfo.totalShards) * 100)}%)
      </p>
    )}
    
    {/* *** ADD THIS: Logs button *** */}
    <button
      onClick={fetchSeederLogs}
      style={{
        marginTop: '0.5rem',
        padding: '0.4rem 0.8rem',
        fontSize: '0.85em',
        backgroundColor: '#34a853',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
      }}
    >
      {showLogs ? 'Refresh Logs' : 'View Seeder Logs'}
    </button>
    
    {showLogs && seederLogs.length > 0 && (
      <div style={{
        marginTop: '0.5rem',
        padding: '0.5rem',
        backgroundColor: '#f8f9fa',
        borderRadius: '4px',
        maxHeight: '200px',
        overflow: 'auto',
        fontSize: '0.75em',
        fontFamily: 'monospace',
        color: '#333'
      }}>
        {seederLogs.slice(-20).map((log, idx) => (
          <div key={idx} style={{ marginBottom: '2px' }}>
            {log}
          </div>
        ))}
      </div>
    )}
  </div>
)}
                {selectedModelInfo && hostableShards !== null && (
                  <p style={{ margin: 0, color: '#1e8e3e', fontSize: '0.95em' }}>
                    Hosting capacity: ~{hostableShards} of {selectedModelInfo.totalShards} shards 
                    ({Math.round((hostableShards / selectedModelInfo.totalShards) * 100)}%)
                  </p>
                )}
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
              Close (Keep Sharing)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ShareGpuModal;

