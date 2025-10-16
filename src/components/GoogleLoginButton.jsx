import React, { useState, useEffect } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { isTauriEnvironment, loadTauriApis } from '../utils/tauriHelpers';

// FIXED: Use constant port 8080 for OAuth
const OAUTH_PORT = 8080;

function GoogleLoginButton() {
  const { googleLogin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [isTauri, setIsTauri] = useState(false);
  const [tauriApis, setTauriApis] = useState(null);

  // Detect if running in Tauri
  useEffect(() => {
    const checkTauri = async () => {
      const inTauri = isTauriEnvironment();
      setIsTauri(inTauri);
      
      if (inTauri) {
        try {
          const apis = await loadTauriApis();
          setTauriApis(apis);
        } catch (error) {
          setIsTauri(false);
        }
      }
    };

    checkTauri();
  }, []);

  // Setup OAuth redirect listener for Tauri
  useEffect(() => {
    if (!isTauri || !tauriApis) return;

    let unlisten;
    
    const setupListener = async () => {
      try {
        unlisten = await tauriApis.listen('oauth_redirect', async (event) => {
          const url = event.payload;
          
          try {
            const hash = new URL(url).hash.substring(1);
            const hashParams = new URLSearchParams(hash);
            const idToken = hashParams.get('id_token');
            
            if (idToken) {
              await googleLogin(idToken);
            } else {
              alert('Failed to get authentication token. Please try again.');
            }
          } catch (error) {
            alert('Failed to sign in with Google. Please try again.');
          } finally {
            setLoading(false);
          }
        });
      } catch (error) {
        // Silent fail - listener setup is internal
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [googleLogin, isTauri, tauriApis]);

  // Tauri Google Login Handler
  const handleTauriGoogleLogin = async () => {
    if (!tauriApis) {
      alert('Application is still initializing. Please wait a moment and try again.');
      return;
    }

    setLoading(true);
    
    try {
      // Start the OAuth server - will use fixed port 8080
      await tauriApis.invoke('start_oauth_server');
      
      // Build Google OAuth URL with fixed port 8080
      const redirectUri = `http://localhost:${OAUTH_PORT}/`;
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      
      if (!clientId) {
        throw new Error('Google Client ID not configured');
      }
      
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'id_token token');
      authUrl.searchParams.set('scope', 'openid profile email');
      authUrl.searchParams.set('nonce', Math.random().toString(36));
      
      // Open in system browser
      await tauriApis.open(authUrl.toString());
    } catch (error) {
      alert(`Failed to start Google sign-in: ${error.message || 'Unknown error'}`);
      setLoading(false);
    }
  };

  // Web Google Login Handler
  const handleWebGoogleLogin = async (credentialResponse) => {
    try {
      setLoading(true);
      await googleLogin(credentialResponse.credential);
    } catch (error) {
      alert('Failed to sign in with Google. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleError = () => {
    alert('Google sign-in was cancelled or failed. Please try again.');
  };

  // Render Tauri button
  if (isTauri) {
    return (
      <div style={{ width: '100%' }}>
        <button 
          onClick={handleTauriGoogleLogin} 
          disabled={loading || !tauriApis}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            justifyContent: 'center',
            backgroundColor: 'white',
            border: '1px solid #dadce0',
            padding: '10px 16px',
            borderRadius: '4px',
            cursor: (loading || !tauriApis) ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: 500,
            opacity: (loading || !tauriApis) ? 0.6 : 1,
            width: '100%',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.18L12.05 13.56c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.96v2.332C2.44 15.983 5.485 18 9.003 18z" fill="#34A853"/>
            <path d="M3.964 10.712c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.96H.957C.347 6.175 0 7.55 0 9.002c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.428 0 9.002 0 5.485 0 2.44 2.017.96 4.958L3.967 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335"/>
          </svg>
          {!tauriApis ? 'Loading...' : (loading ? 'Signing in...' : 'Sign in with Google')}
        </button>
        
        {/* Important note for developers */}
        {process.env.NODE_ENV === 'development' && (
          <div style={{ 
            marginTop: '8px', 
            fontSize: '0.75em', 
            color: '#666',
            textAlign: 'center'
          }}>
            Note: Add http://localhost:8080/ to Google Console
          </div>
        )}
      </div>
    );
  }

  // Render web version
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <GoogleLogin
        onSuccess={handleWebGoogleLogin}
        onError={handleError}
        useOneTap={false}
        flow="implicit"
        ux_mode="popup"
        size="large"
        text="continue_with"
        shape="rectangular"
      />
    </div>
  );
}

export default GoogleLoginButton;