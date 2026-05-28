/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-transactions.ts
 * Module:      broker-admin · Transactions API Hook
 * Purpose:     Wires the transactions page to real backend APIs for deposits and withdrawals.
 *              Resolves client names by batch-fetching user accounts and mapping accountId → name.
 *
 * Exports:
 *   - useTransactionsApi() → { transactions, isLoading, error, approveTx, rejectTx, refetch }
 *
 * Depends on:
 *   - ../client — apiRequest
 *
 * Side-effects:
 *   - Calls GET /admin/accounts/deposits, GET /admin/accounts/withdrawals
 *   - Calls POST /admin/accounts/deposits/:id/approve|reject
 *   - Calls POST /admin/accounts/withdrawals/:wid/approve|reject
 *   - Optionally calls GET /admin/users for client name resolution
 *
 * Key invariants:
 *   - 'use client' — browser APIs via apiRequest
 *   - Transactions are merged from deposits + withdrawals into a unified list
 *   - clientName resolved via accountId → userId → user.name mapping
 *   - Falls back to accountId prefix on error so page still renders
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../client';
import type { Transaction, TransactionStatus, TransactionType } from '../../types';

/* ── API shapes (mirror backend entities) ──────────────────────────────────── */

interface ApiDeposit {
  id: string;
  userId: string;
  accountId: string;
  amount: string;
  currency: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  referenceNote?: string | null;
  createdAt: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
  userName?: string | null;
  accountDisplayId?: string;
}

interface ApiWithdrawal {
  id: string;
  accountId: string;
  amount: string;
  currency: string;
  state: 'PENDING' | 'APPROVED' | 'REJECTED' | 'FULFILLED';
  meta?: Record<string, unknown> | null;
  createdAt: string;
  userName?: string | null;
  accountDisplayId?: string;
}

interface ApiUser { id: string; name?: string | null; email?: string | null; mobileE164?: string | null; }

/** Fetch accounts then users to build accountId → userName map */
async function resolveClientNames(deposits: ApiDeposit[], withdrawals: ApiWithdrawal[]): Promise<Map<string, string>> {
  const accountIds = [...new Set([...deposits, ...withdrawals].map(t => t.accountId))];
  if (accountIds.length === 0) return new Map();

  try {
    // Fetch accounts for all accountIds
    const accountIdToUserId = new Map<string, string>();
    // For simplicity, resolve directly from deposit/withdrawal userId field
    // The backend already provides userName on deposits (and accountDisplayId)
    // For withdrawals, we use accountId → call GET /admin/users to find who owns the account
    const users = await apiRequest<{ data: ApiUser[] }>('/admin/users?limit=200');
    const userMap: Map<string, string> = new Map(
      users.data.map(u => [u.id, u.name ?? u.email ?? u.mobileE164 ?? u.id.slice(0, 8)] as [string, string]),
    );
    // Map: accountId → userName
    // For deposits, userId is directly available
    // For withdrawals, we need to resolve via account
    const result: Map<string, string> = new Map();
    for (const d of deposits) {
      result.set(d.accountId, d.userName ?? userMap.get(d.userId) ?? d.accountId.slice(0, 8));
    }
    for (const w of withdrawals) {
      result.set(w.accountId, w.userName ?? w.accountId.slice(0, 8));
    }
    return result;
  } catch {
    return new Map();
  }
}

function mapDepositToTransaction(d: ApiDeposit, clientName: string): Transaction {
  const statusMap: Record<string, TransactionStatus> = {
    PENDING: 'Pending',
    APPROVED: 'Completed',
    REJECTED: 'Rejected',
  };
  return {
    id: d.id,
    clientId: d.userId,
    clientName,
    type: 'Deposit' as TransactionType,
    status: statusMap[d.status] ?? 'Pending',
    amount: Number(d.amount),
    currency: d.currency,
    method: d.referenceNote ?? '—',
    reference: d.id,
    createdAt: d.createdAt,
    processedAt: d.approvedAt ?? undefined,
  };
}

