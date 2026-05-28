/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-accounts.ts
 * Module:      broker-admin · Accounts API Hook
 * Purpose:     Real API backing for account list and balance pages.
 *              Falls back to mock data when the accounts module has no seeded data.
 *
 * Exports:
 *   - useAccounts()  — returns { accounts, isLoading, error, refetch }
 *   - useAccountBalances(accountId) — returns { balances, isLoading, error }
 *
 * Depends on:
 *   - ../client — apiRequest
 *
 * Side-effects:
 *   - Calls GET /accounts, GET /accounts/:id/balances
 *
 * Key invariants:
 *   - 'use client' safe — only uses browser APIs via apiRequest
 *   - Falls back to empty accounts[] on error so pages still render
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-10
 */

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../client';

/* ── API types (mirror backend entities) ──────────────────────────────────── */

export interface ApiAccount {
  id: string;
  tenantId: string;
  userId: string;
  accountType: 'LIVE' | 'DEMO';
  baseCurrency: string;
  status: 'ACTIVE' | 'DISABLED' | 'SUSPENDED';
  createdAt: string;
  updatedAt: string;
}

export interface ApiBalances {
  totalCash: string;
  lockedCash: string;
  availableCash: string;
  positionsValue: string;
  unrealizedPnl: string;
  equity: string;
  buyingPower: string;
  currency: string;
}

/* ── useAccounts ────────────────────────────────────────────────────────────── */

interface AccountsResult {
  accounts: ApiAccount[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAccounts(): AccountsResult {
  const [accounts, setAccounts] = useState<ApiAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiRequest<ApiAccount[]>('/accounts/all')
      .then(res => { if (!cancelled) setAccounts(res); })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load accounts');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [tick]);

  return { accounts, isLoading, error, refetch };
}

/* ── useAccountBalances ────────────────────────────────────────────────────── */

interface BalancesResult {
  balances: ApiBalances | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAccountBalances(accountId: string): BalancesResult {
  const [balances, setBalances] = useState<ApiBalances | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiRequest<ApiBalances>(`/accounts/${accountId}/balances`)
      .then(res => { if (!cancelled) setBalances(res); })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load balances');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [accountId, tick]);

  return { balances, isLoading, error, refetch };
}