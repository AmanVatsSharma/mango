/**
 * @file market-catalog-audit.ts
 * @module lib/market-catalog
 * @description Audit trail for MARKET_CATALOG_V1 admin edits. Same on-disk shape as
 *              `lib/market-control/market-control-audit.ts` so a single audit-viewer UI can
 *              read both prefixes by simple key namespacing.
 *
 *              Each save records actor + before + after + a flat path-level diff (capped at 500
 *              entries to bound row size). Persisted as a SystemSettings row keyed by
 *              `MARKET_CATALOG_AUDIT_PREFIX + iso-ts` with ownerId=null.
 *
 *              Failure to write the audit row is intentionally swallowed — the configuration
 *              save path must never fail because of audit issues.
 *
 * Exports:
 *   - writeMarketCatalogAudit(input)        — fire-and-forget audit write
 *   - listMarketCatalogAudit(limit?)        — read recent audit rows
 *   - DiffEntry, DiffKind, WriteAuditInput  — shared types
 *
 * Side-effects:
 *   - Writes to and reads from SystemSettings via Prisma.
 *
 * Key invariants:
 *   - actorId may be null (system-initiated changes, e.g. migration).
 *   - diff truncated to 500 entries; the full before/after is still stored.
 *
 * Read order:
 *   1. computeConfigDiff — recursive structural diff.
 *   2. writeMarketCatalogAudit / listMarketCatalogAudit — public entry points.
 *
 * Author:        BharatERP
 * Last-updated:  2026-05-01
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
export function computeCatalogDiff(before: Json, after: Json, basePath = ""): DiffEntry[] {
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
        out.push(...computeCatalogDiff(b, a, nextPath))
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

export async function writeMarketCatalogAudit(input: WriteAuditInput): Promise<void> {
  const ts = new Date().toISOString()
  const diff = computeCatalogDiff(input.before, input.after).slice(0, 500)
  const payload = {
    ts,
    actorId: input.actorId,
    action: input.action,
    summary: input.summary ?? null,
    diff,
    before: input.before,
    after: input.after,
  }
  const key = `${ADMIN_SETTING_KEYS.MARKET_CATALOG_AUDIT_PREFIX}${ts}`
  try {
    await prisma.systemSettings.create({
      data: {
        key,
        value: JSON.stringify(payload),
        description: `Market catalog audit: ${input.action}`,
      },
    })
  } catch {
    // best-effort — audit must never break the config write
  }
}

export async function listMarketCatalogAudit(limit = 50): Promise<
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
      key: { startsWith: ADMIN_SETTING_KEYS.MARKET_CATALOG_AUDIT_PREFIX },
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
