// src/App.jsx
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useEffect } from 'react';
import HomePage from './pages/HomePage';
import AuthPage from './pages/AuthPage';
import ChatPage from './pages/ChatPage';
import { collectAndSendHardwareInfo } from './utils/hardwareService';

const queryClient = new QueryClient();
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID; //

// This component uses the auth context and will be rendered inside the provider
function AppRoutes() {
  const { user, loading } = useAuth(); // Get user object which now contains 'id'
  const location = useLocation();

  // Send hardware info when user logs in (but only once per session)
  useEffect(() => {
    // Ensure user exists and has an id before proceeding
    if (user && user.id) {
      const hardwareInfoSent = sessionStorage.getItem('hardwareInfoSent');

      if (!hardwareInfoSent) {
        const authToken = localStorage.getItem('authToken');
        // Pass the user.id to the function
        collectAndSendHardwareInfo(user.id, authToken)
          .then((result) => {
            if (result.success) {
              console.log('Hardware info collected and sent successfully on login.');
              sessionStorage.setItem('hardwareInfoSent', 'true');
            } else {
              console.error('Failed to send hardware info on login:', result.message);
              // Optionally add user feedback here
            }
          })
          .catch((error) => {
            console.error('Exception during hardware info sending:', error);
            // Optionally add user feedback here
          });
      }
    } else {
      // Clear the flag when user logs out or if user/id is missing
      sessionStorage.removeItem('hardwareInfoSent');
    }
  }, [user]); // Rerun effect when user state changes

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <h2>Loading Application...</h2>
        <p style={{ color: '#666' }}>Validating session...</p>
      </div>
    );
  }

  return (
    <Routes>
      {/* Redirect root to /chat if logged in, else to /auth */}
      <Route
        path="/"
        element={user ? <Navigate to="/chat" replace /> : <Navigate to="/auth" replace />}
      />
      {/* Auth page only accessible when not logged in */}
      <Route
        path="/auth"
        element={!user ? <AuthPage /> : <Navigate to="/chat" replace />}
      />
      {/* Chat page protected */}
      <Route
        path="/chat"
        element={user ? <ChatPage /> : <Navigate to="/auth" state={{ from: location }} replace />}
      />
      {/* Fallback redirect */}
      <Route path="*" element={<Navigate to={user ? "/chat" : "/auth"} replace />} />
    </Routes>
  );
}

// The main App component now sets up all providers
function App() {
  if (!googleClientId) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <h2>Configuration Error</h2>
        <p style={{ color: '#d93025' }}>
          Google Client ID is missing. Please check your .env file.
        </p>
        <p style={{ fontSize: '0.9em', color: '#666' }}>
          Make sure VITE_GOOGLE_CLIENT_ID is set in your .env file.
        </p>
      </div>
    );
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppRoutes /> {/* Render routes within AuthProvider */}
        </AuthProvider>
      </QueryClientProvider>
    </GoogleOAuthProvider>
  );
}

export default App;