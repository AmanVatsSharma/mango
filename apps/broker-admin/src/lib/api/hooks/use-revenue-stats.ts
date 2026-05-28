/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-revenue-stats.ts
 * Module:      broker-admin · Revenue Stats API Hook
 * Purpose:     Fetches revenue breakdown (spread/commission/swap) from the admin dashboard API.
 *              Falls back to empty array when the backend is unavailable.
 *
 * Exports:
 *   - useRevenueStats(period) → { data, isLoading, error }
 *   - RevenueRow               — shape of each period bucket
 *
 * Depends on:
 *   - ../client — apiRequest
 *
 * Side-effects:
 *   - Calls GET /admin/dashboard/revenue?period=daily|weekly|mtx
 *
 * Key invariants:
 *   - 'use client' — browser APIs via apiRequest
 *   - Returns empty array on error so dashboard always renders
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { useEffect, useState } from 'react';
import { apiRequest } from '../client';

export interface RevenueRow {
  label: string;
  spread: number;
  commission: number;
  swap: number;
  bonusCost?: number;
  total: number;
}

interface RevenueResult {
  data: RevenueRow[];
  isLoading: boolean;
  error: string | null;
}

export function useRevenueStats(period: 'daily' | 'weekly' | 'mtd' = 'mtd'): RevenueResult {
  const [data, setData] = useState<RevenueRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiRequest<RevenueRow[]>(`/admin/dashboard/revenue?period=${period}`)
      .then(res => { if (!cancelled) setData(res); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load revenue'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [period]);

  return { data, isLoading, error };
}