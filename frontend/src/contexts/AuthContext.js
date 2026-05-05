import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('wm_token'));
  const [loading, setLoading] = useState(true);

  const api = useCallback(() => {
    const instance = axios.create({
      baseURL: API_URL,
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    instance.interceptors.response.use(
      response => response,
      error => {
        const status = error.response?.status;
        if (status === 401) {
          // Token expired or invalid - logout
          localStorage.removeItem('wm_token');
          setToken(null);
          setUser(null);
          window.location.href = '/login';
        }
        if (status === 403) {
          // Demo read-only mode (or any forbidden write)
          const detail = error.response?.data?.detail;
          if (typeof detail === 'string' && detail.toLowerCase().includes('демо')) {
            toast.error('Демо-режим: изменения запрещены', {
              description: 'Зарегистрируйтесь для полного доступа.',
            });
          }
        }
        return Promise.reject(error);
      }
    );

    return instance;
  }, [token]);

  useEffect(() => {
    const checkAuth = async () => {
      if (token) {
        try {
          const res = await api().get('/auth/me');
          setUser(res.data);
        } catch (e) {
          localStorage.removeItem('wm_token');
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    };
    checkAuth();
  }, [token, api]);

  const login = async (email, password) => {
    const res = await axios.post(`${API_URL}/auth/login`, { email, password });
    localStorage.setItem('wm_token', res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const register = async (email, password, name) => {
    const res = await axios.post(`${API_URL}/auth/register`, { email, password, name });
    localStorage.setItem('wm_token', res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const loginAsDemo = async () => {
    const res = await axios.post(`${API_URL}/auth/demo-login`);
    localStorage.setItem('wm_token', res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('wm_token');
    setToken(null);
    setUser(null);
  };

  const isDemo = user?.role === 'demo';
  const workspaceRole = user?.workspace_role || 'owner';
  const canManageWorkspace = ['owner', 'admin'].includes(workspaceRole) || user?.role === 'superadmin';
  const isReadOnlyRole = ['accountant', 'viewer'].includes(workspaceRole);

  const value = useMemo(() => ({
    user, token, loading, login, register, logout, loginAsDemo, isDemo,
    workspaceRole, canManageWorkspace, isReadOnlyRole, api
  }), [user, token, loading, isDemo, workspaceRole, canManageWorkspace, isReadOnlyRole, api]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
