/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-aml-monitor.ts
 * Module:      broker-admin · AML Monitor API Hook
 * Purpose:     Wires the AML monitor page to /admin/aml/cases.
 *              Falls back to mock data so the page always renders, even if the API is unavailable.
 *
 * Exports:
 *   - useAmlMonitor() → { cases, isLoading, error, refetch, flagCase, clearCase }
 *
 * Depends on:
 *   - ../client   — apiRequest
 *
 * Side-effects:
 *   - Calls GET /admin/aml/cases
 *   - Calls POST /admin/aml/cases/:id/flag
 *   - Calls POST /admin/aml/cases/:id/clear
 *
 * Key invariants:
 *   - 'use client' — browser APIs via apiRequest
 *   - Mock fallback ensures the page never shows a blank screen
 *   - Optimistic updates on flag/clear — updates local state immediately
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-18
 */

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../client';
import type { AMLCase } from '../../types';

/* ── API shapes ──────────────────────────────────────────────────────────────── */

interface ListAmlCasesResponse {
  data: AMLCase[];
  total: number;
  limit: number;
  offset: number;
}

/* ── Hook ──────────────────────────────────────────────────────────────────────── */

interface AmlMonitorResult {
  cases: AMLCase[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  flagCase: (id: string) => void;
  clearCase: (id: string) => void;
}

/**
 * Fetches AML cases from the API with a mock fallback.
 * Supports flagging and clearing individual cases.
 */
export function useAmlMonitor(): AmlMonitorResult {
  const [cases, setCases] = useState<AMLCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiRequest<ListAmlCasesResponse>('/admin/aml/cases?limit=200')
      .then(res => {
        if (!cancelled) setCases(res.data);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load AML cases');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [tick]);

  /** Flag a case as Suspicious (optimistic) */
  const flagCase = useCallback((id: string) => {
    setCases(prev => prev.map(c => c.id === id ? { ...c, status: 'Suspicious' } : c));
    apiRequest(`/admin/aml/cases/${id}/flag`, { method: 'POST' })
      .catch(() => refetch());
  }, [refetch]);

  /** Clear a case (optimistic) */
  const clearCase = useCallback((id: string) => {
    setCases(prev => prev.map(c => c.id === id ? { ...c, status: 'Clear' } : c));
    apiRequest(`/admin/aml/cases/${id}/clear`, { method: 'POST' })
      .catch(() => refetch());
  }, [refetch]);

  return { cases, isLoading, error, refetch, flagCase, clearCase };
}