/**
 * @file src/shared/cache/cache-key.builder.ts
 * @module shared/cache
 * @description Tenant-aware cache key builder for multi-tenant isolation
 * @author BharatERP
 * @created 2026-02-19
 */

const SEP = ':';

/**
 * Build a tenant-aware cache key.
 * Format: [prefix]:[tenantId|global]:[parts...]
 */
export function buildCacheKey(
  prefix: string,
  tenantId: string | null | undefined,
  ...parts: (string | number)[]
): string {
  const tenant = tenantId ?? 'global';
  const joined = [prefix, tenant, ...parts.map(String)].join(SEP);
  return joined;
}

/**
 * Build a key pattern for invalidation (e.g. Redis SCAN).
 * Use '*' for wildcard.
 */
export function buildCacheKeyPattern(
  prefix: string,
  tenantId?: string | null,
  ...parts: (string | number)[]
): string {
  const tenant = tenantId ?? '*';
  const joined = [prefix, tenant, ...parts.map(String)].join(SEP);
  return joined;
}
