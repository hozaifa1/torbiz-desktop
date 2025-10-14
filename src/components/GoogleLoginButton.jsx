import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
// REMOVE useNavigate

function GoogleLoginButton() {
  const { googleLogin } = useAuth();
  // REMOVE navigate variable

  const handleSuccess = async (credentialResponse) => {
    try {
      // This will update the user state in AuthContext,
      // which will automatically trigger the redirect in App.jsx
      await googleLogin(credentialResponse.credential);
      // REMOVE navigate('/chat');
    } catch (error) {
      console.error('Google login failed:', error);
    }
  };

  const handleError = () => {
    console.error('Google Login Failed');
  };

  return (
    <GoogleLogin
      onSuccess={handleSuccess}
      onError={handleError}
      useOneTap
    />
  );
}

export default GoogleLoginButton;