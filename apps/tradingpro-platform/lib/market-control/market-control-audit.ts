/**
 * @file market-control-audit.ts
 * @module lib/market-control
 * @description Audit trail helpers for MARKET_CONTROL_CONFIG_V1 edits. Each change is persisted as
 *              a versioned SystemSettings row (key = `market_control_audit:{iso}`) carrying the
 *              actor id, before/after JSON, and a computed flat diff so the UI can render the
 *              change history without parsing both blobs.
 * @author StockTrade
 * @created 2026-04-16
 */

import { prisma } from "@/lib/prisma"
import { ADMIN_SETTING_KEYS } from "@/lib/constants/admin-settings"

export type DiffKind = "added" | "changed" | "removed"

export interface DiffEntry {
  path: string
  kind: DiffKind
  before: unknown
  after: unknown
}

type Json = unknown

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/** Flatten two JSON values into a list of leaf-level differences. */
export function computeConfigDiff(before: Json, after: Json, basePath = ""): DiffEntry[] {
  const out: DiffEntry[] = []

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    for (const k of keys) {
      const nextPath = basePath ? `${basePath}.${k}` : k
      const b = (before as Record<string, unknown>)[k]
      const a = (after as Record<string, unknown>)[k]
      if (b === undefined && a !== undefined) {
        out.push({ path: nextPath, kind: "added", before: undefined, after: a })
      } else if (b !== undefined && a === undefined) {
        out.push({ path: nextPath, kind: "removed", before: b, after: undefined })
      } else {
        out.push(...computeConfigDiff(b, a, nextPath))
      }
    }
    return out
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      out.push({ path: basePath, kind: "changed", before, after })
    }
    return out
  }

  if (before !== after) {
    out.push({ path: basePath, kind: "changed", before, after })
  }
  return out
}

export interface WriteAuditInput {
  actorId: string | null
  action: string
  before: Json
  after: Json
  summary?: string
}

/**
 * Persist an audit row. Uses SystemSettings as the store (no separate audit table in schema).
 * Row value is JSON-encoded. `ownerId` null = global scope.
 */
export async function writeMarketControlAudit(input: WriteAuditInput): Promise<void> {
  const ts = new Date().toISOString()
  const diff = computeConfigDiff(input.before, input.after).slice(0, 500)
  const payload = {
    ts,
    actorId: input.actorId,
    action: input.action,
    summary: input.summary ?? null,
    diff,
    before: input.before,
    after: input.after,
  }
  const key = `${ADMIN_SETTING_KEYS.MARKET_CONTROL_AUDIT_PREFIX}${ts}`
  try {
    await prisma.systemSettings.create({
      data: {
        key,
        value: JSON.stringify(payload),
        description: `Market control audit: ${input.action}`,
      },
    })
  } catch {
    // best-effort — audit should never break the config write
  }
}

export async function listMarketControlAudit(limit = 50): Promise<
  Array<{
    id: string
    ts: string
    actorId: string | null
    action: string
    summary: string | null
    diff: DiffEntry[]
    updatedAt: Date
  }>
> {
  const rows = await prisma.systemSettings.findMany({
    where: {
      key: { startsWith: ADMIN_SETTING_KEYS.MARKET_CONTROL_AUDIT_PREFIX },
      ownerId: null,
    },
    orderBy: { updatedAt: "desc" },
    take: Math.max(1, Math.min(200, limit)),
    select: { id: true, value: true, updatedAt: true },
  })
  return rows
    .map((r) => {
      try {
        const parsed = JSON.parse(r.value)
        return {
          id: r.id,
          ts: String(parsed.ts ?? r.updatedAt.toISOString()),
          actorId: parsed.actorId ?? null,
          action: String(parsed.action ?? "UNKNOWN"),
          summary: parsed.summary ?? null,
          diff: Array.isArray(parsed.diff) ? (parsed.diff as DiffEntry[]) : [],
          updatedAt: r.updatedAt,
        }
      } catch {
        return null
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
}
