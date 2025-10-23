import React, { useState } from 'react';
import LoginForm from '../components/LoginForm';
import SignupForm from '../components/SignupForm';

function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);

  return (
    <div className="auth-page-container">
      <div className="auth-form-card">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img 
            src="/tauri.svg" 
            alt="Torbiz Logo" 
            style={{ 
              height: '60px', 
              marginBottom: '1rem',
              filter: 'brightness(0) saturate(100%) invert(54%) sepia(63%) saturate(3491%) hue-rotate(345deg) brightness(100%) contrast(95%)'
            }} 
          />
          <h1 style={{ marginBottom: '0.5rem' }}>
            {isLogin ? 'Welcome Back' : 'Join Torbiz'}
          </h1>
          <p className="text-muted" style={{ fontSize: '0.95rem' }}>
            {isLogin ? 'Login to access your decentralized AI' : 'Create an account to get started'}
          </p>
        </div>
        {isLogin ? <LoginForm /> : <SignupForm />}
        <button
          onClick={() => setIsLogin(!isLogin)}
          className="auth-toggle-link"
        >
          {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Login'}
        </button>
      </div>
    </div>
  );
}

export default AuthPage;