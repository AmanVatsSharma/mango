/**
 * @file components/admin-v2/winners/types.ts
 * @module admin-v2/winners
 * @description Re-export of server types so client components have a single import surface.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

export type {
  WinnerControlOverrides,
  WinnerControlSnapshot,
  WinnerControlUpdateInput,
  WinnerHistoryEntry,
  WinnerListResponse,
  WinnerListRow,
  WinnerRulesConfig,
  WinnerRung,
} from "@/lib/winners/types"

export { WINNER_RUNGS, WINNER_RUNG_META } from "@/lib/winners/types"

export interface WinnerListEnvelope {
  success: boolean
  rows: import("@/lib/winners/types").WinnerListRow[]
  total: number
  byRung: Record<import("@/lib/winners/types").WinnerRung, number>
}

export interface WinnerControlEnvelope {
  success: boolean
  control: import("@/lib/winners/types").WinnerControlSnapshot
  history?: import("@/lib/winners/types").WinnerHistoryEntry[]
}
