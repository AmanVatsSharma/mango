/**
 * File: components/trading/widgets/home-customization-dialog.tsx
 * Module: components/trading/widgets
 * Purpose: User-facing dialog to customize and save Home widget preferences.
 * Author: StockTrade
 * Last-updated: 2026-02-17
 * Notes:
 * - Persists preferences through `/api/market-data/home-config` override APIs.
 * - Allows editing marquee symbols, default chart symbol, and widget visibility.
 */

"use client"

import { useEffect, useMemo, useState } from "react"
import { Plus, RotateCcw, Save, Settings2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  HOME_DASHBOARD_WIDGET_KEYS,
  normalizeHomeDashboardConfig,
  normalizeHomeDashboardSymbol,
  type HomeDashboardConfig,
} from "@/lib/home-dashboard/home-dashboard-config-schema"

const HOME_WIDGET_LABELS: Record<(typeof HOME_DASHBOARD_WIDGET_KEYS)[number], string> = {
  tickerTape: "Ticker Marquee",
  chart: "Price Chart",
  heatmap: "Market Heatmap",
  screener: "Screener",
  topMovers: "Top Movers",
  marketStats: "Market Stats",
}

interface HomeCustomizationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: HomeDashboardConfig
  hasUserOverride: boolean
  isSaving: boolean
  onSave: (config: HomeDashboardConfig) => Promise<boolean>
  onReset: () => Promise<boolean>
}

export function HomeCustomizationDialog({
  open,
  onOpenChange,
  config,
  hasUserOverride,
  isSaving,
  onSave,
  onReset,
}: HomeCustomizationDialogProps) {
  const [draftConfig, setDraftConfig] = useState<HomeDashboardConfig>(config)
  const [newSymbol, setNewSymbol] = useState("")

  useEffect(() => {
    if (!open) {
      return
    }
    setDraftConfig(normalizeHomeDashboardConfig(config))
    setNewSymbol("")
  }, [config, open])

  const canReset = hasUserOverride && !isSaving

  const sortedWidgets = useMemo(() => {
    return HOME_DASHBOARD_WIDGET_KEYS.map((key) => ({
      key,
      label: HOME_WIDGET_LABELS[key],
      enabled: draftConfig.enabledWidgets[key],
    }))
  }, [draftConfig.enabledWidgets])

  const handleAddSymbol = () => {
    const normalizedSymbol = normalizeHomeDashboardSymbol(newSymbol)
    if (!normalizedSymbol) {
      return
    }
    if (draftConfig.tickerTapeSymbols.includes(normalizedSymbol)) {
      setNewSymbol("")
      return
    }
    const nextSymbols = [...draftConfig.tickerTapeSymbols, normalizedSymbol]
    setDraftConfig((previousConfig) =>
      normalizeHomeDashboardConfig({
        ...previousConfig,
        tickerTapeSymbols: nextSymbols,
      }),
    )
    setNewSymbol("")
  }

  const handleRemoveSymbol = (symbol: string) => {
    setDraftConfig((previousConfig) =>
      normalizeHomeDashboardConfig({
        ...previousConfig,
        tickerTapeSymbols: previousConfig.tickerTapeSymbols.filter((item) => item !== symbol),
      }),
    )
  }

  const handleToggleWidget = (widgetKey: (typeof HOME_DASHBOARD_WIDGET_KEYS)[number]) => {
    setDraftConfig((previousConfig) =>
      normalizeHomeDashboardConfig({
        ...previousConfig,
        enabledWidgets: {
          ...previousConfig.enabledWidgets,
          [widgetKey]: !previousConfig.enabledWidgets[widgetKey],
        },
      }),
    )
  }

  const handleSave = async () => {
    const saved = await onSave(draftConfig)
    if (saved) {
      onOpenChange(false)
    }
  }

  const handleReset = async () => {
    const reset = await onReset()
    if (reset) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Customize Home Widgets
          </DialogTitle>
          <DialogDescription>
            Personalize your marquee symbols and widget visibility. Admin defaults remain available via reset.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Marquee Symbols</Label>
            <div className="flex gap-2">
              <Input
                value={newSymbol}
                onChange={(event) => setNewSymbol(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    handleAddSymbol()
                  }
                }}
                placeholder="NSE:NIFTY or NSE_EQ-26571"
              />
              <Button type="button" variant="secondary" onClick={handleAddSymbol}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {draftConfig.tickerTapeSymbols.map((symbol) => (
                <Badge key={symbol} variant="secondary" className="flex items-center gap-1">
                  {symbol}
                  <button
                    type="button"
                    onClick={() => handleRemoveSymbol(symbol)}
                    className="rounded-sm hover:text-destructive"
                    aria-label={`Remove ${symbol}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="chartSymbol" className="text-sm font-medium">
              Default Chart Symbol
            </Label>
            <Input
              id="chartSymbol"
              value={draftConfig.chartSymbol}
              onChange={(event) =>
                setDraftConfig((previousConfig) =>
                  normalizeHomeDashboardConfig({
                    ...previousConfig,
                    chartSymbol: event.target.value,
                  }),
                )
              }
              placeholder="NSE:NIFTY"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">Widget Visibility</Label>
            <div className="grid gap-2 md:grid-cols-2">
              {sortedWidgets.map((widget) => (
                <div
                  key={widget.key}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
                >
                  <span className="text-sm text-foreground">{widget.label}</span>
                  <Switch
                    checked={widget.enabled}
                    onCheckedChange={() => handleToggleWidget(widget.key)}
                    aria-label={`Toggle ${widget.label}`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" disabled={!canReset} onClick={handleReset}>
              <RotateCcw className="mr-1 h-4 w-4" /> Reset to Admin Default
            </Button>
            <Button type="button" disabled={isSaving} onClick={handleSave}>
              <Save className="mr-1 h-4 w-4" />
              {isSaving ? "Saving..." : "Save My Preferences"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
