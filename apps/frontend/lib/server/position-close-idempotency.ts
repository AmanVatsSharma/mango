/**
 * @file position-close-idempotency.ts
 * @module server
 * @description Best-effort in-memory idempotency for position close POST/PATCH (single process; not for multi-instance without Redis).
 * @author StockTrade
 * @created 2026-03-30
 */

type IdempotencyEntry = {
  expiresAt: number
  status: number
  body: Record<string, unknown>
}

const TTL_MS = 5 * 60_000
const MAX_ENTRIES = 2_000

const store = new Map<string, IdempotencyEntry>()

function pruneExpired(): void {
  const now = Date.now()
  for (const [k, v] of Array.from(store.entries())) {
    if (v.expiresAt < now) store.delete(k)
  }
  while (store.size > MAX_ENTRIES) {
    const first = store.keys().next().value
    if (first === undefined) break
    store.delete(first)
  }
}

/**
 * Returns a prior response body when the same key was completed recently.
 */
export function consumePositionCloseIdempotency(key: string | null | undefined): {
  status: number
  body: Record<string, unknown>
} | null {
  if (!key || typeof key !== "string") return null
  const trimmed = key.trim().slice(0, 200)
  if (!trimmed) return null
  pruneExpired()
  const hit = store.get(trimmed)
  if (!hit || hit.expiresAt < Date.now()) {
    if (hit) store.delete(trimmed)
    return null
  }
  return { status: hit.status, body: hit.body }
}

/**
 * Stores terminal close response for idempotent replay (success or error JSON).
 */
export function rememberPositionCloseIdempotency(
  key: string | null | undefined,
  status: number,
  body: Record<string, unknown>,
): void {
  if (!key || typeof key !== "string") return
  const trimmed = key.trim().slice(0, 200)
  if (!trimmed) return
  pruneExpired()
  store.set(trimmed, { expiresAt: Date.now() + TTL_MS, status, body })
}

export function resolveIdempotencyKeyFromRequest(req: Request, bodyKey?: unknown): string | null {
  const h =
    req.headers.get("x-idempotency-key") ||
    req.headers.get("idempotency-key") ||
    req.headers.get("Idempotency-Key")
  if (h && h.trim()) return h.trim().slice(0, 200)
  if (typeof bodyKey === "string" && bodyKey.trim()) return bodyKey.trim().slice(0, 200)
  return null
}
