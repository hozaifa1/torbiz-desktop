import React from 'react';
import { Link } from 'react-router-dom';

function HomePage() {
  return (
    <div className="homepage-container">
      <div className="homepage-card">
        <img src="/tauri.svg" className="logo tauri" alt="Torbiz Logo" />
        <h1>Welcome to Torbiz</h1>
        <p className="subtitle">Your decentralized AI chat assistant.</p>
        <p className="description">
          Leverage a distributed network of GPUs to power your conversations, or share your own to contribute to the network.
        </p>
        <div className="row">
          <Link to="/chat">
            <button type="button" className="primary-action-btn">
              Start Chatting
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default HomePage;