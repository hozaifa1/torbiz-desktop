import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import {
    ChevronLeft, ChevronRight, Share2, ChevronDown,
    MessageSquarePlus, Paperclip, SendHorizontal, Loader, AlertTriangle, StopCircle,
    User, Settings, Network
} from 'lucide-react';

import HardwareInfoDisplay from '../components/HardwareInfoDisplay';
import ShareGpuModal from '../components/ShareGpuModal';
import api from '../services/api';
import { streamInference, createInference } from '../services/inferenceService';
import { runDirectInference, checkPetalsEnvironment } from '../services/directInferenceService';

// --- Placeholder Data ---
const chatHistory = [
  { id: 1, title: 'Brainstorming session' },
  { id: 2, title: 'Python script analysis' },
  { id: 3, title: 'Marketing ideas Q4' },
];
// --- End Placeholder Data ---

function ChatPage() {
  const { user, logout } = useAuth();
  const [isHistoryVisible, setIsHistoryVisible] = useState(true);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  
  // Testing mode - direct Petals inference
  const [isTestingMode, setIsTestingMode] = useState(false);
  const [petalsEnvStatus, setPetalsEnvStatus] = useState({
    ready: false,
    needsSetup: false,
    platform: 'unknown',
    message: 'Checking...'
  });
  const [isSettingUpPetals, setIsSettingUpPetals] = useState(false);
  const [petalsLogs, setPetalsLogs] = useState([]);
  const [showPetalsLogs, setShowPetalsLogs] = useState(false);
  const [showSetupConfirmation, setShowSetupConfirmation] = useState(false);

  // Message and streaming state
  const [messages, setMessages] = useState([]);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [streamError, setStreamError] = useState(null);
  
  // Refs
  const conversationEndRef = useRef(null);
  const abortStreamRef = useRef(null);
  const textareaRef = useRef(null);

  // --- Fetch Models Effect ---
  useEffect(() => {
    const fetchModels = async () => {
      setModelsLoading(true);
      setModelsError(null);
      try {
        // *** FIX: Use the correct endpoint from API documentation ***
        const response = await api.get('/llm_models/all-models/'); // 

        // Map API response to frontend structure
        const fetchedModels = response.data.map(model => ({
            id: model.model_id, // [cite: 420, 427, 434, 441, 448]
            name: model.name, // [cite: 423, 428, 435, 442, 449]
            available: model.is_available, // [cite: 426, 431, 438, 445, 452]
            provider: 'Torbiz Network', // Default provider
            description: model.description || 'No description available', // [cite: 424, 429, 436, 443, 450]
            minGpuMemory: model.min_gpu_memory, // [cite: 425, 430, 437, 444, 451]
        }));

        setModels(fetchedModels);

        // Set default selected model
        const firstAvailable = fetchedModels.find(m => m.available);
        setSelectedModel(firstAvailable || null);

      } catch (error) {
        console.error("Failed to fetch models:", error.response?.data || error.message);
        // Check if it's a 404 error specifically
        if (error.response?.status === 404) {
             setModelsError("Model endpoint not found. Please check API URL configuration.");
        } else {
             setModelsError("Could not load models. Please try again later.");
        }
        setModels([]);
        setSelectedModel(null);
      } finally {
        setModelsLoading(false);
      }
    };

    fetchModels();
  }, []); // Empty dependency array means this runs once on mount

  // Auto-scroll to bottom when new messages arrive or streaming updates
  useEffect(() => {
    if (conversationEndRef.current) {
      conversationEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, currentStreamingMessage]);

  // Don't check environment on mount - only when user clicks Direct Mode button
  // This makes the app start instantly without blocking checks

  // No need to re-check on modal close - check happens when user clicks Direct Mode button

  // Listen for WSL setup progress events
  useEffect(() => {
    let unlisten;
    
    const setupListener = async () => {
      const { listen } = await import('@tauri-apps/api/event');
      
      unlisten = await listen('wsl_setup_progress', (event) => {
        const { stage, message, progress } = event.payload;
        setPetalsLogs(prev => [...prev, `[${progress}%] ${message}`]);
      });
    };
    
    if (isSettingUpPetals) {
      setupListener();
    }
    
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [isSettingUpPetals]);

  // Handle send message
  const handleSendMessage = async () => {
    const trimmedInput = inputValue.trim();
    
    // Validation
    if (!trimmedInput) {
      console.log('[CHAT] Empty input, ignoring send');
      return;
    }

    if (!selectedModel) {
      setStreamError('Please select a model first');
      return;
    }

    if (isStreaming) {
      console.log('[CHAT] Already streaming, ignoring send');
      return;
    }

    // Check if testing mode is enabled but Petals isn't ready
    if (isTestingMode && !petalsEnvStatus.ready) {
      setStreamError('Direct mode requires Petals to be installed. ' + petalsEnvStatus.message);
      return;
    }
    
    // Check if selected model is compatible with Petals (not GGUF)
    if (isTestingMode && selectedModel?.id) {
      if (selectedModel.id.includes('GGUF') || selectedModel.id.includes('gguf')) {
        setStreamError('GGUF models are not compatible with Petals. Please select a different model.');
        return;
      }
    }

    // Only check user ID if NOT in testing mode (backend needs it, direct mode doesn't)
    if (!isTestingMode && !user?.id) {
      setStreamError('User session error. Please log in again.');
      return;
    }

    console.log('[CHAT] Sending message:', { 
      model: selectedModel.id, 
      length: trimmedInput.length,
      mode: isTestingMode ? 'DIRECT' : 'BACKEND'
    });

    // Clear input immediately for better UX
    setInputValue('');
    setStreamError(null);

    // Add user message
    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmedInput,
      timestamp: new Date(),
      model: selectedModel.name,
    };

    setMessages(prev => [...prev, userMessage]);

    // Start streaming
    setIsStreaming(true);
    setCurrentStreamingMessage('');

    try {
      let abortFn;
      
      // Choose between direct inference (testing mode) or backend inference
      if (isTestingMode) {
        console.log('[CHAT] Using DIRECT PETALS INFERENCE (testing mode)');
        
        // Clear old logs and show panel
        setPetalsLogs([]); // Real logs will arrive via events
        setShowPetalsLogs(true);
        
        abortFn = await runDirectInference(
          selectedModel.id,
          trimmedInput,
          // onToken callback
          (token) => {
            setCurrentStreamingMessage(prev => prev + token);
          },
          // onComplete callback
          () => {
            console.log('[CHAT] Direct inference completed');
            handleStreamComplete();
          },
          // onError callback
          (error) => {
            console.error('[CHAT] Direct inference error:', error);
            handleStreamError(error);
          },
          // onLog callback - capture inference logs
          (logMessage) => {
            setPetalsLogs(prev => [...prev, logMessage]);
          }
        );
      } else {
        console.log('[CHAT] Using BACKEND INFERENCE (normal mode)');
        
        // Start streaming inference via backend
        abortFn = await streamInference(
          selectedModel.id,
          trimmedInput,
          user.id,
          // onToken callback
          (token) => {
            setCurrentStreamingMessage(prev => prev + token);
          },
          // onComplete callback
          () => {
            console.log('[CHAT] Stream completed');
            handleStreamComplete();
          },
          // onError callback
          (error) => {
            console.error('[CHAT] Stream error:', error);
            handleStreamError(error);
          }
        );
      }

      // Store abort function
      abortStreamRef.current = abortFn;

    } catch (error) {
      console.error('[CHAT] Failed to start stream:', error);
      handleStreamError(error.message || 'Failed to start inference');
    }
  };

  // Handle stream completion
  const handleStreamComplete = () => {
    console.log('[CHAT] Finalizing streamed message');
    
    const assistantMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: currentStreamingMessage || '(No response)',
      timestamp: new Date(),
      model: selectedModel?.name || 'Unknown',
    };

    setMessages(prev => [...prev, assistantMessage]);
    setCurrentStreamingMessage('');
    setIsStreaming(false);
    abortStreamRef.current = null;
  };

  // Handle stream error
  const handleStreamError = (error) => {
    console.error('[CHAT] Stream error:', error);
    
    // Add error message to conversation
    const errorMessage = {
      id: `error-${Date.now()}`,
      role: 'error',
      content: typeof error === 'string' ? error : 'An error occurred while generating the response.',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, errorMessage]);
    setCurrentStreamingMessage('');
    setIsStreaming(false);
    setStreamError(error);
    abortStreamRef.current = null;
  };

  // Stop streaming
  const handleStopStreaming = () => {
    console.log('[CHAT] Stopping stream...');
    
    if (abortStreamRef.current) {
      abortStreamRef.current();
      
      // Finalize partial message
      if (currentStreamingMessage) {
        const partialMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: currentStreamingMessage + ' (stopped)',
          timestamp: new Date(),
          model: selectedModel?.name || 'Unknown',
        };
        setMessages(prev => [...prev, partialMessage]);
      }
      
      setCurrentStreamingMessage('');
      setIsStreaming(false);
      abortStreamRef.current = null;
    }
  };

  // Handle Direct Mode toggle with automatic setup
  const handleDirectModeToggle = async () => {
    console.log('[DIRECT-MODE-TOGGLE] Clicked!');
    
    // If already ON, just turn OFF
    if (isTestingMode) {
      console.log('[DIRECT-MODE-TOGGLE] Turning OFF');
      setIsTestingMode(false);
      setPetalsEnvStatus({ ready: false, needsSetup: false, platform: 'unknown', message: 'Direct Mode disabled' });
      setPetalsLogs(prev => [...prev, '🔌 Direct Mode disabled']);
      return;
    }
    
    // Trying to turn ON - check environment first (BEFORE opening modal)
    console.log('[DIRECT-MODE-TOGGLE] Checking environment...');
    
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const isPetalsReady = await invoke('check_petals_inference_ready');
      
      if (isPetalsReady) {
        // Ready! Just toggle ON without opening modal
        console.log('[DIRECT-MODE-TOGGLE] Petals ready, enabling Direct Mode');
        setIsTestingMode(true);
        setPetalsEnvStatus({ ready: true, needsSetup: false, platform: 'detected', message: 'Petals ready for inference' });
        setShowPetalsLogs(true);
        setPetalsLogs(['⚡ Direct Mode enabled - ready for inference']);
      } else {
        // Needs setup - NOW open modal
        console.log('[DIRECT-MODE-TOGGLE] Petals not ready, showing setup modal');
        setShowSetupConfirmation(true);
      }
    } catch (error) {
      console.error('[DIRECT-MODE-TOGGLE] Check failed:', error);
      // On error, show modal with setup option
      setShowSetupConfirmation(true);
    }
  };

  // Actually start the setup after confirmation
  const startPetalsSetup = async () => {
    setIsSettingUpPetals(true);
    setPetalsLogs(['🚀 Starting setup process...']);
    
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      
      setPetalsLogs(prev => [...prev, '🔍 Checking WSL installation...']);
      
      // Setup WSL environment for client inference (minimal dependencies)
      await invoke('setup_wsl_environment_client');
      await invoke('mark_wsl_setup_complete');
      
      setPetalsLogs(prev => [...prev, '✅ WSL and Petals installed successfully!']);
      setPetalsLogs(prev => [...prev, '🔍 Verifying installation...']);
      
      // Verify it's ready
      const isPetalsReady = await invoke('check_petals_inference_ready');
      
      if (isPetalsReady) {
        setPetalsLogs(prev => [...prev, '✅ Direct Mode is ready!']);
        setPetalsLogs(prev => [...prev, '⚡ Enabling Direct Mode...']);
        
        // Wait a moment for user to see success
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Enable Direct Mode and close modal - CRITICAL: Set petalsEnvStatus.ready = true
        setIsTestingMode(true);
        setPetalsEnvStatus({ ready: true, needsSetup: false, platform: 'detected', message: 'Petals ready for inference' });
        setShowPetalsLogs(true);
        setShowSetupConfirmation(false);
        setPetalsLogs(['⚡ Direct Mode enabled - ready for inference']);
      } else {
        setPetalsLogs(prev => [...prev, '⚠️ Setup completed but verification failed']);
        setPetalsLogs(prev => [...prev, '💡 Try restarting the app or check the Share GPU button']);
      }
    } catch (error) {
      console.error('[DIRECT-MODE] Setup failed:', error);
      setPetalsLogs(prev => [...prev, `❌ Setup failed: ${error}`]);
      setPetalsLogs(prev => [...prev, '💡 You can also use the Share GPU button to set up WSL']);
    } finally {
      setIsSettingUpPetals(false);
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e) => {
    // Send on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle new chat
  const handleNewChat = () => {
    if (isStreaming) {
      handleStopStreaming();
    }
    setMessages([]);
    setCurrentStreamingMessage('');
    setInputValue('');
    setStreamError(null);
    console.log('[CHAT] Started new conversation');
  };

  // --- Render Model Selector Content ---
   const renderModelSelectorContent = () => {
    if (modelsLoading) {
      return (
        <>
          <Loader size={16} className="spinner" />
          <span>Loading Models...</span>
          <ChevronDown size={16} style={{ color: '#ccc' }} />
        </>
      );
    }
    if (modelsError) {
       return (
         <>
           <AlertTriangle size={16} color="#dc3545"/>
           <span style={{ color: '#dc3545' }}>Error Loading Models</span>
           <ChevronDown size={16} />
         </>
       );
    }
    if (!selectedModel && models.length > 0) {
        // Models loaded, none available or selected
        return (
             <>
               <span>Select a Model</span>
               <ChevronDown size={16} />
             </>
        );
    }
     if (!selectedModel && models.length === 0) {
        // Models loaded, but the list is empty
        return (
            <>
              <span>No Models Available</span>
              <ChevronDown size={16} style={{ color: '#ccc' }} />
            </>
        );
    }
    // Model selected
    return (
        <>
          <span>{selectedModel.name}</span>
          <ChevronDown size={16} />
        </>
    );
  };


  return (
    <div className="chat-container">
      {/* Chat History Sidebar */}
      <aside className={`chat-history-sidebar ${isHistoryVisible ? 'visible' : ''}`}>
        <div className="history-header">
          <h3>Chat History</h3>
          <button className="icon-btn" onClick={() => setIsHistoryVisible(false)} aria-label="Close sidebar">
            <ChevronLeft size={20} />
          </button>
        </div>
        <button className="new-chat-btn" onClick={handleNewChat}>
          <MessageSquarePlus size={16} />
          New Chat
        </button>
        <ul className="history-list">
          {chatHistory.map(chat => (
            <li key={chat.id}>{chat.title}</li>
          ))}
          {chatHistory.length === 0 && (
            <li style={{ color: 'hsl(var(--muted-foreground))', fontStyle: 'italic', cursor: 'default', textAlign: 'center', padding: '2rem 1rem' }}>
              No chats yet. Start a new conversation!
            </li>
          )}
        </ul>
        {/* Hardware Info Display at the bottom */}
        <HardwareInfoDisplay />
      </aside>

      {/* Main Chat Area */}
      <main className="chat-main">
        <header className="chat-header">
          <div className="header-left">
            {/* Toggle Sidebar Button */}
            <button 
              className="icon-btn" 
              onClick={() => setIsHistoryVisible(!isHistoryVisible)}
              aria-label={isHistoryVisible ? 'Close sidebar' : 'Open sidebar'}
            >
              {isHistoryVisible ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
            </button>

            {/* Model Selector */}
            <div className="model-selector">
              <button
                className="model-selector-btn"
                onClick={() => !modelsLoading && !modelsError && models.length > 0 && setIsModelDropdownOpen(!isModelDropdownOpen)}
                disabled={modelsLoading || !!modelsError || models.length === 0}
                aria-haspopup="listbox"
                aria-expanded={isModelDropdownOpen}
              >
                {renderModelSelectorContent()}
              </button>
              {isModelDropdownOpen && !modelsLoading && !modelsError && models.length > 0 && (
                <ul className="model-dropdown" role="listbox">
                  {models.map(model => {
                    const isGGUF = model.id.includes('GGUF') || model.id.includes('gguf');
                    const incompatibleWithDirectMode = isTestingMode && isGGUF;
                    
                    return (
                      <li
                        key={model.id}
                        className={!model.available || incompatibleWithDirectMode ? 'disabled' : ''}
                        title={
                          incompatibleWithDirectMode 
                            ? 'GGUF models not compatible with Direct Mode' 
                            : !model.available 
                              ? 'Model currently unavailable' 
                              : model.description || model.name
                        }
                        onClick={() => {
                          if (model.available && !incompatibleWithDirectMode) {
                            setSelectedModel(model);
                            setIsModelDropdownOpen(false);
                          }
                        }}
                        role="option"
                        aria-selected={selectedModel?.id === model.id}
                      >
                        <span className="model-name">
                          {model.name} 
                          {!model.available && ' (Unavailable)'}
                          {incompatibleWithDirectMode && ' ⚠️ Not compatible with Direct Mode'}
                        </span>
                        <span className="model-provider">{model.provider}</span>
                        {model.minGpuMemory && (
                          <span className="text-muted" style={{ fontSize: '0.8em' }}>
                            Requires {model.minGpuMemory}GB+ VRAM
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Header Actions */}
          <div className="header-actions">
            {/* Direct Mode Toggle - Always available, checks on click */}
            <button 
              className={`gpu-share-btn ${isTestingMode ? 'active' : ''}`}
              onClick={handleDirectModeToggle}
              style={{
                backgroundColor: isTestingMode ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.15)',
                color: isTestingMode ? 'hsl(var(--primary-foreground))' : 'hsl(var(--primary))',
                border: isTestingMode ? 'none' : '1px solid hsl(var(--primary) / 0.3)',
              }}
              title={
                isTestingMode 
                  ? 'Direct Mode Active - Click to disable' 
                  : 'Connect directly to Petals network - Click to enable'
              }
            >
              <span style={{ fontSize: '1.2em' }}>⚡</span>
              <span>
                {isTestingMode ? 'Direct Mode: ON' : 'Direct Mode'}
              </span>
            </button>
            
            <button className="gpu-share-btn" onClick={() => setIsShareModalOpen(true)}>
              <Share2 size={16} />
              <span>Share GPU</span>
            </button>
            
            {/* User Menu Dropdown */}
            <div className="profile-menu" style={{ position: 'relative' }}>
              <button 
                className="icon-btn" 
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                style={{
                  width: '36px',
                  height: '36px',
                  padding: 0,
                  borderRadius: '50%',
                  backgroundColor: user?.profileImageUrl ? 'transparent' : 'hsl(var(--secondary))',
                }}
                aria-label="User menu"
              >
              {user?.profileImageUrl ? (
                <img 
                  src={user.profileImageUrl} 
                  alt={`${user.username}'s profile`}
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      objectFit: 'cover'
                    }}
                />
              ) : (
                  <User size={18} />
                )}
              </button>
              
              {/* Dropdown Menu */}
              {isUserMenuOpen && (
                <>
                  {/* Backdrop to close menu */}
                  <div 
                    style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      zIndex: 40
                    }}
                    onClick={() => setIsUserMenuOpen(false)}
                  />
                  
                  {/* Menu Content */}
                  <div className="model-dropdown" style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    left: 'auto',
                    minWidth: '200px',
                    maxWidth: '240px',
                    zIndex: 50,
                    marginRight: 0
                  }}>
                    <div style={{ padding: '0.5rem', borderBottom: '1px solid hsl(var(--border))', marginBottom: '0.5rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                        {user?.username || 'User'}
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                        {user?.email || 'user@torbiz.com'}
                      </div>
                    </div>
                    
                    <Link to="/profile" onClick={() => setIsUserMenuOpen(false)}>
                      <div style={{
                        padding: '0.75rem 1rem',
                        cursor: 'pointer',
                        borderRadius: 'calc(var(--radius) - 4px)',
                        transition: 'var(--transition-smooth)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.9rem'
                      }}
                      className="dropdown-menu-item">
                        <User size={16} />
                        <span>Profile</span>
                      </div>
                    </Link>
                    
                    <Link to="/settings" onClick={() => setIsUserMenuOpen(false)}>
                      <div style={{
                        padding: '0.75rem 1rem',
                        cursor: 'pointer',
                        borderRadius: 'calc(var(--radius) - 4px)',
                        transition: 'var(--transition-smooth)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.9rem'
                      }}
                      className="dropdown-menu-item">
                        <Settings size={16} />
                        <span>Settings</span>
                      </div>
                    </Link>
                    
                    <div style={{ height: '1px', backgroundColor: 'hsl(var(--border))', margin: '0.5rem 0' }} />
                    
                    <Link to="/network" onClick={() => setIsUserMenuOpen(false)}>
                      <div style={{
                        padding: '0.75rem 1rem',
                        cursor: 'pointer',
                        borderRadius: 'calc(var(--radius) - 4px)',
                        transition: 'var(--transition-smooth)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.9rem'
                      }}
                      className="dropdown-menu-item">
                        <Network size={16} />
                        <span>Network Status</span>
                      </div>
                    </Link>
                    
                    <div style={{ height: '1px', backgroundColor: 'hsl(var(--border))', margin: '0.5rem 0' }} />
                    
                    <div 
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        logout();
                      }}
                      style={{
                        padding: '0.75rem 1rem',
                        cursor: 'pointer',
                        borderRadius: 'calc(var(--radius) - 4px)',
                        transition: 'var(--transition-smooth)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.9rem',
                        color: 'hsl(var(--destructive-foreground))'
                      }}
                      className="dropdown-menu-item"
                    >
                      <span>Logout</span>
                    </div>
                </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Conversation Area */}
        <div className="conversation-area">
          {/* Empty State */}
          {messages.length === 0 && !isStreaming && !modelsLoading && (
            <div className="empty-state">
              <h1>What can I help with?</h1>
              <p className="text-muted">
                Powered by decentralized GPU network · 
                {selectedModel ? ` Using ${selectedModel.name}` : ' Select a model to begin'}
              </p>
              {isTestingMode && petalsEnvStatus.ready && (
                <div className="alert-box info" style={{ maxWidth: '600px', marginTop: '1rem' }}>
                  <p style={{ margin: 0, fontSize: '0.9em', marginBottom: '0.5rem' }}>
                    ⚡ <strong>Direct Petals Mode Active</strong> - Your messages connect directly to the Petals network, 
                    bypassing the backend server.
                  </p>
                  <p style={{ margin: 0, fontSize: '0.85em', opacity: 0.9 }}>
                    ⚠️ <strong>Note:</strong> GGUF models are not compatible. Use models like TinyLlama, Llama-2, or other standard HuggingFace models.
                  </p>
                </div>
              )}
              {isSettingUpPetals && (
                <div className="alert-box info" style={{ maxWidth: '600px', marginTop: '1rem' }}>
                  <h4>🔧 Setting Up Direct Mode...</h4>
                  <p style={{ margin: 0, fontSize: '0.9em' }}>
                    Installing WSL and Petals. This may take a few minutes. 
                    Check the Setup Logs at the bottom for progress.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          {messages.map((msg) => (
            <div key={msg.id} className={`message-wrapper ${msg.role === 'user' ? 'user' : msg.role === 'error' ? 'bot' : 'bot'}`}>
              <div className="message-avatar">
                {msg.role === 'user' ? (
                  <span>{user?.username?.charAt(0).toUpperCase() || 'U'}</span>
                ) : msg.role === 'error' ? (
                  <AlertTriangle size={20} />
                ) : (
                  <img src="/tauri.svg" alt="AI Assistant" />
                )}
              </div>
              <div className={`message ${msg.role === 'user' ? 'user' : msg.role === 'error' ? 'bot' : 'bot'}`}>
                <p style={msg.role === 'error' ? { color: 'hsl(var(--destructive-foreground))' } : {}}>
                  {msg.content}
                </p>
                {msg.role === 'assistant' && msg.model && (
                  <span className="text-muted" style={{ fontSize: '0.75em', display: 'block', marginTop: '0.5rem' }}>
                    {msg.model}
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Streaming Message */}
          {isStreaming && currentStreamingMessage && (
            <div className="message-wrapper bot">
              <div className="message-avatar">
                <img src="/tauri.svg" alt="AI Assistant" />
              </div>
              <div className="message bot">
                <p>
                  {currentStreamingMessage}
                  <span className="streaming-cursor">▊</span>
                </p>
              </div>
            </div>
          )}

          {/* Waiting for first token */}
          {isStreaming && !currentStreamingMessage && (
            <div className="message-wrapper bot">
              <div className="message-avatar">
                <img src="/tauri.svg" alt="AI Assistant" />
              </div>
              <div className="message bot">
                <p>
                  <Loader size={16} className="spinner" style={{ display: 'inline-block', marginRight: '8px' }} />
                  Thinking...
                </p>
              </div>
            </div>
          )}

          {/* Scroll anchor */}
          <div ref={conversationEndRef} />

          {/* Loading State */}
          {modelsLoading && (
            <div className="empty-state">
              <Loader size={32} className="spinner text-primary" />
              <p className="text-muted" style={{ marginTop: '1rem' }}>Loading available models...</p>
            </div>
          )}

          {/* Error State */}
          {!selectedModel && !modelsLoading && modelsError && (
            <div className="empty-state">
              <AlertTriangle size={40} className="text-error" style={{ marginBottom: '1rem' }} />
              <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Failed to Load Models</h2>
              <p className="text-muted">{modelsError}</p>
            </div>
          )}

          {/* No Selection State */}
          {!selectedModel && !modelsLoading && !modelsError && models.length > 0 && conversation.length > 0 && (
            <div className="alert-box info" style={{ margin: '1rem auto', maxWidth: '600px' }}>
              <p>Please select an available model from the dropdown above to start chatting.</p>
            </div>
          )}

          {/* No Models Available State */}
          {!selectedModel && !modelsLoading && !modelsError && models.length === 0 && (
            <div className="empty-state">
              <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>No Models Available</h2>
              <p className="text-muted">
                No AI models are currently available on the network. 
                Please try again later or contribute by sharing your GPU.
              </p>
              <button 
                className="modal-action-btn primary" 
                onClick={() => setIsShareModalOpen(true)}
                style={{ maxWidth: '300px', marginTop: '1.5rem' }}
              >
                <Share2 size={16} />
                Share Your GPU
              </button>
            </div>
          )}
        </div>

        {/* Chat Input Bar */}
        <div className="chat-input-bar">
          <div className="chat-input-container">
            <button className="icon-btn attachment-btn" title="Attach file (coming soon)" disabled>
              <Paperclip size={18} />
            </button>
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                modelsLoading ? 'Loading models...' :
                modelsError ? 'Cannot chat - model loading failed' :
                !selectedModel ? 'Select a model to begin' :
                isStreaming ? 'Generating response...' :
                `Message ${selectedModel.name}...`
              }
              disabled={!selectedModel || modelsLoading || !!modelsError || isStreaming}
              aria-label="Chat message input"
              rows={1}
              style={{
                resize: 'none',
                overflow: 'hidden',
                minHeight: '24px',
                maxHeight: '120px',
              }}
            />
            {isStreaming ? (
              <button
                type="button"
                className="send-btn"
                title="Stop generation"
                onClick={handleStopStreaming}
                aria-label="Stop generation"
                style={{ backgroundColor: 'hsl(var(--destructive))' }}
              >
                <StopCircle size={18} />
              </button>
            ) : (
              <button
                type="submit"
                className="send-btn"
                title="Send message"
                disabled={!selectedModel || modelsLoading || !!modelsError || !inputValue.trim()}
                aria-label="Send message"
                onClick={handleSendMessage}
              >
                <SendHorizontal size={18} />
              </button>
            )}
          </div>
          <div className="chat-input-footer">
            {isTestingMode ? (
              <span style={{ color: 'hsl(var(--primary))' }}>
                ⚡ Direct Petals Mode - Bypassing backend
              </span>
            ) : (
              <>
                Powered by Torbiz distributed network · 
                {models.length > 0 && ` ${models.filter(m => m.available).length} models available`}
              </>
            )}
            {streamError && (
              <span style={{ color: 'hsl(var(--destructive-foreground))', marginLeft: '1rem' }}>
                · {streamError}
              </span>
            )}
            {(isTestingMode || petalsLogs.length > 0) && (
              <button
                onClick={() => setShowPetalsLogs(!showPetalsLogs)}
                style={{
                  marginLeft: '1rem',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                  backgroundColor: 'hsl(var(--secondary))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: 'hsl(var(--foreground))',
                }}
              >
                {showPetalsLogs ? '▼' : '▶'} Petals Logs {petalsLogs.length > 0 && `(${petalsLogs.length})`}
              </button>
            )}
          </div>
        </div>

        {/* Petals Setup/Inference Logs Panel (side panel, compact) */}
        {showPetalsLogs && (
          <div style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '400px',
            maxHeight: '300px',
            backgroundColor: 'hsl(var(--card))',
            border: '2px solid hsl(var(--primary))',
            borderRadius: 'var(--radius)',
            padding: '0.75rem',
            overflowY: 'auto',
            zIndex: 1000,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', position: 'sticky', top: 0, backgroundColor: 'hsl(var(--card))', paddingBottom: '0.5rem', borderBottom: '1px solid hsl(var(--border))' }}>
              <h4 style={{ margin: 0, fontSize: '0.85rem', color: 'hsl(var(--foreground))' }}>
                🔧 Petals Logs
              </h4>
              <button
                onClick={() => setShowPetalsLogs(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.1rem',
                  cursor: 'pointer',
                  color: 'hsl(var(--muted-foreground))',
                  padding: '4px',
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: '0.75rem', lineHeight: '1.4', fontFamily: 'monospace' }}>
              {petalsLogs.length > 0 ? (
                petalsLogs.map((log, index) => (
                  <div key={index} style={{ marginBottom: '4px', wordBreak: 'break-word' }}>
                    {log}
                  </div>
                ))
              ) : (
                <div style={{ color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>
                  Waiting for logs...
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Share GPU Modal */}
      <ShareGpuModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
      />

      {/* Direct Mode Setup Modal - Similar to Share GPU Modal */}
      {showSetupConfirmation && (
        <div className="modal-overlay" onClick={() => !isSettingUpPetals && setShowSetupConfirmation(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '550px' }}>
            {!isSettingUpPetals && (
              <button 
                className="modal-close-btn" 
                onClick={() => {
                  setShowSetupConfirmation(false);
                  setIsSettingUpPetals(false);
                  setPetalsLogs([]);
                }}
                aria-label="Close"
              >
                ✕
              </button>
            )}
            
            <h2 style={{ marginBottom: '1rem' }}>⚡ Direct Petals Mode</h2>
            
            {!isSettingUpPetals ? (
              <>
                <div className="alert-box info" style={{ marginBottom: '1rem' }}>
                  <h4 style={{ margin: 0, marginBottom: '0.5rem' }}>What is Direct Mode?</h4>
                  <p style={{ margin: 0, fontSize: '0.9em' }}>
                    Connect directly to the Petals decentralized network for AI inference, 
                    bypassing the backend server. Perfect for testing!
                  </p>
                </div>
                
                <div className="alert-box warning" style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ margin: 0, marginBottom: '0.5rem' }}>🔧 Requirements</h4>
                  <p style={{ margin: '0.5rem 0' }}>
                    Automatic installation of:
                  </p>
                  <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
                    <li><strong>WSL</strong> (Windows Subsystem for Linux)</li>
                    <li><strong>Petals library</strong> (~3GB download)</li>
                    <li><strong>Additional packages</strong> (peft, accelerate)</li>
                  </ul>
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85em' }}>
                    ⏱️ First-time setup: 5-10 minutes
                  </p>
                </div>
                
                <button 
                  className="modal-action-btn primary"
                  onClick={startPetalsSetup}
                >
                  🚀 Start Setup & Enable Direct Mode
                </button>
                
                <button 
                  className="modal-action-btn secondary"
                  onClick={() => {
                    setShowSetupConfirmation(false);
                    setIsSettingUpPetals(false);
                    setPetalsLogs([]);
                  }}
                  disabled={isSettingUpPetals}
                >
                  {isSettingUpPetals ? 'Please wait...' : 'Cancel'}
                </button>
              </>
            ) : (
              <>
                <div className="alert-box info" style={{ marginBottom: '1rem' }}>
                  <h4 style={{ margin: 0, marginBottom: '0.5rem' }}>🔧 Setting Up...</h4>
                  <p style={{ margin: 0, fontSize: '0.9em' }}>
                    Installing WSL and Petals. This may take several minutes.
                    Please don't close this window.
                  </p>
                </div>
                
                {petalsLogs.length > 0 && (
                  <div className="log-display" style={{ maxHeight: '250px', marginBottom: '1rem' }}>
                    {petalsLogs.map((log, index) => (
                      <div key={index} className="log-line" style={{ marginBottom: '4px' }}>
                        {log}
                      </div>
                    ))}
                  </div>
                )}
                
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  <div className="spinner" style={{ width: '32px', height: '32px', margin: '0 auto' }}>
                    <Loader size={32} className="spinner" />
                  </div>
                  <p style={{ marginTop: '1rem', fontSize: '0.9em', color: 'hsl(var(--muted-foreground))' }}>
                    Setup in progress...
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatPage;