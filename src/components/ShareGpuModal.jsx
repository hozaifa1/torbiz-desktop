// src/components/ShareGpuModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { collectAndSendHardwareInfo, deregisterGpuNode } from '../utils/hardwareService';
import { getHardwareInfo } from '../utils/hardwareService';
import { X, CheckCircle, AlertTriangle, Loader, PowerOff, Download, Info } from 'lucide-react';
import { isTauriEnvironment } from '../utils/tauriHelpers';

// Enhanced model metadata with shard information
// Shard counts based on actual transformer layer counts from model architectures
const supportedModels = [
  // Small models
  { 
    id: 'TinyLlama/TinyLlama-1.1B-Chat-v1.0', 
    name: 'TinyLlama 1.1B Chat', 
    totalShards: 22,
    vramPerShard: 0.07,
    totalModelSize: 1.1,
    description: 'Ultra-lightweight chat model with 22 transformer layers'
  },
  { 
    id: 'google/gemma-2-2b', 
    name: 'Gemma 2 2B', 
    totalShards: 26,
    vramPerShard: 0.12,
    totalModelSize: 2.6,
    description: 'Efficient Google model with 26 transformer layers'
  },
  { 
    id: 'microsoft/phi-3-mini-3.8b', 
    name: 'Phi-3 Mini 3.8B', 
    totalShards: 32,
    vramPerShard: 0.14,
    totalModelSize: 3.8,
    description: 'Efficient small model from Microsoft with 32 layers'
  },
  
  // Medium models (typically 32 layers for 7-8B models)
  { 
    id: 'petals-team/StableBeluga2', 
    name: 'StableBeluga2 7B', 
    totalShards: 32,
    vramPerShard: 0.25,
    totalModelSize: 7.0,
    description: 'Popular 7B parameter model with 32 transformer blocks'
  },
  { 
    id: 'meta-llama/Meta-Llama-3.1-8B', 
    name: 'LLaMA 3.1 8B', 
    totalShards: 32,
    vramPerShard: 0.28,
    totalModelSize: 8.0,
    description: 'Meta\'s efficient 8B model with 32 layers'
  },
  
  // Large models
  { 
    id: 'tiiuae/falcon-40b-instruct', 
    name: 'Falcon 40B Instruct', 
    totalShards: 60,
    vramPerShard: 0.7,
    totalModelSize: 40.0,
    description: 'Large instruction-tuned model with 60 transformer blocks'
  },
  { 
    id: 'meta-llama/Llama-2-70b-chat-hf', 
    name: 'LLaMA 2 70B Chat', 
    totalShards: 80,
    vramPerShard: 0.9,
    totalModelSize: 70.0,
    description: 'Very large chat model with 80 transformer layers'
  },
  { 
    id: 'bigscience/bloom', 
    name: 'BLOOM 176B', 
    totalShards: 70,
    vramPerShard: 2.5,
    totalModelSize: 176.0,
    description: 'Massive multilingual model with 70 transformer blocks'
  },
  
  // Extreme scale models
  { 
    id: 'tiiuae/falcon-180b-chat', 
    name: 'Falcon 180B Chat', 
    totalShards: 80,
    vramPerShard: 2.3,
    totalModelSize: 180.0,
    description: 'One of the largest open models with 80 blocks'
  },
  { 
    id: 'meta-llama/Meta-Llama-3.1-405B', 
    name: 'LLaMA 3.1 405B', 
    totalShards: 126,
    vramPerShard: 3.2,
    totalModelSize: 405.0,
    description: 'Ultra-large distributed model with 126 transformer blocks'
  },
];

// Helper to calculate how many shards a GPU can host
function calculateHostableShards(gpuVramGB, vramPerShard) {
  if (!gpuVramGB || gpuVramGB <= 0) return 0;
  const usableVram = Math.max(0, gpuVramGB - 0.5);
  return Math.floor(usableVram / vramPerShard);
}

// Helper to calculate if a model can be hosted on CPU
function canHostOnCpu(totalRAMGB, model) {
  if (!totalRAMGB || totalRAMGB <= 0) return true; // Default to allowing if RAM unknown
  
  // Leave at least 2GB for system, use 90% of remaining RAM
  const usableRAM = Math.max(0, (totalRAMGB - 2.0) * 0.9);
  
  // Model can be hosted if at least ONE block fits in available RAM
  // This allows CPU to contribute even to large models by hosting a few blocks
  return model.vramPerShard <= usableRAM;
}

