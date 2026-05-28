/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-client-groups.ts
 * Module:      broker-admin · Client Groups API Hook
 * Purpose:     Wires the client groups page to the backend's GET /admin/client-groups
 *              endpoint. Returns all groups with client counts, leverage, and commission
 *              settings for the current tenant.
 *
 * Exports:
 *   - ClientGroupEntity  — backend entity shape
 *   - useClientGroups()  — returns { groups, isLoading, error, refetch }
 *
 * Depends on:
 *   - ../client — apiRequest
 *
 * Side-effects:
 *   - Calls GET /admin/client-groups on mount and on refetch()
 *
 * Key invariants:
 *   - 'use client' — browser APIs via apiRequest
 *   - Falls back to empty array on error so the page still renders
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { useEffect, useState } from 'react';
import { apiRequest } from '../client';

export interface ClientGroupEntity {
  id: string;
  name: string;
  description: string;
  clientCount: number;
  leverage: string;
  commissionType: 'Spread' | 'Per Lot' | 'Mixed';
  swapFree: boolean;
  bonusEligible: boolean;
  color: string;
}

interface ClientGroupsResult {
  groups: ClientGroupEntity[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

interface ApiResponse {
  data: ClientGroupEntity[];
  total: number;
}

export function useClientGroups(): ClientGroupsResult {
  const [groups, setGroups] = useState<ClientGroupEntity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = () => setTick(t => t + 1);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiRequest<ApiResponse>('/admin/client-groups')
      .then(res => {
        if (!cancelled) {
          setGroups(res.data ?? []);
          setIsLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load client groups');
          setGroups([]);
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [tick]);

  return { groups, isLoading, error, refetch };
}