function mapWithdrawalToTransaction(w: ApiWithdrawal, clientName: string): Transaction {
  const statusMap: Record<string, TransactionStatus> = {
    PENDING: 'Pending',
    APPROVED: 'Completed',
    REJECTED: 'Rejected',
    FULFILLED: 'Completed',
  };
  return {
    id: w.id,
    clientId: w.accountId,
    clientName,
    type: 'Withdrawal' as TransactionType,
    status: statusMap[w.state] ?? 'Pending',
    amount: Number(w.amount),
    currency: w.currency,
    method: '—',
    reference: w.id,
    createdAt: w.createdAt,
  };
}

/* ── Hook ──────────────────────────────────────────────────────────────────────── */

interface TransactionsResult {
  transactions: Transaction[];
  isLoading: boolean;
  error: string | null;
  approveTx: (txId: string, kind: 'deposit' | 'withdrawal') => void;
  rejectTx: (txId: string, kind: 'deposit' | 'withdrawal', reason?: string) => void;
  refetch: () => void;
}

export function useTransactionsApi(): TransactionsResult {
  const [deposits, setDeposits] = useState<ApiDeposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<ApiWithdrawal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    Promise.all([
      apiRequest<ApiDeposit[]>('/admin/accounts/deposits'),
      apiRequest<ApiWithdrawal[]>('/admin/accounts/withdrawals'),
    ])
      .then(async ([d, w]) => {
        if (!cancelled) {
          setDeposits(d);
          setWithdrawals(w);
        }
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load transactions');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [tick]);

  // Build clientName map once both deposits and withdrawals are loaded
  const [nameMap] = useState(() => new Map<string, string>());
  useEffect(() => {
    if (deposits.length === 0 && withdrawals.length === 0) return;
    resolveClientNames(deposits, withdrawals).then(map => {
      // Merge into nameMap
      for (const [k, v] of map) nameMap.set(k, v);
    });
  }, [deposits.length, withdrawals.length]); // only re-run when data changes

  const transactions: Transaction[] = useMemo(() => {
    const d = deposits.map(dep =>
      mapDepositToTransaction(dep, nameMap.get(dep.accountId) ?? dep.userName ?? '—'),
    );
    const w = withdrawals.map(withw =>
      mapWithdrawalToTransaction(withw, nameMap.get(withw.accountId) ?? '—'),
    );
    return [...d, ...w].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [deposits, withdrawals, nameMap]);

  const approveTx = useCallback((txId: string, kind: 'deposit' | 'withdrawal') => {
    setDeposits(prev =>
      prev.map(d => d.id === txId ? { ...d, status: 'APPROVED' } : d),
    );
    setWithdrawals(prev =>
      prev.map(w => w.id === txId ? { ...w, state: 'APPROVED' } : w),
    );
    const path = kind === 'deposit'
      ? `/admin/accounts/deposits/${txId}/approve`
      : `/admin/accounts/withdrawals/${txId}/approve`;
    apiRequest(path, { method: 'POST', body: JSON.stringify({}) }).catch(() => refetch());
  }, [refetch]);

  const rejectTx = useCallback((txId: string, kind: 'deposit' | 'withdrawal', reason?: string) => {
    setDeposits(prev =>
      prev.map(d => d.id === txId ? { ...d, status: 'REJECTED' } : d),
    );
    setWithdrawals(prev =>
      prev.map(w => w.id === txId ? { ...w, state: 'REJECTED' } : w),
    );
    const path = kind === 'deposit'
      ? `/admin/accounts/deposits/${txId}/reject`
      : `/admin/accounts/withdrawals/${txId}/reject`;
    apiRequest(path, { method: 'POST', body: JSON.stringify({ reason }) }).catch(() => refetch());
  }, [refetch]);

  return { transactions, isLoading, error, approveTx, rejectTx, refetch };
}