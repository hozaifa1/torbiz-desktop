import React, { useState } from 'react';
import LoginForm from '../components/LoginForm';
import SignupForm from '../components/SignupForm';

function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);

  return (
    <div className="auth-page-container">
      <div className="auth-form-card">
        <h1>{isLogin ? 'Login to Torbiz' : 'Sign Up for Torbiz'}</h1>
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