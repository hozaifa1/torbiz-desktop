import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    ChevronLeft, ChevronRight, Share2, ChevronDown,
    MessageSquarePlus, Paperclip, SendHorizontal, Loader, AlertTriangle
} from 'lucide-react';

import HardwareInfoDisplay from '../components/HardwareInfoDisplay';
import ShareGpuModal from '../components/ShareGpuModal';
import api from '../services/api';

// --- Placeholder Data ---
const chatHistory = [
  { id: 1, title: 'Brainstorming session' },
  { id: 2, title: 'Python script analysis' },
  { id: 3, title: 'Marketing ideas Q4' },
];

const conversation = [
  { sender: 'user', text: 'Hey there!', avatar: 'U' },
  { sender: 'bot', text: 'Hello! How can I help you today?', avatar: '/tauri.svg' }, // Ensure tauri.svg is in public folder
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
          {/* Add more history items or loading state here */}
           {chatHistory.length === 0 && <li style={{ color: '#888', fontStyle: 'italic', cursor: 'default' }}>No history yet...</li>}
        </ul>
        {/* Hardware Info Display at the bottom */}
        <HardwareInfoDisplay />
      </aside>

      {/* Main Chat Area */}
      <main className="chat-main">
        <header className="chat-header">
          {/* Toggle Button */}
          {!isHistoryVisible && (
            <button className="icon-btn" onClick={() => setIsHistoryVisible(true)} style={{ marginRight: '1rem' }}>
              <ChevronRight size={20} />
            </button>
          )}

           {/* Model Selector */}
          <div className="model-selector">
            <button
                className="model-selector-btn"
                onClick={() => !modelsLoading && !modelsError && models.length > 0 && setIsModelDropdownOpen(!isModelDropdownOpen)} // Prevent opening if loading/error/no models
                disabled={modelsLoading || !!modelsError || models.length === 0} // Disable button during load, on error, or if no models
                style={{ cursor: (modelsLoading || !!modelsError || models.length === 0) ? 'not-allowed' : 'pointer' }}
            >
              {renderModelSelectorContent()}
            </button>
            {isModelDropdownOpen && !modelsLoading && !modelsError && models.length > 0 && (
              <ul className="model-dropdown">
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
                    style={{ cursor: model.available ? 'pointer' : 'not-allowed' }}
                  >
                    <span className="model-name">{model.name} {!model.available && '(Unavailable)'}</span>
                    <span className="model-provider">{model.provider}</span>
                     {model.minGpuMemory && <span style={{ fontSize: '0.75em', color: '#888' }}>Req: {model.minGpuMemory}GB+ VRAM</span>}
                  </li>
                ))}
              </ul>
            )}
             {/* Display error message directly if dropdown is open and there's an error */}
             {isModelDropdownOpen && modelsError && (
                 <div style={{ position: 'absolute', top: '110%', left: '0', background: '#fff', border: '1px solid #ccc', padding: '10px', borderRadius: '4px', marginTop: '5px', zIndex: 10, color: '#dc3545', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '250px' }}>
                     {modelsError}
                 </div>
             )}
          </div>


          {/* Header Actions */}
          <div className="header-actions">
             <button className="gpu-share-btn" onClick={() => setIsShareModalOpen(true)}>
                <Share2 size={16} />
                <span>Share GPU</span>
             </button>
            <div className="profile-menu">
              {/* Profile Image/Placeholder */}
               {user?.profileImageUrl ? (
                    <img src={user.profileImageUrl} alt="Profile" className="profile-img" title={user.username} />
                ) : (
                    <div className="profile-avatar-placeholder" title={user?.username || 'User'}>
                        {user?.username?.charAt(0).toUpperCase() || '?'}
                    </div>
                )}
                {/* Logout Button */}
                <button onClick={logout} className="logout-btn">Logout</button>
            </div>
          </div>
        </header>

        {/* Conversation Area */}
        <div className="conversation-area">
          {conversation.map((msg, index) => (
            <div key={index} className={`message-wrapper ${msg.sender}`}>
                <div className="message-avatar">
                   {msg.sender === 'bot' ? (
                       <img src={msg.avatar} alt="Bot Avatar" style={{ width: '32px', height: '32px' }} /> // Smaller avatar
                   ) : (
                       <span>{msg.avatar}</span>
                   )}
                </div>
                <div className={`message ${msg.sender}`}>
                    <p>{msg.text}</p>
                </div>
            </div>
          ))}
          {/* Display messages based on model state */}
          {modelsLoading && (
               <div style={{ textAlign: 'center', color: '#666', marginTop: '2rem' }}>
                   <p>Loading available models...</p>
               </div>
          )}
          {!selectedModel && !modelsLoading && modelsError && ( // Error occurred
               <div style={{ textAlign: 'center', color: '#dc3545', marginTop: '2rem' }}>
                   <AlertTriangle size={20} style={{ marginBottom: '0.5rem' }}/>
                   <p>{modelsError}</p>
               </div>
           )}
           {!selectedModel && !modelsLoading && !modelsError && models.length > 0 && ( // Models loaded, none selected/available
              <div style={{ textAlign: 'center', color: '#666', marginTop: '2rem' }}>
                  <p>Please select an available model from the dropdown above to start chatting.</p>
              </div>
          )}
           {!selectedModel && !modelsLoading && !modelsError && models.length === 0 && ( // Models loaded, list empty
              <div style={{ textAlign: 'center', color: '#666', marginTop: '2rem' }}>
                  <p>No AI models are currently available on the network.</p>
              </div>
          )}
        </div>

        {/* Chat Input Bar */}
        <div className="chat-input-bar">
          <button className="icon-btn attachment-btn" title="Attach file (coming soon)" disabled>
            <Paperclip size={20} />
          </button>
          <input
            type="text"
            placeholder={
                modelsLoading ? 'Loading models...' :
                modelsError ? 'Cannot chat - model loading failed' :
                !selectedModel ? 'Select a model to begin' :
                `Message ${selectedModel.name}...`
            }
            disabled={!selectedModel || modelsLoading || !!modelsError} // More robust disable logic
          />
          <button
            type="submit"
            className="send-btn"
            title="Send message"
            disabled={!selectedModel || modelsLoading || !!modelsError} // Match disable logic
          >
            <SendHorizontal size={20} />
          </button>
        </div>
      </main>

       {/* Share GPU Modal */}
      <ShareGpuModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        // Pass available models to the modal if needed
        // availableModels={models.filter(m => m.available)}
      />
    </div>
  );
}

export default ChatPage;