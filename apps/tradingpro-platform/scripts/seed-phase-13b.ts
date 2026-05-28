/**
 * File:        scripts/seed-phase-13b.ts
 * Module:      Surveillance · Phase 13b Seed
 * Purpose:     One-shot seeder for the default Phase 13b surveillance rule set.
 *              Idempotent — safe to run repeatedly. Run via:
 *                  npx tsx scripts/seed-phase-13b.ts
 *
 * Exports:     none (CLI-only).
 *
 * Depends on:
 *   - @/lib/surveillance/seed.seedSurveillanceRules
 *
 * Side-effects:
 *   - DB upserts to SurveillanceRule.
 *
 * Key invariants:
 *   - Operator-tuned values are sacred — the seeder NEVER overwrites operator-tuned fields.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import { seedSurveillanceRules } from "@/lib/surveillance/seed"

async function main() {
  const result = await seedSurveillanceRules({ forceReset: false })
  // eslint-disable-next-line no-console
  console.log("Phase 13b surveillance seed:", result)
  process.exit(0)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Phase 13b seed failed:", err)
  process.exit(1)
})
