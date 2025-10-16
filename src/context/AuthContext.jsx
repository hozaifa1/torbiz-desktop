import { createContext, useState, useEffect, useContext } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // This effect now correctly validates the session against the existing API.
  useEffect(() => {
    const validateSession = async () => {
      const token = localStorage.getItem('authToken');
      const username = localStorage.getItem('username');
      const profileImageUrl = localStorage.getItem('profileImageUrl');
      
      if (token && username) {
        try {
          // Verify token is still valid by making a test request to an existing protected endpoint.
          // This is a workaround because a dedicated /me/ endpoint is not available.
          await api.get('/client/list/'); 
          
          // If the request succeeds, the token is valid. Restore the user from localStorage.
          setUser({ username, profileImageUrl });
        } catch (error) {
          console.error('Session validation failed, token is likely expired or invalid.', error.response?.data || error.message);
          // Token is invalid, clear everything.
          localStorage.removeItem('authToken');
          localStorage.removeItem('deviceToken');
          localStorage.removeItem('username');
          localStorage.removeItem('profileImageUrl');
          setUser(null);
        }
      }
      
      setLoading(false);
    };

    validateSession();
  }, []);

  const login = async (email, password) => {
    try {
      const response = await api.post('/client/login/', { email, password });
      
      if (response.data && response.data.token) {
        // Correctly store all user-related data from the login response to localStorage.
        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('deviceToken', response.data.device_token);
        localStorage.setItem('username', response.data.username);
        localStorage.setItem('profileImageUrl', response.data.profile_image || '');
        
        // Set the user state from the login response.
        setUser({ 
          username: response.data.username, 
          profileImageUrl: response.data.profile_image 
        });
        
        return response.data;
      } else {
        throw new Error('Invalid response from server on login');
      }
    } catch (error) {
      console.error("Login failed:", error.response?.data || error.message);
      throw error;
    }
  };
  
  const signup = async (username, email, password, confirm_password) => {
    try {
      const response = await api.post('/client/register/', {
        username,
        email,
        password,
        confirm_password,
        terms_accepted: true,
      });
      
      return response.data;
    } catch (error) {
      console.error("Signup failed:", error.response?.data || error.message);
      throw error;
    }
  };

  const googleLogin = async (idToken) => {
    try {
      const response = await api.post('/client/google-auth/', { token: idToken });
      
      if (response.data && response.data.token) {
        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('deviceToken', response.data.device_token);
        localStorage.setItem('username', response.data.username);
        localStorage.setItem('profileImageUrl', response.data.profile_image_url || '');
        
        setUser({ 
          username: response.data.username, 
          profileImageUrl: response.data.profile_image_url 
        });
        
        return response.data;
      } else {
        throw new Error('Invalid response from server during Google login');
      }
    } catch (error) {
      console.error("Google login failed:", error.response?.data || error.message);
      throw error;
    }
  };

  const logout = async () => {
    const deviceToken = localStorage.getItem('deviceToken');
    
    try {
      if (deviceToken) {
        await api.post('/client/logout/', { device_token: deviceToken });
      }
    } catch (error) {
      console.error("Server logout failed, clearing client session regardless.", error);
    } finally {
      // Clear all auth-related items from localStorage.
      localStorage.removeItem('authToken');
      localStorage.removeItem('deviceToken');
      localStorage.removeItem('username');
      localStorage.removeItem('profileImageUrl');
      setUser(null);
      sessionStorage.removeItem('hardwareInfoSent');
    }
  };

  const value = { user, loading, login, signup, googleLogin, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};