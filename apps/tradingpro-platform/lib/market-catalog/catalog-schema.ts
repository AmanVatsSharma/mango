/**
 * @file catalog-schema.ts
 * @module lib/market-catalog
 * @description Zod schema + TS types for MARKET_CATALOG_V1 — the admin-curated catalog of
 *              instrument lists & options-chain recipes shown to end users in the watchlist
 *              Add drawer. Persisted as a single SystemSettings row keyed by
 *              ADMIN_SETTING_KEYS.MARKET_CATALOG_V1 with ownerId=null.
 *
 *              Two item kinds:
 *                - "instrument": a fixed pre-resolved row (token, symbol, exchange, segment).
 *                - "options-chain": a recipe (underlying + expiry strategy + strike strategy)
 *                  that the resolver expands at request time against the live Vedpragya feed.
 *                  Recipes mean expiries roll over automatically — admin never has to re-edit.
 *
 *              Resilience: parseMarketCatalogJson() never throws — it falls back to
 *              DEFAULT_MARKET_CATALOG_V1 on any parse/validation failure (mirrors
 *              parseMarketControlConfigJson behavior).
 *
 * Exports:
 *   - marketCatalogV1Schema           — top-level Zod schema (use for safeParse on PUT)
 *   - DEFAULT_MARKET_CATALOG_V1       — empty catalog with version=1
 *   - parseMarketCatalogJson(value)   — defensive parser → MarketCatalogV1
 *   - MarketCatalogV1, CatalogGroup, CatalogItem (+ specific item types) — TS types
 *
 * Side-effects: none (pure schema/parsing module).
 *
 * Key invariants:
 *   - groups[*].id is a slug (lowercase, dash-separated). Stable across edits — used in URLs.
 *   - sortOrder is the canonical ordering signal; UI must respect it.
 *   - options-chain recipes reference the underlying by token (broker instrument token), NOT by symbol —
 *     symbol strings can change but tokens are stable.
 *
 * Read order:
 *   1. CatalogItem types — understand the union shape first.
 *   2. CatalogGroup → MarketCatalogV1 — top-down composition.
 *   3. parseMarketCatalogJson — defensive parsing entry point.
 *
 * Author:        BharatERP
 * Last-updated:  2026-05-01
 */

import { z } from "zod"

/* ────────────────────────────────────────────────────────────────────────────────
 * Primitives — slugs, ISO dates
 * ────────────────────────────────────────────────────────────────────────────── */

const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/i, "must be a slug (alphanumeric + dashes)")

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD (IST)")

/* ────────────────────────────────────────────────────────────────────────────────
 * Item kinds
 * ────────────────────────────────────────────────────────────────────────────── */

/**
 * A pre-resolved instrument row. Admin picks a specific instrument once; it's surfaced
 * verbatim to users until removed.
 */
export const instrumentItemSchema = z.object({
  kind: z.literal("instrument"),
  token: z.number().int().positive(),
  symbol: z.string().min(1).max(64),
  name: z.string().max(160).optional(),
  exchange: z.string().min(1).max(16),
  segment: z.string().min(1).max(16),
})

/**
 * Expiry strategy for an options-chain recipe. Either "next N weekly/monthly" (rolls forward
 * automatically) or an explicit list of expiries (admin must update before they expire — but
 * the daily expiry sweep at least cleans up downstream WatchlistItems).
 */
export const expiryStrategySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("next-n-weekly"),
    count: z.number().int().min(1).max(8),
  }),
  z.object({
    mode: z.literal("next-n-monthly"),
    count: z.number().int().min(1).max(6),
  }),
  z.object({
    mode: z.literal("explicit"),
    dates: z.array(isoDateSchema).min(1).max(12),
  }),
])

/**
 * Strike strategy. "atm-window" is the typical case (e.g., ATM ± 10 strikes); "explicit" allows
 * surgical control over a specific strike list.
 */
export const strikeStrategySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("atm-window"),
    /** Number of strikes on each side of ATM (e.g., 10 → 21 rows total including ATM). */
    window: z.number().int().min(1).max(40),
    /** Optional override of the auto-detected strike step (NIFTY=50, BANKNIFTY=100, …). */
    step: z.number().positive().max(10_000).optional(),
  }),
  z.object({
    mode: z.literal("explicit"),
    strikes: z.array(z.number().positive()).min(1).max(100),
  }),
])

/**
 * An options-chain recipe item. Resolver expands this at request time into a tree of
 * { expiry → [{ strike, ce?, pe? }, …] } rendered as the user-facing tree drawer.
 */
export const optionsChainItemSchema = z.object({
  kind: z.literal("options-chain"),
  underlying: z.object({
    token: z.number().int().positive(),
    symbol: z.string().min(1).max(64),
    segment: z.string().min(1).max(16),
  }),
  expiryStrategy: expiryStrategySchema,
  strikeStrategy: strikeStrategySchema,
  includeCE: z.boolean().default(true),
  includePE: z.boolean().default(true),
})

export const catalogItemSchema = z.discriminatedUnion("kind", [
  instrumentItemSchema,
  optionsChainItemSchema,
])

/* ────────────────────────────────────────────────────────────────────────────────
 * Group + top-level catalog
 * ────────────────────────────────────────────────────────────────────────────── */

export const catalogGroupSchema = z.object({
  id: slugSchema,
  label: z.string().min(1).max(80),
  description: z.string().max(240).optional(),
  /** Lucide icon name, free-form; UI falls back to a default if unknown. */
  icon: z.string().max(40).optional(),
  sortOrder: z.number().int().nonnegative().default(0),
  items: z.array(catalogItemSchema).max(200).default([]),
})

export const marketCatalogV1Schema = z.object({
  version: z.literal(1),
  groups: z.array(catalogGroupSchema).max(50).default([]),
  /** ISO 8601 timestamp set by the writer; informational only — DB updatedAt is authoritative. */
  updatedAt: z.string().optional(),
})

/* ────────────────────────────────────────────────────────────────────────────────
 * Types
 * ────────────────────────────────────────────────────────────────────────────── */

export type InstrumentItem = z.infer<typeof instrumentItemSchema>
export type OptionsChainItem = z.infer<typeof optionsChainItemSchema>
export type CatalogItem = z.infer<typeof catalogItemSchema>
export type CatalogGroup = z.infer<typeof catalogGroupSchema>
export type MarketCatalogV1 = z.infer<typeof marketCatalogV1Schema>
export type ExpiryStrategy = z.infer<typeof expiryStrategySchema>
export type StrikeStrategy = z.infer<typeof strikeStrategySchema>

/* ────────────────────────────────────────────────────────────────────────────────
 * Defaults + defensive parser
 * ────────────────────────────────────────────────────────────────────────────── */

export const DEFAULT_MARKET_CATALOG_V1: MarketCatalogV1 = {
  version: 1,
  groups: [],
}

/**
 * Parse a raw value (string, object, or anything) into a valid MarketCatalogV1.
 * Never throws — falls back to the empty default on any failure. This is intentional:
 * an admin viewing a corrupt blob should see an empty catalog they can fix, not a 500.
 */
export function parseMarketCatalogJson(rawValue: unknown): MarketCatalogV1 {
  let candidate: unknown = rawValue
  if (typeof rawValue === "string") {
    try {
      candidate = JSON.parse(rawValue)
    } catch {
      return { ...DEFAULT_MARKET_CATALOG_V1 }
    }
  }
  const parsed = marketCatalogV1Schema.safeParse(candidate)
  if (!parsed.success) {
    return { ...DEFAULT_MARKET_CATALOG_V1 }
  }
  return parsed.data
}
