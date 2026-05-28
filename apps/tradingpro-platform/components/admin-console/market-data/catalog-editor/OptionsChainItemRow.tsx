/**
 * @file OptionsChainItemRow.tsx
 * @module components/admin-console/market-data/catalog-editor
 * @description Recipe editor for an options-chain catalog item. Lets the admin pick the
 *              underlying, choose an expiry strategy (next-N-weekly / next-N-monthly /
 *              explicit dates) and a strike strategy (ATM-window / explicit list), and
 *              preview the resolved tree against live Vedpragya data.
 *
 *              Live preview hits POST /api/admin/market-data/catalog/preview — the same
 *              resolver the user-facing GET endpoint uses, just for a single item.
 *
 *              Reorder + remove are exposed via the same affordances as InstrumentItemRow
 *              for consistency.
 *
 * Exports:
 *   - OptionsChainItemRow — props { item, onChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast }
 *
 * Side-effects:
 *   - POST /api/admin/market-data/catalog/preview when the admin clicks "Preview".
 *
 * Key invariants:
 *   - All edits go through onChange — the parent owns the canonical state.
 *   - Preview is on-demand (button click), not on-edit, to avoid hammering Vedpragya.
 *
 * @author        BharatERP
 * @created       2026-05-01
 */

"use client"

