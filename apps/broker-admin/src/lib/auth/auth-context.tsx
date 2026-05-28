/**
 * File:        apps/broker-admin/src/lib/auth/auth-context.tsx
 * Module:      broker-admin · Auth Context
 * Purpose:     Stores the broker admin JWT + user identity in sessionStorage and
 *              exposes login/logout to the rest of the app. Tenant identity comes
 *              separately from TenantContext.
 *
 * Exports:
 *   - AuthProvider({ children }) — wraps the app; hydrates from sessionStorage on mount
 *   - useAuth()                  — returns { user, accessToken, isAuthenticated, login, logout }
 *
 * Side-effects:
 *   - Reads and writes 'ba_access_token', 'ba_user_mobile' from sessionStorage
 *
 * Key invariants:
 *   - 'use client' — sessionStorage is unavailable during SSR
 *   - isAuthenticated is false until hydration completes (prevents SSR flash)
 *   - Token storage: access token in sessionStorage only (v1 — re-login on expiry is acceptable)
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-09
 */

'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

interface AuthUser {
  userId: string;
  mobile: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (token: string, mobile: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function decodeUserId(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.sub ?? '';
  } catch {
    return '';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem('ba_access_token');
    const mobile = sessionStorage.getItem('ba_user_mobile');
    if (token && mobile) {
      setAccessToken(token);
      setUser({ userId: decodeUserId(token), mobile });
    }
    setHydrated(true);
  }, []);

  const login = useCallback((token: string, mobile: string) => {
    sessionStorage.setItem('ba_access_token', token);
    sessionStorage.setItem('ba_user_mobile', mobile);
    setAccessToken(token);
    setUser({ userId: decodeUserId(token), mobile });
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('ba_access_token');
    sessionStorage.removeItem('ba_user_mobile');
    sessionStorage.removeItem('ba_tenant_code');
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, accessToken, isAuthenticated: hydrated && !!accessToken, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
