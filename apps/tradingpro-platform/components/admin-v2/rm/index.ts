/**
 * @file components/admin-v2/rm/index.ts
 * @module admin-v2/rm
 * @description Barrel exports for the v2 RM workbench.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

export { default as RmWorkbench } from "./rm-workbench"
export { default as RmRoster } from "./rm-roster"
export { default as RmOrgTree } from "./rm-org-tree"
export { default as RmLeaderboard } from "./rm-leaderboard"
export { default as RmAssignmentPanel } from "./assignment-panel"

export {
  useRmList,
  useRmTeam,
  useRmLeaderboard,
  assignClientToRm,
} from "./hooks"

export type {
  RmRow,
  RmTeamMember,
  LeaderboardRow,
  LeaderboardResp,
  RmListResp,
  RmTeamResp,
} from "./types"
