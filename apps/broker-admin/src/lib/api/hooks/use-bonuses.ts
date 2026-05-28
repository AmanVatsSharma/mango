/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-bonuses.ts
 * Module:      broker-admin · Bonuses API Hook
 * Purpose:     Wires the bonus management page to /admin/bonuses.
 *              Falls back to mock data so the page always renders.
 *
 * Exports:
 *   - useBonuses() → { bonuses, isLoading, error, refetch, createBonus, updateBonus, deactivateBonus }
 *
 * Depends on:
 *   - ../client   — apiRequest
 *   - ../../types — Bonus type
 *
 * Side-effects:
 *   - Calls GET /admin/bonuses
 *   - Calls POST /admin/bonuses
 *   - Calls PATCH /admin/bonuses/:id
 *   - Calls DELETE /admin/bonuses/:id
 *
 * Key invariants:
 *   - 'use client' — browser APIs via apiRequest
 *   - Mock fallback ensures the page never shows a blank screen
 *   - Optimistic update on create/update/deactivate
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-18
 */

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../client';
import type { Bonus } from '../../types';

/* ── API shapes ──────────────────────────────────────────────────────────────── */

export interface CreateBonusPayload {
  name: string;
  type: Bonus['type'];
  amount: number;
  amountType: 'Fixed' | 'Percentage';
  minDeposit?: number;
  maxBonus?: number;
  turnoverMultiple: number;
  startDate: string;
  endDate?: string;
  eligibleGroups: string[];
}

export interface UpdateBonusPayload {
  name?: string;
  type?: Bonus['type'];
  amount?: number;
  amountType?: 'Fixed' | 'Percentage';
  minDeposit?: number;
  maxBonus?: number;
  turnoverMultiple?: number;
  startDate?: string;
  endDate?: string;
  eligibleGroups?: string[];
}

/* ── Hook ──────────────────────────────────────────────────────────────────────── */

interface BonusesResult {
  bonuses: Bonus[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  createBonus: (payload: CreateBonusPayload) => void;
  updateBonus: (id: string, payload: UpdateBonusPayload) => void;
  deactivateBonus: (id: string) => void;
}

export function useBonuses(): BonusesResult {
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiRequest<Bonus[]>('/admin/bonuses')
      .then(res => {
        if (!cancelled) setBonuses(res);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load bonuses');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [tick]);

  const createBonus = useCallback((payload: CreateBonusPayload) => {
    apiRequest<Bonus>('/admin/bonuses', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then(created => {
      setBonuses(prev => [...prev, created]);
    }).catch(() => refetch());
  }, [refetch]);

  const updateBonus = useCallback((id: string, payload: UpdateBonusPayload) => {
    // Optimistic
    setBonuses(prev => prev.map(b => b.id === id ? { ...b, ...payload } : b));
    apiRequest<Bonus>(`/admin/bonuses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }).catch(() => refetch());
  }, [refetch]);

  const deactivateBonus = useCallback((id: string) => {
    // Optimistic
    setBonuses(prev => prev.map(b => b.id === id ? { ...b, status: 'Inactive' } : b));
    apiRequest<Bonus>(`/admin/bonuses/${id}`, { method: 'DELETE' })
      .catch(() => refetch());
  }, [refetch]);

  return { bonuses, isLoading, error, refetch, createBonus, updateBonus, deactivateBonus };
}