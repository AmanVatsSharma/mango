/**
 * @file http-etag.ts
 * @module server
 * @description Weak ETag helpers for conditional GET responses.
 * @author StockTrade
 * @created 2026-03-24
 */

import { createHash } from "node:crypto"

export function weakEtagFromPayload(payload: string): string {
  const digest = createHash("sha256").update(payload).digest("base64url")
  return `W/"${digest}"`
}

export function normalizeIfNoneMatch(headerValue: string | null): string | null {
  if (!headerValue || typeof headerValue !== "string") return null
  const first = headerValue.split(",")[0]?.trim()
  if (!first) return null
  return first.replace(/^W\//i, "").replace(/"/g, "")
}

export function normalizeEtag(etag: string): string {
  return etag.replace(/^W\//i, "").replace(/"/g, "")
}
