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
    const validateSession = async () => {
      const token = localStorage.getItem('authToken');
      const username = localStorage.getItem('username');
      const profileImageUrl = localStorage.getItem('profileImageUrl');
      const userId = localStorage.getItem('userId'); // Retrieve stored userId

      // Require token, username, AND userId for a valid stored session
      if (token && username && userId) {
        try {
          // Verify token is still valid
          await api.get('/client/list/'); // Using existing endpoint for validation
          // Restore user state including userId
          setUser({ username, profileImageUrl, userId });
        } catch (error) {
          console.error('Session validation failed, clearing session.', error.response?.data || error.message);
          // Clear everything
          localStorage.removeItem('authToken');
          localStorage.removeItem('deviceToken');
          localStorage.removeItem('username');
          localStorage.removeItem('profileImageUrl');
          localStorage.removeItem('userId');
          setUser(null);
        }
      } else {
         // Clear any partial data if anything is missing
         localStorage.removeItem('authToken');
         localStorage.removeItem('deviceToken');
         localStorage.removeItem('username');
         localStorage.removeItem('profileImageUrl');
         localStorage.removeItem('userId');
         setUser(null); // Explicitly set user to null if validation fails
      }
      setLoading(false);
    };

    validateSession();
  }, []);

  const login = async (email, password) => {
    try {
      const response = await api.post('/client/login/', { email, password });

      // --- Strict Check: Ensure token AND user_id are present ---
      if (response.data && response.data.token && response.data.user_id) {
        const userId = response.data.user_id;

        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('deviceToken', response.data.device_token);
        localStorage.setItem('username', response.data.username);
        localStorage.setItem('profileImageUrl', response.data.profile_image || '');
        localStorage.setItem('userId', userId); // Store user_id

        setUser({
          username: response.data.username,
          profileImageUrl: response.data.profile_image,
          userId: userId // Set userId in state
        });

        return response.data;
      } else {
        // Throw error if token or user_id is missing from the response
        throw new Error('Invalid response from server on login (missing token or user_id)');
      }
    } catch (error) {
      console.error("Login failed:", error.response?.data || error.message);
      // Clear storage on failure
      localStorage.removeItem('authToken');
      localStorage.removeItem('deviceToken');
      localStorage.removeItem('username');
      localStorage.removeItem('profileImageUrl');
      localStorage.removeItem('userId');
      setUser(null);
      throw error;
    }
  };

  // --- signup function remains unchanged ---
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

       // --- Strict Check: Ensure token AND user_id are present ---
      if (response.data && response.data.token && response.data.user_id) {
        const userId = response.data.user_id;

        localStorage.setItem('authToken', response.data.token);
        localStorage.setItem('deviceToken', response.data.device_token);
        localStorage.setItem('username', response.data.username);
        localStorage.setItem('profileImageUrl', response.data.profile_image_url || '');
        localStorage.setItem('userId', userId); // Store user_id

        setUser({
          username: response.data.username,
          profileImageUrl: response.data.profile_image_url,
          userId: userId // Set userId in state
        });

        return response.data;
      } else {
        // Throw error if token or user_id is missing from the response
        throw new Error('Invalid response from server during Google login (missing token or user_id)');
      }
    } catch (error) {
      console.error("Google login failed:", error.response?.data || error.message);
       // Clear storage on failure
      localStorage.removeItem('authToken');
      localStorage.removeItem('deviceToken');
      localStorage.removeItem('username');
      localStorage.removeItem('profileImageUrl');
      localStorage.removeItem('userId');
      setUser(null);
      throw error;
    }
  };

  // --- logout function remains unchanged ---
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
      localStorage.removeItem('userId'); // Clear userId
      setUser(null);
      sessionStorage.removeItem('hardwareInfoSent'); // Also clear session storage flag
    }
  };


  const value = { user, loading, login, signup, googleLogin, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};