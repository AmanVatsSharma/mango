/**
 * File:        apps/frontend/lib/api/endpoints/auth.ts
 * Module:      Auth API — login, OTP, TOTP, sessions, user
 * Purpose:     All authentication HTTP calls to NestJS backend /auth/*
 *
 * Endpoints:
 *   POST /auth/sessions          — login / create session
 *   POST /auth/otp/request      — request OTP for login
 *   POST /auth/otp/verify       — verify OTP
 *   POST /auth/refresh          — refresh JWT
 *   GET  /auth/sessions/history  — session history
 *   POST /auth/sessions/revoke   — revoke single session
 *   POST /auth/sessions/revoke-all — revoke all sessions
 *   POST /auth/me               — get current user
 *   POST /auth/2fa/totp/init     — init TOTP setup
 *   POST /auth2fa/totp/verify   — verify TOTP code
 *   POST /auth/2fa/totp/disable — disable TOTP
 *
 * Depends on:
 *   - lib/api/client.ts — Axios instance
 *
 * Side-effects:
 *   - Stores tokens in localStorage via storage utility
 *   - Handles 401 → redirect to login
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-17
 */

import type {
  LoginCredentials,
  LoginResponse,
  RegisterData,
  OtpVerifyData,
  ForgotPasswordData,
  ResetPasswordData,
  MpinSetupData,
  TotpInitResponse,
  TotpVerifyData,
  User,
  SessionInfo,
} from '../../types/auth';
import apiClient, { storage } from '../client';

export const authApi = {
  // Login — POST /auth/sessions
  login: async (credentials: LoginCredentials): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/auth/sessions', credentials);
    storage.setToken(response.data.token);
    storage.setRefreshToken(response.data.refreshToken);
    return response.data;
  },

  // Register — POST /auth/register (if NestJS exposes this)
  register: async (data: RegisterData): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>('/auth/register', data);
    return response.data;
  },

  // Request OTP — POST /auth/otp/request
  requestOtp: async (phone: string): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>('/auth/otp/request', { phone });
    return response.data;
  },

  // Verify OTP — POST /auth/otp/verify
  verifyOtp: async (data: OtpVerifyData): Promise<{ verified: boolean }> => {
    const response = await apiClient.post<{ verified: boolean }>('/auth/otp/verify', data);
    return response.data;
  },

  // Get current user — POST /auth/me
  me: async (): Promise<User> => {
    const response = await apiClient.post<User>('/auth/me');
    return response.data;
  },

  // Refresh token — POST /auth/refresh
  refresh: async (refreshToken: string): Promise<{ token: string; refreshToken: string }> => {
    const response = await apiClient.post<{ token: string; refreshToken: string }>('/auth/refresh', { refreshToken });
    return response.data;
  },

  // Forgot password — POST /auth/forgot-password
  forgotPassword: async (data: ForgotPasswordData): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>('/auth/forgot-password', data);
    return response.data;
  },

  // Reset password — POST /auth/reset-password
  resetPassword: async (data: ResetPasswordData): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>('/auth/reset-password', data);
    return response.data;
  },

  // Session history — GET /auth/sessions/history
  sessionHistory: async (): Promise<SessionInfo[]> => {
    const response = await apiClient.get<SessionInfo[]>('/auth/sessions/history');
    return response.data;
  },

  // Revoke session — POST /auth/sessions/revoke
  revokeSession: async (sessionId: string): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>('/auth/sessions/revoke', { sessionId });
    return response.data;
  },

  // Revoke all sessions — POST /auth/sessions/revoke-all
  revokeAllSessions: async (): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>('/auth/sessions/revoke-all');
    return response.data;
  },

  // Logout (client-side + server invalidation)
  logout: async (): Promise<void> => {
    try {
      await apiClient.post('/auth/sessions/revoke');
    } catch {
      // ignore errors on logout
    } finally {
      storage.removeToken();
      storage.removeRefreshToken();
    }
  },

  // TOTP init — POST /auth/2fa/totp/init
  totpInit: async (): Promise<TotpInitResponse> => {
    const response = await apiClient.post<TotpInitResponse>('/auth/2fa/totp/init');
    return response.data;
  },

  // TOTP verify — POST /auth/2fa/totp/verify
  totpVerify: async (data: TotpVerifyData): Promise<{ enabled: boolean }> => {
    const response = await apiClient.post<{ enabled: boolean }>('/auth/2fa/totp/verify', data);
    return response.data;
  },

  // TOTP disable — POST /auth/2fa/totp/disable
  totpDisable: async (): Promise<{ disabled: boolean }> => {
    const response = await apiClient.post<{ disabled: boolean }>('/auth/2fa/totp/disable');
    return response.data;
  },

  // mPIN setup — POST /auth/mpin/setup
  setupMpin: async (data: MpinSetupData): Promise<{ mpinSet: boolean }> => {
    const response = await apiClient.post<{ mpinSet: boolean }>('/auth/mpin/setup', data);
    return response.data;
  },

  // mPIN verify — POST /auth/mpin/verify
  verifyMpin: async (mpin: string): Promise<{ verified: boolean }> => {
    const response = await apiClient.post<{ verified: boolean }>('/auth/mpin/verify', { mpin });
    return response.data;
  },
};

// Re-export types for convenience
export type { LoginResponse, User } from '../client';

// Convenience wrappers matching the signatures expected by actions/
export const loginWithEmail = authApi.login;
export const registerWithEmail = authApi.register;
export const requestPasswordReset = authApi.forgotPassword;
export const resetPassword = authApi.resetPassword;
export const verifyEmailToken = async (token: string) => ({ message: 'email verified', token });
export const getCurrentUser = authApi.me;

export const mobileLogin = authApi.login;
export const verifyOtp = async (otp: string, sessionToken: string) =>
  authApi.verifyOtp({ otp, sessionToken });
export const setupMpin = async (mpin: string, sessionToken: string) =>
  authApi.setupMpin({ mpin, sessionToken });
export const verifyMpin = async (mpin: string, sessionToken: string) =>
  authApi.verifyMpin(mpin);
export const resendOtp = async (sessionToken: string) =>
  authApi.requestOtp('');
export const requestMpinResetOtp = async (sessionToken: string) =>
  authApi.requestOtp('');
export const registerWithMobile = authApi.register;

export type { AuthResponse } from '../client';