/**
 * @file src/shared/cache/cache-service.contract.ts
 * @module shared/cache
 * @description Cache service contract for tenant-aware caching
 * @author BharatERP
 * @created 2026-02-19
 */

/**
 * Cache service contract.
 */
export interface ICacheService {
  get<T>(key: string): Promise<T | null>;

  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;

  del(key: string): Promise<void>;

  /**
   * Invalidate keys matching pattern (implementation-dependent).
   */
  invalidatePattern?(pattern: string): Promise<void>;
}
