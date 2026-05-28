/**
 * File:        apps/backend/src/modules/market/providers/data-provider.interface.ts
 * Module:      market · Data Providers
 * Purpose:     Canonical interface all market-data provider adapters must implement,
 *              plus the shared Quote shape they produce.
 *
 * Exports:
 *   - ProviderQuote          — normalized quote shape returned by every adapter
 *   - DataProviderAdapter    — interface every concrete adapter implements
 *
 * Depends on:
 *   - none (pure types/interface)
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - providerCode must be a stable, uppercase identifier (e.g. 'KITE', 'GENERIC_REST')
 *   - fetchQuotes MUST return a subset of the requested instruments; callers must handle
 *     missing keys (exchange not available, instrument not found, etc.)
 *
 * Read order:
 *   1. ProviderQuote    — understand the data shape
 *   2. DataProviderAdapter — understand what adapters must implement
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-08
 */

export type ProviderQuote = {
  exchange: string;
  symbol: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ts: number;
};

export interface DataProviderAdapter {
  readonly providerCode: string;
  fetchQuotes(instruments: { exchange: string; symbol: string }[]): Promise<ProviderQuote[]>;
}
