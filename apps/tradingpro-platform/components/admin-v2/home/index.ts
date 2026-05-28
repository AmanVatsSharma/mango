/**
 * @file components/admin-v2/home/index.ts
 * @module admin-v2/home
 * @description Barrel exports for the v2 role-aware home.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

export { default as RoleAwareHome } from "./role-aware-home"
export { useHomeVariant } from "./use-role-resolution"
export { useDensity } from "./density-toggle"
export type { HomeVariant } from "./use-role-resolution"
export type { Density } from "./density-toggle"
