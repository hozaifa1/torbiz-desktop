import React, { useState, useEffect } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { isTauriEnvironment, loadTauriApis } from '../utils/tauriHelpers';

function GoogleLoginButton() {
  const { googleLogin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [isTauri, setIsTauri] = useState(false);
  const [tauriApis, setTauriApis] = useState(null);
  const [oauthServerStarted, setOauthServerStarted] = useState(false);

  // Detect if running in Tauri
  useEffect(() => {
    const checkTauri = async () => {
      const inTauri = isTauriEnvironment();
      console.log('[GOOGLE-LOGIN] Tauri environment:', inTauri);
      setIsTauri(inTauri);
      
      if (inTauri) {
        try {
          const apis = await loadTauriApis();
          console.log('[GOOGLE-LOGIN] Tauri APIs loaded successfully');
          setTauriApis(apis);
        } catch (error) {
          console.error('[GOOGLE-LOGIN] Failed to load Tauri APIs:', error);
          setIsTauri(false);
        }
      }
    };

    checkTauri();
  }, []);

  // Setup OAuth redirect listener for Tauri
  useEffect(() => {
    if (!isTauri || !tauriApis) {
      console.log('[GOOGLE-LOGIN] Skipping listener setup (not Tauri or APIs not ready)');
      return;
    }

    let unlisten;
    
    const setupListener = async () => {
      try {
        console.log('[GOOGLE-LOGIN] Setting up oauth_redirect listener...');
        unlisten = await tauriApis.listen('oauth_redirect', async (event) => {
          console.log('[GOOGLE-LOGIN] Received oauth_redirect event:', event.payload);
          const url = event.payload;
          
          try {
            // Parse the URL to extract tokens from the hash fragment
            const urlObj = new URL(url);
            
            // Try to get from hash first (OAuth implicit flow)
            let idToken = null;
            if (urlObj.hash) {
              const hash = urlObj.hash.substring(1); // Remove the # character
              const hashParams = new URLSearchParams(hash);
              idToken = hashParams.get('id_token');
              console.log('[GOOGLE-LOGIN] Found id_token in hash fragment');
            }
            
            // Fallback: try query parameters
            if (!idToken) {
              idToken = urlObj.searchParams.get('id_token');
              if (idToken) {
                console.log('[GOOGLE-LOGIN] Found id_token in query parameters');
              }
            }
            
            console.log('[GOOGLE-LOGIN] Extracted id_token:', idToken ? 'present' : 'missing');
            
            if (idToken) {
              console.log('[GOOGLE-LOGIN] Calling googleLogin with id_token...');
              await googleLogin(idToken);
              console.log('[GOOGLE-LOGIN] Login successful');
            } else {
              console.error('[GOOGLE-LOGIN] No id_token found in redirect URL');
              console.error('[GOOGLE-LOGIN] Full URL:', url);
              console.error('[GOOGLE-LOGIN] Hash:', urlObj.hash);
              console.error('[GOOGLE-LOGIN] Search:', urlObj.search);
              alert('Failed to get authentication token. Please try again.');
            }
          } catch (error) {
            console.error('[GOOGLE-LOGIN] Error processing OAuth redirect:', error);
            alert('Failed to sign in with Google. Please try again.');
          } finally {
            setLoading(false);
          }
        });
        console.log('[GOOGLE-LOGIN] Listener setup complete');
      } catch (error) {
        console.error('[GOOGLE-LOGIN] Failed to setup listener:', error);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        console.log('[GOOGLE-LOGIN] Cleaning up listener');
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

    console.log('[GOOGLE-LOGIN] Starting Tauri Google login flow...');
    setLoading(true);
    
    try {
      // Start the OAuth server (will use port 8080 via proxy)
      console.log('[GOOGLE-LOGIN] Invoking start_oauth_server...');
      const port = await tauriApis.invoke('start_oauth_server');
      console.log('[GOOGLE-LOGIN] OAuth proxy server started on port:', port);
      
      // Always use port 8080 (the proxy port)
      const redirectUri = 'http://localhost:8080/';
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      
      if (!clientId) {
        throw new Error('Google Client ID not configured');
      }
      
      console.log('[GOOGLE-LOGIN] Using redirect URI:', redirectUri);
      
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'id_token token');
      authUrl.searchParams.set('scope', 'openid profile email');
      authUrl.searchParams.set('nonce', Math.random().toString(36));
      
      console.log('[GOOGLE-LOGIN] Opening Google Auth URL:', authUrl.toString());
      
      // Open in system browser
      await tauriApis.open(authUrl.toString());
      console.log('[GOOGLE-LOGIN] Browser opened, waiting for redirect...');
    } catch (error) {
      console.error('[GOOGLE-LOGIN] OAuth flow error:', error);
      alert(`Failed to start Google sign-in: ${error.message || 'Unknown error'}`);
      setLoading(false);
    }
  };

  // Web Google Login Handler
  const handleWebGoogleLogin = async (credentialResponse) => {
    try {
      console.log('[GOOGLE-LOGIN] Web login initiated');
      setLoading(true);
      await googleLogin(credentialResponse.credential);
      console.log('[GOOGLE-LOGIN] Web login successful');
    } catch (error) {
      console.error('[GOOGLE-LOGIN] Web login error:', error);
      alert('Failed to sign in with Google. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleError = () => {
    console.error('[GOOGLE-LOGIN] Google sign-in error');
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
        
        {/* Important note */}
        {process.env.NODE_ENV === 'development' && !loading && (
          <div style={{ 
            marginTop: '8px', 
            fontSize: '0.75em', 
            color: '#666',
            textAlign: 'center'
          }}>
            Note: OAuth server will start on a random available port
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