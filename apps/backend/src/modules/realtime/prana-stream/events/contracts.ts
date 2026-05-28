/**
 * @file src/modules/realtime/prana-stream/events/contracts.ts
 * @module realtime/prana-stream
 * @description Realtime event contracts
 * @author BharatERP
 * @created 2025-09-24
 */

export type RealtimeEvent<T> = {
  type: 'watchlist.tick' | 'order.updated' | 'position.updated' | 'account.updated';
  userId: string;
  requestId?: string;
  seq: number;
  ts: string;
  data: T;
  v: 1;
};


