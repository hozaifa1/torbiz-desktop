import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import {
    ChevronLeft, ChevronRight, Share2, ChevronDown,
    MessageSquarePlus, Paperclip, SendHorizontal, Loader, AlertTriangle, StopCircle,
    User, Settings, Network, Search, MessageCircle, X, Image as ImageIcon, RefreshCw, Trash2, ArrowLeft
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import HardwareInfoDisplay from '../components/HardwareInfoDisplay';
import ShareGpuModal from '../components/ShareGpuModal';
import api from '../services/api';
import { streamInference, createInference } from '../services/inferenceService';
import { runDirectInference } from '../services/directInferenceService';
import { runLocalInference } from '../services/localInferenceService';
import { streamDeepResearch, getDeepResearchByClient, getDeepResearchById, regenerateDeepResearch, deleteDeepResearch } from '../services/deepResearchService';

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
  
  // Mode toggle - Chat vs Deep Research
  const [appMode, setAppMode] = useState('chat'); // 'chat' or 'research'
  
  // Deep Research state
  const [researchHistory, setResearchHistory] = useState([]);
  const [researchLoading, setResearchLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const imageInputRef = useRef(null);
  const [selectedResearch, setSelectedResearch] = useState(null);
  const [isViewingResearch, setIsViewingResearch] = useState(false);
  
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
  const [isCheckingPetals, setIsCheckingPetals] = useState(false);
  
  // Local inference mode (NEW - bypasses Petals DHT)
  const [isLocalMode, setIsLocalMode] = useState(false);

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
  const streamingMessageRef = useRef(''); // Track accumulated message to avoid stale closure

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

  // Fetch research history when in research mode
  useEffect(() => {
    const fetchResearchHistory = async () => {
      if (appMode === 'research' && user?.userId) {
        setResearchLoading(true);
        try {
          const history = await getDeepResearchByClient(user.userId);
          setResearchHistory(history);
        } catch (error) {
          console.error('[RESEARCH] Failed to fetch history:', error);
        } finally {
          setResearchLoading(false);
        }
      }
    };

    fetchResearchHistory();
  }, [appMode, user?.userId]);

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

  // Handle image file selection
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Remove selected image
  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  // Handle mode switch
  const handleModeSwitch = (newMode) => {
    if (isStreaming) {
      handleStopStreaming();
    }
    setAppMode(newMode);
    setMessages([]);
    setCurrentStreamingMessage('');
    setInputValue('');
    setStreamError(null);
    handleRemoveImage();
    setSelectedResearch(null);
    setIsViewingResearch(false);
    console.log(`[MODE] Switched to ${newMode} mode`);
  };

  // Handle viewing a research item from history
  const handleViewResearch = async (researchId) => {
    try {
      console.log('[RESEARCH] Loading research:', researchId);
      const research = await getDeepResearchById(researchId);
      setSelectedResearch(research);
      setIsViewingResearch(true);
      console.log('[RESEARCH] Loaded successfully');
    } catch (error) {
      console.error('[RESEARCH] Failed to load:', error);
      setStreamError('Failed to load research. Please try again.');
    }
  };

  // Handle going back from viewing research
  const handleBackToResearchList = () => {
    setSelectedResearch(null);
    setIsViewingResearch(false);
    setStreamError(null);
  };

  // Handle regenerating research answer
  const handleRegenerateResearch = async () => {
    if (!selectedResearch) return;

    console.log('[RESEARCH] Regenerating research:', selectedResearch.id);
    setIsStreaming(true);
    setStreamError(null);

    // Update the selected research to clear the answer
    setSelectedResearch(prev => ({ ...prev, answer_text: '' }));

    let accumulatedAnswer = '';

    try {
      const abortFn = await regenerateDeepResearch(
        selectedResearch.id,
        // onToken callback
        (token) => {
          accumulatedAnswer += token;
          setSelectedResearch(prev => ({ ...prev, answer_text: accumulatedAnswer }));
        },
        // onComplete callback
        () => {
          console.log('[RESEARCH] Regeneration completed');
          setIsStreaming(false);
          // Refresh research history
          getDeepResearchByClient(user.userId).then(history => {
            setResearchHistory(history);
          }).catch(err => console.error('[RESEARCH] Failed to refresh history:', err));
        },
        // onError callback
        (error) => {
          console.error('[RESEARCH] Regeneration error:', error);
          setStreamError(error);
          setIsStreaming(false);
        }
      );

      abortStreamRef.current = abortFn;
    } catch (error) {
      console.error('[RESEARCH] Failed to start regeneration:', error);
      setStreamError(error.message || 'Failed to regenerate research');
      setIsStreaming(false);
    }
  };

  // Handle deleting research
  const handleDeleteResearch = async (researchId) => {
    if (!confirm('Are you sure you want to delete this research?')) {
      return;
    }

    try {
      console.log('[RESEARCH] Deleting research:', researchId);
      await deleteDeepResearch(researchId);
      
      // Refresh history
      const history = await getDeepResearchByClient(user.userId);
      setResearchHistory(history);
      
      // If we're viewing the deleted research, go back
      if (selectedResearch?.id === researchId) {
        handleBackToResearchList();
      }
      
      console.log('[RESEARCH] Deleted successfully');
    } catch (error) {
      console.error('[RESEARCH] Failed to delete:', error);
      setStreamError('Failed to delete research. Please try again.');
    }
  };
  // Handle deep research send
  const handleDeepResearchSend = async () => {
    const trimmedInput = inputValue.trim();
    
    if (!trimmedInput) {
      console.log('[RESEARCH] Empty input, ignoring send');
      return;
    }

    if (isStreaming) {
      console.log('[RESEARCH] Already streaming, ignoring send');
      return;
    }

    if (!user?.userId) {
      setStreamError('User session error. Please log in again.');
      return;
    }

    console.log('[RESEARCH] Starting deep research:', { 
      question: trimmedInput.substring(0, 50) + '...', 
      hasImage: !!selectedImage 
    });

    // Clear input immediately
    setInputValue('');
    setStreamError(null);

    // Add user message with optional image
    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmedInput,
      timestamp: new Date(),
      image: imagePreview || null,
    };

    setMessages(prev => [...prev, userMessage]);

    // Start streaming
    setIsStreaming(true);
    setCurrentStreamingMessage('');
    streamingMessageRef.current = '';

    try {
      const abortFn = await streamDeepResearch(
        user.userId,
        trimmedInput,
        selectedImage,
        // onToken callback
        (token) => {
          streamingMessageRef.current += token;
          setCurrentStreamingMessage(prev => prev + token);
        },
        // onComplete callback
        () => {
          console.log('[RESEARCH] Stream completed');
          handleStreamComplete();
          // Refresh research history
          getDeepResearchByClient(user.userId).then(history => {
            setResearchHistory(history);
          }).catch(err => console.error('[RESEARCH] Failed to refresh history:', err));
        },
        // onError callback
        (error) => {
          console.error('[RESEARCH] Stream error:', error);
          handleStreamError(error);
        }
      );

      abortStreamRef.current = abortFn;
    } catch (error) {
      console.error('[RESEARCH] Failed to start stream:', error);
      handleStreamError(error.message || 'Failed to start deep research');
    } finally {
      // Clear image after sending
      handleRemoveImage();
    }
  };

  // Main send handler - routes to appropriate function based on mode
  const handleUnifiedSend = () => {
    if (appMode === 'research') {
      handleDeepResearchSend();
    } else {
      handleSendMessage();
    }
  };

  // Handle send message (for regular chat)
  const handleSendMessage = async () => {
    const trimmedInput = inputValue.trim();
    
    // Validation
    if (!trimmedInput) {
      console.log('[CHAT] Empty input, ignoring send');
      return;
    }

    if (!selectedModel && appMode === 'chat') {
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

    // Only check user ID if NOT in testing or local mode (backend needs it, direct modes don't)
    if (!isTestingMode && !isLocalMode && !user?.userId) {
      setStreamError('User session error. Please log in again.');
      return;
    }

    console.log('[CHAT] Sending message:', { 
      model: selectedModel.id, 
      length: trimmedInput.length,
      mode: isLocalMode ? 'LOCAL' : (isTestingMode ? 'DIRECT-PETALS' : 'BACKEND')
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
    streamingMessageRef.current = ''; // Clear the ref for new stream

    try {
      let abortFn;
      
      // Choose between local inference, direct Petals inference, or backend inference
      if (isLocalMode) {
        console.log('[CHAT] Using LOCAL INFERENCE (bypass Petals, use HuggingFace directly)');
        
        // Clear old logs and show panel
        setPetalsLogs([]); // Real logs will arrive via events
        setShowPetalsLogs(true);
        
        // Prepare conversation history for context
        const conversationHistory = messages.map(msg => ({
          role: msg.role,
          content: msg.content
        }));
        
        abortFn = await runLocalInference(
          selectedModel.id,
          trimmedInput,
          conversationHistory,
          // onToken callback
          (token) => {
            streamingMessageRef.current += token; // Update ref
            setCurrentStreamingMessage(prev => prev + token); // Update state for UI
          },
          // onComplete callback
          () => {
            console.log('[CHAT] Local inference completed');
            handleStreamComplete();
          },
          // onError callback
          (error) => {
            console.error('[CHAT] Local inference error:', error);
            handleStreamError(error);
          },
          // onLog callback - capture inference logs
          (logMessage) => {
            setPetalsLogs(prev => [...prev, logMessage]);
          }
        );
      } else if (isTestingMode) {
        console.log('[CHAT] Using DIRECT PETALS INFERENCE (testing mode)');
        
        // Clear old logs and show panel
        setPetalsLogs([]); // Real logs will arrive via events
        setShowPetalsLogs(true);
        
        // Prepare conversation history for context
        const conversationHistory = messages.map(msg => ({
          role: msg.role,
          content: msg.content
        }));
        
        abortFn = await runDirectInference(
          selectedModel.id,
          trimmedInput,
          conversationHistory,
          // onToken callback
          (token) => {
            streamingMessageRef.current += token; // Update ref
            setCurrentStreamingMessage(prev => prev + token); // Update state for UI
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
          user.userId,
          // onToken callback
          (token) => {
            streamingMessageRef.current += token; // Update ref
            setCurrentStreamingMessage(prev => prev + token); // Update state for UI
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
    
    // Use ref value instead of state to avoid stale closure
    const finalContent = streamingMessageRef.current || '(No response)';
    console.log('[CHAT] Final message length:', finalContent.length);
    
    const assistantMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: finalContent,
      timestamp: new Date(),
      model: selectedModel?.name || 'Unknown',
    };

    setMessages(prev => [...prev, assistantMessage]);
    setCurrentStreamingMessage('');
    streamingMessageRef.current = ''; // Clear the ref
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
    streamingMessageRef.current = ''; // Clear the ref
    setIsStreaming(false);
    setStreamError(error);
    abortStreamRef.current = null;
  };

  // Stop streaming
  const handleStopStreaming = () => {
    console.log('[CHAT] Stopping stream...');
    
    if (abortStreamRef.current) {
      abortStreamRef.current();
      
      // Finalize partial message using ref to avoid stale closure
      const partialContent = streamingMessageRef.current;
      if (partialContent) {
        const partialMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: partialContent + ' (stopped)',
          timestamp: new Date(),
          model: selectedModel?.name || 'Unknown',
        };
        setMessages(prev => [...prev, partialMessage]);
      }
      
      setCurrentStreamingMessage('');
      streamingMessageRef.current = ''; // Clear the ref
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
      setPetalsLogs(prev => [...prev, '?? Direct Mode disabled']);
      return;
    }
    
    // IMMEDIATE FEEDBACK - Set loading state before async check
    setIsCheckingPetals(true);
    setPetalsLogs(['?? Checking Petals environment...']);
    setShowPetalsLogs(true); // Show logs panel immediately
    
    console.log('[DIRECT-MODE-TOGGLE] Checking environment...');
    
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const isPetalsReady = await invoke('check_petals_inference_ready');
      
      if (isPetalsReady) {
        // Ready! Enable Direct Mode
        console.log('[DIRECT-MODE-TOGGLE] Petals ready, enabling Direct Mode');
        setIsTestingMode(true);
        setPetalsEnvStatus({ ready: true, needsSetup: false, platform: 'detected', message: 'Petals ready for inference' });
        setPetalsLogs(['? Environment verified', '? Direct Mode enabled - ready for inference']);
      } else {
        // Needs setup - open modal
        console.log('[DIRECT-MODE-TOGGLE] Petals not ready, showing setup modal');
        setPetalsLogs(prev => [...prev, '?? Petals not installed', '?? Setup required']);
        setShowSetupConfirmation(true);
      }
    } catch (error) {
      console.error('[DIRECT-MODE-TOGGLE] Check failed:', error);
      setPetalsLogs(prev => [...prev, `? Check failed: ${error.message}`, '?? Setup may be required']);
      setShowSetupConfirmation(true);
    } finally {
      // Clear loading state
      setIsCheckingPetals(false);
    }
  };

  // Actually start the setup after confirmation
  const startPetalsSetup = async () => {
    setIsSettingUpPetals(true);
    setPetalsLogs(['?? Starting setup process...']);
    
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      
      // Detect platform
      const isMac = navigator.userAgent.includes('Mac');
      const isWin = navigator.userAgent.includes('Windows');
      
      if (isMac) {
        setPetalsLogs(prev => [...prev, '?? Detected macOS - setting up native environment...']);
        
        // Setup macOS environment
        await invoke('setup_macos_environment');
        await invoke('mark_macos_setup_complete');
      } else if (isWin) {
        setPetalsLogs(prev => [...prev, '?? Checking WSL installation...']);
        
        // Setup WSL environment for client inference (minimal dependencies)
        await invoke('setup_wsl_environment_client');
        await invoke('mark_wsl_setup_complete');
      } else {
        setPetalsLogs(prev => [...prev, '?? Detected Linux - setting up environment...']);
        // For Linux, we assume Python and pip are already available
        setPetalsLogs(prev => [...prev, '?? On Linux, please install Petals manually: pip install git+https://github.com/bigscience-workshop/petals']);
        throw new Error('Linux setup not yet automated. Please install Petals manually.');
      }
      
      setPetalsLogs(prev => [...prev, '? Environment and Petals installed successfully!']);
      setPetalsLogs(prev => [...prev, '?? Verifying installation...']);
      
      // Verify it's ready
      const isPetalsReady = await invoke('check_petals_inference_ready');
      
      if (isPetalsReady) {
        setPetalsLogs(prev => [...prev, '? Direct Mode is ready!']);
        setPetalsLogs(prev => [...prev, '? Enabling Direct Mode...']);
        
        // Wait a moment for user to see success
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Enable Direct Mode and close modal - CRITICAL: Set petalsEnvStatus.ready = true
        setIsTestingMode(true);
        setPetalsEnvStatus({ ready: true, needsSetup: false, platform: 'detected', message: 'Petals ready for inference' });
        setShowPetalsLogs(true);
        setShowSetupConfirmation(false);
        setPetalsLogs(['? Direct Mode enabled - ready for inference']);
      } else {
        setPetalsLogs(prev => [...prev, '?? Setup completed but verification failed']);
        setPetalsLogs(prev => [...prev, '?? Try restarting the app or check the Share GPU button']);
      }
    } catch (error) {
      console.error('[DIRECT-MODE] Setup failed:', error);
      setPetalsLogs(prev => [...prev, `? Setup failed: ${error}`]);
      setPetalsLogs(prev => [...prev, '?? You can also use the Share GPU button to set up the environment']);
    } finally {
      setIsSettingUpPetals(false);
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e) => {
    // Send on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleUnifiedSend();
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
    handleRemoveImage();
    setSelectedResearch(null);
    setIsViewingResearch(false);
    console.log(`[${appMode.toUpperCase()}] Started new conversation`);
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
          <h3>{appMode === 'research' ? 'Research History' : 'Chat History'}</h3>
          <button className="icon-btn" onClick={() => setIsHistoryVisible(false)} aria-label="Close sidebar">
            <ChevronLeft size={20} />
          </button>
        </div>
        <button className="new-chat-btn" onClick={handleNewChat}>
          <MessageSquarePlus size={16} />
          {appMode === 'research' ? 'New Research' : 'New Chat'}
        </button>
        <ul className="history-list">
          {appMode === 'research' ? (
            <>
              {researchLoading ? (
                <li style={{ color: 'hsl(var(--muted-foreground))', textAlign: 'center', padding: '1rem' }}>
                  <Loader size={20} className="spinner" style={{ display: 'inline-block' }} />
                </li>
              ) : researchHistory.length > 0 ? (
                researchHistory.map(research => (
                  <li 
                    key={research.id} 
                    style={{ 
                      cursor: 'pointer', 
                      fontSize: '0.9em',
                      backgroundColor: selectedResearch?.id === research.id ? 'hsl(var(--accent))' : 'transparent',
                      padding: '0.75rem',
                      margin: '0.25rem 0',
                      borderRadius: 'var(--radius)',
                      transition: 'var(--transition-smooth)',
                      position: 'relative'
                    }}
                    title={research.question_text}
                    onClick={() => handleViewResearch(research.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        {research.question_text.length > 50 
                          ? research.question_text.substring(0, 50) + '...' 
                          : research.question_text}
                        <div style={{ fontSize: '0.75em', color: 'hsl(var(--muted-foreground))', marginTop: '0.25rem' }}>
                          {new Date(research.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteResearch(research.id);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '0.25rem',
                          color: 'hsl(var(--muted-foreground))',
                          transition: 'var(--transition-smooth)',
                        }}
                        title="Delete research"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                ))
              ) : (
                <li style={{ color: 'hsl(var(--muted-foreground))', fontStyle: 'italic', cursor: 'default', textAlign: 'center', padding: '2rem 1rem' }}>
                  No research history yet. Ask your first question!
                </li>
              )}
            </>
          ) : (
            <>
              {chatHistory.map(chat => (
                <li key={chat.id}>{chat.title}</li>
              ))}
              {chatHistory.length === 0 && (
                <li style={{ color: 'hsl(var(--muted-foreground))', fontStyle: 'italic', cursor: 'default', textAlign: 'center', padding: '2rem 1rem' }}>
                  No chats yet. Start a new conversation!
                </li>
              )}
            </>
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

            {/* Mode Toggle */}
            <div style={{ display: 'flex', gap: '0.5rem', marginRight: '1rem', borderRight: '1px solid hsl(var(--border))', paddingRight: '1rem' }}>
              <button
                className={`mode-toggle-btn ${appMode === 'chat' ? 'active' : ''}`}
                onClick={() => handleModeSwitch('chat')}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: 'var(--radius)',
                  backgroundColor: appMode === 'chat' ? 'hsl(var(--primary))' : 'hsl(var(--secondary))',
                  color: appMode === 'chat' ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.9rem',
                  fontWeight: appMode === 'chat' ? 600 : 400,
                }}
              >
                <MessageCircle size={16} />
                <span>Chat</span>
              </button>
              <button
                className={`mode-toggle-btn ${appMode === 'research' ? 'active' : ''}`}
                onClick={() => handleModeSwitch('research')}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: 'var(--radius)',
                  backgroundColor: appMode === 'research' ? 'hsl(var(--primary))' : 'hsl(var(--secondary))',
                  color: appMode === 'research' ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.9rem',
                  fontWeight: appMode === 'research' ? 600 : 400,
                }}
              >
                <Search size={16} />
                <span>Deep Research</span>
              </button>
            </div>

            {/* Model Selector - Only show in chat mode */}
            {appMode === 'chat' && (
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
                          {incompatibleWithDirectMode && ' ?? Not compatible with Direct Mode'}
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
            )}
          </div>

          {/* Header Actions */}
          <div className="header-actions">
            {/* Local Mode Toggle - NEW: Uses HuggingFace transformers directly */}
            <button 
              className={`gpu-share-btn ${isLocalMode ? 'active' : ''}`}
              onClick={() => {
                // Turn off other modes
                if (!isLocalMode) {
                  setIsTestingMode(false);
                  setPetalsLogs(['?? Local Mode - Using HuggingFace transformers directly']);
                  setShowPetalsLogs(true);
                }
                setIsLocalMode(!isLocalMode);
              }}
              style={{
                backgroundColor: isLocalMode ? '#10b981' : 'hsl(var(--secondary))',
                color: isLocalMode ? 'white' : 'hsl(var(--foreground))',
                border: isLocalMode ? 'none' : '1px solid hsl(var(--border))',
              }}
              title={
                isLocalMode 
                  ? 'Local Mode Active - Bypasses Petals, uses local HuggingFace model' 
                  : 'Enable Local Mode (TEST) - Uses TinyLlama directly, bypasses Petals DHT'
              }
            >
              <span style={{ fontSize: '1.2em' }}>💻</span>
              <span>
                {isLocalMode ? 'Local Mode: ON' : 'Local Mode (TEST)'}
              </span>
            </button>
            
            {/* Direct Mode Toggle - Always available, checks on click */}
            <button 
              className={`gpu-share-btn ${isTestingMode ? 'active' : ''}`}
              onClick={handleDirectModeToggle}
              disabled={isCheckingPetals || isLocalMode}
              style={{
                backgroundColor: isTestingMode ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.15)',
                color: isTestingMode ? 'hsl(var(--primary-foreground))' : 'hsl(var(--primary))',
                border: isTestingMode ? 'none' : '1px solid hsl(var(--primary) / 0.3)',
                opacity: (isCheckingPetals || isLocalMode) ? 0.5 : 1,
                cursor: (isCheckingPetals || isLocalMode) ? 'not-allowed' : 'pointer',
              }}
              title={
                isLocalMode
                  ? 'Direct Mode disabled (Local Mode active)'
                  : isCheckingPetals
                    ? 'Checking environment...'
                    : isTestingMode 
                      ? 'Direct Mode Active - Click to disable' 
                      : 'Connect directly to Petals network - Click to enable'
              }
            >
              {isCheckingPetals ? (
                <>
                  <Loader size={16} className="spinner" />
                  <span>Checking...</span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: '1.2em' }}>?</span>
                  <span>
                    {isTestingMode ? 'Direct Mode: ON' : 'Direct Mode'}
                  </span>
                </>
              )}
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
          {/* Research View Mode */}
          {appMode === 'research' && isViewingResearch && selectedResearch ? (
            <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
              {/* Back button */}
              <button
                onClick={handleBackToResearchList}
                className="research-view-back-btn"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  marginBottom: '1.5rem',
                  backgroundColor: 'hsl(var(--secondary))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                  color: 'hsl(var(--foreground))',
                  fontSize: '0.9rem',
                  transition: 'var(--transition-smooth)',
                }}
              >
                <ArrowLeft size={16} />
                Back to Research List
              </button>

              {/* Research Question */}
              <div className="research-question-card" style={{
                padding: '1.5rem',
                backgroundColor: 'hsl(var(--card))',
                border: '2px solid hsl(var(--primary))',
                borderRadius: 'var(--radius)',
                marginBottom: '1.5rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'hsl(var(--primary))' }}>
                    🔍 Research Question
                  </h2>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={handleRegenerateResearch}
                      disabled={isStreaming}
                      className="research-regenerate-btn"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        backgroundColor: isStreaming ? 'hsl(var(--secondary))' : 'hsl(var(--primary))',
                        color: isStreaming ? 'hsl(var(--muted-foreground))' : 'hsl(var(--primary-foreground))',
                        border: 'none',
                        borderRadius: 'var(--radius)',
                        cursor: isStreaming ? 'not-allowed' : 'pointer',
                        fontSize: '0.85rem',
                        transition: 'var(--transition-smooth)',
                      }}
                      title="Regenerate answer"
                    >
                      <RefreshCw size={14} className={isStreaming ? 'spinner' : ''} />
                      {isStreaming ? 'Regenerating...' : 'Regenerate'}
                    </button>
                  </div>
                </div>
                <p style={{ 
                  margin: 0, 
                  fontSize: '1.1rem', 
                  lineHeight: 1.6,
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word'
                }}>
                  {selectedResearch.question_text}
                </p>
                {selectedResearch.image && (
                  <img 
                    src={selectedResearch.image} 
                    alt="Research context" 
                    style={{ 
                      maxWidth: '400px', 
                      maxHeight: '400px', 
                      borderRadius: '8px', 
                      marginTop: '1rem',
                      border: '1px solid hsl(var(--border))'
                    }} 
                  />
                )}
                <div style={{ 
                  fontSize: '0.8rem', 
                  color: 'hsl(var(--muted-foreground))', 
                  marginTop: '1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span>Asked on {new Date(selectedResearch.created_at).toLocaleString()}</span>
                </div>
              </div>

              {/* Research Answer */}
              <div className="research-answer-card" style={{
                padding: '1.5rem',
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius)',
                minHeight: '300px',
              }}>
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: 'hsl(var(--foreground))' }}>
                  🤖 AI Research Answer
                </h3>
                {isStreaming ? (
                  <div className="markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {selectedResearch.answer_text || ''}
                    </ReactMarkdown>
                    <span className="streaming-cursor">?</span>
                  </div>
                ) : selectedResearch.answer_text ? (
                  <div className="markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {selectedResearch.answer_text}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'hsl(var(--muted-foreground))' }}>
                    <Loader size={24} className="spinner" style={{ display: 'inline-block', marginBottom: '1rem' }} />
                    <p>No answer available yet. Click "Regenerate" to generate an answer.</p>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Empty State */}
          {messages.length === 0 && !isStreaming && !modelsLoading && !isViewingResearch && (
            <div className="empty-state">
              {appMode === 'research' ? (
                <>
                  <h1>🔍 Deep Research</h1>
                  <p className="text-muted">
                    Ask complex questions and get comprehensive, AI-powered research answers.
                    <br />
                    You can even upload images for visual context!
                  </p>
                </>
              ) : (
                <>
                  <h1>What can I help with?</h1>
                  <p className="text-muted">
                    Powered by decentralized GPU network 🌐
                    {selectedModel ? ` Using ${selectedModel.name}` : ' Select a model to begin'}
                  </p>
                </>
              )}
              {isLocalMode && appMode === 'chat' && (
                <div className="alert-box info" style={{ maxWidth: '600px', marginTop: '1rem', backgroundColor: '#d1fae5', border: '2px solid #10b981' }}>
                  <p style={{ margin: 0, fontSize: '0.9em', marginBottom: '0.5rem' }}>
                    💻 <strong>Local Mode Active (TEST)</strong> - Using TinyLlama directly via HuggingFace transformers.
                    Bypasses Petals DHT entirely. First inference may take time as model downloads.
                  </p>
                  <p style={{ margin: 0, fontSize: '0.85em', opacity: 0.9 }}>
                    ?? <strong>Context Support:</strong> Conversation history is sent with each message for better coherence.
                  </p>
                </div>
              )}
              {isTestingMode && petalsEnvStatus.ready && (
                <div className="alert-box info" style={{ maxWidth: '600px', marginTop: '1rem' }}>
                  <p style={{ margin: 0, fontSize: '0.9em', marginBottom: '0.5rem' }}>
                    ? <strong>Direct Petals Mode Active</strong> - Your messages connect directly to the Petals network, 
                    bypassing the backend server.
                  </p>
                  <p style={{ margin: 0, fontSize: '0.85em', opacity: 0.9, marginBottom: '0.5rem' }}>
                    ?? <strong>Context Support:</strong> Conversation history is included for coherent multi-turn conversations.
                  </p>
                  <p style={{ margin: 0, fontSize: '0.85em', opacity: 0.9 }}>
                    ℹ️ <strong>Note:</strong> GGUF models are not compatible. Use models like TinyLlama, Llama-2, or other standard HuggingFace models.
                  </p>
                </div>
              )}
              {isSettingUpPetals && (
                <div className="alert-box info" style={{ maxWidth: '600px', marginTop: '1rem' }}>
                  <h4>⚙️ Setting Up Direct Mode...</h4>
                  <p style={{ margin: 0, fontSize: '0.9em' }}>
                    Installing WSL and Petals. This may take a few minutes. 
                    Check the Setup Logs at the bottom for progress.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          {!isViewingResearch && messages.map((msg) => (
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
                {msg.image && (
                  <img 
                    src={msg.image} 
                    alt="User uploaded" 
                    style={{ 
                      maxWidth: '300px', 
                      maxHeight: '300px', 
                      borderRadius: '8px', 
                      marginBottom: '0.5rem',
                      border: '1px solid hsl(var(--border))'
                    }} 
                  />
                )}
                {msg.role === 'assistant' ? (
                  <div className="markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p style={{...(msg.role === 'error' ? { color: 'hsl(var(--destructive-foreground))' } : {}),
                    // ADD these styles to enforce wrapping for long strings:
                    wordBreak: 'break-word', 
                    overflowWrap: 'break-word' 
                  }}>
                    {msg.content}
                  </p>
                )}
                {msg.role === 'assistant' && msg.model && (
                  <span className="text-muted" style={{ fontSize: '0.75em', display: 'block', marginTop: '0.5rem' }}>
                    {msg.model}
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Streaming Message */}
          {!isViewingResearch && isStreaming && currentStreamingMessage && (
            <div className="message-wrapper bot">
              <div className="message-avatar">
                <img src="/tauri.svg" alt="AI Assistant" />
              </div>
              <div className="message bot">
                <div className="markdown-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {currentStreamingMessage}
                  </ReactMarkdown>
                  <span className="streaming-cursor">?</span>
                </div>
              </div>
            </div>
          )}

          {/* Waiting for first token */}
          {!isViewingResearch && isStreaming && !currentStreamingMessage && (
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
          {!isViewingResearch && modelsLoading && (
            <div className="empty-state">
              <Loader size={32} className="spinner text-primary" />
              <p className="text-muted" style={{ marginTop: '1rem' }}>Loading available models...</p>
            </div>
          )}

          {/* Error State */}
          {!isViewingResearch && !selectedModel && !modelsLoading && modelsError && (
            <div className="empty-state">
              <AlertTriangle size={40} className="text-error" style={{ marginBottom: '1rem' }} />
              <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Failed to Load Models</h2>
              <p className="text-muted">{modelsError}</p>
            </div>
          )}

          {/* No Selection State */}
          {!isViewingResearch && !selectedModel && !modelsLoading && !modelsError && models.length > 0 && messages.length > 0 && (
            <div className="alert-box info" style={{ margin: '1rem auto', maxWidth: '600px' }}>
              <p>Please select an available model from the dropdown above to start chatting.</p>
            </div>
          )}

          {/* No Models Available State */}
          {!isViewingResearch && !selectedModel && !modelsLoading && !modelsError && models.length === 0 && (
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
          {/* Image Preview */}
          {imagePreview && appMode === 'research' && (
            <div style={{ 
              padding: '0.5rem 1rem', 
              borderTop: '1px solid hsl(var(--border))',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              backgroundColor: 'hsl(var(--card))'
            }}>
              <img 
                src={imagePreview} 
                alt="Preview" 
                style={{ 
                  maxWidth: '100px', 
                  maxHeight: '100px', 
                  borderRadius: '8px',
                  border: '1px solid hsl(var(--border))'
                }} 
              />
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'hsl(var(--foreground))' }}>
                  {selectedImage?.name || 'Image attached'}
                </p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))' }}>
                  {selectedImage && `${(selectedImage.size / 1024).toFixed(1)} KB`}
                </p>
              </div>
              <button
                onClick={handleRemoveImage}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.5rem',
                  color: 'hsl(var(--muted-foreground))',
                }}
                title="Remove image"
              >
                <X size={18} />
              </button>
            </div>
          )}
          <div className="chat-input-container">
            {/* Image upload button for research mode, disabled paperclip for chat mode */}
            {appMode === 'research' ? (
              <>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  style={{ display: 'none' }}
                  id="image-upload"
                />
                <button 
                  className="icon-btn attachment-btn" 
                  title="Upload image" 
                  onClick={() => imageInputRef.current?.click()}
                  disabled={isStreaming}
                >
                  <ImageIcon size={18} />
                </button>
              </>
            ) : (
              <button className="icon-btn attachment-btn" title="Attach file (coming soon)" disabled>
                <Paperclip size={18} />
              </button>
            )}
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                appMode === 'research' 
                  ? (isViewingResearch ? 'Click "New Research" to ask a new question' :
                     isStreaming ? 'Researching...' : 'Ask a research question...')
                  : (modelsLoading ? 'Loading models...' :
                     modelsError ? 'Cannot chat - model loading failed' :
                     !selectedModel ? 'Select a model to begin' :
                     isStreaming ? 'Generating response...' :
                     `Message ${selectedModel.name}...`)
              }
              disabled={
                appMode === 'research' 
                  ? (isStreaming || isViewingResearch)
                  : (!selectedModel || modelsLoading || !!modelsError || isStreaming)
              }
              aria-label={appMode === 'research' ? 'Research question input' : 'Chat message input'}
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
                title={appMode === 'research' ? 'Start research' : 'Send message'}
                disabled={
                  appMode === 'research'
                    ? (!inputValue.trim() || isViewingResearch)
                    : (!selectedModel || modelsLoading || !!modelsError || !inputValue.trim())
                }
                aria-label={appMode === 'research' ? 'Start research' : 'Send message'}
                onClick={handleUnifiedSend}
              >
                <SendHorizontal size={18} />
              </button>
            )}
          </div>
          <div className="chat-input-footer">
            {appMode === 'research' ? (
              <span>
                🔍 Deep Research Mode - AI-powered comprehensive answers
                {imagePreview && ' 🖼️ Image attached'}
              </span>
            ) : isLocalMode ? (
              <span style={{ color: '#10b981' }}>
                💻 Local Mode (TEST) - Using HuggingFace transformers directly
              </span>
            ) : isTestingMode ? (
              <span style={{ color: 'hsl(var(--primary))' }}>
                ? Direct Petals Mode - Bypassing backend
              </span>
            ) : (
              <>
                Powered by Torbiz distributed network 🌐
                {models.length > 0 && ` ${models.filter(m => m.available).length} models available`}
              </>
            )}
            {streamError && (
              <span style={{ color: 'hsl(var(--destructive-foreground))', marginLeft: '1rem' }}>
                ⚠️ {streamError}
              </span>
            )}
            {(isLocalMode || isTestingMode || petalsLogs.length > 0) && (
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
                {showPetalsLogs ? '👁️' : '📋'} {isLocalMode ? 'Local Logs' : 'Petals Logs'} {petalsLogs.length > 0 && `(${petalsLogs.length})`}
              </button>
            )}
          </div>
        </div>

        {/* Petals Setup/Inference Logs Panel (side panel, compact) */}
        {showPetalsLogs && !showSetupConfirmation && (
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
                {isLocalMode ? '💻 Local Inference Logs' : '⚡ Petals Logs'}
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
                ?
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
                ?
              </button>
            )}
            
            <h2 style={{ marginBottom: '1rem' }}>? Direct Petals Mode</h2>
            
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
                  <h4 style={{ margin: 0, marginBottom: '0.5rem' }}>⚙️ Requirements</h4>
                  <p style={{ margin: '0.5rem 0' }}>
                    Automatic installation of:
                  </p>
                  <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
                    <li><strong>Platform setup</strong> (WSL on Windows, native on macOS/Linux)</li>
                    <li><strong>Petals library</strong> (~3GB download)</li>
                    <li><strong>Additional packages</strong> (dependencies)</li>
                  </ul>
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85em' }}>
                    ?? First-time setup: 5-10 minutes
                  </p>
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85em', fontStyle: 'italic' }}>
                    🍎 macOS users: Homebrew must be installed first
                  </p>
                </div>
                
                <button 
                  className="modal-action-btn primary"
                  onClick={startPetalsSetup}
                >
                  ?? Start Setup & Enable Direct Mode
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
                  <h4 style={{ margin: 0, marginBottom: '0.5rem' }}>⚙️ Setting Up...</h4>
                  <p style={{ margin: 0, fontSize: '0.9em' }}>
                    Installing environment and Petals. This may take several minutes.
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