/**
 * File:        components/admin-console/home-tab-settings.tsx
 * Module:      Admin Console · Home Tab Settings
 * Purpose:     Admin console component for configuring home tab widgets, stocks, featured tokens, market highlights, stats, and platform links.
 *
 * Exports:
 *   - HomeTabSettings() → JSX.Element   — main settings component
 *
 * Depends on:
 *   - @/lib/home-dashboard/home-dashboard-config-schema — types + normalizers
 *   - @/components/stock-search — StockSearch modal for token selection
 *   - @/components/ui/card — Card primitives
 *   - @/components/ui/badge — symbol chips
 *
 * Side-effects:
 *   - Fetches config from /api/admin/settings on mount
 *   - Saves config to /api/admin/settings on button click
 *
 * Key invariants:
 *   - tickerTapeSymbols max 30 items
 *   - featuredTokens max 10 items
 *   - All list items have up/down reorder capability
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-16
 */

"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/hooks/use-toast"
import { Save, Plus, X, RefreshCw, Eye, EyeOff, ChevronUp, ChevronDown } from "lucide-react"
import {
  DEFAULT_HOME_DASHBOARD_CONFIG,
  HOME_DASHBOARD_WIDGET_KEYS,
  normalizeHomeDashboardConfig,
  normalizeHomeDashboardSymbol,
  type HomeDashboardConfig,
  type HomeDashboardWidgetKey,
  type HomePageToken,
  type HomePageHighlight,
  type HomePageStat,
  type HomePagePlatformLink,
} from "@/lib/home-dashboard/home-dashboard-config-schema"
import { StockSearch } from "@/components/stock-search"

const HOME_WIDGET_LABELS: Record<HomeDashboardWidgetKey, string> = {
  tickerTape: "Ticker Marquee",
  chart: "Price Chart",
  heatmap: "Market Heatmap",
  screener: "Screener",
  topMovers: "Top Movers",
  marketStats: "Market Stats",
  proOrderEntry: "Pro Order Entry",
  timeAndSales: "Time & Sales",
  accountMetricsBar: "Account Metrics Bar",
}

