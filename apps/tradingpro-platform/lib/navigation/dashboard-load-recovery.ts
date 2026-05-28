/**
 * @file dashboard-load-recovery.ts
 * @module lib/navigation
 * @description Caps automatic full-page reloads when dashboard session or route loading is stuck.
 * @author StockTrade
 * @created 2026-03-30
 * @updated 2026-03-30
 */

const STORAGE_KEY = "dashboard-load-recovery-v1"

/** Auto-reloads allowed before showing a hard error (sessionStorage-backed per tab). */
export const DASHBOARD_LOAD_RECOVERY_MAX_ATTEMPTS = 3

/** Watchdog: full reload when session or route loading exceeds this (ms). */
export const DASHBOARD_LOAD_STUCK_MS = 5_000

export type DashboardLoadRecoveryOutcome = "reload" | "give_up"

/**
 * Clears recovery counter after a healthy session / dashboard load.
 */
export function clearDashboardLoadRecoveryCounter(): void {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore quota / privacy mode */
  }
}

/**
 * Records one recovery attempt and returns whether a full reload should run.
 */
export function prepareDashboardLoadRecoveryReload(): DashboardLoadRecoveryOutcome {
  if (typeof window === "undefined") return "give_up"
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    let n = raw ? parseInt(raw, 10) : 0
    if (!Number.isFinite(n) || n < 0) {
      n = 0
    }
    if (n >= DASHBOARD_LOAD_RECOVERY_MAX_ATTEMPTS) {
      return "give_up"
    }
    window.sessionStorage.setItem(STORAGE_KEY, String(n + 1))
    return "reload"
  } catch {
    return "reload"
  }
}
