/**
 * File:        components/admin-console/market-data/MarketDataAdminPage.tsx
 * Module:      admin-console · Market Data
 * Purpose:     Tabbed Market Data admin page with sticky header, single orchestrated Save,
 *              and dirty-state indicators per section. Replaces the original 4-stacked-cards
 *              layout. Tabs: Overview, Market Hours, Display Settings, Market Controls, Catalog.
 *
 * Exports:
 *   - MarketDataAdminPage — top-level page component (no props)
 *
 * Depends on:
 *   - @/lib/hooks/market-timing  — getSegmentMarketSession, setNSEHolidays, setMarketForceClosed
 *   - @/lib/market-display/market-display-config.schema — MarketDisplayConfigV1 + parser
 *   - @/lib/constants/admin-settings — ADMIN_SETTING_KEYS
 *   - MarketControlPanel              — 10-tab super-panel (embed mode, hideCard=true)
 *   - MarketCatalogEditor             — admin-curated catalog editor for the user Browse drawer
 *
 * Side-effects:
 *   - GET /api/admin/settings on mount + reload
 *   - POST /api/admin/settings (market_force_closed, market_holidays_csv) on Hours save
 *   - PUT /api/settings/market-display on Display save
 *   - Delegates market-controls save to MarketControlPanel.saveAll() via ref
 *
 * Key invariants:
 *   - updateDisplayDraft (not setMarketDisplayDraft directly) sets displayDirty
 *   - fetchSettings resets all dirty flags (reload overwrites drafts with server state)
 *   - marketControlRef may be null when Controls tab panel is CSS-hidden; header Save
 *     skips controlsSave if ref is null (component still mounts on page load due to CSS-hide)
 *   - All 4 content panels are always in the DOM (CSS hidden, never unmounted) so
 *     marketControlRef stays valid for cross-tab orchestrated saves
 *
 * Read order:
 *   1. MarketDataAdminPage — state, dirty tracking, save orchestration, JSX structure
 *   2. DirtyDot / InfoTip — helpers
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-25
 */

"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Clock,
  AlertTriangle,
  CalendarDays,
  Activity,
  Zap,
  ShieldAlert,
  BarChart2,
  HelpCircle,
  Save,
  Loader2,
  Plus,
  X as XIcon,
  RefreshCw,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { MarketControlPanel, type MarketControlPanelHandle } from "@/components/admin-console/market-control/MarketControlPanel"
import { MarketCatalogEditor, type MarketCatalogEditorHandle } from "./MarketCatalogEditor"
import { getSegmentMarketSession, setNSEHolidays, setMarketForceClosed } from "@/lib/hooks/market-timing"
import { ADMIN_SETTING_KEYS } from "@/lib/constants/admin-settings"
import {
  DEFAULT_MARKET_DISPLAY_CONFIG_V1,
  MARKET_DISPLAY_SEGMENT_KEYS,
  parseMarketDisplayConfigJson,
  type MarketDisplayConfigV1,
} from "@/lib/market-display/market-display-config.schema"

type MarketDataTab = "overview" | "hours" | "display" | "controls" | "catalog"

/** Amber dot shown on a tab trigger to signal unsaved changes. */
function DirtyDot() {
  return <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-amber-500 shrink-0" />
}

/** Inline info tooltip used next to admin display labels. */
function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 rounded-sm text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="What does this mean?"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[min(22rem,calc(100vw-2rem))] text-left text-xs font-normal leading-relaxed"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  )
}

interface SystemSetting {
  id: string
  key: string
  value: string
  description: string | null
  category: string
  isActive: boolean
}

