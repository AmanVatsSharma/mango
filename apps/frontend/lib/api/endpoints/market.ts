/**
 * File:        apps/frontend/lib/api/endpoints/market.ts
 * Module:      Market Data API — instruments, quotes, search
 * Purpose:     All market data HTTP calls to NestJS backend
 *
 * Depends on:
 *   - lib/api/client.ts — Axios instance
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-17
 */

import apiClient from '../client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Instrument {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  segment: 'EQUITY' | 'FUTURES' | 'OPTIONS' | 'COMMODITY' | 'FOREX' | 'CRYPTO';
  lotSize: number;
  tickSize: number;
  isin?: string;
  isTradeable: boolean;
  lastPrice?: number;
  change?: number;
  changePercent?: number;
}

export interface Quote {
  symbol: string;
  exchange: string;
  lastPrice: number;
  bid: number;
  ask: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  close: number;
  timestamp: number;
  openInterest?: number;
}

export interface MarketStats {
  symbol: string;
  exchange: string;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  allTimeHigh: number;
  allTimeLow: number;
  avgVolume: number;
  avgDeliveryPercent: number;
  marketCap?: number;
}

export interface SearchResult {
  instruments: Instrument[];
  total: number;
}

// ─── API Functions ────────────────────────────────────────────────────────────

export const marketApi = {
  // GET /market/instruments
  getInstruments: async (params?: { exchange?: string; segment?: string; isTradeable?: boolean }): Promise<{ data: Instrument[]; total: number }> => {
    const response = await apiClient.get<{ data: Instrument[]; total: number }>('/market/instruments', { params });
    return response.data;
  },

  // GET /market/instruments/:symbol
  getInstrument: async (symbol: string, exchange: string): Promise<Instrument> => {
    const response = await apiClient.get<Instrument>(`/market/instruments/${symbol}`, {
      params: { exchange },
    });
    return response.data;
  },

  // GET /market/quotes
  getQuotes: async (symbols: string[], exchange: string): Promise<Quote[]> => {
    const response = await apiClient.get<Quote[]>('/market/quotes', {
      params: { symbols: symbols.join(','), exchange },
    });
    return response.data;
  },

  // GET /market/quotes/:symbol
  getQuote: async (symbol: string, exchange: string): Promise<Quote> => {
    const response = await apiClient.get<Quote>(`/market/quotes/${symbol}`, {
      params: { exchange },
    });
    return response.data;
  },

  // GET /market/search?q=
  search: async (query: string, params?: { exchange?: string; limit?: number }): Promise<SearchResult> => {
    const response = await apiClient.get<SearchResult>('/market/search', {
      params: { q: query, ...params },
    });
    return response.data;
  },

  // GET /market/stats/:symbol
  getStats: async (symbol: string, exchange: string): Promise<MarketStats> => {
    const response = await apiClient.get<MarketStats>(`/market/stats/${symbol}`, {
      params: { exchange },
    });
    return response.data;
  },

  // GET /market/top-movers
  getTopMovers: async (params?: { exchange?: string; segment?: string; limit?: number }): Promise<Instrument[]> => {
    const response = await apiClient.get<Instrument[]>('/market/top-movers', { params });
    return response.data;
  },

  // GET /market/indices
  getIndices: async (): Promise<{ name: string; value: number; change: number; changePercent: number }[]> => {
    const response = await apiClient.get<{ name: string; value: number; change: number; changePercent: number }[]>('/market/indices');
    return response.data;
  },
};