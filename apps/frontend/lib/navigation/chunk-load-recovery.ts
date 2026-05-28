/**
 * @file chunk-load-recovery.ts
 * @module lib/navigation
 * @description Caps automatic full-page reloads triggered by ChunkLoadErrors after a deployment.
 *   After a Next.js redeployment, old chunk hashes become invalid and browsers throw
 *   ChunkLoadError when trying to fetch stale chunk URLs. This module tracks reload attempts
 *   to auto-recover silently (up to MAX_CHUNK_RELOAD_ATTEMPTS times per tab session).
 * @author StockTrade
 * @created 2026-04-12
 */

const STORAGE_KEY = "chunk-load-recovery-v1"

/** Auto-reloads allowed before showing a hard error (sessionStorage-backed per tab). */
export const MAX_CHUNK_RELOAD_ATTEMPTS = 2

export type ChunkLoadRecoveryOutcome = "reload" | "give_up"

/**
 * Returns true when the given error is a ChunkLoadError from webpack / Next.js.
 * Checks error.name (webpack sets this explicitly) and common message patterns:
 * - JS chunk load failures from webpack
 * - Dynamic import failures (ES modules)
 * - CSS chunk load failures from Next.js
 */
export function isChunkLoadError(error: Error): boolean {
  if (!error) return false
  if (error.name === "ChunkLoadError") return true
  const msg = (error.message || "").toLowerCase()
  return (
    msg.includes("loading chunk") ||
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("chunkloaderror") ||
    msg.includes("loading css chunk")
  )
}

/**
 * Clears the chunk-reload counter after a healthy page load.
 * Call this once the app has fully hydrated without a ChunkLoadError.
 */
export function clearChunkLoadRecoveryCounter(): void {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore quota / privacy mode */
  }
}

/**
 * Records one chunk-reload attempt and returns whether the page should reload.
 * Returns "give_up" once MAX_CHUNK_RELOAD_ATTEMPTS is reached for this tab session.
 */
export function prepareChunkLoadRecovery(): ChunkLoadRecoveryOutcome {
  if (typeof window === "undefined") return "give_up"
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    let n = raw ? parseInt(raw, 10) : 0
    if (!Number.isFinite(n) || n < 0) n = 0
    if (n >= MAX_CHUNK_RELOAD_ATTEMPTS) return "give_up"
    window.sessionStorage.setItem(STORAGE_KEY, String(n + 1))
    return "reload"
  } catch {
    // If sessionStorage is unavailable, attempt one reload anyway
    return "reload"
  }
}