// Helper to calculate how many CPU shards can be hosted
function calculateCpuHostableShards(totalRAMGB, model) {
  if (!totalRAMGB || totalRAMGB <= 0) return 0;
  
  // REALISTIC memory allocation matching backend proven configurations
  // Based on actual testing: 10 blocks crashes 8GB system, 5 blocks stable
  
  let reservedForOsApps, petalsOverhead, maxRamForBlocks;
  
  if (totalRAMGB <= 8) {
    // 8GB systems: Very conservative (tested)
    reservedForOsApps = 4.5;  // Windows + apps + browser
    petalsOverhead = 0.5;      // DHT, networking, buffers
    maxRamForBlocks = Math.max(0.5, totalRAMGB - reservedForOsApps - petalsOverhead);
  } else if (totalRAMGB <= 16) {
    // 16GB systems: Balanced
    reservedForOsApps = 5.0;
    petalsOverhead = 1.0;
    maxRamForBlocks = Math.max(1.0, totalRAMGB - reservedForOsApps - petalsOverhead);
  } else {
    // 32GB+ systems: Optimized
    reservedForOsApps = 6.0;
    petalsOverhead = 2.0;
    maxRamForBlocks = Math.max(2.0, totalRAMGB - reservedForOsApps - petalsOverhead);
  }
  
  // REALISTIC block size estimates: float32 + runtime overhead
  // Based on actual memory profiling, not theoretical calculations
  let blockSizeGB;
  const modelName = model.id.toLowerCase();
  
  if (modelName.includes("tinyllama") || modelName.includes("1.1b")) {
    // TinyLlama float32: 2.2GB / 22 = 100MB base + 100MB overhead = 200MB
    blockSizeGB = 0.20;
  } else if (modelName.includes("gemma-2-2b") || modelName.includes("2b")) {
    // Gemma 2B float32: ~5GB / 26 = 190MB base + overhead = 250MB
    blockSizeGB = 0.25;
  } else if (modelName.includes("phi-3") || modelName.includes("3.8b")) {
    // Phi-3 float32: ~7.6GB / 32 = 240MB base + overhead = 300MB
    blockSizeGB = 0.30;
  } else if (model.totalModelSize < 4) {
    // Small models: default 200MB
    blockSizeGB = 0.20;
  } else if (model.totalModelSize < 10) {
    // Medium models: 250MB
    blockSizeGB = 0.25;
  } else {
    // Large models: 300MB
    blockSizeGB = 0.30;
  }
  
  // Calculate blocks
  const hostableShards = Math.floor(maxRamForBlocks / blockSizeGB);
  
  // Hard safety caps based on proven stable configurations:
  // 8GB: max 8 blocks (10 crashes, 5 stable, 8 is safe middle ground)
  // 16GB: max 16 blocks
  // 32GB+: max 30 blocks
  let maxBlocks;
  if (totalRAMGB <= 8) {
    maxBlocks = 8;  // Proven safe through user testing
  } else if (totalRAMGB <= 16) {
    maxBlocks = 16;
  } else {
    maxBlocks = 30;
  }
  
  // Ensure at least 1, don't exceed safety cap or model total
  return Math.max(1, Math.min(hostableShards, maxBlocks, model.totalShards));
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
  const [isMacOS, setIsMacOS] = useState(false);
  const [wslSetupProgress, setWslSetupProgress] = useState({ stage: '', message: '', progress: 0 });
  const [wslSetupComplete, setWslSetupComplete] = useState(false);
  const [macosSetupComplete, setMacosSetupComplete] = useState(false);
  const [gpuVram, setGpuVram] = useState(null);
  const [hardwareInfo, setHardwareInfo] = useState(null);
  const [showShardInfo, setShowShardInfo] = useState(false);
  const [seederLogs, setSeederLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [seederError, setSeederError] = useState(null);
  const [hasNvidiaGpu, setHasNvidiaGpu] = useState(false);
  const [hfToken, setHfToken] = useState(''); // Hugging Face token (optional)
  const [showHfTokenInput, setShowHfTokenInput] = useState(false);
  const logsEndRef = useRef(null);

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
    setHfToken('');
    setShowHfTokenInput(false);
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
            if (model && gpuVram !== null && hasNvidiaGpu) {
              const hostableShards = calculateHostableShards(gpuVram, model.vramPerShard);
              let msg = `Currently sharing ${model.name}`;
              if (hostableShards >= model.totalShards) {
                msg += ` (hosting full model)`;
              } else if (hostableShards === 1) {
                msg += ` (hosting 1 block)`;
              } else {
                msg += ` (hosting ${hostableShards} blocks)`;
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
          setIsMacOS(platformName === 'macos');
        } catch (error) {
          console.error('[PLATFORM] Failed to detect platform:', error);
          const isWindowsFallback = navigator.userAgent.includes('Windows');
          const isMacOSFallback = navigator.userAgent.includes('Mac');
          console.log('[PLATFORM] Fallback detection, Windows:', isWindowsFallback, 'macOS:', isMacOSFallback);
          setIsWindows(isWindowsFallback);
          setIsMacOS(isMacOSFallback);
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

  // Listen for WSL setup progress and Petals events
  useEffect(() => {
    if (!isTauriEnvironment()) return;

    let unlistenProgress, unlistenError, unlistenSuccess, unlistenLog, unlistenPetalsProgress;
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
          
          // Auto-transition to success state
          if (status === 'loading-seeder-verify' || status === 'loading-seeder') {
            setStatus('success');
            setActiveModelId(selectedModel);
            
            const modelInfo = supportedModels.find(m => m.id === selectedModel);
            
            let successMessage = `Successfully sharing ${modelInfo.name}`;
            
            // Only show specific block counts for NVIDIA GPUs with known VRAM
            if (hasNvidiaGpu && gpuVram !== null) {
              const hostableShards = calculateHostableShards(gpuVram, modelInfo.vramPerShard);
              if (hostableShards >= modelInfo.totalShards) {
                successMessage += ` (hosting full model)`;
              } else {
                successMessage += ` (hosting ${hostableShards} blocks)`;
              }
            }
            
            setMessage(successMessage);
          }
        });
        
        // Real-time log streaming
        unlistenLog = await listen('petals_log', (event) => {
          const logLine = event.payload;
          setSeederLogs(prev => {
            const newLogs = [...prev, logLine];
            // Keep last 100 lines
            return newLogs.slice(-100);
          });
          
          // Auto-scroll to bottom
          setTimeout(() => {
            if (logsEndRef.current) {
              logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
            }
          }, 100);
        });
        
        // Petals progress updates
        unlistenPetalsProgress = await listen('petals_progress', (event) => {
          const progress = event.payload;
          console.log('[PETALS-PROGRESS]', progress);
          if (status === 'loading-seeder-verify' || status === 'loading-seeder') {
            setMessage(progress.message || 'Loading...');
          }
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
      if (unlistenLog) unlistenLog();
      if (unlistenPetalsProgress) unlistenPetalsProgress();
    };
  }, [status, selectedModel, gpuVram]);

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

  const handleMacosSetup = async () => {
    if (!isTauriEnvironment()) return;

    setStatus('wsl-setup'); // Reuse the same status for progress display
    setMessage('Setting up macOS environment for Petals...');
    setWslSetupProgress({ stage: 'starting', message: 'Initializing...', progress: 0 });

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      
      const result = await invoke('setup_macos_environment');
      console.log('[MACOS-SETUP] Setup completed:', result);
      
      await invoke('mark_macos_setup_complete');
      setMacosSetupComplete(true);
      
      setStatus('wsl-ready'); // Reuse the same status
      setMessage('macOS environment is ready! You can now start sharing your GPU.');
      
    } catch (error) {
      console.error('[MACOS-SETUP] Setup failed:', error);
      setStatus('wsl-error'); // Reuse the same status
      
      if (error.includes('Homebrew')) {
        setMessage(`Homebrew is required. Please install it from https://brew.sh and try again. Error: ${error}`);
      } else {
        setMessage(`macOS setup failed: ${error}`);
      }
    }
  };

  const handleShare = async () => {
    // Step 1: On Windows, ensure WSL is set up first
    if (isWindows && !wslSetupComplete) {
      await handleWslSetup();
      return;
    }

    // Step 1: On macOS, ensure environment is set up first
    if (isMacOS && !macosSetupComplete) {
      await handleMacosSetup();
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
      setStatus('success');
      setActiveModelId(selectedModel);
      setMessage(
        `GPU registered successfully for ${modelInfo.name}. ` +
        `(Petals seeder only works in desktop app)`
      );
      return;
    }

    setStatus('loading-seeder');
    setMessage('Starting Petals seeder...');

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      
      // Prepare arguments for Petals seeder
      const seederArgs = {
        modelName: selectedModel,
        nodeToken: receivedToken
      };
      
      // Add HuggingFace token if provided
      if (hfToken.trim()) {
        seederArgs.hfToken = hfToken.trim();
        console.log("[SHARE-GPU] Using provided HuggingFace token");
      }
      
      const seederResult = await invoke('start_petals_seeder', seederArgs);

      console.log("[SHARE-GPU] Petals seeder started:", seederResult);
      
      setStatus('loading-seeder-verify');
      setMessage('Waiting for Petals to connect (this may take 2-5 minutes)...');
      setShowLogs(true); // Auto-show logs during loading
      
      // The event listeners will handle the success/error states now
      // Just wait for the process to start and let events drive the UI
      console.log("[SHARE-GPU] Petals seeder started, waiting for events...")

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
    setMessage('Stopping Petals seeder and announcing offline...');

    // Step 1: Stop the Petals process first
    let processStopSuccess = true;
    if (isTauriEnvironment()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const stopResult = await invoke('stop_petals_seeder');
        console.log("[SHARE-GPU] Petals stopped:", stopResult);
        setMessage('Petals stopped. De-registering from network...');
      } catch (error) {
        console.error("[SHARE-GPU] Failed to stop Petals:", error);
        processStopSuccess = false;
        // Continue to try deregistration
      }
    }

    // Step 2: De-register from backend (even if process stop failed)
    const deregisterResult = await deregisterGpuNode(nodeToken);
    
    // Handle results
    if (processStopSuccess && deregisterResult.success) {
      // Perfect - everything worked
      setStatus('idle');
      setMessage('GPU sharing stopped successfully. Node announced offline.');
      setNodeToken(null);
      setActiveModelId(null);
    } else if (processStopSuccess && !deregisterResult.success) {
      // Process stopped but backend deregistration failed (backend bug)
      setStatus('idle'); // Still set to idle since process is stopped
      setMessage('⚠️ Petals stopped, but backend deregistration failed. Your node may still appear active on the network temporarily. It will auto-expire.');
      setNodeToken(null); // Clear token since process is stopped
      setActiveModelId(null);
      console.warn('[SHARE-GPU] Backend deregistration failed (likely backend bug):', deregisterResult.message);
    } else if (!processStopSuccess && deregisterResult.success) {
      // Process failed to stop but backend thinks it's offline
      setStatus('error-stop');
      setMessage('⚠️ Backend updated, but Petals process may still be running. Please restart the app.');
      setNodeToken(null);
      setActiveModelId(null);
    } else {
      // Both failed
      setStatus('error-stop');
      setMessage(`Failed to stop sharing: ${deregisterResult.message}. Please restart the app.`);
      // Don't clear nodeToken - allow retry
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
  
  // Only calculate specific shard counts for NVIDIA GPUs with known VRAM
  // For macOS Metal GPUs and other cases, don't show misleading estimates
  const hostableShards = selectedModelInfo && hasNvidiaGpu && gpuVram !== null
    ? calculateHostableShards(gpuVram, selectedModelInfo.vramPerShard)
    : null;
  
  // For macOS, determine if model can be hosted based on size (without specific block count)
  const canHostOnMac = selectedModelInfo && isMacOS && !hasNvidiaGpu
    ? selectedModelInfo.totalModelSize <= (hardwareInfo?.total_memory || 0) * 0.5 // Can host if model is less than 50% of RAM
    : false;

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

        {/* WSL Setup Required (Windows) */}
        {isWindows && !wslSetupComplete && status === 'idle' && (
          <>
            {!hasNvidiaGpu && (
              <div className="alert-box warning" style={{ textAlign: 'left' }}>
                <h4>
                  <AlertTriangle size={18} />
                  No NVIDIA GPU Detected
                </h4>
                <p>
                  Petals requires an NVIDIA GPU for best performance. Your system appears to have {hardwareInfo?.gpu_info?.[0] || 'a non-NVIDIA GPU'}. You can still proceed, but performance will be limited (CPU-only mode).
                </p>
              </div>
            )}
            
            <div className="alert-box warning" style={{ textAlign: 'left' }}>
              <h4>
                <Download size={18} />
                First-Time Setup Required
              </h4>
              <p style={{ marginBottom: '0.5rem' }}>
                To run Petals on Windows, we need to set up a Linux environment (WSL). This is a one-time process that will take 5-10 minutes.
              </p>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9em', fontStyle: 'italic' }}>
                ⚠️ During setup, you may see terminal windows opening and closing automatically. This is normal - please don't close them manually.
              </p>
              <p style={{ margin: '0', fontSize: '0.9em' }}>
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

        {/* macOS Setup Required */}
        {isMacOS && !macosSetupComplete && status === 'idle' && (
          <>
            <div className="alert-box info" style={{ textAlign: 'left' }}>
              <h4>
                <Download size={18} />
                First-Time Setup Required
              </h4>
              <p style={{ marginBottom: '0.5rem' }}>
                To run Petals on macOS, we need to install Python and Petals library. This is a one-time process that will take 5-10 minutes.
              </p>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9em' }}>
                <strong>Prerequisites:</strong>
              </p>
              <ul style={{ margin: '0 0 0.5rem 1.5rem', fontSize: '0.9em' }}>
                <li>Homebrew must be installed (<a href="https://brew.sh" target="_blank" rel="noopener noreferrer" style={{ color: '#1a73e8' }}>install from brew.sh</a>)</li>
                <li>Stable internet connection</li>
              </ul>
              <p style={{ margin: '0', fontSize: '0.9em', fontStyle: 'italic', color: '#10b981' }}>
                ✨ <strong>Apple Silicon detected:</strong> Petals will automatically use your Metal GPU for acceleration!
              </p>
            </div>
            <button 
              className="modal-action-btn primary" 
              onClick={handleMacosSetup}
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

        {/* Setup in Progress (WSL or macOS) */}
        {status === 'wsl-setup' && (
          <div className="status-display">
            <Loader size={48} className="spinner" />
            <p style={{ fontWeight: '600', marginTop: '1rem', marginBottom: '0.5rem' }}>
              {wslSetupProgress.stage === 'complete' ? 'Setup Complete!' : 'Setting Up Environment...'}
            </p>
            <p style={{ fontSize: '0.9em', color: '#333', marginBottom: '1rem' }}>{wslSetupProgress.message}</p>
            
            {/* Keep warning visible during entire setup */}
            {wslSetupProgress.stage !== 'complete' && (
              <div className="alert-box warning" style={{ fontSize: '0.9em', textAlign: 'left' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontWeight: '500' }}>
                  ⚠️ Please wait - do not close the app
                </p>
                {isWindows && (
                  <>
                    <p style={{ margin: '0 0 0.3rem 0' }}>
                      • Terminal windows may open/close automatically - this is normal
                    </p>
                  </>
                )}
                <p style={{ margin: '0 0 0.3rem 0' }}>
                  • Downloading packages (~3GB)
                </p>
                <p style={{ margin: '0' }}>
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
        {(status === 'idle' || status === 'wsl-ready' || status === 'error-register') && (!isWindows || wslSetupComplete) && (!isMacOS || macosSetupComplete) && (
          <>
            {/* CPU/GPU Warning - Show if no NVIDIA GPU detected (but not on macOS with Metal) */}
            {!hasNvidiaGpu && !isMacOS && (
              <div className="alert-box warning" style={{ textAlign: 'left' }}>
                <h4>
                  <AlertTriangle size={18} />
                  CPU-Only Mode
                </h4>
                <p style={{ marginBottom: '0.5rem' }}>
                  No NVIDIA GPU detected. You'll be running in CPU-only mode with limited performance.
                </p>
                <p style={{ marginBottom: '0.5rem' }}>
                  Your system has: <strong>{hardwareInfo?.gpu_info?.[0] || 'Unknown GPU'}</strong>
                </p>
                <p style={{ marginBottom: '0.5rem', fontSize: '0.9em' }}>
                  {hardwareInfo?.gpu_info?.[0]?.toLowerCase().includes('amd') || hardwareInfo?.gpu_info?.[0]?.toLowerCase().includes('radeon') ? (
                    <>
                      <strong>AMD GPUs are powerful hardware,</strong> but Petals v2.3.0 depends on CUDA (NVIDIA-exclusive). 
                      You can still contribute using your CPU, but with reduced performance.
                    </>
                  ) : (
                    <>You can still contribute to the network using your CPU, though performance will be limited.</>
                  )}
                </p>
                <p style={{ margin: 0, fontSize: '0.9em', fontStyle: 'italic' }}>
                  💡 CPU mode can host lightweight models and still helps the network!
                </p>
              </div>
            )}
            
            {/* macOS Metal GPU Info */}
            {isMacOS && (
              <div className="alert-box success" style={{ textAlign: 'left', backgroundColor: '#d1fae5', border: '2px solid #10b981' }}>
                <h4 style={{ color: '#065f46' }}>
                  ✨ Metal GPU Acceleration
                </h4>
                <p style={{ marginBottom: '0.5rem', color: '#065f46' }}>
                  <strong>Your Mac's GPU will be used automatically!</strong> Petals leverages Metal Performance Shaders for hardware acceleration on Apple Silicon.
                </p>
                <p style={{ margin: 0, fontSize: '0.9em', color: '#047857' }}>
                  Your system: <strong>{hardwareInfo?.gpu_info?.[0] || 'Apple GPU'}</strong>
                </p>
              </div>
            )}

            {/* Info banner about Petals sharding */}
            <div className="alert-box info" style={{ fontSize: '0.9em' }}>
              <strong>How Petals Works:</strong> Large AI models are split into shards distributed across the network. 
              Even {hasNvidiaGpu ? 'GPUs with limited VRAM' : 'CPUs'} can contribute by hosting one or more shards.
            </div>

            {/* Time sync info for WSL users */}
            {isWindows && wslSetupComplete && (
              <div className="alert-box info" style={{ fontSize: '0.85em', marginTop: '0.5rem' }}>
                <p style={{ margin: 0 }}>
                  💡 <strong>Tip:</strong> WSL automatically syncs time when starting. If you get time errors after sleep/hibernate, just restart the app.
                </p>
              </div>
            )}

            {status === 'error-register' && (
              <div className="status-display error">
                <AlertTriangle size={20} style={{ marginRight: '8px', flexShrink: 0 }}/>
                <p style={{ margin: 0 }}>{message}</p>
              </div>
            )}

            {/* GPU VRAM Info - NVIDIA */}
            {hasNvidiaGpu && gpuVram !== null && (
              <div style={{
                backgroundColor: 'hsl(var(--secondary))',
                padding: '0.75rem',
                borderRadius: 'calc(var(--radius) - 2px)',
                marginBottom: '1rem',
                fontSize: '0.9em',
                border: '1px solid hsl(var(--border))'
              }}>
                <strong>Your GPU:</strong> {gpuVram.toFixed(1)}GB VRAM detected
              </div>
            )}
            
            {/* macOS Metal GPU Info */}
            {isMacOS && !hasNvidiaGpu && (
              <div style={{
                backgroundColor: '#d1fae5',
                padding: '0.75rem',
                borderRadius: 'calc(var(--radius) - 2px)',
                marginBottom: '1rem',
                fontSize: '0.9em',
                border: '2px solid #10b981'
              }}>
                <strong style={{ color: '#065f46' }}>✨ Metal GPU Mode:</strong> <span style={{ color: '#047857' }}>Hardware acceleration enabled</span>
              </div>
            )}
            
            {/* CPU Mode Info - Non-macOS only */}
            {!hasNvidiaGpu && !isMacOS && (
              <div style={{
                backgroundColor: 'hsl(var(--secondary))',
                padding: '0.75rem',
                borderRadius: 'calc(var(--radius) - 2px)',
                marginBottom: '1rem',
                fontSize: '0.9em',
                border: '1px solid hsl(var(--border))'
              }}>
                <strong>Compute Mode:</strong> CPU-only (using {hardwareInfo?.total_memory || 'available'}GB RAM)
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
                  // Determine if model can be hosted
                  let canHost;
                  let reason = '';
                  
                  if (hasNvidiaGpu && gpuVram !== null) {
                    // NVIDIA GPU: check actual VRAM capacity
                    canHost = calculateHostableShards(gpuVram, model.vramPerShard) > 0;
                    reason = !canHost ? ' - Insufficient VRAM' : '';
                  } else if (isMacOS && !hasNvidiaGpu) {
                    // macOS Metal GPU: check based on total model size vs RAM
                    const totalRAM = hardwareInfo?.total_memory || 0;
                    canHost = model.totalModelSize <= totalRAM * 0.5; // Conservative: model should be less than 50% of RAM
                    reason = !canHost ? ' - Requires more RAM' : '';
                  } else {
                    // CPU-only or unknown: be permissive
                    canHost = canHostOnCpu(hardwareInfo?.total_memory, model);
                    reason = !canHost ? ' - Too large' : '';
                  }
                  
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
                      {model.name} ({model.totalModelSize}GB model)
                      {reason}
                    </option>
                  );
                })}
              </select>

              {/* Shard info for selected model */}
              {selectedModelInfo && (
                <div style={{
                  backgroundColor: 'hsl(var(--card))',
                  padding: '0.75rem',
                  borderRadius: 'calc(var(--radius) - 2px)',
                  fontSize: '0.85em',
                  border: '1px solid hsl(var(--border))'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ marginBottom: '0.5rem' }}>
                        <strong>{selectedModelInfo.name}</strong>
                      </div>
                      <div className="text-muted" style={{ marginBottom: '0.25rem' }}>
                        • Total size: {selectedModelInfo.totalModelSize}GB
                      </div>
                      <div className="text-muted" style={{ marginBottom: '0.25rem' }}>
                        • Architecture: {selectedModelInfo.totalShards} transformer blocks
                      </div>
                      
                      {/* Show specific block estimates only for NVIDIA GPUs with known VRAM */}
                      {hostableShards !== null ? (
                        <div className={hostableShards > 0 ? 'alert-box success' : 'alert-box error'} 
                             style={{ 
                          marginTop: '0.5rem', 
                          padding: '0.5rem',
                               fontSize: '0.9em',
                          fontWeight: '500'
                        }}>
                          {hostableShards > 0 ? (
                            <>✓ Your GPU can host ~{hostableShards} block{hostableShards !== 1 ? 's' : ''} ({Math.round(hostableShards / selectedModelInfo.totalShards * 100)}% of model)</>
                          ) : (
                            <>✗ Your GPU cannot host this model (needs {selectedModelInfo.vramPerShard}GB+ VRAM per block)</>
                          )}
                        </div>
                      ) : canHostOnMac ? (
                        /* macOS Metal GPU - show general capability without fake numbers */
                        <div className="alert-box success" style={{ marginTop: '0.5rem', padding: '0.5rem', fontSize: '0.9em', fontWeight: '500' }}>
                          ✓ Your Mac can host this model using Metal GPU acceleration
                        </div>
                      ) : isMacOS && !hasNvidiaGpu ? (
                        /* macOS but model too large */
                        <div className="alert-box warning" style={{ marginTop: '0.5rem', padding: '0.5rem', fontSize: '0.9em' }}>
                          ⚠️ This model may require more RAM than available. Petals will auto-adjust.
                        </div>
                      ) : null}
                      
                      {/* Info about Petals auto-detection for non-NVIDIA systems */}
                      {!hasNvidiaGpu && (isMacOS || canHostOnMac) && (
                        <div className="alert-box info" style={{ marginTop: '0.5rem', padding: '0.5rem', fontSize: '0.85em' }}>
                          ℹ️ Petals will automatically determine the optimal number of blocks based on your available memory.
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
                      borderTop: '1px solid hsl(var(--border))',
                      fontSize: '0.9em'
                    }} className="text-muted">
                      <p style={{ margin: '0 0 0.5rem 0' }}>{selectedModelInfo.description}</p>
                      <p style={{ margin: '0.5rem 0', fontStyle: 'italic' }}>
                        Petals distributes model blocks across multiple computers. Each participant hosts a portion, and the network combines them for inference.
                      </p>
                      {hostableShards !== null && hostableShards > 0 && hostableShards < selectedModelInfo.totalShards && (
                        <p style={{ margin: 0, fontStyle: 'italic' }}>
                          Your GPU will contribute approximately {hostableShards} blocks to the network.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Hugging Face Token Input (Optional) */}
            <div className="form-group" style={{ marginTop: '1rem' }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  marginBottom: '0.5rem'
                }}>
                  <label htmlFor="hf-token" style={{ margin: 0 }}>
                    Hugging Face Token <span className="text-muted" style={{ fontSize: '0.85em' }}>(optional)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowHfTokenInput(!showHfTokenInput)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#1a73e8',
                      cursor: 'pointer',
                      fontSize: '0.85em',
                      textDecoration: 'underline',
                      padding: '0'
                    }}
                  >
                    {showHfTokenInput ? 'Hide' : 'Show'}
                  </button>
                </div>
                
                {showHfTokenInput && (
                  <>
                    <input
                      id="hf-token"
                      type="password"
                      value={hfToken}
                      onChange={(e) => setHfToken(e.target.value)}
                      placeholder="hf_xxxxxxxxxxxxxxxxxxxxx"
                      disabled={isLoading}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: 'calc(var(--radius) - 2px)',
                        border: '1px solid hsl(var(--border))',
                        fontSize: '0.9em',
                        fontFamily: 'monospace'
                      }}
                    />
                    <div className="alert-box info" style={{ 
                      fontSize: '0.8em', 
                      marginTop: '0.5rem',
                      textAlign: 'left'
                    }}>
                      <p style={{ margin: 0 }}>
                        <strong>When do you need this?</strong> Some models (like Meta's Llama series) 
                        require authentication. Get your token from{' '}
                        <a 
                          href="https://huggingface.co/settings/tokens" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ color: '#1a73e8', textDecoration: 'underline' }}
                        >
                          HuggingFace Settings
                        </a>.
                      </p>
                    </div>
                  </>
                )}
              </div>

            <button 
              className="modal-action-btn primary" 
              onClick={handleShare} 
              disabled={isLoading || (hostableShards !== null && hostableShards === 0) || (isMacOS && !hasNvidiaGpu && !canHostOnMac)}
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
              {status === 'loading-seeder-verify' && message}
              {status === 'loading-stop' && 'Stopping seeder...'}
            </p>
            {status === 'loading-seeder-verify' && (
              <>
                <p style={{ fontSize: '0.85em', color: 'hsl(var(--muted-foreground))', marginTop: '0.5rem' }}>
                  This may take 2-5 minutes. Watch the logs below for progress.
                </p>
                
                {/* Real-time logs during loading */}
                {seederLogs.length > 0 && (
                  <div className="log-display">
                    {seederLogs.slice(-20).map((log, idx) => {
                      // Color-code logs based on content
                      let logClass = 'log-line';
                      if (log.includes('[INFO]') || log.includes('✓')) logClass += ' info';
                      if (log.includes('[WARN]')) logClass += ' warning';
                      if (log.includes('[ERROR]')) logClass += ' error';
                      if (log.includes('Successfully') || log.includes('Loaded')) logClass += ' success';
                      
                      return (
                        <div key={idx} className={logClass}>
                          {log}
                        </div>
                      );
                    })}
                    <div ref={logsEndRef} />
                  </div>
                )}
                
                {seederLogs.length === 0 && (
                  <p style={{ fontSize: '0.8em', color: 'hsl(var(--muted-foreground))', marginTop: '0.5rem', fontStyle: 'italic' }}>
                    Waiting for logs...
                  </p>
                )}
              </>
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
              <div className="alert-box error" style={{ textAlign: 'left', width: '100%', marginTop: '1rem', marginBottom: '1rem' }}>
                <h4>
                  <AlertTriangle size={18} />
                  Petals Failed to Start
                </h4>
                <p style={{ marginBottom: '0.5rem', fontSize: '0.9em' }}>
                  {seederError.includes('device') ? 'The model configuration is incompatible. This may be because:' :
                   seederError.includes('CUDA') || seederError.includes('GPU') ? 'GPU error occurred:' :
                   'An error occurred:'}
                </p>
                <div style={{
                  backgroundColor: 'hsl(var(--background))',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.75em',
                  fontFamily: 'monospace',
                  color: 'hsl(var(--foreground))',
                  maxHeight: '100px',
                  overflow: 'auto',
                  marginBottom: '0.5rem',
                  border: '1px solid hsl(var(--border))'
                }}>
                  {seederError}
                </div>
                {!hasNvidiaGpu && seederError.toLowerCase().includes('cuda') && (
                  <p style={{ margin: '0', fontSize: '0.9em', fontStyle: 'italic' }}>
                    💡 Note: You're running in CPU mode. Your system has {hardwareInfo?.gpu_info?.[0] || 'a non-NVIDIA GPU'}. Some CUDA-related errors are expected.
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
              <div className="alert-box success" style={{ marginTop: '1rem', fontSize: '0.9em', textAlign: 'left' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontWeight: '500' }}>
                  ✓ Your {isMacOS && !hasNvidiaGpu ? 'Mac' : 'GPU'} is contributing to the decentralized AI network
                </p>
                {selectedModelInfo && hostableShards !== null && (
                  <p style={{ margin: 0, color: '#1e8e3e', fontSize: '0.95em' }}>
                    Hosting approximately {hostableShards} blocks ({Math.round(hostableShards / selectedModelInfo.totalShards * 100)}% of the model)
                  </p>
                )}
                {selectedModelInfo && !hostableShards && canHostOnMac && (
                  <p style={{ margin: 0, color: '#1e8e3e', fontSize: '0.95em' }}>
                    Hosting {selectedModelInfo.name} with Metal GPU acceleration
                  </p>
                )}
                
                {/* Logs button */}
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
                  <div className="log-display">
                    {seederLogs.slice(-30).map((log, idx) => {
                      // Color-code logs based on content
                      let logClass = 'log-line';
                      if (log.includes('[INFO]') || log.includes('✓')) logClass += ' info';
                      if (log.includes('[WARN]')) logClass += ' warning';
                      if (log.includes('[ERROR]')) logClass += ' error';
                      if (log.includes('Successfully') || log.includes('Loaded')) logClass += ' success';
                      
                      return (
                        <div key={idx} className={logClass}>
                          {log}
                        </div>
                      );
                    })}
                    <div ref={logsEndRef} />
                  </div>
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

