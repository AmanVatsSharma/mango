/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-audit-log.ts
 * Module:      broker-admin · Audit Log API Hook
 * Purpose:     Wires the audit log page to real backend API (GET /admin/audit/all).
 *              Falls back to empty list on error so the page still renders.
 *
 * Exports:
 *   - useAuditLog() → { entries, isLoading, error, refetch }
 *
 * Depends on:
 *   - ../client — apiRequest
 *
 * Side-effects:
 *   - Calls GET /admin/audit/all with optional filters
 *
 * Key invariants:
 *   - 'use client' — browser APIs via apiRequest
 *   - Falls back to empty list on error
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { useEffect, useState } from 'react';
import { apiRequest } from '../client';

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  module: string;
  targetId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  createdAt: string;
  severity?: 'Info' | 'Warn' | 'Critical';
}

export interface AuditLogParams {
  offset?: number;
  limit?: number;
  from?: string;  // ISO date string
  to?: string;    // ISO date string
  module?: string;
  actor?: string;
}

interface AuditLogResult {
  entries: AuditEntry[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAuditLog(params: AuditLogParams = {}): AuditLogResult {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = () => setTick(t => t + 1);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    // Build query string with pagination and date filters
    const searchParams = new URLSearchParams();
    searchParams.set('limit', String(params.limit ?? 200));
    if (params.offset != null)  searchParams.set('offset', String(params.offset));
    if (params.from)            searchParams.set('from', params.from);
    if (params.to)              searchParams.set('to', params.to);
    if (params.module)          searchParams.set('module', params.module);
    if (params.actor)           searchParams.set('actor', params.actor);

    const query = searchParams.toString();
    apiRequest<{ data: any[]; total: number }>(`/admin/audit/all?${query}`)
      .then(res => {
        if (!cancelled) {
          setEntries(res.data.map((e: any) => ({
            id: e.id,
            actor: e.actor ?? '—',
            action: e.action,
            module: e.module ?? '—',
            targetId: e.orderId ?? e.targetId ?? '—',
            before: e.data?.before,
            after: e.data?.after,
            ip: e.ip ?? '—',
            createdAt: e.createdAt,
            severity: 'Info' as const,
          })));
        }
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load audit log');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [tick, params.offset, params.from, params.to, params.module, params.actor]);

  return { entries, isLoading, error, refetch };
}