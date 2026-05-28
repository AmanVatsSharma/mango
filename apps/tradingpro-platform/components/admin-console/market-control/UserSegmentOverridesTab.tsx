"use client"

/**
 * @file UserSegmentOverridesTab.tsx
 * @module components/admin-console/market-control
 * @description Dynamic UserSegment-backed override editor for Market Control. Fetches the real
 *              UserSegment rows from /api/admin/segments and renders an editable override form per
 *              segment, writing to `draft.segmentOverrides` keyed by segment id. Replaces the
 *              hardcoded Groups union — the source of truth is now the platform's UserSegment module.
 * @author StockTrade
 * @created 2026-04-16
 */

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Loader2, RefreshCw, Users, ArrowRight } from "lucide-react"
import Link from "next/link"
import type { MarketControlConfigV1, SegmentOverrideV1 } from "@/lib/market-control/market-control-config.schema"
import { InfoHint, marketControlHint, MARKET_CONTROL_HELP } from "./market-control-help"
import { SpreadPreviewWidget } from "./SpreadPreviewWidget"

interface SegmentRow {
  id: string
  name: string
  color: string | null
  description: string | null
  isActive: boolean
  memberCount?: number
}

const DEFAULT_OVERRIDE: SegmentOverrideV1 = {
  spreadMult: 1,
  slipMult: 1,
  antiScalpRelaxed: false,
  forceWorstFill: false,
  marginMultiplier: 1,
  tiltBiasPct: 0,
  priority: 0,
}

function clampNum(v: string, min: number, max: number, fallback: number): number {
  const n = parseFloat(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

interface Props {
  draft: MarketControlConfigV1
  setDraft: (u: (prev: MarketControlConfigV1) => MarketControlConfigV1) => void
}

export function UserSegmentOverridesTab({ draft, setDraft }: Props) {
  const [segments, setSegments] = useState<SegmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/segments", { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || json?.message || "Failed to load segments")
      const rows = (json.segments ?? json.data?.segments ?? json.data ?? []) as SegmentRow[]
      setSegments(rows.filter((r) => r.isActive !== false))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const updateOverride = (id: string, patch: Partial<SegmentOverrideV1>) => {
    setDraft((prev) => {
      const current: SegmentOverrideV1 = prev.segmentOverrides[id] ?? { ...DEFAULT_OVERRIDE }
      return {
        ...prev,
        segmentOverrides: {
          ...prev.segmentOverrides,
          [id]: { ...current, ...patch },
        },
      }
    })
  }

  const clearOverride = (id: string) => {
    setDraft((prev) => {
      const next = { ...prev.segmentOverrides }
      delete next[id]
      return { ...prev, segmentOverrides: next }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <div className="text-xs font-semibold">UserSegment overrides</div>
          <Badge variant="outline" className="text-[10px]">
            {segments.length} segments
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-2 h-8">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Reload
          </Button>
          <Link href="/admin-console/segments">
            <Button variant="outline" size="sm" className="gap-2 h-8">
              Manage segments <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Overrides apply on top of exchange-segment rules. When a user belongs to multiple segments, the override with
        the highest <span className="font-mono">priority</span> wins. Per-user overrides (in the User Management drawer) still beat segment overrides.
      </p>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
      )}

      {!loading && segments.length === 0 && !error && (
        <div className="rounded border border-border bg-background/40 px-3 py-4 text-center text-xs text-muted-foreground">
          No user segments yet.&nbsp;
          <Link href="/admin-console/segments" className="text-primary underline">
            Create your first segment →
          </Link>
        </div>
      )}

      <div className="space-y-2">
        {segments.map((s) => {
          const ov: SegmentOverrideV1 = draft.segmentOverrides[s.id] ?? { ...DEFAULT_OVERRIDE }
          const active = draft.segmentOverrides[s.id] !== undefined
          return (
            <div key={s.id} className="rounded border border-border p-3 space-y-2 bg-background/40">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block h-3 w-3 rounded-full border border-border shrink-0"
                    style={{ backgroundColor: s.color ?? "#64748b" }}
                  />
                  <span className="text-xs font-semibold truncate">{s.name}</span>
                  <Badge variant="outline" className="text-[9px] font-mono">{s.id.slice(0, 8)}…</Badge>
                  {active && <Badge className="text-[9px] bg-primary/15 text-primary border border-primary/40">override active</Badge>}
                </div>
                {active && (
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => clearOverride(s.id)}>
                    Clear
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Field label="× Spread" value={ov.spreadMult} step={0.1} min={0} max={10}
                  onChange={(v) => updateOverride(s.id, { spreadMult: v })} />
                <Field label="× Slippage" value={ov.slipMult} step={0.1} min={0} max={10}
                  onChange={(v) => updateOverride(s.id, { slipMult: v })} />
                <Field label="× Margin" value={ov.marginMultiplier} step={0.1} min={0.5} max={5}
                  onChange={(v) => updateOverride(s.id, { marginMultiplier: v })} />
                <Field label="Priority" value={ov.priority} step={1} min={0} max={9999}
                  onChange={(v) => updateOverride(s.id, { priority: Math.round(v) })} />
                <Field label="Tilt bias %" value={ov.tiltBiasPct} step={0.01} min={-1} max={1}
                  onChange={(v) => updateOverride(s.id, { tiltBiasPct: v })} />
              </div>
              {/* Effective spread preview — applies spreadMult on DEFAULT segment base range */}
              {(() => {
                const base = draft.segments?.["DEFAULT"]?.spread ?? { min: 0.08, max: 0.30 }
                return (
                  <SpreadPreviewWidget
                    min={base.min * ov.spreadMult}
                    max={base.max * ov.spreadMult}
                  />
                )
              })()}

              <div className="flex gap-3 flex-wrap">
                <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Switch
                    checked={ov.antiScalpRelaxed}
                    onCheckedChange={(c) => updateOverride(s.id, { antiScalpRelaxed: c })}
                  />
                  Anti-scalp relaxed
                  <InfoHint text={MARKET_CONTROL_HELP.antiScalpRelaxed} />
                </Label>
                <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Switch
                    checked={ov.forceWorstFill}
                    onCheckedChange={(c) => updateOverride(s.id, { forceWorstFill: c })}
                  />
                  Force worst fill
                  <InfoHint text={MARKET_CONTROL_HELP.forceWorstFill} />
                </Label>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  step = 1,
  min = -1e9,
  max = 1e9,
  onChange,
}: {
  label: string
  value: number
  step?: number
  min?: number
  max?: number
  onChange: (v: number) => void
}) {
  const tip = marketControlHint(label)
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        <span>{label}</span>
        {tip && <InfoHint text={tip} />}
      </Label>
      <Input
        type="number"
        className="h-8 text-xs font-mono"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(clampNum(e.target.value, min, max, value))}
      />
    </div>
  )
}
