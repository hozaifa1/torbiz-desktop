import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

// Interceptor to add the auth token to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Token ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor to handle 401 (Unauthorized) responses
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // If we get a 401, the token is invalid - clear storage
    if (error.response && error.response.status === 401) {
      console.log('Received 401 - Token is invalid, clearing session');
      localStorage.removeItem('authToken');
      localStorage.removeItem('deviceToken');
      localStorage.removeItem('username');
      localStorage.removeItem('profileImageUrl');
      
      // Redirect to auth page if not already there
      if (!window.location.pathname.includes('/auth')) {
        window.location.href = '/auth';
      }
    }
    return Promise.reject(error);
  }
);

export default api;