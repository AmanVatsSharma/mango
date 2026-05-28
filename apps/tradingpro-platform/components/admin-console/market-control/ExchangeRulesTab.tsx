/**
 * File:        components/admin-console/market-control/ExchangeRulesTab.tsx
 * Module:      admin-console · market-control
 * Purpose:     Exchange-tier rule editor: top of the cascade hierarchy (Exchange → Segment → Symbol → User).
 *              Renders one card per exchange (NSE, BSE, MCX, NSE_FO_DERIVS) with spread floor,
 *              slippage cap, volatility multiplier, kill switch, trading-hours override, and
 *              enabled-segments toggles. Also shows a cascade-preview strip at the bottom.
 *
 * Exports:
 *   - ExchangeRulesTab(props) → JSX.Element   — the full tab content
 *
 * Depends on:
 *   - @/lib/market-control/market-control-config.schema — ExchangeRuleV1, ExchangeKey, EXCHANGE_TO_SEGMENTS, exchangeKeys
 *
 * Side-effects: none (pure UI; parent owns state + save)
 *
 * Key invariants:
 *   - draft.exchangeOverrides may be sparse (empty object) — tab fills missing keys with defaults on first edit.
 *   - Changes only mutate draft; parent MarketControlPanel owns the save call.
 *
 * Read order:
 *   1. ExchangeRulesTab — props + helpers
 *   2. ExchangeCard     — per-exchange collapsible card
 *   3. CascadePreview   — effective-rule preview at the bottom
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-25
 */

"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Building2,
  ChevronDown,
  Ban,
  Clock,
  TrendingUp,
  Activity,
  HelpCircle,
  AlertTriangle,
  BarChart2,
} from "lucide-react"
import {
  exchangeKeys,
  EXCHANGE_TO_SEGMENTS,
  type ExchangeKey,
  type ExchangeRuleV1,
  type MarketControlConfigV1,
  type MarketControlSegmentKey,
} from "@/lib/market-control/market-control-config.schema"

/* ─── defaults ────────────────────────────────────────────────────────────── */

const DEFAULT_EXCHANGE_RULE: ExchangeRuleV1 = {
  spreadBasePct: 0,
  slippageCapPct: 0,
  volMultiplier: 1.0,
  killSwitch: { buyDisabled: false, sellDisabled: false, reason: "" },
  enabledSegments: [],
  notes: "",
}

/* ─── label maps ──────────────────────────────────────────────────────────── */

const EXCHANGE_LABELS: Record<ExchangeKey, string> = {
  NSE: "NSE — National Stock Exchange",
  BSE: "BSE — Bombay Stock Exchange",
  MCX: "MCX — Multi Commodity Exchange",
  NSE_FO_DERIVS: "NSE F&O — Futures & Options",
}

const EXCHANGE_COLORS: Record<ExchangeKey, { bg: string; border: string; text: string; dot: string }> = {
  NSE: { bg: "bg-blue-500/8", border: "border-blue-500/30", text: "text-blue-400", dot: "bg-blue-500" },
  BSE: { bg: "bg-orange-500/8", border: "border-orange-500/30", text: "text-orange-400", dot: "bg-orange-500" },
  MCX: { bg: "bg-yellow-500/8", border: "border-yellow-500/30", text: "text-yellow-400", dot: "bg-yellow-500" },
  NSE_FO_DERIVS: { bg: "bg-purple-500/8", border: "border-purple-500/30", text: "text-purple-400", dot: "bg-purple-500" },
}

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="info">
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}

/* ─── sub-components ──────────────────────────────────────────────────────── */

interface ExchangeCardProps {
  exchangeKey: ExchangeKey
  rule: ExchangeRuleV1
  onChange: (rule: ExchangeRuleV1) => void
}

