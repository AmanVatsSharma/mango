/**
 * @file session-bootstrap-utils.ts
 * @module components/auth
 * @description Session bootstrap polling helpers for resilient auth-to-dashboard transitions.
 * @author StockTrade
 * @created 2026-02-22
 */

export const DEFAULT_BOOTSTRAP_ATTEMPTS = 8
export const DEFAULT_BOOTSTRAP_DELAY_MS = 350
export const DEFAULT_BOOTSTRAP_REQUEST_TIMEOUT_MS = 2500

export interface FetchSessionSnapshotOptions {
  fetchImpl?: typeof fetch
  endpoint?: string
  requestTimeoutMs?: number
}

export interface SessionSnapshotResult {
  isReady: boolean
  payload: unknown
  error?: unknown
}

export interface PollSessionBootstrapOptions extends FetchSessionSnapshotOptions {
  attempts?: number
  delayMs?: number
  onAttemptFailure?: (error: unknown, attempt: number) => void
}

function sleep(delayMs: number): Promise<void> {
  if (delayMs <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

export function hasHydratedSessionUser(payload: unknown): boolean {
  const sessionPayload = payload as { user?: { id?: unknown } } | null | undefined
  const userId = sessionPayload?.user?.id
  return typeof userId === "string" && userId.trim().length > 0
}

export async function fetchSessionSnapshot(
  options: FetchSessionSnapshotOptions = {}
): Promise<SessionSnapshotResult> {
  const {
    fetchImpl = fetch,
    endpoint = "/api/auth/session",
    requestTimeoutMs = DEFAULT_BOOTSTRAP_REQUEST_TIMEOUT_MS,
  } = options

  const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined
  const timeoutId =
    controller && requestTimeoutMs > 0
      ? setTimeout(() => controller.abort(), requestTimeoutMs)
      : undefined

  try {
    const requestInit: RequestInit = {
      method: "GET",
      cache: "no-store",
      credentials: "include",
      ...(controller ? { signal: controller.signal } : {}),
    }

    const response = await fetchImpl(endpoint, requestInit)
    if (!response.ok) {
      return { isReady: false, payload: null }
    }

    const raw = await response.text()
    let payload: unknown = null
    if (raw.trim().length > 0) {
      try {
        payload = JSON.parse(raw) as unknown
      } catch {
        return { isReady: false, payload: null }
      }
    }
    return {
      isReady: hasHydratedSessionUser(payload),
      payload,
    }
  } catch (error) {
    return { isReady: false, payload: null, error }
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

export async function pollForHydratedSession(
  options: PollSessionBootstrapOptions = {}
): Promise<boolean> {
  const {
    attempts = DEFAULT_BOOTSTRAP_ATTEMPTS,
    delayMs = DEFAULT_BOOTSTRAP_DELAY_MS,
    onAttemptFailure,
    ...snapshotOptions
  } = options

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const snapshot = await fetchSessionSnapshot(snapshotOptions)
    if (snapshot.isReady) {
      return true
    }

    if (snapshot.error && onAttemptFailure) {
      onAttemptFailure(snapshot.error, attempt)
    }

    if (attempt < attempts) {
      await sleep(delayMs)
    }
  }

  return false
}
