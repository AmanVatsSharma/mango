"use client"

/**
 * @file ChangeHistoryPanel.tsx
 * @module components/admin-console/market-control
 * @description Renders the audit timeline of Market Control edits. Fetches
 *              GET /api/admin/market-controls/history and shows each entry with actor, timestamp,
 *              action code and a flat diff (path: before → after) so operators can see what
 *              changed and when. Backed by SystemSettings rows with the `market_control_audit:` prefix.
 * @author StockTrade
 * @created 2026-04-16
 */

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCw, History } from "lucide-react"

interface DiffEntry {
  path: string
  kind: "added" | "changed" | "removed"
  before: unknown
  after: unknown
}

interface AuditEntry {
  id: string
  ts: string
  actorId: string | null
  action: string
  summary: string | null
  diff: DiffEntry[]
}

function fmtVal(v: unknown): string {
  if (v === undefined) return "∅"
  if (v === null) return "null"
  if (typeof v === "string") return `"${v}"`
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  try {
    const s = JSON.stringify(v)
    return s.length > 60 ? `${s.slice(0, 57)}…` : s
  } catch {
    return "[object]"
  }
}

function kindBadge(kind: DiffEntry["kind"]) {
  const color =
    kind === "added"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
      : kind === "removed"
        ? "bg-red-500/10 text-red-400 border-red-500/30"
        : "bg-amber-500/10 text-amber-400 border-amber-500/30"
  return <span className={`rounded border px-1 py-[1px] text-[9px] uppercase ${color}`}>{kind}</span>
}

export function ChangeHistoryPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/market-controls/history?limit=50", { cache: "no-store" })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to load")
      setEntries(json.data as AuditEntry[])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-primary" />
          <div className="text-xs font-semibold">Change history</div>
          <Badge variant="outline" className="text-[10px]">
            {entries.length} entries
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-2 h-8">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Reload
        </Button>
      </div>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
      )}

      {!loading && entries.length === 0 && !error && (
        <p className="text-xs text-muted-foreground italic px-1">No audit entries yet — edits to Market Control will appear here.</p>
      )}

      <div className="space-y-2 max-h-[500px] overflow-auto pr-1">
        {entries.map((e) => {
          const isOpen = expanded[e.id] ?? false
          const shownDiff = isOpen ? e.diff : e.diff.slice(0, 5)
          return (
            <div key={e.id} className="rounded border border-border bg-background/40 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {e.action}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground font-mono truncate">
                    {new Date(e.ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false })}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground truncate">
                  {e.actorId ? `actor: ${e.actorId.slice(0, 10)}…` : "actor: system"}
                </span>
              </div>

              {e.summary && <div className="text-[11px] text-muted-foreground">{e.summary}</div>}

              {e.diff.length === 0 ? (
                <div className="text-[11px] text-muted-foreground italic">No field changes detected.</div>
              ) : (
                <div className="space-y-1">
                  {shownDiff.map((d, i) => (
                    <div key={i} className="text-[11px] font-mono flex items-start gap-2">
                      {kindBadge(d.kind)}
                      <span className="text-primary break-all">{d.path || "(root)"}</span>
                      <span className="text-muted-foreground">:</span>
                      <span className="text-red-400 break-all">{fmtVal(d.before)}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-emerald-400 break-all">{fmtVal(d.after)}</span>
                    </div>
                  ))}
                  {e.diff.length > 5 && (
                    <button
                      type="button"
                      className="text-[11px] text-primary hover:underline"
                      onClick={() => setExpanded((prev) => ({ ...prev, [e.id]: !isOpen }))}
                    >
                      {isOpen ? "Show less" : `Show ${e.diff.length - 5} more…`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