function ExchangeCard({ exchangeKey, rule, onChange }: ExchangeCardProps) {
  const [open, setOpen] = useState(false)
  const colors = EXCHANGE_COLORS[exchangeKey]
  const segments = EXCHANGE_TO_SEGMENTS[exchangeKey] ?? []
  const isKilled = rule.killSwitch.buyDisabled || rule.killSwitch.sellDisabled

  const patch = (partial: Partial<ExchangeRuleV1>) => onChange({ ...rule, ...partial })
  const patchKill = (partial: Partial<ExchangeRuleV1["killSwitch"]>) =>
    patch({ killSwitch: { ...rule.killSwitch, ...partial } })

  const toggleSegment = (seg: MarketControlSegmentKey) => {
    const current = rule.enabledSegments
    const next = current.includes(seg) ? current.filter((s) => s !== seg) : [...current, seg]
    patch({ enabledSegments: next })
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <div
          className={`rounded-xl border p-4 cursor-pointer transition-colors ${colors.bg} ${colors.border} hover:brightness-110`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${colors.dot} ${isKilled ? "animate-pulse" : ""}`} />
              <div className="min-w-0">
                <p className={`text-sm font-semibold truncate ${colors.text}`}>{EXCHANGE_LABELS[exchangeKey]}</p>
                <p className="text-xs text-muted-foreground">
                  {segments.length} segment{segments.length !== 1 ? "s" : ""} · spread +{rule.spreadBasePct.toFixed(2)}% · vol ×{rule.volMultiplier.toFixed(1)}
                  {isKilled && " · KILL ACTIVE"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isKilled && (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/40 text-[10px] h-5">
                  <Ban className="h-3 w-3 mr-1" />Kill
                </Badge>
              )}
              {rule.tradingHours && (
                <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">
                  <Clock className="h-3 w-3 mr-1" />{rule.tradingHours.open}–{rule.tradingHours.close}
                </Badge>
              )}
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
            </div>
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-2 rounded-xl border border-border/60 bg-muted/10 p-4 space-y-5">

          {/* Spread + Slippage + Vol */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs">Spread Base (%)</Label>
                <InfoTip text="Absolute spread floor added to every child segment's spread. 0 = no extra floor." />
              </div>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="5"
                value={rule.spreadBasePct}
                onChange={(e) => patch({ spreadBasePct: Math.max(0, Math.min(5, parseFloat(e.target.value) || 0)) })}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs">Slippage Cap (%)</Label>
                <InfoTip text="Hard cap on slippage before segment multipliers are applied. 0 = no cap." />
              </div>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="5"
                value={rule.slippageCapPct}
                onChange={(e) => patch({ slippageCapPct: Math.max(0, Math.min(5, parseFloat(e.target.value) || 0)) })}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs">Vol Multiplier</Label>
                <InfoTip text="Exchange-level volatility baseline applied on top of segment vol multipliers (multiplicative)." />
              </div>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="10"
                value={rule.volMultiplier}
                onChange={(e) => patch({ volMultiplier: Math.max(0, Math.min(10, parseFloat(e.target.value) || 1)) })}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <Separator />

          {/* Kill Switch */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-semibold">Exchange Kill Switch</Label>
              <InfoTip text="When buy or sell is disabled at exchange level, ALL segments under this exchange are also blocked regardless of their individual kill-switch state." />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div
                className={`flex items-center justify-between rounded-lg border p-3 ${rule.killSwitch.buyDisabled ? "bg-red-500/10 border-red-500/40" : "bg-muted/30 border-border/60"}`}
              >
                <Label className={`text-sm font-medium ${rule.killSwitch.buyDisabled ? "text-red-300" : ""}`}>Disable Buy</Label>
                <Switch
                  checked={rule.killSwitch.buyDisabled}
                  onCheckedChange={(v) => patchKill({ buyDisabled: v })}
                  className={rule.killSwitch.buyDisabled ? "data-[state=checked]:bg-red-500" : ""}
                />
              </div>
              <div
                className={`flex items-center justify-between rounded-lg border p-3 ${rule.killSwitch.sellDisabled ? "bg-red-500/10 border-red-500/40" : "bg-muted/30 border-border/60"}`}
              >
                <Label className={`text-sm font-medium ${rule.killSwitch.sellDisabled ? "text-red-300" : ""}`}>Disable Sell</Label>
                <Switch
                  checked={rule.killSwitch.sellDisabled}
                  onCheckedChange={(v) => patchKill({ sellDisabled: v })}
                  className={rule.killSwitch.sellDisabled ? "data-[state=checked]:bg-red-500" : ""}
                />
              </div>
            </div>
            {(rule.killSwitch.buyDisabled || rule.killSwitch.sellDisabled) && (
              <div className="space-y-1.5">
                <Label className="text-xs">Kill reason (shown in logs)</Label>
                <Input
                  value={rule.killSwitch.reason}
                  onChange={(e) => patchKill({ reason: e.target.value.slice(0, 240) })}
                  placeholder="e.g. System maintenance — re-enable by 10:00 IST"
                  className="h-8 text-sm"
                />
              </div>
            )}
          </div>

          <Separator />

          {/* Trading Hours Override */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-semibold">Trading Hours Override (IST)</Label>
              <InfoTip text="When set, overrides the market-timing module for this exchange. Leave blank to use standard session hours." />
              <Switch
                checked={!!rule.tradingHours}
                onCheckedChange={(v) =>
                  patch({ tradingHours: v ? { open: "09:15", close: "15:30" } : undefined })
                }
                className="ml-auto"
              />
            </div>
            {rule.tradingHours && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Open (HH:MM 24h)</Label>
                  <Input
                    type="time"
                    value={rule.tradingHours.open}
                    onChange={(e) => patch({ tradingHours: { ...rule.tradingHours!, open: e.target.value } })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Close (HH:MM 24h)</Label>
                  <Input
                    type="time"
                    value={rule.tradingHours.close}
                    onChange={(e) => patch({ tradingHours: { ...rule.tradingHours!, close: e.target.value } })}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Enabled Segments */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-semibold">Active Segments</Label>
              <InfoTip text="Control which segments are active under this exchange. Empty = all segments active (default). Disabling a segment here blocks it at exchange level regardless of its own rules." />
            </div>
            <div className="flex flex-wrap gap-2">
              {segments.map((seg) => {
                const isEnabled = rule.enabledSegments.length === 0 || rule.enabledSegments.includes(seg)
                return (
                  <button
                    key={seg}
                    type="button"
                    onClick={() => toggleSegment(seg)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-mono font-medium transition-all ${
                      isEnabled
                        ? "bg-green-500/15 border-green-500/40 text-green-400"
                        : "bg-muted/30 border-border/60 text-muted-foreground line-through"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${isEnabled ? "bg-green-400" : "bg-muted-foreground"}`} />
                    {seg}
                  </button>
                )
              })}
              {segments.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No segments mapped to this exchange.</p>
              )}
            </div>
            {rule.enabledSegments.length > 0 && (
              <button
                type="button"
                onClick={() => patch({ enabledSegments: [] })}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Reset to all-active
              </button>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs">Admin notes</Label>
            <Input
              value={rule.notes}
              onChange={(e) => patch({ notes: e.target.value.slice(0, 240) })}
              placeholder="Optional — visible only to admins"
              className="h-8 text-sm"
            />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/* ─── cascade preview ─────────────────────────────────────────────────────── */

interface CascadePreviewProps {
  draft: MarketControlConfigV1
}

function CascadePreview({ draft }: CascadePreviewProps) {
  const [selectedExchange, setSelectedExchange] = useState<ExchangeKey>("NSE")
  const [selectedSegment, setSelectedSegment] = useState<MarketControlSegmentKey>("NSE_EQ")

  const exchangeRule = draft.exchangeOverrides[selectedExchange] ?? DEFAULT_EXCHANGE_RULE
  const segmentRule = draft.segments[selectedSegment]

  const effectiveSpreadMin = exchangeRule.spreadBasePct + (segmentRule?.spread.min ?? 0) * exchangeRule.volMultiplier
  const effectiveSpreadMax = exchangeRule.spreadBasePct + (segmentRule?.spread.max ?? 0) * exchangeRule.volMultiplier
  const effectiveSlipMax = exchangeRule.slippageCapPct > 0
    ? Math.min(segmentRule?.slippage.max ?? 99, exchangeRule.slippageCapPct)
    : segmentRule?.slippage.max ?? 0

  const isKilled = exchangeRule.killSwitch.buyDisabled || exchangeRule.killSwitch.sellDisabled

  const segmentsForExchange = EXCHANGE_TO_SEGMENTS[selectedExchange] ?? []

  return (
    <Card className="bg-muted/20 border-border/60">
      <CardHeader className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm">Cascade Preview</CardTitle>
          <CardDescription className="text-xs ml-1">Effective rule after Exchange → Segment layers</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Exchange</Label>
            <div className="flex gap-1.5">
              {exchangeKeys.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setSelectedExchange(ex)
                    const segs = EXCHANGE_TO_SEGMENTS[ex]
                    if (segs?.length) setSelectedSegment(segs[0])
                  }}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    selectedExchange === ex
                      ? "bg-primary/15 border-primary/50 text-primary"
                      : "bg-muted/30 border-border/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Segment</Label>
            <div className="flex gap-1.5 flex-wrap">
              {segmentsForExchange.map((seg) => (
                <button
                  key={seg}
                  type="button"
                  onClick={() => setSelectedSegment(seg)}
                  className={`rounded-md border px-2 py-1 text-[10px] font-mono transition-colors ${
                    selectedSegment === seg
                      ? "bg-primary/15 border-primary/50 text-primary"
                      : "bg-muted/30 border-border/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {seg}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isKilled ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-400 font-medium">
              Exchange kill switch active — all orders blocked for {selectedExchange}.
              {exchangeRule.killSwitch.reason ? ` Reason: ${exchangeRule.killSwitch.reason}` : ""}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { label: "Spread min", value: `${effectiveSpreadMin.toFixed(3)}%` },
              { label: "Spread max", value: `${effectiveSpreadMax.toFixed(3)}%` },
              { label: "Slippage max", value: `${effectiveSlipMax.toFixed(3)}%` },
              { label: "Vol mult", value: `×${exchangeRule.volMultiplier.toFixed(1)}` },
              { label: "Exchange floor", value: `+${exchangeRule.spreadBasePct.toFixed(2)}%` },
              { label: "Slip cap", value: exchangeRule.slippageCapPct > 0 ? `≤${exchangeRule.slippageCapPct.toFixed(2)}%` : "None" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-muted/30 border border-border/50 p-2.5">
                <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
                <p className="text-sm font-mono font-semibold text-foreground mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">
          Symbol and user-segment overrides are applied after this. Preview shows Exchange + Segment layers only.
        </p>
      </CardContent>
    </Card>
  )
}

/* ─── main tab component ──────────────────────────────────────────────────── */

interface ExchangeRulesTabProps {
  draft: MarketControlConfigV1
  setDraft: React.Dispatch<React.SetStateAction<MarketControlConfigV1>>
}

export function ExchangeRulesTab({ draft, setDraft }: ExchangeRulesTabProps) {
  const updateExchange = (key: ExchangeKey, rule: ExchangeRuleV1) => {
    setDraft((prev) => ({
      ...prev,
      exchangeOverrides: { ...prev.exchangeOverrides, [key]: rule },
    }))
  }

  return (
    <TooltipProvider>
      <div className="space-y-3">
        {/* Summary header */}
        <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/30 border border-border/50">
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">Exchange-level baseline rules</p>
            <p className="text-xs text-muted-foreground">
              These apply above all segment rules in the cascade. An exchange kill switch overrides every segment under it.
              Click an exchange card to expand and edit.
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-1.5 shrink-0">
            {exchangeKeys.map((ex) => {
              const rule = draft.exchangeOverrides[ex] ?? DEFAULT_EXCHANGE_RULE
              const isKilled = rule.killSwitch.buyDisabled || rule.killSwitch.sellDisabled
              const hasFloor = rule.spreadBasePct > 0
              return (
                <Badge
                  key={ex}
                  variant="outline"
                  className={`text-[10px] h-5 ${isKilled ? "border-red-500/50 text-red-400 bg-red-500/10" : hasFloor ? "border-amber-500/50 text-amber-400" : "text-muted-foreground"}`}
                >
                  {ex}
                  {isKilled ? " KILL" : hasFloor ? ` +${rule.spreadBasePct.toFixed(2)}%` : ""}
                </Badge>
              )
            })}
          </div>
        </div>

        {/* Exchange cards */}
        <div className="space-y-2">
          {exchangeKeys.map((ex) => (
            <ExchangeCard
              key={ex}
              exchangeKey={ex}
              rule={draft.exchangeOverrides[ex] ?? DEFAULT_EXCHANGE_RULE}
              onChange={(rule) => updateExchange(ex, rule)}
            />
          ))}
        </div>

        {/* Cascade preview */}
        <CascadePreview draft={draft} />
      </div>
    </TooltipProvider>
  )
}
