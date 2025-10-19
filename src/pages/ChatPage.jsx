import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    ChevronLeft, ChevronRight, Share2, ChevronDown,
    MessageSquarePlus, Paperclip, SendHorizontal, Loader, AlertTriangle
} from 'lucide-react';

import HardwareInfoDisplay from '../components/HardwareInfoDisplay';
import ShareGpuModal from '../components/ShareGpuModal';
import api from '../services/api';

// --- Placeholder Data (Removed models, kept others for now) ---
const chatHistory = [
  { id: 1, title: 'Brainstorming session for new movie' },
  { id: 2, title: 'Python script for data analysis' },
  { id: 3, title: 'Marketing ideas for Q4 launch' },
  { id: 4, title: 'Vacation planning: Southeast Asia' },
];

const conversation = [
  { sender: 'user', text: 'Hey, can you help me brainstorm some ideas for a new sci-fi movie?', avatar: 'U' },
  { sender: 'bot', text: 'Of course! I\'d love to. Let\'s start with the main theme. Are you thinking of something dystopian, a space opera, or perhaps something more philosophical like first contact?', avatar: '/tauri.svg' },
  { sender: 'user', text: 'Let\'s go with dystopian.', avatar: 'U' },
];
// --- End Placeholder Data ---

function ChatPage() {
  const { user, logout } = useAuth();
  const [isHistoryVisible, setIsHistoryVisible] = useState(true);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // --- Fetch Models Effect (Updated Mapping) ---
  useEffect(() => {
    const fetchModels = async () => {
      setModelsLoading(true);
      setModelsError(null);
      try {
        const response = await api.get('/llm_models/models/');

        // --- Verified Mapping based on provided structure ---
        const fetchedModels = response.data.map(model => ({
            id: model.model_id,             // Use model_id for id
            name: model.name,               // Use name for name
            available: model.is_available,  // Use is_available for available
            provider: 'Torbiz Network',     // Default provider as it's not in the API response
            description: model.description, // Keep description if needed
            minGpuMemory: model.min_gpu_memory // Keep min_gpu_memory if needed
        }));
        // --- End Mapping ---

        setModels(fetchedModels);

        // Set the default selected model to the first available one
        const firstAvailable = fetchedModels.find(m => m.available);
        setSelectedModel(firstAvailable || null);

      } catch (error) {
        console.error("Failed to fetch models:", error);
        setModelsError("Could not load models. Please try again later.");
        setModels([]);
        setSelectedModel(null);
      } finally {
        setModelsLoading(false);
      }
    };

    fetchModels();
  }, []);

  // --- Helper to display model selector status ---
  const renderModelSelectorContent = () => {
    if (modelsLoading) {
      return (
        <>
          <Loader size={16} className="spinner" />
          <span>Loading Models...</span>
        </>
      );
    }
    if (modelsError) {
       return (
         <>
           <AlertTriangle size={16} color="#dc3545"/>
           <span style={{ color: '#dc3545' }}>Error Loading</span>
           <ChevronDown size={16} />
         </>
       );
    }
    if (!selectedModel) {
        return (
            <>
              <span>No Models Available</span>
              <ChevronDown size={16} />
            </>
        );
    }
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
          <button className="icon-btn" onClick={() => setIsHistoryVisible(false)}>
            <ChevronLeft size={20} />
          </button>
        </div>
        <button className="new-chat-btn">
          <MessageSquarePlus size={16} />
          New Chat
        </button>
        <ul className="history-list">
          {chatHistory.map(chat => (
            <li key={chat.id}>{chat.title}</li>
          ))}
        </ul>
        <HardwareInfoDisplay />
      </aside>

      {/* Main Chat Area */}
      <main className="chat-main">
        <header className="chat-header">
          {!isHistoryVisible && (
            <button className="icon-btn" onClick={() => setIsHistoryVisible(true)}>
              <ChevronRight size={20} />
            </button>
          )}

          {/* Model Selector */}
          <div className="model-selector">
            <button
                className="model-selector-btn"
                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                disabled={modelsLoading || !!modelsError} // Updated disabled logic slightly
            >
              {renderModelSelectorContent()}
            </button>
            {isModelDropdownOpen && !modelsLoading && !modelsError && models.length > 0 && (
              <ul className="model-dropdown">
                {models.map(model => (
                  <li
                    key={model.id} // Use the unique model.id as the key
                    className={!model.available ? 'disabled' : ''}
                    onClick={() => {
                        if (model.available) {
                            setSelectedModel(model);
                            setIsModelDropdownOpen(false);
                        }
                    }}
                  >
                    <span className="model-name">{model.name}</span>
                    <span className="model-provider">{model.provider}</span>
                  </li>
                ))}
              </ul>
            )}
             {isModelDropdownOpen && modelsError && (
                 <div style={{ position: 'absolute', top: '100%', left: 0, background: '#fff', border: '1px solid #ccc', padding: '10px', borderRadius: '4px', marginTop: '5px', zIndex: 10, color: '#dc3545' }}>
                     {modelsError}
                 </div>
             )}
          </div>

          <div className="header-actions">
             <button className="gpu-share-btn" onClick={() => setIsShareModalOpen(true)}>
                <Share2 size={16} />
                <span>Share GPU</span>
             </button>
            <div className="profile-menu">
                {user.profileImageUrl ? (
                    <img src={user.profileImageUrl} alt="Profile" className="profile-img" />
                ) : (
                    <div className="profile-avatar-placeholder">{user.username.charAt(0).toUpperCase()}</div>
                )}
                <button onClick={logout} className="logout-btn">Logout</button>
            </div>
          </div>
        </header>

        <div className="conversation-area">
          {/* Placeholder conversation */}
          {conversation.map((msg, index) => (
            <div key={index} className={`message-wrapper ${msg.sender}`}>
                <div className="message-avatar">
                    {msg.sender === 'bot' ? <img src={msg.avatar} alt="Bot Avatar"/> : <span>{msg.avatar}</span>}
                </div>
                <div className={`message ${msg.sender}`}>
                    <p>{msg.text}</p>
                </div>
            </div>
          ))}
          {/* Messages for loading/error/no models */}
          {!selectedModel && !modelsLoading && !modelsError && (
              <div style={{ textAlign: 'center', color: '#666', marginTop: '2rem' }}>
                  <p>No models are currently available.</p>
              </div>
          )}
           {modelsError && (
               <div style={{ textAlign: 'center', color: '#dc3545', marginTop: '2rem' }}>
                   <p>Failed to load models. Please check your connection or try again later.</p>
               </div>
           )}
        </div>

        <div className="chat-input-bar">
          <button className="icon-btn attachment-btn">
            <Paperclip size={20} />
          </button>
          <input
            type="text"
            placeholder={selectedModel ? `Message ${selectedModel.name}...` : 'Select a model to start'}
            disabled={!selectedModel || modelsLoading || !!modelsError}
          />
          <button
            type="submit"
            className="send-btn"
            disabled={!selectedModel || modelsLoading || !!modelsError}
          >
            <SendHorizontal size={20} />
          </button>
        </div>
      </main>

      <ShareGpuModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
      />
    </div>
  );
}

export default ChatPage;