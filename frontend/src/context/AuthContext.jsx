import React, { createContext, useContext, useState, useEffect } from 'react';
import authService from '../services/authService';
import { MOCK_USER, MOCK_STAFF_USER, MOCK_ADMIN_USER } from '../services/mockData';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initAuth() {
      try {
        const savedUser = localStorage.getItem('smart_parking_user');
        const token = localStorage.getItem('smart_parking_token');
        if (savedUser) {
          try {
            setUser(JSON.parse(savedUser));
          } catch {
            setUser(null);
          }
        } else {
          setUser(null);
        }

        // Fetch latest user profile from backend to sync role changes in real time
        if (token && !token.startsWith('mock_token_')) {
          try {
            const freshUser = await authService.getCurrentUser();
            if (freshUser && freshUser.id) {
              setUser(freshUser);
              localStorage.setItem('smart_parking_user', JSON.stringify(freshUser));
            }
          } catch {
            // Keep existing savedUser if server temporarily unreachable
          }
        }
      } catch (err) {
        console.error('Error loading initial user state:', err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    initAuth();
  }, []);

  const login = async (credentials) => {
    setLoading(true);
    try {
      const data = await authService.login(credentials);
      setUser(data.user);
      return data.user;
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData) => {
    setLoading(true);
    try {
      const data = await authService.register(userData);
      setUser(data.user);
      return data.user;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    authService.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
