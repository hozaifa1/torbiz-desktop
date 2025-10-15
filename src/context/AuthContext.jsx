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

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const username = localStorage.getItem('username');
    const profileImageUrl = localStorage.getItem('profileImageUrl');
    
    if (token && username) {
      console.log('Restoring user session:', username);
      setUser({ username, profileImageUrl });
    }
    
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      console.log('Attempting login for:', email);
      const response = await api.post('/client/login/', { email, password });
      
      if (response.data && response.data.token) {
        console.log('Login successful');
        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('deviceToken', response.data.device_token);
        localStorage.setItem('username', response.data.username);
        localStorage.setItem('profileImageUrl', response.data.profile_image || '');
        
        setUser({ 
          username: response.data.username, 
          profileImageUrl: response.data.profile_image 
        });
        
        return response.data;
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error("Login failed:", error.response?.data || error.message);
      throw error;
    }
  };
  
  const signup = async (username, email, password, confirm_password) => {
    try {
      console.log('Attempting signup for:', username);
      const response = await api.post('/client/register/', {
        username,
        email,
        password,
        confirm_password,
        terms_accepted: true,
      });
      
      console.log('Signup successful');
      return response.data;
    } catch (error) {
      console.error("Signup failed:", error.response?.data || error.message);
      throw error;
    }
  };

  const googleLogin = async (token) => {
    try {
      console.log('Attempting Google login');
      const response = await api.post('/client/google-auth/', { token });
      
      if (response.data && response.data.token) {
        console.log('Google login successful');
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
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error("Google login failed:", error.response?.data || error.message);
      
      // Provide more specific error messages
      if (error.response?.status === 400) {
        throw new Error('Invalid Google authentication token');
      } else if (error.response?.status === 401) {
        throw new Error('Google authentication failed. Please try again.');
      } else if (error.response?.status === 500) {
        throw new Error('Server error. Please try again later.');
      }
      
      throw error;
    }
  };

  const logout = async () => {
    const deviceToken = localStorage.getItem('deviceToken');
    console.log('Logging out...');
    
    try {
      if (deviceToken) {
        await api.post('/client/logout/', { device_token: deviceToken });
      }
      console.log('Logout successful');
    } catch (error) {
      console.error("Logout failed on server, clearing client session anyway.", error);
    } finally {
      localStorage.clear();
      setUser(null);
    }
  };

  const value = { user, loading, login, signup, googleLogin, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};