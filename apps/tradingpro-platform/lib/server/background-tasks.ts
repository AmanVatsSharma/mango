/**
 * File: lib/server/background-tasks.ts
 * Module: server
 * Purpose: Enqueue best-effort background work without blocking HTTP responses (Vercel-friendly).
 * Author: StockTrade
 * Last-updated: 2026-02-04
 * Notes:
 * - On Vercel Node runtime, uses `waitUntil()` from `@vercel/functions` so work can continue after response.
 * - On other runtimes, falls back to fire-and-forget (best effort).
 */

export type BackgroundTask = Promise<unknown>

/**
 * Enqueue a background task in a platform-safe way.
 *
 * IMPORTANT:
 * - This should be used only for idempotent work or work protected by DB locks (e.g. advisory locks),
 *   because serverless environments may retry/duplicate invocations.
 */
export function enqueueBackgroundTask(task: BackgroundTask): void {
  try {
    // `@vercel/functions` is optional at runtime (only available when installed).
    // We require it dynamically to avoid bundling issues in non-Vercel environments.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("@vercel/functions") as { waitUntil?: (p: Promise<unknown>) => void }
    if (typeof mod?.waitUntil === "function") {
      mod.waitUntil(task)
      return
    }
  } catch {
    // ignore; fallback below
  }

  // Best-effort fallback (do not await).
  void task
}

