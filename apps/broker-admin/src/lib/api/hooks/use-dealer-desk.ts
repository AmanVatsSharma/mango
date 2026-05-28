/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-dealer-desk.ts
 * Module:      broker-admin · Dealer Desk Hook
 * Purpose:     Bridges the dealer-desk page to real backend APIs — live positions,
 *              manual hedge order submission, and instrument quotes. Falls back to
 *              mock data so the page always renders in dev / when the backend is offline.
 *
 * Exports:
 *   - useDealerDesk() — returns { positions, quotes, submitHedge, loading, error }
 *
 * Depends on:
 *   - ../client            — apiRequest (GET /admin/dealer-desk/positions, POST /admin/dealer-desk/hedge, GET /admin/dealer-desk/quotes)
 *   - ../../mock-data     — mock positions + quotes for dev fallback
 *
 * Side-effects:
 *   - Calls GET /admin/dealer-desk/positions on mount
 *   - Calls GET /admin/dealer-desk/quotes on mount
 *   - POST /admin/dealer-desk/hedge on hedge action
 *
 * Key invariants:
 *   - 'use client' — browser APIs via apiRequest
 *   - Falls back to mock data on API error (safe default)
 *   - submitHedge returns the created dealId on success; throws on failure
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-18
 */

import { useCallback, useEffect, useState } from 'react';
import { apiRequest, ApiError } from '../client';

export interface DealerPosition {
  positionId: string;
  symbol: string;
  exchange: string;
  side: 'BUY' | 'SELL';
  lots: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  realizedPnl: number;
  value: number;
  openTime: string | null;
}

export interface DealerQuote {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  updatedAt: string;
  status: 'LIVE' | 'STALE';
}

export interface HedgeResult {
  dealId: string;
  symbol: string;
  side: string;
  lots: number;
  status: string;
  createdAt: string;
}

// Mock data for dev / offline fallback
const MOCK_POSITIONS: DealerPosition[] = [
  { positionId: 'POS001', symbol: 'EUR/USD', exchange: 'FX', side: 'BUY', lots: 5.0, entryPrice: 1.08000, currentPrice: 1.08451, pnl: 225.50, realizedPnl: 0, value: 5422.55, openTime: new Date(Date.now() - 3600_000 * 3).toISOString() },
  { positionId: 'POS002', symbol: 'XAUUSD', exchange: 'COMEX', side: 'SELL', lots: 2.0, entryPrice: 2310.00, currentPrice: 2311.00, pnl: -200.00, realizedPnl: 0, value: 4622.00, openTime: new Date(Date.now() - 3600_000 * 8).toISOString() },
  { positionId: 'POS003', symbol: 'NIFTY FUT', exchange: 'NSE', side: 'BUY', lots: 3.0, entryPrice: 22850.00, currentPrice: 22852.00, pnl: 600.00, realizedPnl: 0, value: 68556.00, openTime: new Date(Date.now() - 3600_000 * 1).toISOString() },
  { positionId: 'POS004', symbol: 'BTC/USD', exchange: 'CRYPTO', side: 'BUY', lots: 0.1, entryPrice: 67500.00, currentPrice: 67600.00, pnl: 100.00, realizedPnl: 0, value: 6760.00, openTime: new Date(Date.now() - 3600_000 * 12).toISOString() },
];

const MOCK_QUOTES: DealerQuote[] = [
  { symbol: 'EUR/USD', bid: 1.08420, ask: 1.08451, spread: 0.00031, updatedAt: new Date().toISOString(), status: 'LIVE' },
  { symbol: 'XAUUSD', bid: 2310.50, ask: 2311.00, spread: 0.50, updatedAt: new Date().toISOString(), status: 'LIVE' },
  { symbol: 'USD/JPY', bid: 148.200, ask: 148.205, spread: 0.005, updatedAt: new Date().toISOString(), status: 'LIVE' },
  { symbol: 'NIFTY FUT', bid: 22850.00, ask: 22852.00, spread: 2.00, updatedAt: new Date().toISOString(), status: 'LIVE' },
];

interface PositionsResponse { data: DealerPosition[]; total: number; limit: number; offset: number; }
interface BrokersResponse { data: DealerPosition[]; total: number; limit: number; offset: number; }

export function useDealerDesk() {
  const [positions, setPositions] = useState<DealerPosition[]>(MOCK_POSITIONS);
  const [quotes, setQuotes] = useState<DealerQuote[]>(MOCK_QUOTES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [positionsRes, quotesRes] = await Promise.all([
          apiRequest<PositionsResponse>('/admin/dealer-desk/positions?limit=100').catch(() => null),
          apiRequest<DealerQuote[]>('/admin/dealer-desk/quotes').catch(() => null),
        ]);

        if (cancelled) return;

        if (positionsRes?.data?.length) setPositions(positionsRes.data);
        if (quotesRes?.length) setQuotes(quotesRes);
      } catch (err) {
        // Fall back to mock data — already set as initial state
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load dealer desk data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const submitHedge = useCallback(async (dto: {
    symbol: string;
    side: 'BUY' | 'SELL' | 'BUY_HEDGE' | 'SELL_HEDGE';
    lots: number;
    price?: number;
    notes?: string;
  }): Promise<HedgeResult> => {
    try {
      const result = await apiRequest<HedgeResult>('/admin/dealer-desk/hedge', {
        method: 'POST',
        body: JSON.stringify(dto),
      });
      return result;
    } catch (err) {
      throw new ApiError(
        err instanceof ApiError ? err.message : 'Failed to submit hedge order',
        err instanceof ApiError ? err.code : 'HEDGE_FAILED',
        err instanceof ApiError ? err.requestId : undefined,
        err instanceof ApiError ? err.status : undefined,
      );
    }
  }, []);

  const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);

  return {
    positions,
    quotes,
    submitHedge,
    loading,
    positionsLoading: loading,
    error,
    totalPnl,
  };
}