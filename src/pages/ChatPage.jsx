import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { invoke } from '@tauri-apps/api/core';
import { 
    ChevronLeft, ChevronRight, Share2, ChevronDown, 
    MessageSquarePlus, Paperclip, SendHorizontal 
} from 'lucide-react';

import HardwareInfoTest from '../components/HardwareInfoTest';

// --- Placeholder Data ---
const models = [
  { name: 'Llama 3 70B', available: true, provider: 'Torbiz Network' },
  { name: 'Mistral Large', available: true, provider: 'Torbiz Network' },
  { name: 'GPT-4o', available: false, provider: 'OpenAI (Unavailable)' },
  { name: 'Claude 3 Opus', available: true, provider: 'Torbiz Network' },
  { name: 'Gemini 1.5 Pro', available: false, provider: 'Google (Unavailable)' },
];

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
  const [selectedModel, setSelectedModel] = useState(models.find(m => m.available));

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
      </aside>

      {/* Main Chat Area */}
      <main className="chat-main">
        <header className="chat-header">
          {!isHistoryVisible && (
            <button className="icon-btn" onClick={() => setIsHistoryVisible(true)}>
              <ChevronRight size={20} />
            </button>
          )}

          <div className="model-selector">
            <button className="model-selector-btn" onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}>
              <span>{selectedModel.name}</span>
              <ChevronDown size={16} />
            </button>
            {isModelDropdownOpen && (
              <ul className="model-dropdown">
                {models.map(model => (
                  <li
                    key={model.name}
                    className={!model.available ? 'disabled' : ''}
                    onClick={() => { if (model.available) { setSelectedModel(model); setIsModelDropdownOpen(false); }}}
                  >
                    <span className="model-name">{model.name}</span>
                    <span className="model-provider">{model.provider}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="header-actions">
             <button className="gpu-share-btn">
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
        </div>

        <div className="chat-input-bar">
          <button className="icon-btn attachment-btn">
            <Paperclip size={20} />
          </button>
          <input type="text" placeholder={`Message ${selectedModel.name}...`} />
          <button type="submit" className="send-btn">
            <SendHorizontal size={20} />
          </button>
        </div>
        {/* {process.env.NODE_ENV === 'development' && <HardwareInfoTest />} */}
        {/* {<HardwareInfoTest />} */}
      </main>
    </div>
  );
}

export default ChatPage;