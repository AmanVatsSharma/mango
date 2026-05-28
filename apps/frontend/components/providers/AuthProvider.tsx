/**
 * File:        apps/frontend/components/providers/AuthProvider.tsx
 * Module:      Authentication Provider — JWT auth state management
 * Purpose:     React context providing auth state (user, token, login, logout)
 *              throughout the application. Replaces NextAuth's SessionProvider.
 *
 * Usage:
 *   <AuthProvider>
 *     <ThemeProvider>
 *       {children}
 *     </ThemeProvider>
 *   </AuthProvider>
 *
 * Depends on:
 *   - lib/api/endpoints/auth.ts — authApi calls
 *   - lib/types/auth.ts — User, LoginCredentials types
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-17
 */

'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { User, LoginCredentials, LoginResponse } from '@/lib/types/auth';
import { authApi } from '@/lib/api/endpoints/auth';
import { storage } from '@/lib/api/client';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: check for existing token and fetch user
  useEffect(() => {
    const storedToken = storage.getToken();
    if (storedToken) {
      setToken(storedToken);
      authApi.me()
        .then(setUser)
        .catch(() => {
          storage.removeToken();
          storage.removeRefreshToken();
          setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (credentials: LoginCredentials): Promise<LoginResponse> => {
    setIsLoading(true);
    try {
      const response = await authApi.login(credentials);
      setUser(response.user);
      setToken(response.token);
      return response;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setToken(null);
      setIsLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async (): Promise<void> => {
    if (!storage.getToken()) return;
    try {
      const currentUser = await authApi.me();
      setUser(currentUser);
    } catch {
      // ignore errors on refresh
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated: !!user && !!token,
      login,
      logout,
      refreshUser,
    }),
    [user, token, isLoading, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return context;
}

export { AuthContext };