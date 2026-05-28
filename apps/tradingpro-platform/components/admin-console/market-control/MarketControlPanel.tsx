/**
 * File:        components/admin-console/market-control/MarketControlPanel.tsx
 * Module:      admin-console · Market Control
 * Purpose:     Unified Market Data Control super-panel covering exchanges, segments,
 *              symbols, user groups, order behaviour, anti-scalping, price tilt,
 *              kill switches, live preview and change history. Persists config via
 *              PUT /api/admin/market-controls/config.
 *
 * Exports:
 *   - MarketControlPanel                         — forwardRef component (10-tab super-panel)
 *   - MarketControlPanelHandle                   — ref handle: { saveAll() → Promise<void>, reload() → void }
 *
 * Depends on:
 *   - @/lib/market-control/market-control-config.schema — config types + defaults
 *   - ./PnLLeakKpiCard                           — KPI bar shown in full-card mode only
 *   - ./ChangeHistoryPanel                       — audit log tab
 *   - ./UserSegmentOverridesTab                  — user-segment tab
 *   - ./ExchangeRulesTab                         — exchange-level rules tab
 *   - ./InstrumentsTab                           — premium instrument on/off + kill-switch tab
 *   - ./market-control-help                      — tooltip copy
 *   - ./SpreadPreviewWidget                      — live spread bar chart
 *
 * Side-effects:
 *   - GET /api/admin/market-controls/config on mount and reload
 *   - PUT /api/admin/market-controls/config on save
 *
 * Key invariants:
 *   - forwardRef exposes { saveAll, reload } so parent page can orchestrate global saves
 *   - hideCard=true strips outer Card + KPI bar + Reload/Save buttons (embed mode)
 *   - onDirty fires whenever draft changes after initial load
 *
 * Read order:
 *   1. MarketControlPanelHandle — ref API contract
 *   2. MarketControlPanel — state, fetchConfig, save, tabsNode, conditional returns
 *   3. TabTriggerWithHint / FieldNum / LivePreviewPanel — UI helpers
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-28
 */

"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import {
  Loader2,
  Save,
  Shield,
  Zap,
  Layers,
  Activity,
  TrendingUp,
  Ban,
  Gauge,
  Plus,
  Trash2,
  RefreshCw,
  Eye,
  History,
  UserCog,
} from "lucide-react"
import {
  DEFAULT_MARKET_CONTROL_CONFIG_V1,
  MARKET_CONTROL_SEGMENT_KEYS,
  userGroupKeys,
  type MarketControlConfigV1,
  type SegmentRuleV1,
  type UserGroupKey,
} from "@/lib/market-control/market-control-config.schema"
import { PnLLeakKpiCard } from "./PnLLeakKpiCard"
import { ChangeHistoryPanel } from "./ChangeHistoryPanel"
import { UserSegmentOverridesTab } from "./UserSegmentOverridesTab"
import { ExchangeRulesTab } from "./ExchangeRulesTab"
import { InstrumentsTab } from "./InstrumentsTab"
import { InfoHint, HintByKey, marketControlHint, MARKET_CONTROL_HELP } from "./market-control-help"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { SpreadPreviewWidget } from "./SpreadPreviewWidget"
import { mutate as swrMutate } from "swr"

