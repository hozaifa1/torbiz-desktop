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
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// This component uses the auth context and will be rendered inside the provider
function AppRoutes() {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Send hardware info when user logs in (but only once per session)
  useEffect(() => {
    if (user) {
      // Check if hardware info was already sent this session
      const hardwareInfoSent = sessionStorage.getItem('hardwareInfoSent');
      
      if (!hardwareInfoSent) {
        const authToken = localStorage.getItem('authToken');
        collectAndSendHardwareInfo(authToken)
          .then(() => {
            console.log('Hardware info collected and sent successfully');
            // Mark as sent for this session
            sessionStorage.setItem('hardwareInfoSent', 'true');
          })
          .catch((error) => {
            console.error('Failed to send hardware info:', error);
            // Don't mark as sent so it can retry next time
          });
      }
    } else {
      // Clear the flag when user logs out
      sessionStorage.removeItem('hardwareInfoSent');
    }
  }, [user]);

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
        <p style={{ color: '#666' }}>Please wait while we initialize...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route 
        path="/auth" 
        element={!user ? <AuthPage /> : <Navigate to="/chat" replace />} 
      />
      <Route
        path="/chat"
        element={user ? <ChatPage /> : <Navigate to="/auth" state={{ from: location }} replace />}
      />
      <Route path="*" element={<Navigate to="/" />} />
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
          Make sure VITE_GOOGLE_CLIENT_ID is set in your .env file
        </p>
      </div>
    );
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </QueryClientProvider>
    </GoogleOAuthProvider>
  );
}

export default App;