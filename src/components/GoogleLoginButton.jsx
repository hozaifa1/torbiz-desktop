import React, { useState, useEffect } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';

// Dynamically import Tauri APIs (they won't exist in web browser)
let invoke, listen, open;
let isTauri = false;

try {
  // Check if we're running in Tauri
  if (window.__TAURI__) {
    isTauri = true;
    import('@tauri-apps/api/core').then(module => {
      invoke = module.invoke;
    });
    import('@tauri-apps/api/event').then(module => {
      listen = module.listen;
    });
    import('@tauri-apps/plugin-opener').then(module => {
      open = module.open;
    });
  }
} catch (e) {
  console.log('Not running in Tauri, using web OAuth');
}

function GoogleLoginButton() {
  const { googleLogin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [isTauriReady, setIsTauriReady] = useState(false);

  useEffect(() => {
    // Wait for Tauri APIs to load
    if (isTauri) {
      const checkTauriReady = setInterval(() => {
        if (invoke && listen && open) {
          setIsTauriReady(true);
          clearInterval(checkTauriReady);
        }
      }, 100);

      return () => clearInterval(checkTauriReady);
    }
  }, []);

  useEffect(() => {
    if (!isTauri || !isTauriReady) return;

    // Listen for OAuth redirect events from Rust (Tauri only)
    let unlisten;
    
    listen('oauth_redirect', async (event) => {
      const url = event.payload;
      console.log('OAuth redirect received:', url);
      
      try {
        // For implicit flow, token is in hash fragment
        const hash = new URL(url).hash.substring(1);
        const hashParams = new URLSearchParams(hash);
        const idToken = hashParams.get('id_token');
        
        if (idToken) {
          // Use the id_token with your existing backend
          await googleLogin(idToken);
        } else {
          console.error('No id_token found in OAuth response');
          alert('Failed to get authentication token. Please try again.');
        }
      } catch (error) {
        console.error('Error processing OAuth response:', error);
        alert('Failed to sign in with Google. Please try again.');
      } finally {
        setLoading(false);
      }
    }).then(fn => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [googleLogin, isTauriReady]);

  const handleTauriGoogleLogin = async () => {
    if (!invoke || !open) {
      console.error('Tauri APIs not loaded yet');
      return;
    }

    setLoading(true);
    
    try {
      // Start the OAuth server
      const port = await invoke('start_oauth_server');
      console.log('OAuth server started on port:', port);
      
      // Build Google OAuth URL with implicit flow to get id_token directly
      const redirectUri = `http://localhost:${port}/`;
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'id_token token'); // Implicit flow
      authUrl.searchParams.set('scope', 'openid profile email');
      authUrl.searchParams.set('nonce', Math.random().toString(36)); // Required for implicit flow
      
      console.log('Opening OAuth URL:', authUrl.toString());
      
      // Open in system browser
      await open(authUrl.toString());
    } catch (error) {
      console.error('Failed to start OAuth flow:', error);
      alert('Failed to start Google sign-in. Please try again.');
      setLoading(false);
    }
  };

  const handleWebGoogleLogin = async (credentialResponse) => {
    try {
      await googleLogin(credentialResponse.credential);
    } catch (error) {
      console.error('Google login failed:', error);
    }
  };

  const handleError = () => {
    console.error('Google Login Failed');
  };

  // If running in Tauri, show custom button
  if (isTauri && isTauriReady) {
    return (
      <button 
        onClick={handleTauriGoogleLogin} 
        disabled={loading}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          justifyContent: 'center',
          backgroundColor: 'white',
          border: '1px solid #dadce0',
          padding: '10px 16px',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: 500,
          opacity: loading ? 0.6 : 1,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
          <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.18L12.05 13.56c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.96v2.332C2.44 15.983 5.485 18 9.003 18z" fill="#34A853"/>
          <path d="M3.964 10.712c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.96H.957C.347 6.175 0 7.55 0 9.002c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
          <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.428 0 9.002 0 5.485 0 2.44 2.017.96 4.958L3.967 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335"/>
        </svg>
        {loading ? 'Signing in...' : 'Sign in with Google'}
      </button>
    );
  }

  // If running in Tauri but not ready, show loading
  if (isTauri && !isTauriReady) {
    return (
      <button 
        disabled
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          justifyContent: 'center',
          backgroundColor: 'white',
          border: '1px solid #dadce0',
          padding: '10px 16px',
          borderRadius: '4px',
          fontSize: '14px',
          fontWeight: 500,
          opacity: 0.6,
        }}
      >
        Loading...
      </button>
    );
  }

  // Otherwise, use the web version (for dev in browser)
  return (
    <GoogleLogin
      onSuccess={handleWebGoogleLogin}
      onError={handleError}
      useOneTap
    />
  );
}

export default GoogleLoginButton;