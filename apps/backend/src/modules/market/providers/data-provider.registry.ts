/**
 * File:        apps/backend/src/modules/market/providers/data-provider.registry.ts
 * Module:      market · Data Providers
 * Purpose:     Injectable registry that maps providerCode strings to concrete
 *              DataProviderAdapter instances; used by PriceFeedService to route
 *              quote requests to the right provider per exchange.
 *
 * Exports:
 *   - DataProviderRegistry   — injectable service; register() + resolve() + codes()
 *
 * Depends on:
 *   - data-provider.interface — DataProviderAdapter type
 *
 * Side-effects:
 *   - none (in-memory map only)
 *
 * Key invariants:
 *   - Adapters self-register in their OnModuleInit; the registry has no hard-coded list.
 *   - resolve() returns undefined (not throws) for unknown codes so callers can fall back.
 *
 * Read order:
 *   1. DataProviderRegistry — single class
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-08
 */

import { Injectable } from '@nestjs/common';
import { DataProviderAdapter } from './data-provider.interface';

@Injectable()
export class DataProviderRegistry {
  private readonly providers = new Map<string, DataProviderAdapter>();

  register(adapter: DataProviderAdapter): void {
    this.providers.set(adapter.providerCode, adapter);
  }

  resolve(code: string): DataProviderAdapter | undefined {
    return this.providers.get(code);
  }

  codes(): string[] {
    return Array.from(this.providers.keys());
  }
}
