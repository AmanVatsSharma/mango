/**
 * @file src/modules/realtime/prana-stream/services/subscription-registry.service.ts
 * @module realtime/prana-stream
 * @description Tracks per-client and per-user subscriptions for realtime streams
 * @author BharatERP
 * @created 2025-09-24
 */

import { Injectable } from '@nestjs/common';
import { AppLoggerService } from '../../../../shared/logger';

export type SubscriptionPayload = {
  watchlist?: Array<{ exchange: string; symbol: string }>;
  orders?: boolean;
  positions?: boolean;
  accounts?: boolean;
};

@Injectable()
export class SubscriptionRegistryService {
  private readonly clientToUser: Map<string, string> = new Map();
  private readonly clientSubs: Map<string, SubscriptionPayload> = new Map();
  private readonly symbolWatchers: Map<string, Set<string>> = new Map(); // key: exch:symbol -> set of userIds

  constructor(private readonly logger: AppLoggerService) {
    this.logger.setContext(SubscriptionRegistryService.name);
  }

  async apply(clientId: string, userId: string, payload: SubscriptionPayload) {
    this.clientToUser.set(clientId, userId);
    // Remove previous symbol watchers for this client
    const prev = this.clientSubs.get(clientId);
    if (prev?.watchlist) this.updateWatchers(userId, prev.watchlist, false);
    this.clientSubs.set(clientId, payload);
    if (payload.watchlist) this.updateWatchers(userId, payload.watchlist, true);
    this.logger.debug('subscriptions applied', { clientId, userId });
  }

  async remove(clientId: string, payload?: SubscriptionPayload) {
    if (!payload) {
      this.clientSubs.delete(clientId);
      const userId = this.clientToUser.get(clientId);
      if (userId) this.clearUserWatchers(userId);
      return;
    }
    const existing = this.clientSubs.get(clientId) || {};
    this.clientSubs.set(clientId, {
      watchlist: payload.watchlist ? [] : existing.watchlist,
      orders: payload.orders ? false : existing.orders,
      positions: payload.positions ? false : existing.positions,
      accounts: payload.accounts ? false : existing.accounts,
    });
    const userId = this.clientToUser.get(clientId);
    if (userId && existing.watchlist) this.updateWatchers(userId, existing.watchlist, false);
  }

  removeAll(clientId: string) {
    this.clientToUser.delete(clientId);
    const prev = this.clientSubs.get(clientId);
    const userId = this.clientToUser.get(clientId);
    if (userId && prev?.watchlist) this.updateWatchers(userId, prev.watchlist, false);
    this.clientSubs.delete(clientId);
  }

  getUserId(clientId: string): string | undefined {
    return this.clientToUser.get(clientId);
  }

  getSubscription(clientId: string): SubscriptionPayload | undefined {
    return this.clientSubs.get(clientId);
  }

  getWatchersFor(exchange: string, symbol: string): string[] {
    const key = `${exchange}:${symbol}`;
    return Array.from(this.symbolWatchers.get(key) || []);
  }

  getAllWatchedSymbols(): Array<{ exchange: string; symbol: string }> {
    const out: Array<{ exchange: string; symbol: string }> = [];
    for (const key of this.symbolWatchers.keys()) {
      const [exchange, symbol] = key.split(':');
      out.push({ exchange, symbol });
    }
    return out;
  }

  private updateWatchers(
    userId: string,
    symbols: Array<{ exchange: string; symbol: string }>,
    add: boolean,
  ) {
    for (const s of symbols) {
      const key = `${s.exchange}:${s.symbol}`;
      if (!this.symbolWatchers.has(key)) this.symbolWatchers.set(key, new Set());
      const set = this.symbolWatchers.get(key);
      if (add) set.add(userId);
      else set.delete(userId);
      if (set.size === 0) this.symbolWatchers.delete(key);
    }
  }

  private clearUserWatchers(userId: string) {
    for (const [key, set] of this.symbolWatchers.entries()) {
      set.delete(userId);
      if (set.size === 0) this.symbolWatchers.delete(key);
    }
  }
}


