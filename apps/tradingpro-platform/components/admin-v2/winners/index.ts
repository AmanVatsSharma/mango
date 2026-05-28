/**
 * @file components/admin-v2/winners/index.ts
 * @module admin-v2/winners
 * @description Barrel exports for the Winner Mitigation module.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

export { WinnersWorkbench } from "./winners-workbench"
export { WinnerControlPanel } from "./winner-control-panel"
export { RungPill } from "./rung-pill"
export { useWinnerControl, useWinnerList } from "./hooks"
export type {
  WinnerControlEnvelope,
  WinnerListEnvelope,
  WinnerControlSnapshot,
  WinnerControlUpdateInput,
  WinnerHistoryEntry,
  WinnerListRow,
  WinnerRung,
} from "./types"
export { WINNER_RUNGS, WINNER_RUNG_META } from "./types"
