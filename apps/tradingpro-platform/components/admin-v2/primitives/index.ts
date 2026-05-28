/**
 * @file components/admin-v2/primitives/index.ts
 * @module admin-v2/primitives
 * @description Barrel export for v2 admin primitives. Import from this single file across v2.
 *
 *              Exports:
 *                - StatusPill, statusKindToTone, StatusKind, StatusTone
 *                - EmptyState
 *                - KpiTile
 *                - V2Drawer, V2DrawerTrigger, V2DrawerHeader, V2DrawerBody, V2DrawerFooter
 *                - V2DataTable, useV2TableColumnHelper
 *
 *              Side-effects: none.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

export { StatusPill, statusKindToTone } from "./status-pill"
export type { StatusKind, StatusTone } from "./status-pill"
export { EmptyState } from "./empty-state"
export { KpiTile } from "./kpi-tile"
export {
  V2Drawer,
  V2DrawerTrigger,
  V2DrawerHeader,
  V2DrawerBody,
  V2DrawerFooter,
} from "./drawer"
export { V2DataTable, useV2TableColumnHelper } from "./data-table"
