import React, { useState, useEffect } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { isTauriEnvironment, loadTauriApis } from '../utils/tauriHelpers';

function GoogleLoginButton() {
  const { googleLogin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [isTauri, setIsTauri] = useState(false);
  const [tauriApis, setTauriApis] = useState(null);
  const [error, setError] = useState(null);

  // Detect if running in Tauri
  useEffect(() => {
    const checkTauri = async () => {
      const inTauri = isTauriEnvironment();
      console.log('Tauri detected:', inTauri);
      setIsTauri(inTauri);
      
      if (inTauri) {
        try {
          const apis = await loadTauriApis();
          
          // Detailed logging
          console.log('Tauri APIs loaded successfully');
          console.log('Available API methods:', Object.keys(apis));
          console.log('API types:', {
            invoke: typeof apis.invoke,
            listen: typeof apis.listen,
            open: typeof apis.open
          });
          
          // Verify open function exists and is callable
          if (typeof apis.open !== 'function') {
            throw new Error(`open is not a function, it is: ${typeof apis.open}`);
          }
          
          setTauriApis(apis);
          console.log('✅ All Tauri APIs ready, including open function');
        } catch (error) {
          console.error('❌ Failed to load Tauri APIs:', error);
          console.error('Error details:', {
            message: error.message,
            stack: error.stack
          });
          setError(`Failed to initialize Tauri APIs: ${error.message}`);
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
        console.log('Setting up OAuth listener...');
        
        unlisten = await tauriApis.listen('oauth_redirect', async (event) => {
          const url = event.payload;
          console.log('OAuth redirect received:', url);
          
          try {
            // Extract id_token from hash fragment
            const hash = new URL(url).hash.substring(1);
            const hashParams = new URLSearchParams(hash);
            const idToken = hashParams.get('id_token');
            
            if (idToken) {
              console.log('ID token extracted successfully');
              await googleLogin(idToken);
            } else {
              console.error('No id_token found in OAuth response');
              console.error('Available params:', Array.from(hashParams.keys()));
              alert('Failed to get authentication token. Please try again.');
            }
          } catch (error) {
            console.error('Error processing OAuth response:', error);
            alert('Failed to sign in with Google. Please try again.');
          } finally {
            setLoading(false);
          }
        });
        
        console.log('✅ OAuth listener setup successfully');
      } catch (error) {
        console.error('❌ Failed to setup OAuth listener:', error);
        setError(`Failed to setup OAuth listener: ${error.message}`);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
        console.log('OAuth listener cleaned up');
      }
    };
  }, [googleLogin, isTauri, tauriApis]);

  // Tauri Google Login Handler
  const handleTauriGoogleLogin = async () => {
    console.log('Google login button clicked');
    console.log('Current state:', {
      tauriApis: !!tauriApis,
      hasOpen: tauriApis ? typeof tauriApis.open : 'N/A',
      loading
    });
    
    if (!tauriApis) {
      console.error('❌ Tauri APIs not loaded yet');
      alert('Application is still initializing. Please wait a moment and try again.');
      return;
    }

    if (typeof tauriApis.open !== 'function') {
      console.error('❌ Open function not available');
      console.error('tauriApis contents:', tauriApis);
      console.error('open type:', typeof tauriApis.open);
      alert('Browser opening functionality is not available. Please check the console for details.');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      console.log('🚀 Starting OAuth flow...');
      
      // Start the OAuth server
      console.log('Invoking start_oauth_server...');
      const port = await tauriApis.invoke('start_oauth_server');
      console.log('✅ OAuth server started on port:', port);
      
      // Build Google OAuth URL with implicit flow
      const redirectUri = `http://localhost:${port}/`;
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      
      if (!clientId) {
        throw new Error('Google Client ID not configured in environment variables');
      }
      
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'id_token token');
      authUrl.searchParams.set('scope', 'openid profile email');
      authUrl.searchParams.set('nonce', Math.random().toString(36));
      
      const authUrlString = authUrl.toString();
      console.log('📱 Opening OAuth URL in system browser');
      console.log('URL:', authUrlString.substring(0, 100) + '...');
      
      // Open in system browser
      console.log('Calling tauriApis.open()...');
      await tauriApis.open(authUrlString);
      
      console.log('✅ System browser opened successfully');
      console.log('⏳ Waiting for OAuth redirect...');
    } catch (error) {
      console.error('❌ Failed to start OAuth flow:', error);
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      
      const errorMessage = error.message || 'Unknown error occurred';
      alert(`Failed to start Google sign-in: ${errorMessage}`);
      setError(errorMessage);
      setLoading(false);
    }
  };

  // Web Google Login Handler
  const handleWebGoogleLogin = async (credentialResponse) => {
    try {
      setLoading(true);
      setError(null);
      console.log('Web Google login initiated');
      await googleLogin(credentialResponse.credential);
      console.log('Web Google login successful');
    } catch (error) {
      console.error('Web Google login failed:', error);
      alert('Failed to sign in with Google. Please try again.');
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleError = () => {
    console.error('Google Login Failed or Cancelled');
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
        {error && (
          <p style={{ color: '#d93025', fontSize: '0.85em', marginTop: '0.5rem', textAlign: 'center' }}>
            {error}
          </p>
        )}
        {!tauriApis && !error && (
          <p style={{ color: '#666', fontSize: '0.85em', marginTop: '0.5rem', textAlign: 'center' }}>
            Initializing authentication...
          </p>
        )}
      </div>
    );
  }

  // Render web version with proper configuration
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