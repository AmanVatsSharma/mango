/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-clients.ts
 * Module:      broker-admin · Clients API Hook
 * Purpose:     Per-page hook providing real API-backed client data to the /clients page.
 *              Returns the same shape as the clients slice of useBrokerData() so the
 *              page component requires minimal changes. Financial fields (balance, equity,
 *              P&L) default to 0 until the accounts module is wired in Phase 2.
 *
 * Exports:
 *   - useClientsApi()  — returns { clients, isLoading, error, refetch, approveKyc,
 *                         rejectKyc, suspendClient, unsuspendClient }
 *   - ApiUser          — shape returned by GET /admin/users
 *
 * Depends on:
 *   - ../client              — apiRequest
 *
 * Side-effects:
 *   - Calls GET /admin/users, PATCH /admin/users/:id, POST /admin/users/:id/deactivate|reactivate
 *
 * Key invariants:
 *   - 'use client' safe — only uses browser APIs via apiRequest
 *   - Optimistic update: local state is updated immediately; API is fire-and-forget on actions
 *   - KYC status mapping: backend lowercase ('pending') → display title case ('Pending')
 *   - Pagination: fetches page 1, limit 100 for initial load; pagination is Phase 2 work
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-09
 */

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../client';
import type { Client, KYCStatus } from '../../types';

export interface ApiUser {
  id: string;
  tenantId: string;
  mobileE164: string;
  email?: string | null;
  name?: string | null;
  countryCode?: string | null;
  dateOfBirth?: string | null;
  kycStatus: 'pending' | 'verified' | 'rejected';
  isActive: boolean;
  isLocked: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  amlFlag: boolean;
  pepFlag: boolean;
}

interface ListUsersResponse {
  data: ApiUser[];
  total: number;
  page: number;
  limit: number;
}

function mapKycStatus(status: ApiUser['kycStatus']): KYCStatus {
  const map: Record<ApiUser['kycStatus'], KYCStatus> = {
    pending: 'Pending',
    verified: 'Verified',
    rejected: 'Rejected',
  };
  return map[status] ?? 'Pending';
}

function countryFlag(code?: string | null): string {
  if (!code || code.length !== 2) return '🌐';
  const codePoints = [...code.toUpperCase()].map(
    char => 0x1F1E6 - 65 + char.charCodeAt(0),
  );
  return String.fromCodePoint(...codePoints);
}

function mapUserToClient(user: ApiUser): Client {
  const kycStatus = mapKycStatus(user.kycStatus);
  const status = !user.isActive ? 'Suspended' : kycStatus === 'Verified' ? 'Active' : 'Pending';
  return {
    id: user.id,
    name: user.name ?? user.email ?? user.mobileE164,
    email: user.email ?? '',
    phone: user.mobileE164,
    country: user.countryCode ?? '',
    flag: countryFlag(user.countryCode),
    dob: user.dateOfBirth ?? '',
    nationality: '',
    address: '',
    type: 'Retail',
    group: 'Default',
    status,
    kyc: kycStatus,
    kycLevel: 'Basic',
    kycExpiry: null,
    balance: 0,
    equity: 0,
    margin: 0,
    marginPct: null,
    floatPnl: 0,
    openPositions: 0,
    totalDeposited: 0,
    totalWithdrawn: 0,
    bonusBalance: 0,
    credit: 0,
    leverage: '1:1',
    accountCurrency: 'USD',
    regDate: new Date(user.createdAt).toLocaleDateString('en-IN'),
    lastLogin: user.lastLoginAt
      ? new Date(user.lastLoginAt).toLocaleDateString('en-IN')
      : 'Never',
    volumeMTD: 0,
    platform: [],
    suitability: 'PENDING',
    riskProfile: 'Moderate',
    ib: null,
    tags: [],
    amlScore: user.amlFlag ? 75 : 0,
    amlStatus: user.amlFlag ? 'Flagged' : 'Clear',
    notes: [],
  };
}

interface ClientsApiResult {
  clients: Client[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  approveKyc: (clientId: string) => void;
  rejectKyc: (clientId: string) => void;
  suspendClient: (clientId: string) => void;
  unsuspendClient: (clientId: string) => void;
}

export function useClientsApi(): ClientsApiResult {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiRequest<ListUsersResponse>('/admin/users?limit=100')
      .then(res => {
        if (!cancelled) {
          setClients(res.data.map(mapUserToClient));
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load clients');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [tick]);

  // Optimistic update helpers — update local state immediately, fire API in background
  const approveKyc = useCallback((clientId: string) => {
    setClients(prev =>
      prev.map(c => c.id === clientId ? { ...c, kyc: 'Verified' as KYCStatus, status: 'Active' } : c),
    );
    apiRequest(`/admin/users/${clientId}`, {
      method: 'PATCH',
      body: JSON.stringify({ kycStatus: 'verified' }),
    }).catch(() => refetch());
  }, [refetch]);

  const rejectKyc = useCallback((clientId: string) => {
    setClients(prev =>
      prev.map(c => c.id === clientId ? { ...c, kyc: 'Rejected' as KYCStatus } : c),
    );
    apiRequest(`/admin/users/${clientId}`, {
      method: 'PATCH',
      body: JSON.stringify({ kycStatus: 'rejected' }),
    }).catch(() => refetch());
  }, [refetch]);

  const suspendClient = useCallback((clientId: string) => {
    setClients(prev =>
      prev.map(c => c.id === clientId ? { ...c, status: 'Suspended' } : c),
    );
    apiRequest(`/admin/users/${clientId}/deactivate`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Suspended by broker admin' }),
    }).catch(() => refetch());
  }, [refetch]);

  const unsuspendClient = useCallback((clientId: string) => {
    setClients(prev =>
      prev.map(c => c.id === clientId ? { ...c, status: 'Active' } : c),
    );
    apiRequest(`/admin/users/${clientId}/reactivate`, {
      method: 'POST',
    }).catch(() => refetch());
  }, [refetch]);

  return { clients, isLoading, error, refetch, approveKyc, rejectKyc, suspendClient, unsuspendClient };
}
