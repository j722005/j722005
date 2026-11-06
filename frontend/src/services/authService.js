import api from './api';
import { MOCK_USER, MOCK_STAFF_USER, MOCK_ADMIN_USER } from './mockData';

export const authService = {
  async login(credentials) {
    try {
      const response = await api.post('/auth/login/', credentials);
      if (response.data?.token) {
        localStorage.setItem('smart_parking_token', response.data.token);
      }
      if (response.data?.user) {
        localStorage.setItem('smart_parking_user', JSON.stringify(response.data.user));
      }
      return response.data;
    } catch (error) {
      // If server responded with an error (e.g. 401 Invalid Credentials, 400 Bad Request),
      // respect the real backend response and do not mask it with a mock!
      if (error.response) {
        throw error;
      }

      console.warn('[Network Offline Fallback] Django backend server not reachable. Using offline demo profile.', error.message);
      const { username } = credentials;
      let matchedUser = MOCK_USER;

      if (username?.toLowerCase().includes('admin') || username === 'admin') {
        matchedUser = MOCK_ADMIN_USER;
      } else if (username?.toLowerCase().includes('staff') || username === 'staff') {
        matchedUser = MOCK_STAFF_USER;
      }

      const mockResponse = {
        token: `mock_token_${matchedUser.role}_${Date.now()}`,
        user: matchedUser,
      };

      localStorage.setItem('smart_parking_token', mockResponse.token);
      localStorage.setItem('smart_parking_user', JSON.stringify(matchedUser));
      return mockResponse;
    }
  },

  async register(userData) {
    try {
      const response = await api.post('/auth/register/', userData);
      if (response.data?.token) {
        localStorage.setItem('smart_parking_token', response.data.token);
      }
      if (response.data?.user) {
        localStorage.setItem('smart_parking_user', JSON.stringify(response.data.user));
      }
      return response.data;
    } catch (error) {
      if (error.response) {
        throw error;
      }

      console.warn('[Network Offline Fallback] Django backend server not reachable. Simulating offline account registration.', error.message);
      const newUser = {
        id: Date.now(),
        username: userData.username,
        email: userData.email,
        name: userData.first_name || userData.username,
        role: 'customer',
      };
      const mockResponse = {
        token: `mock_token_customer_${Date.now()}`,
        user: newUser,
      };
      localStorage.setItem('smart_parking_token', mockResponse.token);
      localStorage.setItem('smart_parking_user', JSON.stringify(newUser));
      return mockResponse;
    }
  },

  async getCurrentUser() {
    try {
      const response = await api.get('/auth/user/');
      if (response.data) {
        localStorage.setItem('smart_parking_user', JSON.stringify(response.data));
      }
      return response.data;
    } catch (error) {
      const saved = localStorage.getItem('smart_parking_user');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
      return MOCK_USER;
    }
  },

  logout() {
    api.post('/auth/logout/').catch(() => {});
    localStorage.removeItem('smart_parking_token');
    localStorage.removeItem('smart_parking_user');
  },
};

export default authService;
