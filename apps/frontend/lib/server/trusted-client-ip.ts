/**
 * @file trusted-client-ip.ts
 * @module lib/server
 * @description Resolves a single client IP from proxy headers with configurable trusted depth (X-Forwarded-For, CF-Connecting-IP, X-Real-IP, fallback socket).
 * @author StockTrade
 * @created 2026-03-28
 */

import "server-only"

export type TrustedClientIpInput = {
  headers: Headers | Record<string, string | string[] | undefined | null>
  /** Direct remote address when headers are absent (e.g. req.socket.remoteAddress). */
  socketRemoteAddress?: string | null | undefined
}

function getHeader(
  headers: TrustedClientIpInput["headers"],
  name: string
): string | undefined {
  const lower = name.toLowerCase()
  if (headers instanceof Headers) {
    const v = headers.get(name) ?? headers.get(lower)
    return v?.trim() || undefined
  }
  const raw = (headers as Record<string, unknown>)[name] ?? (headers as Record<string, unknown>)[lower]
  if (raw == null) return undefined
  if (Array.isArray(raw)) {
    const first = raw.find((x) => typeof x === "string" && x.trim().length > 0)
    return typeof first === "string" ? first.trim() : undefined
  }
  if (typeof raw === "string") return raw.trim() || undefined
  return undefined
}

/**
 * Number of trusted proxies in front of the app (default 1 for Vercel / typical CDN).
 * Client IP is taken as the Nth hop from the left in X-Forwarded-For (0-based index = depth - 1 from right is wrong — we use "leftmost client after stripping proxies").
 * Standard: XFF lists client, proxy1, proxy2 ... left to right. With one trusted proxy, use first entry.
 * With two (e.g. client -> cdn -> app), use index 0 still if CDN appends; if your chain differs, increase depth.
 */
function parseTrustedDepth(): number {
  const raw = process.env.TRUSTED_PROXY_DEPTH ?? process.env.TRUSTED_PROXY_HOPS
  const n = raw != null ? Number.parseInt(String(raw), 10) : NaN
  if (!Number.isFinite(n) || n < 1) return 1
  if (n > 10) return 10
  return Math.floor(n)
}

function normalizeIp(raw: string): string {
  const t = raw.trim()
  if (t.startsWith("::ffff:")) return t.slice(7)
  return t
}

/**
 * Proxies usually *append* to XFF; the original client is often the leftmost entry.
 * `depth` selects 0-based index from the left (default 0). Increase only if your edge strips
 * spoofed leading hops and you must skip them (operational — document your proxy config).
 */
function pickFromXff(chain: string, depth: number): string | undefined {
  const parts = chain
    .split(",")
    .map((p) => normalizeIp(p.trim()))
    .filter((p) => p.length > 0)
  if (parts.length === 0) return undefined
  const i = Math.min(Math.max(depth - 1, 0), parts.length - 1)
  return parts[i]
}

/**
 * Returns best-effort client IP for security logging and clustering. Never trust XFF without TLS-terminated trusted proxies.
 */
export function getTrustedClientIp(input: TrustedClientIpInput): string {
  const depth = parseTrustedDepth()
  const cf = getHeader(input.headers, "cf-connecting-ip")
  if (cf) return normalizeIp(cf)

  const xff = getHeader(input.headers, "x-forwarded-for")
  if (xff) {
    const picked = pickFromXff(xff, depth)
    if (picked) return picked
  }

  const realIp = getHeader(input.headers, "x-real-ip")
  if (realIp) return normalizeIp(realIp)

  if (input.socketRemoteAddress) {
    return normalizeIp(String(input.socketRemoteAddress))
  }

  return "unknown"
}

/**
 * Build a Headers-like view from a Node/Next `Request` or `IncomingMessage`.
 */
export function headersFromIncoming(req: {
  headers?: TrustedClientIpInput["headers"]
  socket?: { remoteAddress?: string | null }
}): TrustedClientIpInput {
  return {
    headers: (req.headers ?? {}) as Record<string, string | string[] | undefined>,
    socketRemoteAddress: req.socket?.remoteAddress,
  }
}
