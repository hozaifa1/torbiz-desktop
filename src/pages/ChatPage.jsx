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

    if (!user?.id) {
      setStreamError('User session error. Please log in again.');
      return;
    }

    console.log('[CHAT] Sending message:', { model: selectedModel.id, length: trimmedInput.length });

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
      // Start streaming inference
      const abortFn = await streamInference(
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
                  {models.map(model => (
                    <li
                      key={model.id}
                      className={!model.available ? 'disabled' : ''}
                      title={!model.available ? 'Model currently unavailable' : model.description || model.name}
                      onClick={() => {
                        if (model.available) {
                          setSelectedModel(model);
                          setIsModelDropdownOpen(false);
                        }
                      }}
                      role="option"
                      aria-selected={selectedModel?.id === model.id}
                    >
                      <span className="model-name">
                        {model.name} {!model.available && '(Unavailable)'}
                      </span>
                      <span className="model-provider">{model.provider}</span>
                      {model.minGpuMemory && (
                        <span className="text-muted" style={{ fontSize: '0.8em' }}>
                          Requires {model.minGpuMemory}GB+ VRAM
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Header Actions */}
          <div className="header-actions">
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
            Powered by Torbiz distributed network · 
            {models.length > 0 && ` ${models.filter(m => m.available).length} models available`}
            {streamError && (
              <span style={{ color: 'hsl(var(--destructive-foreground))', marginLeft: '1rem' }}>
                · {streamError}
              </span>
            )}
          </div>
        </div>
      </main>

      {/* Share GPU Modal */}
      <ShareGpuModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
      />
    </div>
  );
}

export default ChatPage;