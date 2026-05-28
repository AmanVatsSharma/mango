/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-system-status.ts
 * Module:      broker-admin · System Status API Hook
 * Purpose:     Fetches system health check from the admin dashboard API.
 *              Falls back to safe default when the backend is unavailable.
 *
 * Exports:
 *   - useSystemStatus() → { data, isLoading, error }
 *   - SystemStatusRow   — shape of each service status row
 *
 * Depends on:
 *   - ../client — apiRequest
 *
 * Side-effects:
 *   - Calls GET /admin/dashboard/system/status
 *
 * Key invariants:
 *   - 'use client' — browser APIs via apiRequest
 *   - Returns default operational status on error so dashboard always renders
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { useEffect, useState } from 'react';
import { apiRequest } from '../client';

export interface SystemStatusRow {
  service: string;
  status: 'operational' | 'degraded' | 'down';
  latency?: number;
}

const DEFAULT_STATUS: SystemStatusRow[] = [
  { service: 'API Gateway', status: 'operational', latency: 0 },
  { service: 'Database', status: 'operational', latency: 0 },
  { service: 'Cache', status: 'operational', latency: 0 },
  { service: 'OMS', status: 'operational', latency: 0 },
];

interface SystemStatusResult {
  data: SystemStatusRow[];
  isLoading: boolean;
  error: string | null;
}

export function useSystemStatus(): SystemStatusResult {
  const [data, setData] = useState<SystemStatusRow[]>(DEFAULT_STATUS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiRequest<SystemStatusRow[]>('/admin/dashboard/system/status')
      .then(res => { if (!cancelled) setData(res); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load system status'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, []);

  return { data, isLoading, error };
}