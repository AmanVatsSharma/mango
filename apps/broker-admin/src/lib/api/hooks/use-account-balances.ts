/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-account-balances.ts
 * Module:      broker-admin · Account Balances API Hook
 * Purpose:     Fetches account balances for a given user when the client drawer opens.
 *              First resolves the user's account ID via GET /accounts?userId=<id>, then
 *              fetches the full balance snapshot via GET /accounts/<aid>/balances.
 *              Populates the financial fields in the ClientDrawer overview tab.
 *
 * Exports:
 *   - useAccountBalances(clientId)  — returns { balances, isLoading, error, refetch }
 *
 * Depends on:
 *   - ../client — apiRequest
 *
 * Side-effects:
 *   - Calls GET /accounts?userId=<id> (resolves account ID)
 *   - Calls GET /accounts/<aid>/balances (fetches balances if account found)
 *
 * Key invariants:
 *   - 'use client' — browser APIs via apiRequest
 *   - Returns null balances on any error so drawer still renders
 *   - Skips requests when clientId is null/undefined (drawer closed)
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { useEffect, useState } from 'react';
import { apiRequest } from '../client';

export interface AccountBalances {
  balance: number;
  equity: number;
  margin: number;
  marginPct: number | null;
  freeMargin: number;
  unrealizedPnL: number;
  bonusBalance: number;
  credit: number;
}

interface AccountEntity {
  id: string;
  userId: string;
  accountCurrency: string;
  accountType: string;
}

interface AccountsResponse {
  data: AccountEntity[];
}

interface BalancesResponse {
  data: AccountBalances;
}

interface AccountBalancesResult {
  balances: AccountBalances | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

const EMPTY_BALANCES: AccountBalances = {
  balance: 0,
  equity: 0,
  margin: 0,
  marginPct: null,
  freeMargin: 0,
  unrealizedPnL: 0,
  bonusBalance: 0,
  credit: 0,
};

export function useAccountBalances(clientId: string | null): AccountBalancesResult {
  const [balances, setBalances] = useState<AccountBalances | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = () => setTick(t => t + 1);

  useEffect(() => {
    if (!clientId) {
      setBalances(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setBalances(null);

    // Step 1: Resolve account ID for this user
    apiRequest<AccountsResponse>(`/accounts?userId=${encodeURIComponent(clientId)}`)
      .then(res => {
        if (cancelled) return;
        const account = res.data?.[0];
        if (!account) {
          // No account found — use empty balances
          setBalances(null);
          setIsLoading(false);
          return;
        }
        // Step 2: Fetch balances for the resolved account
        return apiRequest<BalancesResponse>(`/accounts/${account.id}/balances`);
      })
      .then(res => {
        if (!cancelled && res) {
          setBalances(res.data ?? EMPTY_BALANCES);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load balances');
          setBalances(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [clientId, tick]);

  return { balances, isLoading, error, refetch };
}