export function MarketDataAdminPage() {
  const [refreshing, setRefreshing] = useState(false)

  // Market hours state
  const [forceClosed, setForceClosed] = useState(false)
  const [holidaysCsv, setHolidaysCsv] = useState("")
  const [newHolidayInput, setNewHolidayInput] = useState("")
  const [holidayInputError, setHolidayInputError] = useState("")

  // Market display config state
  const [marketDisplayDraft, setMarketDisplayDraft] = useState<MarketDisplayConfigV1>(DEFAULT_MARKET_DISPLAY_CONFIG_V1)

  // Tab and dirty tracking
  const [activeTab, setActiveTab] = useState<MarketDataTab>("overview")
  const [hoursDirty, setHoursDirty] = useState(false)
  const [displayDirty, setDisplayDirty] = useState(false)
  const [controlsDirty, setControlsDirty] = useState(false)
  const [catalogDirty, setCatalogDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const marketControlRef = useRef<MarketControlPanelHandle>(null)
  const catalogRef = useRef<MarketCatalogEditorHandle>(null)

  const dirtyCount = [hoursDirty, displayDirty, controlsDirty, catalogDirty].filter(Boolean).length

  // ── Helpers ──────────────────────────────────────────────────────────

  const holidaysList = useMemo(
    () =>
      holidaysCsv
        .split(/[,\n\r]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .sort(),
    [holidaysCsv],
  )

  const todayISO = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  }, [])

  const addHoliday = useCallback(
    (date: string) => {
      const trimmed = date.trim()
      if (!trimmed) return
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        setHolidayInputError("Use YYYY-MM-DD format")
        return
      }
      setHolidayInputError("")
      if (holidaysList.includes(trimmed)) return
      setHolidaysCsv([...holidaysList, trimmed].sort().join("\n"))
      setNewHolidayInput("")
      setHoursDirty(true)
    },
    [holidaysList],
  )

  const removeHoliday = useCallback(
    (date: string) => {
      setHolidaysCsv(holidaysList.filter((d) => d !== date).join("\n"))
      setHoursDirty(true)
    },
    [holidaysList],
  )

  /** Updates market display draft and marks the Display section dirty. */
  const updateDisplayDraft = useCallback((updater: (d: MarketDisplayConfigV1) => MarketDisplayConfigV1) => {
    setMarketDisplayDraft(updater)
    setDisplayDirty(true)
  }, [])

  // ── Data fetching ─────────────────────────────────────────────────────

  const fetchSettings = useCallback(async () => {
    setRefreshing(true)
    setHoursDirty(false)
    setDisplayDirty(false)
    setControlsDirty(false)
    setCatalogDirty(false)
    try {
      const response = await fetch("/api/admin/settings")
      const data = await response.json()
      if (data.success && data.settings) {
        data.settings.forEach((setting: SystemSetting) => {
          if (setting.key === "market_force_closed") {
            const val = setting.value === "true"
            setForceClosed(val)
            setMarketForceClosed(val)
          } else if (setting.key === ADMIN_SETTING_KEYS.MARKET_DISPLAY_CONFIG_V1) {
            setMarketDisplayDraft(parseMarketDisplayConfigJson(setting.value))
          } else if (setting.key === "market_holidays_csv") {
            setHolidaysCsv(setting.value)
            try {
              setNSEHolidays(
                setting.value
                  .split(/[,\n\r]+/)
                  .map((s: string) => s.trim())
                  .filter(Boolean),
              )
            } catch {}
          }
        })
      }
    } catch {
      toast({ title: "Error", description: "Failed to load market settings", variant: "destructive" })
    } finally {
      setRefreshing(false)
    }
    marketControlRef.current?.reload()
    void catalogRef.current?.reload()
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // ── Save functions ────────────────────────────────────────────────────

  const saveMarketControls = useCallback(async () => {
    const r1 = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "market_force_closed", value: String(forceClosed), category: "MARKET" }),
    })
    if (!r1.ok) throw new Error("Failed to save market_force_closed")

    const normalized = holidaysCsv.split(/[\n,\r]+/).map((s) => s.trim()).filter(Boolean).join(",")
    const r2 = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "market_holidays_csv", value: normalized, category: "MARKET" }),
    })
    if (!r2.ok) throw new Error("Failed to save market_holidays_csv")

    try {
      setNSEHolidays(normalized.split(",").filter(Boolean))
      setMarketForceClosed(forceClosed)
    } catch {}

    toast({ title: "Saved", description: "Market hours updated successfully" })
    setHoursDirty(false)
  }, [forceClosed, holidaysCsv])

  const saveMarketDisplay = useCallback(async () => {
    const res = await fetch("/api/settings/market-display", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(marketDisplayDraft),
    })
    if (!res.ok) throw new Error("Failed to save market display config")
    toast({ title: "Saved", description: "Market display settings updated" })
    setDisplayDirty(false)
  }, [marketDisplayDraft])

  const handleHeaderSave = useCallback(async () => {
    setIsSaving(true)
    try {
      const jobs: Promise<void>[] = []
      if (hoursDirty) {
        jobs.push(
          saveMarketControls().catch((e: unknown) => {
            toast({ title: "Save Failed", description: e instanceof Error ? e.message : "Unable to save market hours", variant: "destructive" })
          })
        )
      }
      if (displayDirty) {
        jobs.push(
          saveMarketDisplay().catch((e: unknown) => {
            toast({ title: "Save Failed", description: e instanceof Error ? e.message : "Unable to save display settings", variant: "destructive" })
          })
        )
      }
      if (controlsDirty && marketControlRef.current) {
        jobs.push(
          marketControlRef.current.saveAll().then(() => setControlsDirty(false))
        )
      }
      if (catalogDirty && catalogRef.current) {
        jobs.push(
          catalogRef.current.saveAll().then(() => setCatalogDirty(false)).catch((e: unknown) => {
            toast({ title: "Save Failed", description: e instanceof Error ? e.message : "Unable to save catalog", variant: "destructive" })
          })
        )
      }
      await Promise.allSettled(jobs)
    } finally {
      setIsSaving(false)
    }
  }, [hoursDirty, displayDirty, controlsDirty, catalogDirty, saveMarketControls, saveMarketDisplay])

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as MarketDataTab)}>
        {/* ── Sticky Header ───────────────────────────────────────────── */}
        <div className="sticky top-0 z-20 bg-background border-b">
          <div className="px-4 sm:px-6 pt-4 pb-0 space-y-3">

            {/* Row 1: Page title + live clock */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary shrink-0" />
                <h1 className="text-lg font-semibold tracking-tight">Market Data</h1>
              </div>
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span suppressHydrationWarning>
                  {new Date().toLocaleTimeString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}{" "}
                  IST
                </span>
              </span>
            </div>

            {/* Row 2: Exchange status pills + force-close + actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Force-close alert pill */}
              {forceClosed && (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400">
                  <AlertTriangle className="h-3 w-3 shrink-0" /> FORCE CLOSED
                </span>
              )}

              {/* Exchange status pills */}
              {(
                [
                  { label: "NSE EQ", segment: "NSE_EQ" as const },
                  { label: "NSE F&O", segment: "NSE_FO" as const },
                  { label: "BSE EQ", segment: "BSE_EQ" as const },
                  { label: "MCX", segment: "MCX_FO" as const },
                ] as const
              ).map(({ label, segment }) => {
                const sessionResult = getSegmentMarketSession(segment)
                const sessionLabel = forceClosed ? "closed" : sessionResult.session
                const isOpen = !forceClosed && sessionResult.session === "open"
                const isPreOpen = !forceClosed && sessionResult.session === "pre-open"
                return (
                  <span
                    key={segment}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                      forceClosed
                        ? "border-red-500/30 bg-red-500/10 text-red-400"
                        : isOpen
                          ? "border-green-500/30 bg-green-500/10 text-green-400"
                          : isPreOpen
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                            : "border-border bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                        forceClosed
                          ? "bg-red-500 animate-pulse"
                          : isOpen
                            ? "bg-green-500 animate-pulse"
                            : isPreOpen
                              ? "bg-amber-500"
                              : "bg-muted-foreground/50"
                      }`}
                    />
                    {label} · {sessionLabel.toUpperCase()}
                  </span>
                )
              })}

              {/* Actions */}
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchSettings}
                  disabled={refreshing}
                  className="gap-1.5 h-8"
                >
                  {refreshing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Reload
                </Button>
                <Button
                  size="sm"
                  onClick={handleHeaderSave}
                  disabled={dirtyCount === 0 || isSaving}
                  className="gap-1.5 h-8"
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  {isSaving ? "Saving…" : dirtyCount > 0 ? `Save · ${dirtyCount} dirty` : "All saved"}
                </Button>
              </div>
            </div>

            {/* Row 3: Tab navigation */}
            <TabsList className="h-9 w-full justify-start rounded-none border-0 bg-transparent px-0 gap-1">
              <TabsTrigger value="overview" className="h-full rounded-t-md rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-sm px-3">
                Overview
              </TabsTrigger>
              <TabsTrigger value="hours" className="h-full rounded-t-md rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-sm px-3 inline-flex items-center">
                Market Hours {hoursDirty && <DirtyDot />}
              </TabsTrigger>
              <TabsTrigger value="display" className="h-full rounded-t-md rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-sm px-3 inline-flex items-center">
                Display Settings {displayDirty && <DirtyDot />}
              </TabsTrigger>
              <TabsTrigger value="controls" className="h-full rounded-t-md rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-sm px-3 inline-flex items-center">
                Market Controls {controlsDirty && <DirtyDot />}
              </TabsTrigger>
              <TabsTrigger value="catalog" className="h-full rounded-t-md rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-sm px-3 inline-flex items-center">
                Catalog {catalogDirty && <DirtyDot />}
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* ── Tab Content Panels (all in DOM, CSS-hidden when inactive) ── */}
        <div className="px-4 sm:px-6 py-5 space-y-4">

          {/* ── Tab: Overview ─────────────────────────────────────────── */}
          <div className={activeTab !== "overview" ? "hidden" : ""}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(
                [
                  { label: "NSE Equity", segment: "NSE_EQ" as const },
                  { label: "NSE F&O", segment: "NSE_FO" as const },
                  { label: "BSE Equity", segment: "BSE_EQ" as const },
                  { label: "MCX", segment: "MCX_FO" as const },
                ] as const
              ).map(({ label, segment }) => {
                const sessionResult = getSegmentMarketSession(segment)
                const sessionLabel = forceClosed ? "closed" : sessionResult.session
                const isOpen = !forceClosed && sessionResult.session === "open"
                const isPreOpen = !forceClosed && sessionResult.session === "pre-open"
                return (
                  <div
                    key={segment}
                    className={`rounded-xl border p-4 flex flex-col gap-2 ${
                      forceClosed
                        ? "bg-red-500/8 border-red-500/30"
                        : isOpen
                          ? "bg-green-500/8 border-green-500/30"
                          : isPreOpen
                            ? "bg-amber-500/8 border-amber-500/30"
                            : "bg-muted/50 border-border"
                    }`}
                  >
                    <span className="text-xs font-medium text-muted-foreground">{label}</span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${
                          forceClosed
                            ? "bg-red-500 animate-pulse"
                            : isOpen
                              ? "bg-green-500 animate-pulse"
                              : isPreOpen
                                ? "bg-amber-500"
                                : "bg-muted-foreground/50"
                        }`}
                      />
                      <span
                        className={`text-sm font-semibold uppercase tracking-wide ${
                          forceClosed
                            ? "text-red-400"
                            : isOpen
                              ? "text-green-400"
                              : isPreOpen
                                ? "text-amber-400"
                                : "text-muted-foreground"
                        }`}
                      >
                        {forceClosed ? "Force Closed" : sessionLabel}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
            {forceClosed && (
              <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Market is administratively force-closed. All order placement and live polling is blocked. Toggle off in the <button type="button" onClick={() => setActiveTab("hours")} className="underline hover:text-red-300">Market Hours</button> tab.</span>
              </div>
            )}
          </div>

          {/* ── Tab: Market Hours ─────────────────────────────────────── */}
          <div className={activeTab !== "hours" ? "hidden" : "space-y-5 max-w-2xl"}>
            {/* Force Close toggle */}
            <div
              className={`flex items-start justify-between gap-4 rounded-xl border p-4 transition-colors ${
                forceClosed ? "bg-red-500/10 border-red-500/40" : "bg-muted/50 border-border"
              }`}
            >
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className={`mt-0.5 h-5 w-5 shrink-0 ${forceClosed ? "text-red-400" : "text-muted-foreground"}`}
                />
                <div className="space-y-0.5">
                  <Label className={`font-semibold text-sm ${forceClosed ? "text-red-300" : "text-foreground"}`}>
                    Force Market Closed
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Overrides normal session hours. Blocks all order placement and live price polling instantly.
                  </p>
                  {forceClosed && (
                    <p className="text-xs font-medium text-red-400 mt-1">⚠ Market is currently force-closed</p>
                  )}
                </div>
              </div>
              <Switch
                checked={forceClosed}
                onCheckedChange={(v) => {
                  setForceClosed(v)
                  setHoursDirty(true)
                }}
                className={forceClosed ? "data-[state=checked]:bg-red-500" : ""}
              />
            </div>

            {/* NSE Holidays */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <Label className="font-semibold text-sm">NSE Holidays</Label>
                </div>
                <div className="flex gap-1.5">
                  {(() => {
                    const upcoming = holidaysList.filter((d) => d >= todayISO).length
                    const past = holidaysList.length - upcoming
                    return (
                      <>
                        {upcoming > 0 && (
                          <Badge className="bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[10px] h-5">
                            {upcoming} upcoming
                          </Badge>
                        )}
                        {past > 0 && (
                          <Badge variant="outline" className="text-muted-foreground text-[10px] h-5">
                            {past} past
                          </Badge>
                        )}
                        {holidaysList.length === 0 && (
                          <Badge variant="outline" className="text-muted-foreground text-[10px] h-5">
                            No holidays
                          </Badge>
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Add YYYY-MM-DD dates. Changes take effect after saving.
              </p>

              {/* Add date row */}
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Input
                    type="date"
                    value={newHolidayInput}
                    onChange={(e) => {
                      setNewHolidayInput(e.target.value)
                      setHolidayInputError("")
                    }}
                    onKeyDown={(e) => e.key === "Enter" && addHoliday(newHolidayInput)}
                    className="bg-background border-border text-sm h-9"
                  />
                  {holidayInputError && <p className="text-xs text-red-400">{holidayInputError}</p>}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 gap-1.5 shrink-0"
                  onClick={() => addHoliday(newHolidayInput)}
                  disabled={!newHolidayInput}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </div>

              {/* Holiday chips */}
              {holidaysList.length > 0 && (
                <div className="flex flex-wrap gap-2 rounded-xl border border-border/60 bg-muted/20 p-3">
                  {holidaysList.map((date) => {
                    const isPast = date < todayISO
                    return (
                      <span
                        key={date}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                          isPast
                            ? "border-border/50 bg-muted text-muted-foreground line-through opacity-60"
                            : "border-blue-500/30 bg-blue-500/15 text-blue-400"
                        }`}
                      >
                        {date}
                        <button
                          type="button"
                          onClick={() => removeHoliday(date)}
                          className="ml-0.5 rounded-full hover:text-red-400 transition-colors focus:outline-none"
                          aria-label={`Remove ${date}`}
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>

            {hoursDirty && (
              <p className="text-xs text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Unsaved changes — use the Save button in the header.
              </p>
            )}
          </div>

          {/* ── Tab: Display Settings ─────────────────────────────────── */}
          <div className={activeTab !== "display" ? "hidden" : "space-y-4"}>

            {/* Row 1: Price Smoothing + Data Freshness side-by-side on desktop */}
            <div className="grid gap-4 lg:grid-cols-2">

              {/* Price Smoothing */}
              <Card className="border-border/60 flex flex-col">
                <CardHeader className="px-5 pt-4 pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-400 shrink-0" />
                    Price Smoothing
                    <span className="ml-auto flex gap-1.5">
                      {marketDisplayDraft.global.jitter.enabled && (
                        <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] h-5 px-2">Jitter ON</Badge>
                      )}
                      {marketDisplayDraft.global.interpolation.enabled && (
                        <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px] h-5 px-2">Smooth ON</Badge>
                      )}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5 space-y-4 flex-1">
                  {/* Jitter section */}
                  <div className="rounded-lg border border-border/50 bg-muted/10 divide-y divide-border/40">
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Label className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Jitter</Label>
                        <InfoTip text="Adds tiny random ups and downs around the real last price so numbers feel active instead of frozen. Safe for perception only — the true tick still drives risk logic underneath." />
                      </div>
                      <Switch
                        checked={marketDisplayDraft.global.jitter.enabled}
                        onCheckedChange={(v) =>
                          updateDisplayDraft((d) => ({
                            ...d,
                            global: { ...d.global, jitter: { ...d.global.jitter, enabled: v } },
                          }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-0 divide-x divide-border/40">
                      <div className="px-3 py-2.5 space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-[10px] text-muted-foreground">Interval (ms)</Label>
                          <InfoTip text="Minimum time between picking a new random wiggle." />
                        </div>
                        <Input
                          type="number"
                          className="h-7 text-xs"
                          value={marketDisplayDraft.global.jitter.interval}
                          onChange={(e) =>
                            updateDisplayDraft((d) => ({
                              ...d,
                              global: { ...d.global, jitter: { ...d.global.jitter, interval: Math.max(50, Math.min(5000, Number(e.target.value) || 250)) } },
                            }))
                          }
                        />
                      </div>
                      <div className="px-3 py-2.5 space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-[10px] text-muted-foreground">Intensity</Label>
                          <InfoTip text="How strong the random move can be, relative to price." />
                        </div>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-7 text-xs"
                          value={marketDisplayDraft.global.jitter.intensity}
                          onChange={(e) =>
                            updateDisplayDraft((d) => ({
                              ...d,
                              global: { ...d.global, jitter: { ...d.global.jitter, intensity: Math.max(0, Math.min(5, Number(e.target.value) || 0)) } },
                            }))
                          }
                        />
                      </div>
                      <div className="px-3 py-2.5 space-y-1">
                        <div className="flex items-center gap-1">
                          <Label className="text-[10px] text-muted-foreground">Convergence</Label>
                          <InfoTip text="How much each refresh pulls the wiggle toward a new random target. Closer to 1 = smoother." />
                        </div>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-7 text-xs"
                          value={marketDisplayDraft.global.jitter.convergence}
                          onChange={(e) =>
                            updateDisplayDraft((d) => ({
                              ...d,
                              global: { ...d.global, jitter: { ...d.global.jitter, convergence: Math.max(0, Math.min(1, Number(e.target.value) || 0)) } },
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {/* Smooth Transitions section */}
                  <div className="rounded-lg border border-border/50 bg-muted/10 divide-y divide-border/40">
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Label className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Smooth Transitions</Label>
                        <InfoTip text="When a new tick arrives, instead of snapping instantly the price glides over N steps and D ms. Reduces visual jumpiness on volatile instruments." />
                      </div>
                      <Switch
                        checked={marketDisplayDraft.global.interpolation.enabled}
                        onCheckedChange={(v) =>
                          updateDisplayDraft((d) => ({
                            ...d,
                            global: { ...d.global, interpolation: { ...d.global.interpolation, enabled: v } },
                          }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-0 divide-x divide-border/40">
                      <div className="px-3 py-2.5 space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Steps</Label>
                        <Input
                          type="number"
                          className="h-7 text-xs"
                          value={marketDisplayDraft.global.interpolation.steps}
                          onChange={(e) =>
                            updateDisplayDraft((d) => ({
                              ...d,
                              global: { ...d.global, interpolation: { ...d.global.interpolation, steps: Math.max(1, Math.min(500, Number(e.target.value) || 50)) } },
                            }))
                          }
                        />
                      </div>
                      <div className="px-3 py-2.5 space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Duration (ms)</Label>
                        <Input
                          type="number"
                          className="h-7 text-xs"
                          value={marketDisplayDraft.global.interpolation.duration}
                          onChange={(e) =>
                            updateDisplayDraft((d) => ({
                              ...d,
                              global: { ...d.global, interpolation: { ...d.global.interpolation, duration: Math.max(100, Math.min(30_000, Number(e.target.value) || 4500)) } },
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Data Freshness */}
              <Card className="border-border/60 flex flex-col">
                <CardHeader className="px-5 pt-4 pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-400 shrink-0" />
                    Data Freshness
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5 space-y-4 flex-1">
                  {/* Quote badges toggle row */}
                  <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/10 px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-sm font-medium">Quote Badges</Label>
                      <InfoTip text="Master switch for LIVE / STALE / FROZEN-style feed badges on positions and watchlist." />
                    </div>
                    <Switch
                      checked={marketDisplayDraft.ui.quoteBadgesEnabled}
                      onCheckedChange={(v) =>
                        updateDisplayDraft((d) => ({ ...d, ui: { ...d.ui, quoteBadgesEnabled: v } }))
                      }
                    />
                  </div>

                  {/* Stale threshold + price mode */}
                  <div className="rounded-lg border border-border/50 bg-muted/10 divide-y divide-border/40">
                    <div className="px-3 py-2.5 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs">Stale badge threshold (ms)</Label>
                        <InfoTip text="After this many milliseconds without a new tick the price is marked stale. Leave blank to disable." />
                      </div>
                      <Input
                        type="number"
                        placeholder="null = disabled"
                        className="h-8 text-xs"
                        value={marketDisplayDraft.ui.staleBadgeAfterMs ?? ""}
                        onChange={(e) => {
                          const val = e.target.value === "" ? null : Math.max(500, Math.min(600_000, Number(e.target.value) || 5_000))
                          updateDisplayDraft((d) => ({ ...d, ui: { ...d.ui, staleBadgeAfterMs: val } }))
                        }}
                      />
                    </div>
                    <div className="px-3 py-2.5 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs">Stale quote price mode</Label>
                        <InfoTip text="strict: hide the numeric price when quote is older than display max age. last_tick: keep showing last received LTP." />
                      </div>
                      <Select
                        value={marketDisplayDraft.ui.staleQuotePriceMode}
                        onValueChange={(v) =>
                          updateDisplayDraft((d) => ({ ...d, ui: { ...d.ui, staleQuotePriceMode: v as "strict" | "last_tick" } }))
                        }
                      >
                        <SelectTrigger className="h-8 text-xs w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="strict">Strict — hide stale price</SelectItem>
                          <SelectItem value="last_tick">Last tick — keep showing</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Row 2: Square-off & MTM Display — full width with internal 2-col grid */}
            <Card className="border-border/60">
              <CardHeader className="px-5 pt-4 pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-purple-400 shrink-0" />
                  Square-off &amp; MTM Display
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="grid gap-4 lg:grid-cols-3">
                  {/* Square-off price authority */}
                  <div className="rounded-lg border border-border/50 bg-muted/10 px-4 py-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs font-semibold">Sq-off price authority</Label>
                      <InfoTip text="server: executed exit mark prefers live server quote. client_assisted: trust client mark when timestamp proves freshness (legacy net-close behaviour)." />
                    </div>
                    <Select
                      value={marketDisplayDraft.ui.positionSquareOffPriceAuthority}
                      onValueChange={(v) =>
                        updateDisplayDraft((d) => ({ ...d, ui: { ...d.ui, positionSquareOffPriceAuthority: v as "server" | "client_assisted" } }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="client_assisted">Client assisted (legacy)</SelectItem>
                        <SelectItem value="server">Server only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Positions MTM display mode */}
                  <div className="rounded-lg border border-border/50 bg-muted/10 px-4 py-3 space-y-2">
                    <Label className="text-xs font-semibold">Positions tab MTM mode</Label>
                    <Select
                      value={marketDisplayDraft.ui.positionsTabMtmDisplayMode}
                      onValueChange={(v) =>
                        updateDisplayDraft((d) => ({ ...d, ui: { ...d.ui, positionsTabMtmDisplayMode: v as "live_hybrid" | "live_quote_preferred" | "server_snapshot_preferred" } }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="live_hybrid">Live hybrid</SelectItem>
                        <SelectItem value="live_quote_preferred">Live quote preferred</SelectItem>
                        <SelectItem value="server_snapshot_preferred">Server snapshot preferred</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Admin sq-off cached tick toggle */}
                  <div className="rounded-lg border border-border/50 bg-muted/10 px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-start gap-1.5">
                      <div className="space-y-0.5">
                        <Label className="text-xs font-semibold">Allow last cached tick</Label>
                        <p className="text-[10px] text-muted-foreground leading-relaxed">Admin sq-off may use cached server tick if no fresh live quote. Retail flows ignore this.</p>
                      </div>
                      <InfoTip text="When enabled, admin PATCH position close may use the last cached server subscription tick if no fresh live quote is available. Retail flows ignore this flag." />
                    </div>
                    <Switch
                      checked={marketDisplayDraft.ui.adminSquareOffAllowLastSubscriptionTick}
                      onCheckedChange={(v) =>
                        updateDisplayDraft((d) => ({ ...d, ui: { ...d.ui, adminSquareOffAllowLastSubscriptionTick: v } }))
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Row 3: Per-Segment Display Overrides — full width */}
            <Card className="border-border/60">
              <CardHeader className="px-5 pt-4 pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-green-400 shrink-0" />
                  Per-Segment Display Overrides
                  <span className="ml-auto text-[10px] font-normal text-muted-foreground">Overrides the global toggles above for specific segments</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {/* Header row */}
                <div className="grid grid-cols-[minmax(7rem,10rem)_1fr_1fr_1fr] items-center gap-x-2 text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1 px-3">
                  <span>Segment</span>
                  <span className="text-center">Jitter</span>
                  <span className="text-center">Deviation</span>
                  <span className="text-center">Smooth</span>
                </div>
                <div className="space-y-1.5">
                  {MARKET_DISPLAY_SEGMENT_KEYS.map((seg) => {
                    const segCfg = marketDisplayDraft.segments?.[seg] ?? {}
                    const isDefault = seg === "default"
                    return (
                      <div
                        key={seg}
                        className={`grid grid-cols-[minmax(7rem,10rem)_1fr_1fr_1fr] items-center gap-x-2 rounded-lg border px-3 py-2.5 ${
                          isDefault
                            ? "border-blue-500/20 bg-blue-500/5"
                            : "border-border/50 bg-muted/20"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-mono font-bold text-foreground/80">{seg}</span>
                          {isDefault && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1 border-blue-500/30 text-blue-400">fallback</Badge>
                          )}
                        </div>
                        <div className="flex justify-center">
                          <Switch
                            checked={segCfg.jitter?.enabled ?? false}
                            onCheckedChange={(v) =>
                              updateDisplayDraft((d) => ({
                                ...d,
                                segments: { ...d.segments, [seg]: { ...segCfg, jitter: { ...(segCfg.jitter ?? {}), enabled: v } } },
                              }))
                            }
                          />
                        </div>
                        <div className="flex justify-center">
                          <Switch
                            checked={segCfg.deviation?.enabled ?? false}
                            onCheckedChange={(v) =>
                              updateDisplayDraft((d) => ({
                                ...d,
                                segments: { ...d.segments, [seg]: { ...segCfg, deviation: { ...(segCfg.deviation ?? {}), enabled: v } } },
                              }))
                            }
                          />
                        </div>
                        <div className="flex justify-center">
                          <Switch
                            checked={segCfg.interpolation?.enabled ?? false}
                            onCheckedChange={(v) =>
                              updateDisplayDraft((d) => ({
                                ...d,
                                segments: { ...d.segments, [seg]: { ...segCfg, interpolation: { ...(segCfg.interpolation ?? {}), enabled: v } } },
                              }))
                            }
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {displayDirty && (
              <p className="text-xs text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Unsaved changes — use the Save button in the header.
              </p>
            )}
          </div>

          {/* ── Tab: Market Controls ──────────────────────────────────── */}
          {/*
            Always in the DOM (CSS-hidden when inactive) so marketControlRef stays
            valid for cross-tab orchestrated saves via the header Save button.
          */}
          <div className={activeTab !== "controls" ? "hidden" : ""}>
            <MarketControlPanel
              ref={marketControlRef}
              hideCard
              onDirty={() => setControlsDirty(true)}
            />
          </div>

          {/* ── Tab: Catalog (admin-curated lists for the user-facing Browse drawer) ── */}
          <div className={activeTab !== "catalog" ? "hidden" : ""}>
            <MarketCatalogEditor
              ref={catalogRef}
              onDirtyChange={setCatalogDirty}
            />
          </div>

        </div>
      </Tabs>
    </motion.div>
  )
}
