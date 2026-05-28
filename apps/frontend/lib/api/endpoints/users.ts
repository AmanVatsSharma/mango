/**
 * File:        apps/frontend/lib/api/endpoints/users.ts
 * Module:      Users API — profile, KYC, referral
 * Purpose:     All user management HTTP calls to NestJS backend
 *
 * Depends on:
 *   - lib/api/client.ts — Axios instance
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-17
 */

import apiClient from '../client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type KycStatus = 'NOT_STARTED' | 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface UserProfile {
  id: string;
  email: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  kycStatus: KycStatus;
  hasMpin: boolean;
  role: string;
  referralCode?: string;
  referralCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfileData {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface KycDocument {
  id: string;
  type: 'AADHAR' | 'PAN' | 'BANK_ACCOUNT' | 'ADDRESS_PROOF' | 'SIGNATURE';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  documentNumber?: string;
  uploadedAt: string;
  verifiedAt?: string;
  rejectionReason?: string;
}

export interface ReferralInfo {
  code: string;
  totalReferrals: number;
  totalEarnings: number;
  pendingEarnings: number;
  paidEarnings: number;
}

// ─── API Functions ────────────────────────────────────────────────────────────

export const usersApi = {
  // GET /users/profile
  getProfile: async (): Promise<UserProfile> => {
    const response = await apiClient.get<UserProfile>('/users/profile');
    return response.data;
  },

  // PUT /users/profile
  updateProfile: async (data: UpdateProfileData): Promise<UserProfile> => {
    const response = await apiClient.put<UserProfile>('/users/profile', data);
    return response.data;
  },

  // GET /users/kyc
  getKycStatus: async (): Promise<{ status: KycStatus; documents: KycDocument[] }> => {
    const response = await apiClient.get<{ status: KycStatus; documents: KycDocument[] }>('/users/kyc');
    return response.data;
  },

  // POST /users/kyc/upload
  uploadKycDocument: async (formData: FormData): Promise<KycDocument> => {
    const response = await apiClient.post<KycDocument>('/users/kyc/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // GET /users/referral
  getReferralInfo: async (): Promise<ReferralInfo> => {
    const response = await apiClient.get<ReferralInfo>('/users/referral');
    return response.data;
  },
};