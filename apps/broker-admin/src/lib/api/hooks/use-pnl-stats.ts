/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-pnl-stats.ts
 * Module:      broker-admin · P&L Statistics API Hook
 * Purpose:     Wires the P&L page to the backend's GET /admin/dashboard/revenue endpoint.
 *              Fetches revenue line items (spread, commission, swap, bonusCost) broken
 *              down by period. Maps the backend's revenue-point[] to the RevenuePoint[]
 *              shape that the chart and table components expect.
 *
 * Exports:
 *   - usePnLStats(period)  — returns { data, isLoading, error, refetch }
 *
 * Depends on:
 *   - ../client — apiRequest
 *   - @/lib/types — RevenuePoint (local type alias for the page)
 *
 * Side-effects:
 *   - Calls GET /admin/dashboard/revenue?period=<period> on mount and on period change
 *
 * Key invariants:
 *   - 'use client' — browser APIs via apiRequest
 *   - Falls back to empty array on error so the chart renders without data
 *   - Backend returns { data: RevenuePoint[], total: number }; only data is forwarded
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { useEffect, useState } from 'react';
import { apiRequest } from '../client';
import type { RevenuePoint } from '@/lib/types';

export interface PnLStatsResult {
  data: RevenuePoint[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

interface ApiResponse {
  data: RevenuePoint[];
  total: number;
}

export function usePnLStats(period: 'daily' | 'weekly' | 'monthly'): PnLStatsResult {
  const [data, setData] = useState<RevenuePoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = () => setTick(t => t + 1);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiRequest<ApiResponse>(`/admin/dashboard/revenue?period=${period}`)
      .then(res => {
        if (!cancelled) {
          setData(res.data ?? []);
          setIsLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load P&L data');
          setData([]);
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [period, tick]);

  return { data, isLoading, error, refetch };
}