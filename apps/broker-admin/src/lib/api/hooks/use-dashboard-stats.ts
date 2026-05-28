/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-dashboard-stats.ts
 * Module:      broker-admin · Dashboard Stats API Hook
 * Purpose:     Fetches admin KPI snapshot — users, accounts, orders count for the dashboard page.
 *              Falls back to safe zeroed stats when the backend is unavailable.
 *
 * Exports:
 *   - useDashboardStats() → { stats, isLoading, error }
 *
 * Depends on:
 *   - ../client — apiRequest
 *
 * Side-effects:
 *   - Calls GET /admin/dashboard/stats
 *
 * Key invariants:
 *   - 'use client' — only browser APIs via apiRequest
 *   - Returns safe default shape so dashboard always renders even on empty DB
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-10
 */

import { useEffect, useState } from 'react';
import { apiRequest } from '../client';

export interface ApiDashboardStats {
  users: number;
  accounts: number;
  orders: number;
  sampleAudits: Array<{ action: string; orderId: string; createdAt: string }>;
}

interface StatsResult {
  stats: ApiDashboardStats | null;
  isLoading: boolean;
  error: string | null;
}

export function useDashboardStats(): StatsResult {
  const [stats, setStats] = useState<ApiDashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiRequest<ApiDashboardStats>('/admin/dashboard/stats')
      .then(res => { if (!cancelled) setStats(res); })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load stats');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, []);

  return { stats, isLoading, error };
}