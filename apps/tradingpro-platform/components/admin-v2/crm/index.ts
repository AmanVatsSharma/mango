/**
 * @file components/admin-v2/crm/index.ts
 * @module admin-v2/crm
 * @description Barrel exports for canonical v2 CRM components.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

export { default as CrmNotesPanel } from "./notes-panel"
export { default as CrmTasksPanel } from "./tasks-panel"
export { default as CrmQuickNotePopover } from "./quick-note-popover"
export { default as CrmIntegrationStubButtons } from "./integration-stub-buttons"
export { default as CallbackRadar } from "./callback-radar"

export {
  useCrmNotes,
  useCrmTasks,
  useCallbackRadarCounts,
  useCallbackQueue,
  createCrmNote,
  createCrmTask,
  updateCrmTask,
  mutateCrmCachesForUser,
} from "./hooks"

export type {
  CrmNote,
  CrmNoteVisibility,
  CrmTask,
  CrmTaskKind,
  CrmTaskStatus,
  CrmTaskPriority,
  CrmTaskDisposition,
  CrmRadarCounts,
  CrmQueueRow,
  CrmQueueResp,
} from "./types"