type TabKey =
  | "exchanges"
  | "segments"
  | "symbols"
  | "userSegs"
  | "orderBehavior"
  | "antiScalp"
  | "priceTilt"
  | "killSwitch"
  | "preview"
  | "history"

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function clampNum(v: string, min: number, max: number, fallback: number): number {
  const n = parseFloat(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

export interface MarketControlPanelHandle {
  saveAll: () => Promise<void>
  reload: () => void
}

interface MarketControlPanelProps {
  hideCard?: boolean
  onDirty?: () => void
}

export const MarketControlPanel = forwardRef<MarketControlPanelHandle, MarketControlPanelProps>(
  function MarketControlPanel({ hideCard = false, onDirty }, ref) {
  const { toast } = useToast()
  const [draft, setDraft] = useState<MarketControlConfigV1>(DEFAULT_MARKET_CONTROL_CONFIG_V1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [tab, setTab] = useState<TabKey>("exchanges")
  const [activeSegment, setActiveSegment] = useState<string>("NSE_EQ")
  const initialLoadDone = useRef(false)

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/market-controls/config", { cache: "no-store" })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to load")
      setDraft(json.data as MarketControlConfigV1)
      initialLoadDone.current = true
    } catch (err) {
      toast({
        title: "Load failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  const save = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/market-controls/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || "Save failed")
      const now = new Date()
      setLastSavedAt(now)
      // Push spread invalidation to all client-side SWR caches so watchlist cards
      // and order dialogs pick up the new config within the next revalidation cycle.
      void swrMutate("/api/admin/market-controls/spread-config")
      const istTime = now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      toast({ title: "Saved", description: `Market controls updated at ${istTime} IST — cache invalidated, applies to all future orders` })
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }, [draft, toast])

  useImperativeHandle(ref, () => ({ saveAll: save, reload: fetchConfig }), [save, fetchConfig])

  useEffect(() => {
    if (initialLoadDone.current) onDirty?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const activeSeg: SegmentRuleV1 =
    draft.segments[activeSegment] ?? DEFAULT_MARKET_CONTROL_CONFIG_V1.segments.DEFAULT

  const updateSegment = (key: string, mutator: (prev: SegmentRuleV1) => SegmentRuleV1) => {
    setDraft((prev) => ({
      ...prev,
      segments: { ...prev.segments, [key]: mutator(prev.segments[key] ?? clone(DEFAULT_MARKET_CONTROL_CONFIG_V1.segments.DEFAULT)) },
    }))
  }

  const killSwitchSummary = useMemo(() => {
    const active: string[] = []
    Object.entries(draft.segments).forEach(([k, s]) => {
      if (s.killSwitch?.buyDisabled || s.killSwitch?.sellDisabled) active.push(k)
    })
    Object.entries(draft.symbolOverrides).forEach(([k, o]) => {
      if (o.killSwitch?.buyDisabled || o.killSwitch?.sellDisabled) active.push(k)
    })
    return active
  }, [draft])

  const killSwitchAlert = killSwitchSummary.length > 0 && (
    <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400 flex items-center gap-2">
      <Ban className="w-4 h-4" />
      <span className="font-semibold">Kill switches active:</span>
      <span className="font-mono">{killSwitchSummary.join(", ")}</span>
    </div>
  )

  const tabsNode = (
    <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
            <TabsList className="grid grid-cols-5 lg:grid-cols-10 w-full">
              <TabTriggerWithHint value="exchanges" hintKey="tabSegments" icon={<Layers className="w-3 h-3" />} label="Exchanges" />
              <TabTriggerWithHint value="segments" hintKey="tabSegments" icon={<Activity className="w-3 h-3" />} label="Segments" />
              <TabTriggerWithHint value="symbols" hintKey="tabSymbols" icon={<Activity className="w-3 h-3" />} label="Symbols" />
              <TabTriggerWithHint value="userSegs" hintKey="tabUserSegs" icon={<UserCog className="w-3 h-3" />} label="U.Segs" />
              <TabTriggerWithHint value="orderBehavior" hintKey="tabOrders" icon={<Gauge className="w-3 h-3" />} label="Orders" />
              <TabTriggerWithHint value="antiScalp" hintKey="tabAntiScalp" icon={<Shield className="w-3 h-3" />} label="Anti-Scalp" />
              <TabTriggerWithHint value="priceTilt" hintKey="tabTilt" icon={<Zap className="w-3 h-3" />} label="Tilt" />
              <TabTriggerWithHint value="killSwitch" hintKey="tabKill" icon={<Ban className="w-3 h-3" />} label="Kill" />
              <TabTriggerWithHint value="preview" hintKey="tabPreview" icon={<Eye className="w-3 h-3" />} label="Preview" />
              <TabTriggerWithHint value="history" hintKey="tabHistory" icon={<History className="w-3 h-3" />} label="History" />
            </TabsList>

            {/* ── Exchanges (new top-level tier) ────────────────────── */}
            <TabsContent value="exchanges" className="pt-4">
              <ExchangeRulesTab draft={draft} setDraft={setDraft} />
            </TabsContent>

            {/* ── Segments ──────────────────────────────────────────── */}
            <TabsContent value="segments" className="pt-4 space-y-3">
              <div className="flex gap-2 flex-wrap">
                {MARKET_CONTROL_SEGMENT_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setActiveSegment(k)}
                    className={`text-xs font-mono px-2.5 py-1 rounded border ${
                      activeSegment === k
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {/* Spread card — primary house-revenue knob; visually accented for quick access */}
                <div className="rounded border border-primary/40 bg-primary/5 p-3 space-y-3">
                  <div className="text-xs font-semibold text-primary flex items-center gap-1">
                    Spread % <span className="text-[9px] font-normal text-primary/60 ml-1 uppercase tracking-wide">(revenue lever)</span>
                    <InfoHint text="The extra fee charged on top of the real market price when a user trades. Higher = more profit for the house, less friendly to the user." />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <FieldNum
                      label="Min"
                      value={activeSeg.spread.min}
                      step={0.01}
                      onChange={(v) =>
                        updateSegment(activeSegment, (p) => ({ ...p, spread: { ...p.spread, min: v } }))
                      }
                    />
                    <FieldNum
                      label="Max"
                      value={activeSeg.spread.max}
                      step={0.01}
                      onChange={(v) =>
                        updateSegment(activeSegment, (p) => ({ ...p, spread: { ...p.spread, max: v } }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Distribution</Label>
                    <Select
                      value={activeSeg.spread.distribution}
                      onValueChange={(v) =>
                        updateSegment(activeSegment, (p) => ({
                          ...p,
                          spread: { ...p.spread, distribution: v as "uniform" | "weighted_worst" },
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="uniform">Uniform (random in range)</SelectItem>
                        <SelectItem value="weighted_worst">Weighted worst (bias max)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <SpreadPreviewWidget min={activeSeg.spread.min} max={activeSeg.spread.max} />
                </div>

                <div className="rounded border border-border p-3 space-y-3">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                    Slippage %
                    <InfoHint text="Random price movement applied at the moment of fill. Simulates real market slippage and adds a small edge to the house." />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <FieldNum
                      label="Min"
                      value={activeSeg.slippage.min}
                      step={0.01}
                      onChange={(v) =>
                        updateSegment(activeSegment, (p) => ({ ...p, slippage: { ...p.slippage, min: v } }))
                      }
                    />
                    <FieldNum
                      label="Max"
                      value={activeSeg.slippage.max}
                      step={0.01}
                      onChange={(v) =>
                        updateSegment(activeSegment, (p) => ({ ...p, slippage: { ...p.slippage, max: v } }))
                      }
                    />
                  </div>
                  <FieldNum
                    label="Tilt bias % (-1..+1)"
                    value={activeSeg.tiltBiasPct}
                    step={0.01}
                    min={-1}
                    max={1}
                    onChange={(v) => updateSegment(activeSegment, (p) => ({ ...p, tiltBiasPct: v }))}
                  />
                  <FieldNum
                    label="Vol multiplier"
                    value={activeSeg.volMultiplier}
                    step={0.1}
                    min={0}
                    max={10}
                    onChange={(v) => updateSegment(activeSegment, (p) => ({ ...p, volMultiplier: v }))}
                  />
                </div>

                <div className="rounded border border-border p-3 space-y-3 md:col-span-2">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                    Size tiers (rupee value thresholds + slippage multipliers)
                    <InfoHint text="Small trades usually get friendly slippage to keep retail happy. Medium and Large trades get hit harder because they move the book more." />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <FieldNum
                      label="Small ≤ ₹"
                      value={activeSeg.sizeTiers.small}
                      step={1000}
                      min={0}
                      onChange={(v) => updateSegment(activeSegment, (p) => ({ ...p, sizeTiers: { ...p.sizeTiers, small: v } }))}
                    />
                    <FieldNum
                      label="Medium ≤ ₹"
                      value={activeSeg.sizeTiers.medium}
                      step={1000}
                      min={0}
                      onChange={(v) => updateSegment(activeSegment, (p) => ({ ...p, sizeTiers: { ...p.sizeTiers, medium: v } }))}
                    />
                    <FieldNum
                      label="Large ≤ ₹"
                      value={activeSeg.sizeTiers.large}
                      step={1000}
                      min={0}
                      onChange={(v) => updateSegment(activeSegment, (p) => ({ ...p, sizeTiers: { ...p.sizeTiers, large: v } }))}
                    />
                    <FieldNum
                      label="× Small"
                      value={activeSeg.sizeTiers.multSmall}
                      step={0.1}
                      min={0}
                      onChange={(v) => updateSegment(activeSegment, (p) => ({ ...p, sizeTiers: { ...p.sizeTiers, multSmall: v } }))}
                    />
                    <FieldNum
                      label="× Medium"
                      value={activeSeg.sizeTiers.multMedium}
                      step={0.1}
                      min={0}
                      onChange={(v) => updateSegment(activeSegment, (p) => ({ ...p, sizeTiers: { ...p.sizeTiers, multMedium: v } }))}
                    />
                    <FieldNum
                      label="× Large"
                      value={activeSeg.sizeTiers.multLarge}
                      step={0.1}
                      min={0}
                      onChange={(v) => updateSegment(activeSegment, (p) => ({ ...p, sizeTiers: { ...p.sizeTiers, multLarge: v } }))}
                    />
                  </div>
                </div>

                <div className="rounded border border-border p-3 space-y-3 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      Time-of-day windows (IST)
                      <InfoHint text="Tighten or loosen pricing during specific hours — e.g. wider spreads at market open (09:15–09:30) and narrower during lunch." />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() =>
                        updateSegment(activeSegment, (p) => ({
                          ...p,
                          timeOfDay: [...(p.timeOfDay ?? []), { from: "09:15", to: "09:30", spreadMult: 1.5, slipMult: 1.5 }],
                        }))
                      }
                    >
                      <Plus className="w-3 h-3" /> Add window
                    </Button>
                  </div>
                  {(activeSeg.timeOfDay ?? []).length === 0 && (
                    <p className="text-[11px] text-muted-foreground italic">No windows — spread applies uniformly through the day.</p>
                  )}
                  {(activeSeg.timeOfDay ?? []).map((w, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        className="h-8 text-xs font-mono w-20"
                        value={w.from}
                        onChange={(e) =>
                          updateSegment(activeSegment, (p) => {
                            const next = [...(p.timeOfDay ?? [])]
                            next[idx] = { ...next[idx], from: e.target.value }
                            return { ...p, timeOfDay: next }
                          })
                        }
                      />
                      <span className="text-muted-foreground text-xs">→</span>
                      <Input
                        className="h-8 text-xs font-mono w-20"
                        value={w.to}
                        onChange={(e) =>
                          updateSegment(activeSegment, (p) => {
                            const next = [...(p.timeOfDay ?? [])]
                            next[idx] = { ...next[idx], to: e.target.value }
                            return { ...p, timeOfDay: next }
                          })
                        }
                      />
                      <FieldNum
                        label="× spread"
                        value={w.spreadMult}
                        step={0.1}
                        min={0}
                        onChange={(v) =>
                          updateSegment(activeSegment, (p) => {
                            const next = [...(p.timeOfDay ?? [])]
                            next[idx] = { ...next[idx], spreadMult: v }
                            return { ...p, timeOfDay: next }
                          })
                        }
                      />
                      <FieldNum
                        label="× slip"
                        value={w.slipMult}
                        step={0.1}
                        min={0}
                        onChange={(v) =>
                          updateSegment(activeSegment, (p) => {
                            const next = [...(p.timeOfDay ?? [])]
                            next[idx] = { ...next[idx], slipMult: v }
                            return { ...p, timeOfDay: next }
                          })
                        }
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() =>
                          updateSegment(activeSegment, (p) => ({
                            ...p,
                            timeOfDay: (p.timeOfDay ?? []).filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* ── Instruments (replaces raw text-input Symbols tab) ──── */}
            <TabsContent value="symbols" className="pt-4">
              <InstrumentsTab draft={draft} setDraft={setDraft} />
            </TabsContent>

            {/* ── UserSegment overrides (dynamic) ───────────────────────── */}
            <TabsContent value="userSegs" className="pt-4">
              <UserSegmentOverridesTab draft={draft} setDraft={setDraft} />
            </TabsContent>

            {/* ── Order Behavior ──────────────────────────────────────────── */}
            <TabsContent value="orderBehavior" className="pt-4 space-y-3">
              {/* Emergency-bypass banner — only renders when at least one lever is ON. */}
              {(draft.orderBehavior.marketOrder.bypassServerQuote || draft.orderBehavior.limitOrder.disabled) && (
                <div className="rounded border-2 border-red-500 bg-red-500/10 p-3 text-xs space-y-1">
                  <div className="font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
                    ⚠️ EMERGENCY BYPASS ACTIVE — server price authority is reduced
                  </div>
                  <ul className="list-disc list-inside text-red-700 dark:text-red-300 space-y-0.5">
                    {draft.orderBehavior.marketOrder.bypassServerQuote && (
                      <li>
                        MARKET orders execute at the <strong>client-supplied price</strong> with no server-side quote freshness check.
                      </li>
                    )}
                    {draft.orderBehavior.limitOrder.disabled && (
                      <li>LIMIT orders are <strong>blocked</strong> at placement.</li>
                    )}
                  </ul>
                  <div className="text-[11px] text-red-700/80 dark:text-red-300/80">
                    Toggle these OFF as soon as the upstream feed is healthy. Every bypass-priced order is tagged
                    <code className="mx-1">pricingPath: "ADMIN_BYPASS"</code> in its execution context.
                  </div>
                </div>
              )}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded border border-border p-3 space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                    Market orders
                    <InfoHint text="Orders that fill instantly at the current price. Controls how strict we are about quote freshness and price movement before fill." />
                  </div>
                  <FieldNum
                    label="Require fresh quote (ms)"
                    value={draft.orderBehavior.marketOrder.requireFreshQuoteMs}
                    min={0}
                    max={60000}
                    step={100}
                    onChange={(v) =>
                      setDraft((p) => ({ ...p, orderBehavior: { ...p.orderBehavior, marketOrder: { ...p.orderBehavior.marketOrder, requireFreshQuoteMs: Math.trunc(v) } } }))
                    }
                  />
                  <FieldNum
                    label="Max deviation %"
                    value={draft.orderBehavior.marketOrder.maxDeviationPct}
                    min={0}
                    max={50}
                    step={0.1}
                    onChange={(v) =>
                      setDraft((p) => ({ ...p, orderBehavior: { ...p.orderBehavior, marketOrder: { ...p.orderBehavior.marketOrder, maxDeviationPct: v } } }))
                    }
                  />
                  <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Switch
                      checked={draft.orderBehavior.marketOrder.rejectOnKillSwitch}
                      onCheckedChange={(c) =>
                        setDraft((p) => ({ ...p, orderBehavior: { ...p.orderBehavior, marketOrder: { ...p.orderBehavior.marketOrder, rejectOnKillSwitch: c } } }))
                      }
                    />
                    Reject on kill switch
                    <InfoHint text={MARKET_CONTROL_HELP.rejectOnKillSwitch} />
                  </Label>
                  <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Switch
                      checked={draft.orderBehavior.marketOrder.rejectOnStaleQuote}
                      onCheckedChange={(c) =>
                        setDraft((p) => ({ ...p, orderBehavior: { ...p.orderBehavior, marketOrder: { ...p.orderBehavior.marketOrder, rejectOnStaleQuote: c } } }))
                      }
                    />
                    Reject on stale quote
                    <InfoHint text={MARKET_CONTROL_HELP.rejectOnStaleQuote} />
                  </Label>
                  <div className="mt-2 pt-2 border-t border-red-500/30">
                    <Label className="text-[11px] flex items-center gap-1">
                      <Switch
                        checked={draft.orderBehavior.marketOrder.bypassServerQuote}
                        onCheckedChange={(c) =>
                          setDraft((p) => ({ ...p, orderBehavior: { ...p.orderBehavior, marketOrder: { ...p.orderBehavior.marketOrder, bypassServerQuote: c } } }))
                        }
                      />
                      <span className="font-semibold text-red-700 dark:text-red-400">⚠️ Bypass server quote (use client price)</span>
                      <InfoHint text="EMERGENCY LEVER. When ON, MARKET orders skip the server WS quote wait entirely and execute at the client-supplied price. Use only when the upstream feed is broken on the server but works on the client. Every order is tagged ADMIN_BYPASS." />
                    </Label>
                  </div>
                </div>

                <div className="rounded border border-border p-3 space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                    Limit orders
                    <InfoHint text="Orders that wait until the user's price is reached. Controls fill delay, partial fills and expiry — knobs for stopping automated scalpers." />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground uppercase">Marketability</Label>
                    <Select
                      value={draft.orderBehavior.limitOrder.marketability}
                      onValueChange={(v) =>
                        setDraft((p) => ({ ...p, orderBehavior: { ...p.orderBehavior, limitOrder: { ...p.orderBehavior.limitOrder, marketability: v as any } } }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ask_bid">Ask/Bid (recommended)</SelectItem>
                        <SelectItem value="touch">Touch (LTP)</SelectItem>
                        <SelectItem value="cross">Cross (LTP must cross)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground uppercase">Fill price policy</Label>
                    <Select
                      value={draft.orderBehavior.limitOrder.fillAt}
                      onValueChange={(v) =>
                        setDraft((p) => ({ ...p, orderBehavior: { ...p.orderBehavior, limitOrder: { ...p.orderBehavior.limitOrder, fillAt: v as any } } }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="better">Better of limit or side quote</SelectItem>
                        <SelectItem value="limit">Always at limit price</SelectItem>
                        <SelectItem value="side_quote">Always at side quote</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <FieldNum
                      label="Delay min (ms)"
                      value={draft.orderBehavior.limitOrder.fillDelayMs.min}
                      min={0}
                      max={60000}
                      step={100}
                      onChange={(v) =>
                        setDraft((p) => ({ ...p, orderBehavior: { ...p.orderBehavior, limitOrder: { ...p.orderBehavior.limitOrder, fillDelayMs: { ...p.orderBehavior.limitOrder.fillDelayMs, min: v } } } }))
                      }
                    />
                    <FieldNum
                      label="Delay max (ms)"
                      value={draft.orderBehavior.limitOrder.fillDelayMs.max}
                      min={0}
                      max={60000}
                      step={100}
                      onChange={(v) =>
                        setDraft((p) => ({ ...p, orderBehavior: { ...p.orderBehavior, limitOrder: { ...p.orderBehavior.limitOrder, fillDelayMs: { ...p.orderBehavior.limitOrder.fillDelayMs, max: v } } } }))
                      }
                    />
                  </div>
                  <FieldNum
                    label="Partial fill prob (0..1)"
                    value={draft.orderBehavior.limitOrder.partialFillProb}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(v) =>
                      setDraft((p) => ({ ...p, orderBehavior: { ...p.orderBehavior, limitOrder: { ...p.orderBehavior.limitOrder, partialFillProb: v } } }))
                    }
                  />
                  <FieldNum
                    label="Expire after (min)"
                    value={draft.orderBehavior.limitOrder.expireAfterMin}
                    min={1}
                    max={10080}
                    step={1}
                    onChange={(v) =>
                      setDraft((p) => ({ ...p, orderBehavior: { ...p.orderBehavior, limitOrder: { ...p.orderBehavior.limitOrder, expireAfterMin: Math.trunc(v) } } }))
                    }
                  />
                  <div className="mt-2 pt-2 border-t border-red-500/30">
                    <Label className="text-[11px] flex items-center gap-1">
                      <Switch
                        checked={draft.orderBehavior.limitOrder.disabled}
                        onCheckedChange={(c) =>
                          setDraft((p) => ({ ...p, orderBehavior: { ...p.orderBehavior, limitOrder: { ...p.orderBehavior.limitOrder, disabled: c } } }))
                        }
                      />
                      <span className="font-semibold text-red-700 dark:text-red-400">⚠️ Disable LIMIT orders</span>
                      <InfoHint text="EMERGENCY LEVER. When ON, all LIMIT order placements are rejected with a fixed message. Pair with MARKET bypass when the upstream feed is broken — LIMIT orders depend on a fresh quote for marketability and would otherwise hit the same stale-quote rejection." />
                    </Label>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── Anti-Scalp ──────────────────────────────────────────── */}
            <TabsContent value="antiScalp" className="pt-4 space-y-3">
              <div className="rounded border border-border p-3 space-y-3">
                <Label className="text-xs flex items-center gap-2">
                  <Switch
                    checked={draft.antiScalping.enabled}
                    onCheckedChange={(c) => setDraft((p) => ({ ...p, antiScalping: { ...p.antiScalping, enabled: c } }))}
                  />
                  <span className="font-semibold">Anti-scalping enabled</span>
                  <InfoHint text={MARKET_CONTROL_HELP.antiScalpEnabled} />
                </Label>
                <div className="grid md:grid-cols-3 gap-2">
                  <FieldNum
                    label="Min holding (seconds)"
                    value={draft.antiScalping.minHoldingSeconds}
                    min={0}
                    max={86400}
                    step={1}
                    onChange={(v) => setDraft((p) => ({ ...p, antiScalping: { ...p.antiScalping, minHoldingSeconds: Math.trunc(v) } }))}
                  />
                  <FieldNum
                    label="Min favorable move %"
                    value={draft.antiScalping.minFavorableMovePct}
                    min={0}
                    max={100}
                    step={0.01}
                    onChange={(v) => setDraft((p) => ({ ...p, antiScalping: { ...p.antiScalping, minFavorableMovePct: v } }))}
                  />
                  <FieldNum
                    label="× Asymmetric exit spread"
                    value={draft.antiScalping.asymmetricExitSpreadMult}
                    min={0}
                    max={10}
                    step={0.1}
                    onChange={(v) => setDraft((p) => ({ ...p, antiScalping: { ...p.antiScalping, asymmetricExitSpreadMult: v } }))}
                  />
                  <FieldNum
                    label="Max profit / trade %"
                    value={draft.antiScalping.maxProfitPerTradePct}
                    min={0}
                    max={10000}
                    step={0.5}
                    onChange={(v) => setDraft((p) => ({ ...p, antiScalping: { ...p.antiScalping, maxProfitPerTradePct: v } }))}
                  />
                  <FieldNum
                    label="Max profit / day %"
                    value={draft.antiScalping.maxProfitPerDayPct}
                    min={0}
                    max={10000}
                    step={0.5}
                    onChange={(v) => setDraft((p) => ({ ...p, antiScalping: { ...p.antiScalping, maxProfitPerDayPct: v } }))}
                  />
                  <Label className="text-[11px] text-muted-foreground flex items-center gap-1 mt-5">
                    <Switch
                      checked={draft.antiScalping.rejectOnViolation}
                      onCheckedChange={(c) => setDraft((p) => ({ ...p, antiScalping: { ...p.antiScalping, rejectOnViolation: c } }))}
                    />
                    Reject on violation (else penalise)
                    <InfoHint text={MARKET_CONTROL_HELP.rejectOnViolation} />
                  </Label>
                </div>
              </div>

              <div className="rounded border border-border p-3 space-y-2">
                <Label className="text-xs flex items-center gap-2">
                  <Switch
                    checked={draft.antiScalping.scalperAutoFlag.enabled}
                    onCheckedChange={(c) =>
                      setDraft((p) => ({ ...p, antiScalping: { ...p.antiScalping, scalperAutoFlag: { ...p.antiScalping.scalperAutoFlag, enabled: c } } }))
                    }
                  />
                  <span className="font-semibold">Scalper auto-flag</span>
                  <InfoHint text={MARKET_CONTROL_HELP.scalperAutoFlagEnabled} />
                </Label>
                <div className="grid md:grid-cols-3 gap-2">
                  <FieldNum
                    label="Trades/min threshold"
                    value={draft.antiScalping.scalperAutoFlag.tradesPerMinuteThreshold}
                    min={1}
                    max={1000}
                    step={1}
                    onChange={(v) =>
                      setDraft((p) => ({ ...p, antiScalping: { ...p.antiScalping, scalperAutoFlag: { ...p.antiScalping.scalperAutoFlag, tradesPerMinuteThreshold: Math.trunc(v) } } }))
                    }
                  />
                  <FieldNum
                    label="Quick round-trips/hr"
                    value={draft.antiScalping.scalperAutoFlag.quickRoundTripsPerHour}
                    min={1}
                    max={1000}
                    step={1}
                    onChange={(v) =>
                      setDraft((p) => ({ ...p, antiScalping: { ...p.antiScalping, scalperAutoFlag: { ...p.antiScalping.scalperAutoFlag, quickRoundTripsPerHour: Math.trunc(v) } } }))
                    }
                  />
                  <FieldNum
                    label="Min profitable r/t %"
                    value={draft.antiScalping.scalperAutoFlag.minProfitableRoundTripPct}
                    min={0}
                    max={100}
                    step={0.05}
                    onChange={(v) =>
                      setDraft((p) => ({ ...p, antiScalping: { ...p.antiScalping, scalperAutoFlag: { ...p.antiScalping.scalperAutoFlag, minProfitableRoundTripPct: v } } }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground uppercase">Demote to group</Label>
                  <Select
                    value={draft.antiScalping.scalperAutoFlag.demoteToGroup}
                    onValueChange={(v) =>
                      setDraft((p) => ({ ...p, antiScalping: { ...p.antiScalping, scalperAutoFlag: { ...p.antiScalping.scalperAutoFlag, demoteToGroup: v as UserGroupKey } } }))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs max-w-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {userGroupKeys.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            {/* ── Price Tilt ──────────────────────────────────────────── */}
            <TabsContent value="priceTilt" className="pt-4 space-y-3">
              <div className="rounded border border-border p-3 space-y-3">
                <Label className="text-xs flex items-center gap-2">
                  <Switch
                    checked={draft.priceTilt.enabled}
                    onCheckedChange={(c) => setDraft((p) => ({ ...p, priceTilt: { ...p.priceTilt, enabled: c } }))}
                  />
                  <span className="font-semibold">Price tilt enabled</span>
                  <InfoHint text={MARKET_CONTROL_HELP.priceTiltEnabled} />
                </Label>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground uppercase">Mode</Label>
                  <Select
                    value={draft.priceTilt.mode}
                    onValueChange={(v) => setDraft((p) => ({ ...p, priceTilt: { ...p.priceTilt, mode: v as any } }))}
                  >
                    <SelectTrigger className="h-8 text-xs max-w-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">Off</SelectItem>
                      <SelectItem value="per_position">Per position</SelectItem>
                      <SelectItem value="per_user">Per user</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <FieldNum
                    label="Bias (bps)"
                    value={draft.priceTilt.biasBps}
                    min={0}
                    max={1000}
                    step={1}
                    onChange={(v) => setDraft((p) => ({ ...p, priceTilt: { ...p.priceTilt, biasBps: Math.trunc(v) } }))}
                  />
                  <FieldNum
                    label="Max total drift %"
                    value={draft.priceTilt.maxTotalDriftPct}
                    min={0}
                    max={50}
                    step={0.01}
                    onChange={(v) => setDraft((p) => ({ ...p, priceTilt: { ...p.priceTilt, maxTotalDriftPct: v } }))}
                  />
                </div>
              </div>
            </TabsContent>

            {/* ── Kill Switches ──────────────────────────────────────────── */}
            <TabsContent value="killSwitch" className="pt-4 space-y-3">
              {MARKET_CONTROL_SEGMENT_KEYS.map((k) => {
                const s = draft.segments[k] ?? DEFAULT_MARKET_CONTROL_CONFIG_V1.segments.DEFAULT
                return (
                  <div key={k} className="rounded border border-border p-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs font-mono">
                        {k}
                      </Badge>
                      <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Switch
                          checked={s.killSwitch.buyDisabled}
                          onCheckedChange={(c) =>
                            updateSegment(k, (p) => ({ ...p, killSwitch: { ...p.killSwitch, buyDisabled: c } }))
                          }
                        />
                        Kill BUY
                      </Label>
                      <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Switch
                          checked={s.killSwitch.sellDisabled}
                          onCheckedChange={(c) =>
                            updateSegment(k, (p) => ({ ...p, killSwitch: { ...p.killSwitch, sellDisabled: c } }))
                          }
                        />
                        Kill SELL
                      </Label>
                    </div>
                    <div className="flex items-center gap-1 flex-1 min-w-[200px]">
                      <Input
                        className="h-8 text-xs flex-1"
                        placeholder="Reason (shown to users)"
                        value={s.killSwitch.reason ?? ""}
                        onChange={(e) =>
                          updateSegment(k, (p) => ({ ...p, killSwitch: { ...p.killSwitch, reason: e.target.value } }))
                        }
                      />
                      <InfoHint text={MARKET_CONTROL_HELP.killReason} />
                    </div>
                  </div>
                )
              })}
            </TabsContent>

            {/* ── Live Preview ──────────────────────────────────────────── */}
            <TabsContent value="preview" className="pt-4">
              <LivePreviewPanel />
            </TabsContent>

            {/* ── Change History ───────────────────────────────────────── */}
            <TabsContent value="history" className="pt-4">
              <ChangeHistoryPanel />
            </TabsContent>
          </Tabs>
  )

  if (loading) {
    return hideCard ? (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading market controls…
      </div>
    ) : (
      <Card className="bg-card border-border shadow-sm neon-border">
        <CardContent className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading market controls…
        </CardContent>
      </Card>
    )
  }

  if (hideCard) {
    return (
      <div className="space-y-3">
        {killSwitchAlert}
        {lastSavedAt && (
          <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-0.5 inline-block">
            ✓ saved {lastSavedAt.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" })} IST
          </span>
        )}
        {tabsNode}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PnLLeakKpiCard />
      {killSwitchAlert}
      <Card className="bg-card border-border shadow-sm neon-border">
        <CardHeader className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Market Control Super-Panel</CardTitle>
                <CardDescription className="text-xs">
                  Exchange → Segment → Symbol → User cascade: spread, slippage, anti-scalping and kill
                  switches. All settings apply instantly to new orders.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {lastSavedAt && (
                <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-0.5">
                  ✓ saved{" "}
                  {lastSavedAt.toLocaleTimeString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}{" "}
                  IST
                </span>
              )}
              <Button variant="outline" size="sm" onClick={fetchConfig} className="gap-2">
                <RefreshCw className="w-3.5 h-3.5" /> Reload
              </Button>
              <Button size="sm" onClick={save} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save all
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {tabsNode}
        </CardContent>
      </Card>
    </div>
  )
}
)

/* ──────────────────────────────────────────────────────────────────── */

function TabTriggerWithHint({
  value,
  icon,
  label,
  hintKey,
}: {
  value: string
  icon: React.ReactNode
  label: string
  hintKey: string
}) {
  const tip = MARKET_CONTROL_HELP[hintKey]
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <TabsTrigger value={value} className="text-xs gap-1">
            {icon} {label}
          </TabsTrigger>
        </TooltipTrigger>
        {tip && (
          <TooltipContent side="bottom" className="max-w-xs text-[11px] leading-snug">
            {tip}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  )
}

function FieldNum({
  label,
  value,
  step = 1,
  min = -1e9,
  max = 1e9,
  onChange,
  hint,
}: {
  label: string
  value: number
  step?: number
  min?: number
  max?: number
  onChange: (v: number) => void
  hint?: string
}) {
  const tip = hint ?? marketControlHint(label)
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

/* ──────────────────────────────────────────────────────────────────── */

function LivePreviewPanel() {
  const [segment, setSegment] = useState("NSE_EQ")
  const [symbol, setSymbol] = useState("RELIANCE")
  const [ltp, setLtp] = useState("1000")
  const [qty, setQty] = useState("10")
  const [side, setSide] = useState<"BUY" | "SELL">("BUY")
  const [result, setResult] = useState<any>(null)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch("/api/market-controls/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment,
          symbol,
          ltp: parseFloat(ltp),
          qty: parseInt(qty, 10),
          side,
        }),
      })
      const json = await res.json()
      setResult(json)
    } catch (err) {
      setResult({ success: false, error: err instanceof Error ? err.message : "error" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-5 gap-2">
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Segment</Label>
          <Select value={segment} onValueChange={setSegment}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MARKET_CONTROL_SEGMENT_KEYS.map((k) => (
                <SelectItem key={k} value={k}>{k}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Symbol</Label>
          <Input className="h-8 text-xs font-mono" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
        </div>
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">LTP ₹</Label>
          <Input className="h-8 text-xs font-mono" value={ltp} onChange={(e) => setLtp(e.target.value)} />
        </div>
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Qty</Label>
          <Input className="h-8 text-xs font-mono" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Side</Label>
          <Select value={side} onValueChange={(v) => setSide(v as "BUY" | "SELL")}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="BUY">BUY</SelectItem>
              <SelectItem value="SELL">SELL</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button size="sm" onClick={run} disabled={busy} className="gap-2">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
        Resolve preview
      </Button>
      {result && (
        <pre className="text-[11px] font-mono bg-muted/40 rounded border border-border p-3 overflow-auto max-h-80">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
      <p className="text-[11px] text-muted-foreground">
        Live Preview calls <span className="font-mono">POST /api/market-controls/preview</span> — shows the exact
        spread, slippage, kill-switch and ask/bid a user in this group would see on this symbol right now.
      </p>
    </div>
  )
}
