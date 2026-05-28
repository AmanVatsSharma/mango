/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-ib-commissions.ts
 * Module:      broker-admin · IB Commissions API Hook
 * Purpose:     Wires the IB commissions page to real backend APIs — listing IBs with
 *              commission summaries and running batch commission payouts.
 *
 * Exports:
 *   - useIbCommissions() → { ibs, isLoading, error, refetch, runPayout, isRunning }
 *
 * Depends on:
 *   - ../client — apiRequest
 *
 * Side-effects:
 *   - GET /admin/ibs — list IBs
 *   - POST /admin/ibs/:id/payout — single IB payout
 *   - POST /admin/commissions/run — batch payout for all IBs
 *
 * Key invariants:
 *   - 'use client' — browser APIs via apiRequest
 *   - Optimistic update: local state updated on payout; API called in background
 *   - Fallback: returns empty list on error so page still renders
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../client';
import type { IntroducingBroker } from '../../types';

/* ── API shapes ──────────────────────────────────────────────────────────────── */

interface IbCommissionSummary {
  pending: { total: string; count: number };
  payable: { total: string; count: number };
  paid: { total: string; count: number };
}

interface IbApiResponse {
  id: string;
  tenantId: string;
  name?: string | null;
  email?: string | null;
  mobileE164?: string | null;
  countryCode?: string | null;
  isActive: boolean;
  parentIbUserId?: string | null;
  commissionRate?: string | null;
  tier?: string | null;
  createdAt: string;
}

/* ── Type mapping ──────────────────────────────────────────────────────────── */

function countryFlag(code?: string | null): string {
  if (!code || code.length !== 2) return '🌐';
  const codePoints = [...code.toUpperCase()].map(
    char => 0x1F1E6 - 65 + char.charCodeAt(0),
  );
  return String.fromCodePoint(...codePoints);
}

function mapIbToBroker(ib: IbApiResponse, summary: IbCommissionSummary): IntroducingBroker {
  const name = ib.name ?? ib.email ?? ib.mobileE164 ?? ib.id.slice(0, 8);
  const pendingNum = parseFloat(summary.payable.total);
  return {
    id: ib.id,
    name,
    email: ib.email ?? '',
    country: ib.countryCode ?? '',
    flag: countryFlag(ib.countryCode),
    status: ib.isActive ? 'Active' : 'Suspended',
    clientCount: 0,           // populated from separate metrics API in Phase 2
    volumeMTD: 0,             // populated from broker-metrics service
    commissionMTD: parseFloat(summary.pending.total) || 0,
    commissionTotal: parseFloat(summary.paid.total) || 0,
    commissionRate: parseFloat(ib.commissionRate ?? '0'),
    tier: (ib.tier as any) ?? 'Standard',
    regDate: new Date(ib.createdAt).toLocaleDateString('en-IN'),
    lastPayout: '',
    pendingPayout: pendingNum,
  };
}

/* ── Hook ──────────────────────────────────────────────────────────────────────── */

interface IbWithSummary {
  broker: IntroducingBroker;
  summary: IbCommissionSummary;
}

interface IbCommissionsResult {
  ibs: IntroducingBroker[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  runPayout: () => Promise<{ paidCount: number; periodKey: string }>;
  isRunning: boolean;
  runResult: { paidCount: number; periodKey: string } | null;
}

export function useIbCommissions(): IbCommissionsResult {
  const [ibsWithSummary, setIbsWithSummary] = useState<IbWithSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ paidCount: number; periodKey: string } | null>(null);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiRequest<IbApiResponse[]>('/admin/ibs?limit=200')
      .then(async (ibs) => {
        if (cancelled) return;
        // Batch-fetch commission summaries for all IBs in parallel
        const withSummary = await Promise.all(
          ibs.map(async (ib) => {
            try {
              const summary = await apiRequest<IbCommissionSummary>(
                `/admin/ibs/${ib.id}/commissions`,
              );
              return { broker: mapIbToBroker(ib, summary), summary };
            } catch {
              return {
                broker: mapIbToBroker(ib, {
                  pending: { total: '0', count: 0 },
                  payable: { total: '0', count: 0 },
                  paid: { total: '0', count: 0 },
                }),
                summary: {
                  pending: { total: '0', count: 0 },
                  payable: { total: '0', count: 0 },
                  paid: { total: '0', count: 0 },
                },
              };
            }
          }),
        );
        if (!cancelled) setIbsWithSummary(withSummary);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load IBs');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [tick]);

  const runPayout = useCallback(async (): Promise<{ paidCount: number; periodKey: string }> => {
    setIsRunning(true);
    try {
      const result = await apiRequest<{ paidCount: number; periodKey: string }>(
        '/admin/commissions/run',
        { method: 'POST', body: JSON.stringify({}) },
      );
      setRunResult(result);
      refetch();
      return result;
    } finally {
      setIsRunning(false);
    }
  }, [refetch]);

  return {
    ibs: ibsWithSummary.map(w => w.broker),
    isLoading,
    error,
    refetch,
    runPayout,
    isRunning,
    runResult,
  };
}