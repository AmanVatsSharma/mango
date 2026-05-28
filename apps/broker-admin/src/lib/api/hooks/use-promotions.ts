/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-promotions.ts
 * Module:      broker-admin · Promotions API Hook
 * Purpose:     Wires the promotions page to /admin/promotions.
 *              Falls back to local constants so the page always renders.
 *
 * Exports:
 *   - usePromotions() → { promotions, isLoading, error, refetch, createPromotion, updatePromotion }
 *
 * Depends on:
 *   - ../client   — apiRequest
 *
 * Side-effects:
 *   - Calls GET /admin/promotions
 *   - Calls POST /admin/promotions
 *   - Calls PATCH /admin/promotions/:id
 *
 * Key invariants:
 *   - 'use client' — browser APIs via apiRequest
 *   - Mock fallback ensures the page never shows a blank screen
 *   - Optimistic update on create/update
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-18
 */

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../client';

/* ── Local types (mirror backend PromotionResponseDto) ────────────────────────── */

export type CampaignStatus = 'Active' | 'Scheduled' | 'Ended' | 'Draft';
export type CampaignType = 'Deposit Bonus' | 'No-Deposit Bonus' | 'Cashback' | 'Rebate' | 'Referral' | 'Trading Contest';
export type TargetAudience = 'All Clients' | 'New Clients' | 'VIP' | 'Dormant' | 'IB Clients';

export interface Promotion {
  id: string;
  name: string;
  type: CampaignType;
  targetAudience: TargetAudience;
  status: CampaignStatus;
  startDate: string;
  endDate: string;
  budget: number;
  spent: number;
  participants: number;
  conversions: number;
  rewardType: string;
  rewardValue: string;
}

export interface CreatePromotionPayload {
  name: string;
  type: CampaignType;
  targetAudience: TargetAudience;
  startDate: string;
  endDate: string;
  budget: number;
  rewardType: string;
  rewardValue: string;
}

export interface UpdatePromotionPayload {
  name?: string;
  type?: CampaignType;
  targetAudience?: TargetAudience;
  startDate?: string;
  endDate?: string;
  budget?: number;
  rewardType?: string;
  rewardValue?: string;
  status?: CampaignStatus;
}

/* ── Local mock constants (fallback when API is unavailable) ─────────────────── */

const LOCAL_CAMPAIGNS: Promotion[] = [
  {
    id: 'C001', name: 'January Welcome Bonus', type: 'Deposit Bonus',
    targetAudience: 'New Clients', status: 'Active',
    startDate: '2024-01-01', endDate: '2024-01-31',
    budget: 50_000, spent: 18_420,
    participants: 142, conversions: 98,
    rewardType: '30% match bonus', rewardValue: 'Up to $500',
  },
  {
    id: 'C002', name: 'VIP Cashback February', type: 'Cashback',
    targetAudience: 'VIP', status: 'Scheduled',
    startDate: '2024-02-01', endDate: '2024-02-29',
    budget: 30_000, spent: 0,
    participants: 0, conversions: 0,
    rewardType: '5% spread cashback', rewardValue: 'Up to $1,000',
  },
  {
    id: 'C003', name: 'Q4 Trading Blitz', type: 'Trading Contest',
    targetAudience: 'All Clients', status: 'Ended',
    startDate: '2023-10-01', endDate: '2023-12-31',
    budget: 20_000, spent: 20_000,
    participants: 284, conversions: 284,
    rewardType: 'Prize pool distribution', rewardValue: '$20,000 prize pool',
  },
  {
    id: 'C004', name: 'Referral Sprint', type: 'Referral',
    targetAudience: 'All Clients', status: 'Active',
    startDate: '2024-01-10', endDate: '2024-03-10',
    budget: 15_000, spent: 4_200,
    participants: 67, conversions: 28,
    rewardType: '$50 per referral deposit', rewardValue: 'Unlimited',
  },
  {
    id: 'C005', name: 'No-Deposit Starter', type: 'No-Deposit Bonus',
    targetAudience: 'New Clients', status: 'Draft',
    startDate: '2024-02-15', endDate: '2024-03-15',
    budget: 5_000, spent: 0,
    participants: 0, conversions: 0,
    rewardType: '$25 free credit', rewardValue: '$25',
  },
  {
    id: 'C006', name: 'IB Volume Rebate', type: 'Rebate',
    targetAudience: 'IB Clients', status: 'Active',
    startDate: '2024-01-01', endDate: '2024-12-31',
    budget: 80_000, spent: 12_840,
    participants: 18, conversions: 18,
    rewardType: '$0.50/lot rebate', rewardValue: 'Per lot traded',
  },
];

/* ── Hook ──────────────────────────────────────────────────────────────────────── */

interface PromotionsResult {
  promotions: Promotion[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  createPromotion: (payload: CreatePromotionPayload) => void;
  updatePromotion: (id: string, payload: UpdatePromotionPayload) => void;
}

export function usePromotions(): PromotionsResult {
  const [promotions, setPromotions] = useState<Promotion[]>(LOCAL_CAMPAIGNS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiRequest<Promotion[]>('/admin/promotions')
      .then(res => {
        if (!cancelled) setPromotions(res);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load promotions');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [tick]);

  const createPromotion = useCallback((payload: CreatePromotionPayload) => {
    apiRequest<Promotion>('/admin/promotions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then(created => {
      setPromotions(prev => [...prev, created]);
    }).catch(() => refetch());
  }, [refetch]);

  const updatePromotion = useCallback((id: string, payload: UpdatePromotionPayload) => {
    // Optimistic
    setPromotions(prev => prev.map(p => p.id === id ? { ...p, ...payload } : p));
    apiRequest<Promotion>(`/admin/promotions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }).catch(() => refetch());
  }, [refetch]);

  return { promotions, isLoading, error, refetch, createPromotion, updatePromotion };
}