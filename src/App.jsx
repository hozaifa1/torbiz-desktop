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

  // Send hardware info when user logs in
  useEffect(() => {
    if (user) {
      const authToken = localStorage.getItem('authToken');
      collectAndSendHardwareInfo(authToken)
        .then(() => {
          // Hardware info sent successfully (or logged in testing mode)
        })
        .catch(() => {
          // Silent fail - don't interrupt user experience
        });
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