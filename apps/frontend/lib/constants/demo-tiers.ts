/**
 * File:        lib/constants/demo-tiers.ts
 * Module:      Demo Account — Seed Tier Definitions
 * Purpose:     Preset virtual balances available when a user creates a demo account.
 *
 * Exports:
 *   - DEMO_ACCOUNT_TIERS — readonly array of tier options
 *   - DEMO_TIER_MAP      — lookup by value string
 *   - DemoTier           — tier object shape
 *   - isValidDemoTier(value: string) — type guard
 *
 * Depends on: none (pure data, no framework imports)
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - Values are string-serializable (to pass in API body) while amounts are integers (rupees)
 *
 * Read order:
 *   1. DEMO_ACCOUNT_TIERS — all tiers
 *   2. DEMO_TIER_MAP      — quick lookup
 *
 * Author:      Claude
 * Last-updated: 2026-05-14
 */

export const DEMO_ACCOUNT_TIERS = [
  { value: "100000",   label: "₹1 Lakh",   amount: 100_000   } as const,
  { value: "1000000",  label: "₹10 Lakh",  amount: 1_000_000  } as const,
  { value: "10000000", label: "₹1 Crore",  amount: 10_000_000 } as const,
] as const

export type DemoTier = typeof DEMO_ACCOUNT_TIERS[number]

export const DEMO_TIER_MAP: Record<DemoTier["value"], DemoTier> = Object.fromEntries(
  DEMO_ACCOUNT_TIERS.map((t) => [t.value, t])
) as Record<DemoTier["value"], DemoTier>

export function isValidDemoTier(value: string): value is DemoTier["value"] {
  return value in DEMO_TIER_MAP
}
