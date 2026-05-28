/**
 * @file src/modules/realtime/prana-stream/adapters/market-data.provider.ts
 * @module realtime/prana-stream
 * @description Provider interface for market data feeds (main, vortex, mock)
 * @author BharatERP
 * @created 2025-09-24
 */

export type Tick = {
  exchange: string;
  symbol: string;
  price: number;
  ts: number;
};

export interface MarketDataProvider {
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribeTicks(subscriberId: string, symbols: Array<{ exchange: string; symbol: string }>): Promise<void>;
  unsubscribeTicks(subscriberId: string, symbols?: Array<{ exchange: string; symbol: string }>): Promise<void>;
  getSnapshot(symbols: Array<{ exchange: string; symbol: string }>): Promise<Tick[]>;
  onTicks(cb: (ticks: Tick[]) => void): void;
  isHealthy(): boolean;
}