export function HomeTabSettings() {
  const [config, setConfig] = useState<HomeDashboardConfig>(DEFAULT_HOME_DASHBOARD_CONFIG)
  const [newSymbol, setNewSymbol] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // New section states
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchType, setSearchType] = useState<"ticker" | "featured" | "highlight" | "stats">("ticker")
  const [newHighlight, setNewHighlight] = useState("")
  const [newStatValue, setNewStatValue] = useState("")
  const [newStatLabel, setNewStatLabel] = useState("")

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    setLoading(true)
    try {
      // Load from system settings
      const response = await fetch('/api/admin/settings?category=HOME_TAB')
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.settings?.length > 0) {
          const homeTabSetting = data.settings.find((s: any) => s.key === 'home_tab_config')
          if (homeTabSetting) {
            const parsed = JSON.parse(homeTabSetting.value)
            const normalizedConfig = normalizeHomeDashboardConfig(parsed)
            setConfig(normalizedConfig)
            console.log("✅ [HOME-TAB-SETTINGS] Config loaded:", normalizedConfig)
          }
        }
      }
    } catch (error) {
      console.error('❌ [HOME-TAB-SETTINGS] Error loading config:', error)
      toast({
        title: "Error",
        description: "Failed to load configuration",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    setSaving(true)
    try {
      const normalizedConfig = normalizeHomeDashboardConfig(config)
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'home_tab_config',
          value: JSON.stringify(normalizedConfig),
          description: 'Home tab widget and stock configuration',
          category: 'HOME_TAB',
          isActive: true,
        }),
      })

      if (response.ok) {
        toast({
          title: "✅ Saved",
          description: "Home tab configuration saved successfully",
        })
        console.log("✅ [HOME-TAB-SETTINGS] Config saved:", normalizedConfig)
        setConfig(normalizedConfig)
      } else {
        throw new Error('Failed to save')
      }
    } catch (error) {
      console.error('❌ [HOME-TAB-SETTINGS] Error saving config:', error)
      toast({
        title: "Error",
        description: "Failed to save configuration",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const addSymbol = () => {
    const normalizedSymbol = normalizeHomeDashboardSymbol(newSymbol)
    if (!normalizedSymbol) {
      return
    }
    if (config.tickerTapeSymbols.includes(normalizedSymbol)) {
      setNewSymbol("")
      return
    }
    setConfig(
      normalizeHomeDashboardConfig({
        ...config,
        tickerTapeSymbols: [...config.tickerTapeSymbols, normalizedSymbol],
      }),
    )
    setNewSymbol("")
  }

  const removeSymbol = (symbol: string) => {
    setConfig(
      normalizeHomeDashboardConfig({
        ...config,
        tickerTapeSymbols: config.tickerTapeSymbols.filter((s) => s !== symbol),
      }),
    )
  }

  const toggleWidget = (widget: HomeDashboardWidgetKey) => {
    setConfig(
      normalizeHomeDashboardConfig({
        ...config,
        enabledWidgets: {
          ...config.enabledWidgets,
          [widget]: !config.enabledWidgets[widget],
        },
      }),
    )
  }

  // ── Featured Token handlers ──────────────────────────────
  const openTokenSearch = useCallback((type: "ticker" | "featured") => {
    setSearchType(type)
    setSearchOpen(true)
  }, [])

  const handleTokenSelect = useCallback(
    (stockData: string | { token?: number; uirId?: number; canonicalSymbol?: string; symbol?: string; name?: string; exchange?: string; segment?: string; instrumentId?: string }) => {
      if (searchType === "featured") {
        // Add as featured token
        if (config.featuredTokens.length >= 10) {
          toast({ title: "Limit reached", description: "Maximum 10 featured tokens allowed", variant: "destructive" })
          return
        }
        const tokenData = typeof stockData === "string" ? { symbol: stockData, name: stockData, exchange: "" } : stockData
        const newToken: HomePageToken = {
          token: tokenData.token?.toString() || tokenData.symbol || "",
          symbol: tokenData.symbol || "",
          name: tokenData.name || tokenData.symbol || "",
          exchange: tokenData.exchange || "",
          order: config.featuredTokens.length,
        }
        setConfig(
          normalizeHomeDashboardConfig({
            ...config,
            featuredTokens: [...config.featuredTokens, newToken],
          }),
        )
      }
      setSearchOpen(false)
    },
    [searchType, config],
  )

  const removeFeaturedToken = useCallback((index: number) => {
    const updated = config.featuredTokens.filter((_, i) => i !== index)
    setConfig(normalizeHomeDashboardConfig({ ...config, featuredTokens: updated }))
  }, [config])

  const moveFeaturedToken = useCallback((index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= config.featuredTokens.length) return
    const updated = [...config.featuredTokens]
    ;[updated[index], updated[newIndex]] = [updated[newIndex], updated[index]]
    setConfig(normalizeHomeDashboardConfig({ ...config, featuredTokens: updated }))
  }, [config])

  // ── Highlight handlers ──────────────────────────────────
  const addHighlight = useCallback(() => {
    if (!newHighlight.trim()) return
    const highlight: HomePageHighlight = {
      id: `highlight-${Date.now()}`,
      text: newHighlight.trim(),
      order: config.highlights.length,
    }
    setConfig(normalizeHomeDashboardConfig({ ...config, highlights: [...config.highlights, highlight] }))
    setNewHighlight("")
  }, [newHighlight, config])

  const removeHighlight = useCallback((id: string) => {
    setConfig(normalizeHomeDashboardConfig({ ...config, highlights: config.highlights.filter((h) => h.id !== id) }))
  }, [config])

  const moveHighlight = useCallback((index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= config.highlights.length) return
    const updated = [...config.highlights]
    ;[updated[index], updated[newIndex]] = [updated[newIndex], updated[index]]
    setConfig(normalizeHomeDashboardConfig({ ...config, highlights: updated }))
  }, [config])

  // ── Stats handlers ──────────────────────────────────────
  const addStat = useCallback(() => {
    if (!newStatValue.trim() || !newStatLabel.trim()) return
    const stat: HomePageStat = {
      id: `stat-${Date.now()}`,
      value: newStatValue.trim(),
      label: newStatLabel.trim(),
      order: config.statsData.length,
    }
    setConfig(normalizeHomeDashboardConfig({ ...config, statsData: [...config.statsData, stat] }))
    setNewStatValue("")
    setNewStatLabel("")
  }, [newStatValue, newStatLabel, config])

  const removeStat = useCallback((id: string) => {
    setConfig(normalizeHomeDashboardConfig({ ...config, statsData: config.statsData.filter((s) => s.id !== id) }))
  }, [config])

  const moveStat = useCallback((index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= config.statsData.length) return
    const updated = [...config.statsData]
    ;[updated[index], updated[newIndex]] = [updated[newIndex], updated[index]]
    setConfig(normalizeHomeDashboardConfig({ ...config, statsData: updated }))
  }, [config])

  // ── Platform links handlers ──────────────────────────────
  const updatePlatformLink = useCallback(
    (platform: "android" | "ios" | "desktop" | "web", url: string) => {
      const existingIndex = config.platformLinks.findIndex((l) => l.platform === platform)
      const updatedLinks = [...config.platformLinks]
      if (existingIndex >= 0) {
        updatedLinks[existingIndex] = { ...updatedLinks[existingIndex], url }
      } else {
        updatedLinks.push({ id: `link-${Date.now()}`, platform, url })
      }
      setConfig(normalizeHomeDashboardConfig({ ...config, platformLinks: updatedLinks }))
    },
    [config],
  )

  const removePlatformLink = useCallback(
    (platform: "android" | "ios" | "desktop" | "web") => {
      setConfig(normalizeHomeDashboardConfig({ ...config, platformLinks: config.platformLinks.filter((l) => l.platform !== platform) }))
    },
    [config],
  )

  // ── Reorder helper for ticker symbols ────────────────────
  const moveTickerSymbol = useCallback((index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= config.tickerTapeSymbols.length) return
    const updated = [...config.tickerTapeSymbols]
    ;[updated[index], updated[newIndex]] = [updated[newIndex], updated[index]]
    setConfig(normalizeHomeDashboardConfig({ ...config, tickerTapeSymbols: updated }))
  }, [config])

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Home Tab Configuration</CardTitle>
          <CardDescription>
            Configure which widgets and stocks to display on the home tab
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Ticker Tape Symbols */}
          <div className="space-y-3">
            <Label>Ticker Tape Symbols (NSE/BSE)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g., NSE:RELIANCE or BSE:500325"
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addSymbol()}
              />
              <Button onClick={addSymbol} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {config.tickerTapeSymbols.map((symbol) => (
                <Badge key={symbol} variant="secondary" className="flex items-center gap-1">
                  {symbol}
                  <button
                    onClick={() => removeSymbol(symbol)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Format: NSE:SYMBOL or BSE:SYMBOL (e.g., NSE:RELIANCE, BSE:500325)
            </p>
          </div>

          <Separator />

          {/* Chart Symbol */}
          <div className="space-y-2">
            <Label>Default Chart Symbol</Label>
            <Input
              value={config.chartSymbol}
              onChange={(e) =>
                setConfig(
                  normalizeHomeDashboardConfig({
                    ...config,
                    chartSymbol: e.target.value,
                  }),
                )
              }
              placeholder="NSE:NIFTY"
            />
            <p className="text-xs text-muted-foreground">
              Default symbol to show in the main chart widget
            </p>
          </div>

          <Separator />

          {/* Order Entry Presets */}
          <div className="space-y-2">
            <Label>Pro Order Entry Quantities</Label>
            <Input
              value={config.orderEntryPresets?.join(", ")}
              onChange={(e) => {
                const parts = e.target.value.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
                setConfig(
                  normalizeHomeDashboardConfig({
                    ...config,
                    orderEntryPresets: parts,
                  }),
                )
              }}
              placeholder="10, 50, 100"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of default quantity presets (e.g. 10, 50, 100)
            </p>
          </div>

          <Separator />

          {/* Widget Toggles */}
          <div className="space-y-4">
            <Label>Enabled Widgets</Label>
            {HOME_DASHBOARD_WIDGET_KEYS.map((key) => (
              <div
                key={key}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-2">
                  {config.enabledWidgets[key] ? (
                    <Eye className="h-4 w-4 text-green-500" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  )}
                  <Label className="font-normal">
                    {HOME_WIDGET_LABELS[key]}
                  </Label>
                </div>
                <Switch
                  checked={config.enabledWidgets[key]}
                  onCheckedChange={() => toggleWidget(key)}
                />
              </div>
            ))}
          </div>

          <Separator />

          {/* Featured Tokens Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Featured Tokens</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {config.featuredTokens.length}/10
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openTokenSearch("featured")}
                  disabled={config.featuredTokens.length >= 10}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Token
                </Button>
              </div>
            </div>
            {config.featuredTokens.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
                No featured tokens added yet
              </p>
            ) : (
              <div className="space-y-2">
                {config.featuredTokens.map((token, index) => (
                  <div
                    key={`${token.symbol}-${index}`}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-muted-foreground w-6">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-medium">{token.symbol}</p>
                        <p className="text-xs text-muted-foreground">
                          {token.name} &bull; {token.exchange}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => moveFeaturedToken(index, "up")}
                        disabled={index === 0}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => moveFeaturedToken(index, "down")}
                        disabled={index === config.featuredTokens.length - 1}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFeaturedToken(index)}
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Market Highlights Section */}
          <div className="space-y-4">
            <Label>Market Highlights</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Enter highlight text..."
                value={newHighlight}
                onChange={(e) => setNewHighlight(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && addHighlight()}
              />
              <Button onClick={addHighlight} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
            {config.highlights.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
                No highlights added yet
              </p>
            ) : (
              <div className="space-y-2">
                {config.highlights.map((highlight, index) => (
                  <div
                    key={highlight.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-muted-foreground w-6">
                        {index + 1}
                      </span>
                      <p className="text-sm">{highlight.text}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => moveHighlight(index, "up")}
                        disabled={index === 0}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => moveHighlight(index, "down")}
                        disabled={index === config.highlights.length - 1}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeHighlight(highlight.id)}
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Stats Data Section */}
          <div className="space-y-4">
            <Label>Stats Data</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Value (e.g., ₹98.2 Crore)"
                value={newStatValue}
                onChange={(e) => setNewStatValue(e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="Label (e.g., BROKERAGE SAVED)"
                value={newStatLabel}
                onChange={(e) => setNewStatLabel(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && addStat()}
                className="flex-1"
              />
              <Button onClick={addStat} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
            {config.statsData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
                No stats added yet
              </p>
            ) : (
              <div className="space-y-2">
                {config.statsData.map((stat, index) => (
                  <div
                    key={stat.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-muted-foreground w-6">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-medium">{stat.value}</p>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => moveStat(index, "up")}
                        disabled={index === 0}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => moveStat(index, "down")}
                        disabled={index === config.statsData.length - 1}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeStat(stat.id)}
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Platform Links Section */}
          <div className="space-y-4">
            <Label>Platform Links</Label>
            <div className="space-y-3">
              {(["android", "ios", "desktop", "web"] as const).map((platform) => {
                const existingLink = config.platformLinks.find((l) => l.platform === platform)
                return (
                  <div key={platform} className="flex items-center gap-3">
                    <Label className="w-20 text-sm capitalize">{platform}</Label>
                    <Input
                      placeholder={`${platform} URL`}
                      value={existingLink?.url || ""}
                      onChange={(e) => updatePlatformLink(platform, e.target.value)}
                      className="flex-1"
                    />
                    {existingLink && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removePlatformLink(platform)}
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <Separator />

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={saveConfig} disabled={saving}>
              {saving ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Configuration
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stock Search Modal */}
      <StockSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onAddStock={handleTokenSelect}
        onClose={() => setSearchOpen(false)}
      />
    </div>
  )
}
