/**
 * File:        apps/frontend/lib/api/client.ts
 * Module:      API Client — Axios HTTP client for NestJS backend
 * Purpose:     Centralized HTTP client with JWT auth interceptor and 401 handling.
 *              All REST calls to the NestJS backend go through this instance.
 *
 * Environment:
 *   NEXT_PUBLIC_API_URL — base URL of NestJS backend (default: http://localhost:3001)
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-17
 */

import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Token storage (in-memory + localStorage for persistence)
export const storage = {
  getToken: () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('auth_token');
  },
  setToken: (token: string) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('auth_token', token);
  },
  removeToken: () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('auth_token');
  },
  getRefreshToken: () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('refresh_token');
  },
  setRefreshToken: (token: string) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('refresh_token', token);
  },
  removeRefreshToken: () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('refresh_token');
  },
};

// Create Axios instance
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Flag to prevent infinite refresh loops
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

function onRefreshComplete(token: string) {
  refreshSubscribers.forEach(cb => cb(token));
  refreshSubscribers = [];
}

// Attach JWT Bearer token to every request
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = storage.getToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Handle 401 — attempt token refresh, then redirect to login
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(apiClient(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = storage.getRefreshToken();
        if (!refreshToken) throw new Error('No refresh token');

        const response = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
        const { token, refreshToken: newRefreshToken } = response.data;

        storage.setToken(token);
        storage.setRefreshToken(newRefreshToken);
        onRefreshComplete(token);

        originalRequest.headers.Authorization = `Bearer ${token}`;
        return apiClient(originalRequest);
      } catch {
        storage.removeToken();
        storage.removeRefreshToken();
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }
      } finally {
        isRefreshing = false;
        refreshSubscribers = [];
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;

// Shared types used across the API layer
export interface AuthResponse {
  success?: string;
  error?: string;
  redirectTo?: string;
  sessionToken?: string;
  requiresOtp?: boolean;
  requiresMpin?: boolean;
  requiresKyc?: boolean;
  kycStatus?: string;
  token?: string;
  refreshToken?: string;
  user?: {
    id?: string;
    name?: string;
    email?: string;
    phone?: string;
    clientId?: string;
  };
}