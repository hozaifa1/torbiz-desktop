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
      setUser({ username, profileImageUrl });
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      // FINAL, CORRECT PAYLOAD FOR LOGIN: Sends `email` as per the error message.
      const response = await api.post('/client/login/', { email, password });
      localStorage.setItem('authToken', response.data.token);
      localStorage.setItem('deviceToken', response.data.device_token);
      localStorage.setItem('username', response.data.username);
      localStorage.setItem('profileImageUrl', response.data.profile_image);
      setUser({ username: response.data.username, profileImageUrl: response.data.profile_image });
      return response.data;
    } catch (error) {
      console.error("Login API Call Failed:", error.response?.data || error.message);
      throw error;
    }
  };
  
  const signup = async (username, email, password, confirm_password) => {
    try {
        // FINAL, CORRECT PAYLOAD FOR SIGNUP: Sends `username` as required by the User model.
        await api.post('/client/register/', {
          username,
          email,
          password,
          confirm_password,
          terms_accepted: true,
        });
    } catch (error) {
        console.error("Signup API Call Failed:", error.response?.data || error.message);
        throw error;
    }
  };


  const googleLogin = async (token) => {
    try {
      const response = await api.post('/client/google-auth/', { token });
      localStorage.setItem('authToken', response.data.token);
      localStorage.setItem('deviceToken', response.data.device_token);
      localStorage.setItem('username', response.data.username);
      localStorage.setItem('profileImageUrl', response.data.profile_image_url);
      setUser({ username: response.data.username, profileImageUrl: response.data.profile_image_url });
      return response.data;
    } catch (error) {
      console.error("Google Login API Call Failed:", error.response?.data || error.message);
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
        console.error("Logout failed on server, clearing client session anyway.", error);
    } finally {
        localStorage.clear();
        setUser(null);
    }
  };

  const value = { user, loading, login, signup, googleLogin, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};