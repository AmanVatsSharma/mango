/**
 * File:        apps/frontend/lib/types/auth.ts
 * Module:      Authentication types for frontend
 * Purpose:     TypeScript types for auth state, user, and JWT token claims
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-17
 */

export interface User {
  id: string;
  email: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'NOT_STARTED';
  role: 'USER' | 'ADMIN' | 'MODERATOR' | 'SUPER_ADMIN';
  tradingAccountId?: string;
  hasMpin?: boolean;
  sessionSecurityStepUpPending?: boolean;
  clientId?: string;
  createdAt?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
  otpCode?: string;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: User;
}

export interface RegisterData {
  email: string;
  password: string;
  phone: string;
  firstName?: string;
  lastName?: string;
}

export interface OtpVerifyData {
  phone: string;
  otpCode: string;
  purpose: 'LOGIN' | 'REGISTER' | 'MPIN_SETUP' | 'WITHDRAWAL' | '2FA';
}

export interface ForgotPasswordData {
  email: string;
}

export interface ResetPasswordData {
  token: string;
  newPassword: string;
}

export interface MpinSetupData {
  mpin: string;
}

export interface TotpInitResponse {
  otpauthUrl: string;
  base32: string;
}

export interface TotpVerifyData {
  code: string;
}

export interface SessionInfo {
  id: string;
  jti: string;
  userAgent: string;
  ipAddress: string;
  createdAt: string;
  lastActiveAt: string;
  isCurrent: boolean;
}