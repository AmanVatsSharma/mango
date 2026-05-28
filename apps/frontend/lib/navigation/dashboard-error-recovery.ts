/**
 * @file dashboard-error-recovery.ts
 * @module lib/navigation
 * @description Auto-recovery tracker for ANY error surfaced on the trading dashboard
 *   (segment error boundary or React error boundary). The goal is simple: users must
 *   almost never see the red "Application Error" card. For transient errors (WebSocket
 *   glitches, stale SWR cache, hydration hiccups, backend 5xx blips) we escalate silently:
 *
 *     1. SILENT_RETRY_MAX soft retries via `reset()` — user sees loading spinner only.
 *     2. HARD_RELOAD_MAX hard reloads via `window.location.reload()` — same spinner.
 *     3. Only after all attempts are exhausted does the `TradingErrorDisplay` card show.
 *
 *   The counter is kept in sessionStorage so it survives re-renders and full reloads,
 *   and is cleared in `TradingDashboardWrapper` once the dashboard mounts healthy.
 * @author StockTrade
 * @created 2026-04-24
 */

const STORAGE_KEY = "dashboard-error-recovery-v1"

/** Silent `reset()` attempts before we escalate to a hard reload. */
export const SILENT_RETRY_MAX = 2

/** Total attempts (silent + reload) before we finally show the error card. */
export const HARD_RELOAD_MAX = 4

/** Delay before triggering a silent `reset()` — lets transient issues settle. */
export const SILENT_RETRY_DELAY_MS = 700

/** Delay before a hard `window.location.reload()`. */
export const HARD_RELOAD_DELAY_MS = 900

/** Safety-net reload when an overlay is rendered without a retry callback. */
export const SAFETY_RELOAD_DELAY_MS = 3_000

export type DashboardErrorRecoveryAction = "silent_retry" | "hard_reload" | "give_up"

// In-memory fallback for environments where sessionStorage is blocked (Safari
// private mode, quota exceeded, third-party-cookie lockdown). Without this the
// counter never advances, and `prepareDashboardErrorRecovery` would return
// "silent_retry" forever — stranding the user on the loading spinner.
let memoryCounter = 0

function readCounter(): number {
  if (typeof window === "undefined") return HARD_RELOAD_MAX
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (raw === null) return memoryCounter
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n) || n < 0) return memoryCounter
    return n
  } catch {
    return memoryCounter
  }
}

function writeCounter(n: number): void {
  memoryCounter = n
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, String(n))
  } catch {
    /* sessionStorage unavailable — memoryCounter still advances */
  }
}

/**
 * Clears the error-recovery counter after a healthy dashboard mount.
 */
export function clearDashboardErrorRecoveryCounter(): void {
  memoryCounter = 0
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* sessionStorage unavailable — memoryCounter already reset */
  }
}

/**
 * Records one error-recovery attempt and returns the action the caller should run.
 * Increments the counter only when an actual retry will be attempted.
 */
export function prepareDashboardErrorRecovery(): DashboardErrorRecoveryAction {
  const current = readCounter()
  if (current < SILENT_RETRY_MAX) {
    writeCounter(current + 1)
    return "silent_retry"
  }
  if (current < HARD_RELOAD_MAX) {
    writeCounter(current + 1)
    return "hard_reload"
  }
  return "give_up"
}

/**
 * Peeks the current attempt count without incrementing. Useful for UI copy.
 */
export function getDashboardErrorRecoveryAttempt(): number {
  return readCounter()
}
