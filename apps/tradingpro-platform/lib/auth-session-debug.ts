/**
 * @file auth-session-debug.ts
 * @module lib
 * @description Env-gated one-line JSON logs for NextAuth JWT/session and JTI troubleshooting (no secrets).
 * @author StockTrade
 * @created 2026-03-28
 * @updated 2026-03-28
 *
 * Notes:
 * - `AUTH_SESSION_DEBUG` or `AUTH_SESSION_DEBUG_TRACE`: middleware trace headers + `authSessionMw` logs.
 * - `AUTH_SESSION_ROUTE_AUDIT` or (non-production + `AUTH_SESSION_DEBUG`): `/api/auth/session` response shape audit.
 */

/** Visible prefix length for correlation; never log full jti/userId in production-adjacent logs. */
const PREFIX_LEN = 8

function prefixId(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined
  return `${value.slice(0, PREFIX_LEN)}…`
}

function isNodeDebug(): boolean {
  return process.env.AUTH_SESSION_DEBUG === "1"
}

function isEdgeDebug(): boolean {
  return process.env.AUTH_SESSION_DEBUG_EDGE === "1"
}

/** Edge middleware: request id + /api/auth/session snapshot logs. */
export function isAuthSessionTraceEnabled(): boolean {
  return process.env.AUTH_SESSION_DEBUG === "1" || process.env.AUTH_SESSION_DEBUG_TRACE === "1"
}

/**
 * Middleware-only JSON line (Edge-safe). Uses same env as trace headers.
 */
export function authSessionMiddlewareDebug(event: string, fields: Record<string, unknown>): void {
  if (!isAuthSessionTraceEnabled() || typeof console === "undefined" || !console.info) return
  console.info(JSON.stringify({ t: "authSessionMw", event, ...fields }))
}

function shouldAuditAuthSessionRoute(): boolean {
  if (process.env.AUTH_SESSION_ROUTE_AUDIT === "1") return true
  return process.env.NODE_ENV !== "production" && process.env.AUTH_SESSION_DEBUG === "1"
}

/**
 * After NextAuth GET handler: logs whether JSON body has user + expires (never logs cookies/tokens).
 */
export async function authSessionRouteAudit(req: Request, res: Response): Promise<void> {
  if (!shouldAuditAuthSessionRoute() || typeof console === "undefined" || !console.info) return
  try {
    const url = new URL(req.url)
    if (req.method !== "GET" || !url.pathname.endsWith("/session")) return
    const clone = res.clone()
    const text = await clone.text()
    let body: unknown = null
    try {
      body = text && text.length > 0 ? JSON.parse(text) : null
    } catch {
      return
    }
    const b = body as { user?: { id?: unknown }; expires?: unknown } | null
    const uid = b?.user && typeof b.user === "object" ? (b.user as { id?: unknown }).id : undefined
    const hasUser = typeof uid === "string" && uid.trim().length > 0
    console.info(
      JSON.stringify({
        t: "authSession",
        event: "route:session_response",
        hasUser,
        hasExpires: typeof b?.expires === "string",
      }),
    )
  } catch {
    /* ignore audit failures */
  }
}

/**
 * Node / Route Handler / full auth config. Set AUTH_SESSION_DEBUG=1.
 */
export function authSessionDebug(event: string, fields: Record<string, unknown>): void {
  if (!isNodeDebug() || typeof console === "undefined" || !console.info) return
  const line = JSON.stringify({ t: "authSession", event, ...fields })
  console.info(line)
}

/**
 * Edge middleware only. Set AUTH_SESSION_DEBUG_EDGE=1 (avoid noisy Edge logs by default).
 */
export function authSessionDebugEdge(event: string, fields: Record<string, unknown>): void {
  if (!isEdgeDebug() || typeof console === "undefined" || !console.info) return
  const line = JSON.stringify({ t: "authSessionEdge", event, ...fields })
  console.info(line)
}

export { prefixId }
