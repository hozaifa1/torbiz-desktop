// src/App.jsx
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useEffect } from 'react';
import { Loader } from 'lucide-react';
import HomePage from './pages/HomePage';
import AuthPage from './pages/AuthPage';
import ChatPage from './pages/ChatPage';
import NetworkPage from './pages/NetworkPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import NotFoundPage from './pages/NotFoundPage';
import { collectAndSendHardwareInfo } from './utils/hardwareService';
import { checkForUpdates } from './utils/updateService';

const queryClient = new QueryClient();
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID; //

// This component uses the auth context and will be rendered inside the provider
function AppRoutes() {
  const { user, loading } = useAuth(); // Get user object which now contains 'id'
  const location = useLocation();

  // Check for updates on app startup and periodically
  useEffect(() => {
    console.log('[APP] Setting up update checker...');
    
    // Check immediately on mount
    checkForUpdates().catch(error => {
      console.error('[APP] Initial update check failed:', error);
    });
    
    // Check every 4 hours for updates
    const updateInterval = setInterval(() => {
      console.log('[APP] Running periodic update check...');
      checkForUpdates().catch(error => {
        console.error('[APP] Periodic update check failed:', error);
      });
    }, 4 * 60 * 60 * 1000); // 4 hours
    
    // Cleanup interval on unmount
    return () => {
      console.log('[APP] Cleaning up update checker');
      clearInterval(updateInterval);
    };
  }, []); // Run once on mount

  // Send hardware info when user logs in (but only once per session)
  useEffect(() => {
    // Ensure user exists and has an id before proceeding
    if (user && user.userId) {
      const hardwareInfoSent = sessionStorage.getItem('hardwareInfoSent');

      if (!hardwareInfoSent) {
        const authToken = localStorage.getItem('authToken');
        // Pass the user.userId to the function
        collectAndSendHardwareInfo(user.userId, authToken)
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
      <div className="loading-container">
        <div className="spinner spinner-lg text-primary"></div>
        <h2>Loading Application...</h2>
        <p className="text-muted">Validating session...</p>
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
      {/* Network page protected */}
      <Route
        path="/network"
        element={user ? <NetworkPage /> : <Navigate to="/auth" state={{ from: location }} replace />}
      />
      {/* Profile page protected */}
      <Route
        path="/profile"
        element={user ? <ProfilePage /> : <Navigate to="/auth" state={{ from: location }} replace />}
      />
      {/* Settings page protected */}
      <Route
        path="/settings"
        element={user ? <SettingsPage /> : <Navigate to="/auth" state={{ from: location }} replace />}
      />
      {/* 404 Not Found - Must be last */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

// The main App component now sets up all providers
function App() {
  if (!googleClientId) {
    return (
      <div className="loading-container">
        <h2>Configuration Error</h2>
        <p className="text-error">
          Google Client ID is missing. Please check your .env file.
        </p>
        <p className="text-muted" style={{ fontSize: '0.9em' }}>
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