import { useCallback, useState } from "react"
import { ChevronDown, ChevronUp, Eye, Loader2, Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type {
  OptionsChainItem,
  ExpiryStrategy,
  StrikeStrategy,
} from "@/lib/market-catalog/catalog-schema"
import type { ResolvedOptionsChain } from "@/lib/market-catalog/resolve-catalog"
import {
  InstrumentPickerDialog,
  type PickedInstrument,
} from "./InstrumentPickerDialog"

type ExpiryMode = ExpiryStrategy["mode"]
type StrikeMode = StrikeStrategy["mode"]

export interface OptionsChainItemRowProps {
  item: OptionsChainItem
  onChange: (item: OptionsChainItem) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
}

export function OptionsChainItemRow({
  item,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: OptionsChainItemRowProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [preview, setPreview] = useState<ResolvedOptionsChain | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [explicitDateInput, setExplicitDateInput] = useState("")
  const [explicitStrikeInput, setExplicitStrikeInput] = useState("")

  const setUnderlying = (picked: PickedInstrument) => {
    onChange({
      ...item,
      underlying: { token: picked.token, symbol: picked.symbol, segment: picked.segment },
    })
    setPreview(null)
  }

  const setExpiryMode = (mode: ExpiryMode) => {
    if (mode === "explicit") {
      onChange({ ...item, expiryStrategy: { mode, dates: [] } })
    } else if (mode === "next-n-weekly") {
      onChange({ ...item, expiryStrategy: { mode, count: 3 } })
    } else {
      onChange({ ...item, expiryStrategy: { mode, count: 2 } })
    }
    setPreview(null)
  }

  const setExpiryCount = (count: number) => {
    const s = item.expiryStrategy
    if (s.mode === "explicit") return
    onChange({ ...item, expiryStrategy: { ...s, count } })
    setPreview(null)
  }

  const addExplicitDate = () => {
    const v = explicitDateInput.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return
    if (item.expiryStrategy.mode !== "explicit") return
    if (item.expiryStrategy.dates.includes(v)) return
    onChange({
      ...item,
      expiryStrategy: {
        mode: "explicit",
        dates: [...item.expiryStrategy.dates, v].sort(),
      },
    })
    setExplicitDateInput("")
    setPreview(null)
  }

  const removeExplicitDate = (d: string) => {
    if (item.expiryStrategy.mode !== "explicit") return
    onChange({
      ...item,
      expiryStrategy: { mode: "explicit", dates: item.expiryStrategy.dates.filter((x) => x !== d) },
    })
    setPreview(null)
  }

  const setStrikeMode = (mode: StrikeMode) => {
    if (mode === "atm-window") {
      onChange({ ...item, strikeStrategy: { mode, window: 5 } })
    } else {
      onChange({ ...item, strikeStrategy: { mode, strikes: [] } })
    }
    setPreview(null)
  }

  const setWindow = (window: number) => {
    if (item.strikeStrategy.mode !== "atm-window") return
    onChange({ ...item, strikeStrategy: { ...item.strikeStrategy, window } })
    setPreview(null)
  }

  const setStrikeStep = (stepRaw: string) => {
    if (item.strikeStrategy.mode !== "atm-window") return
    const v = Number(stepRaw)
    onChange({
      ...item,
      strikeStrategy: { ...item.strikeStrategy, step: Number.isFinite(v) && v > 0 ? v : undefined },
    })
    setPreview(null)
  }

  const addExplicitStrike = () => {
    const v = Number(explicitStrikeInput.trim())
    if (!Number.isFinite(v) || v <= 0) return
    if (item.strikeStrategy.mode !== "explicit") return
    if (item.strikeStrategy.strikes.includes(v)) return
    onChange({
      ...item,
      strikeStrategy: {
        mode: "explicit",
        strikes: [...item.strikeStrategy.strikes, v].sort((a, b) => a - b),
      },
    })
    setExplicitStrikeInput("")
    setPreview(null)
  }

  const removeExplicitStrike = (s: number) => {
    if (item.strikeStrategy.mode !== "explicit") return
    onChange({
      ...item,
      strikeStrategy: { mode: "explicit", strikes: item.strikeStrategy.strikes.filter((x) => x !== s) },
    })
    setPreview(null)
  }

  const runPreview = useCallback(async () => {
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const res = await fetch("/api/admin/market-data/catalog/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item }),
      })
      const data = await res.json()
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || data?.message || "preview failed")
      }
      setPreview((data.data ?? null) as ResolvedOptionsChain | null)
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Preview failed")
      setPreview(null)
    } finally {
      setPreviewLoading(false)
    }
  }, [item])

  return (
    <div className="rounded-xl border border-border/50 bg-background/50 p-4 space-y-4">
      {/* Row 1: header + reorder/delete */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
            Options Chain
          </div>
          <div className="text-sm font-semibold text-foreground mt-0.5">
            {item.underlying.symbol}
            <span className="ml-2 text-[11px] text-muted-foreground font-normal">
              token {item.underlying.token}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={isFirst}
            onClick={onMoveUp}
            aria-label="Move up"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={isLast}
            onClick={onMoveDown}
            aria-label="Move down"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-rose-500 hover:text-rose-500 hover:bg-rose-500/10"
            onClick={onRemove}
            aria-label="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Underlying picker */}
      <div className="space-y-1.5">
        <Label className="text-xs">Underlying</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
          Change underlying
        </Button>
      </div>

      {/* Expiry strategy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Expiry strategy</Label>
          <Select value={item.expiryStrategy.mode} onValueChange={(v) => setExpiryMode(v as ExpiryMode)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="next-n-weekly">Next N (weekly)</SelectItem>
              <SelectItem value="next-n-monthly">Next N (monthly)</SelectItem>
              <SelectItem value="explicit">Explicit dates</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {item.expiryStrategy.mode !== "explicit" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Count</Label>
            <Input
              type="number"
              min={1}
              max={item.expiryStrategy.mode === "next-n-weekly" ? 8 : 6}
              value={item.expiryStrategy.count}
              onChange={(e) => setExpiryCount(Math.max(1, Number(e.target.value) || 1))}
              className="h-9"
            />
          </div>
        )}
      </div>

      {item.expiryStrategy.mode === "explicit" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Dates (YYYY-MM-DD)</Label>
          <div className="flex gap-2">
            <Input
              type="date"
              value={explicitDateInput}
              onChange={(e) => setExplicitDateInput(e.target.value)}
              className="h-9 flex-1"
            />
            <Button type="button" size="sm" onClick={addExplicitDate}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {item.expiryStrategy.dates.map((d) => (
              <span
                key={d}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-muted border border-border/40"
              >
                {d}
                <button
                  type="button"
                  onClick={() => removeExplicitDate(d)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${d}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Strike strategy */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Strike strategy</Label>
          <Select value={item.strikeStrategy.mode} onValueChange={(v) => setStrikeMode(v as StrikeMode)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="atm-window">ATM ± window</SelectItem>
              <SelectItem value="explicit">Explicit strikes</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {item.strikeStrategy.mode === "atm-window" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Window (each side)</Label>
              <Input
                type="number"
                min={1}
                max={40}
                value={item.strikeStrategy.window}
                onChange={(e) => setWindow(Math.max(1, Number(e.target.value) || 1))}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Strike step (auto if blank)</Label>
              <Input
                type="number"
                min={1}
                placeholder="e.g. 50"
                value={item.strikeStrategy.step ?? ""}
                onChange={(e) => setStrikeStep(e.target.value)}
                className="h-9"
              />
            </div>
          </>
        )}
      </div>

      {item.strikeStrategy.mode === "explicit" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Strikes</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              placeholder="e.g. 20000"
              value={explicitStrikeInput}
              onChange={(e) => setExplicitStrikeInput(e.target.value)}
              className="h-9 flex-1"
            />
            <Button type="button" size="sm" onClick={addExplicitStrike}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {item.strikeStrategy.strikes.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-muted border border-border/40"
              >
                {s.toLocaleString("en-IN")}
                <button
                  type="button"
                  onClick={() => removeExplicitStrike(s)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${s}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* CE/PE toggles */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch
            checked={item.includeCE}
            onCheckedChange={(v) => onChange({ ...item, includeCE: v })}
          />
          <Label className="text-xs">Include Calls (CE)</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={item.includePE}
            onCheckedChange={(v) => onChange({ ...item, includePE: v })}
          />
          <Label className="text-xs">Include Puts (PE)</Label>
        </div>
      </div>

      {/* Preview */}
      <div className="border-t border-border/40 pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
            Live preview
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={runPreview}
            disabled={previewLoading}
          >
            {previewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Eye className="h-3.5 w-3.5 mr-1.5" />}
            Preview
          </Button>
        </div>
        {previewError && (
          <div className="text-xs text-rose-500">{previewError}</div>
        )}
        {preview && <PreviewView preview={preview} />}
      </div>

      <InstrumentPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        mode="underlying"
        title="Pick underlying for options chain"
        onPick={setUnderlying}
      />
    </div>
  )
}

interface PreviewViewProps {
  preview: ResolvedOptionsChain
}

function PreviewView({ preview }: PreviewViewProps) {
  if (preview.expiries.length === 0) {
    return (
      <div className="text-xs text-muted-foreground px-2 py-3">
        No live contracts found. Check the underlying symbol or window.
      </div>
    )
  }
  const first = preview.expiries[0]!
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2">
      <div className="text-xs text-muted-foreground">
        First expiry: <span className="font-medium text-foreground">{first.expiry}</span>
        {preview.underlying.atm !== undefined && (
          <>
            {" · "}ATM: <span className="font-medium text-foreground">{preview.underlying.atm}</span>
          </>
        )}
        {" · "}{preview.expiries.length} expiry / {first.strikes.length} strikes per expiry
      </div>
      <div className="grid grid-cols-3 gap-1 text-[11px]">
        <div className="text-muted-foreground font-semibold uppercase">Strike</div>
        <div className="text-emerald-500 font-semibold uppercase">CE</div>
        <div className="text-rose-500 font-semibold uppercase">PE</div>
        {first.strikes.slice(0, 12).map((row) => (
          <div key={row.strike} className="contents">
            <div
              className={cn(
                "tabular-nums font-medium",
                row.isAtm && "text-primary",
              )}
            >
              {row.strike}
              {row.isAtm && <span className="ml-1 text-[9px]">ATM</span>}
            </div>
            <div className={cn("tabular-nums", !row.ce && "text-muted-foreground/40")}>
              {row.ce?.ltp !== undefined ? row.ce.ltp.toFixed(1) : "—"}
            </div>
            <div className={cn("tabular-nums", !row.pe && "text-muted-foreground/40")}>
              {row.pe?.ltp !== undefined ? row.pe.ltp.toFixed(1) : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
