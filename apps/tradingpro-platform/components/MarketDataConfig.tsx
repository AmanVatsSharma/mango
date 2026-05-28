/**
 * File:        components/MarketDataConfig.tsx
 * Module:      Market Demo · Per-tab Jitter / Deviation / Interpolation Knobs
 * Purpose:     Demo-route playground for tweaking the client-side jitter,
 *              deviation, and interpolation enhancements applied on top of
 *              live ticks. Mounted only on /market-demo for developers and
 *              support staff who want to feel out the visual settings.
 *
 * Exports:
 *   - MarketDataConfig — React FC, optional `className` prop
 *
 * Depends on:
 *   - @/lib/hooks/MarketDataProvider — useMarketData (per-tab React context)
 *
 * Side-effects:
 *   - Mutates the per-tab MarketDataProvider context via updateConfig.
 *   - NO persistence: settings vanish on reload, differ per browser tab,
 *     and are NOT shared with other users or with the actual dashboard
 *     market-data path. The dashboard provider
 *     (lib/market-data/providers/WebSocketMarketDataProvider) does NOT
 *     read these values.
 *
 * Key invariants:
 *   - Trading-3qv: this is a DEMO surface, not an admin one. The audit
 *     flagged it because it looks admin-shaped — solved by making the
 *     scope unmistakable in the UI (banner + "(Demo)" title) rather than
 *     adding a fake persistence layer that doesn't exist on the read side.
 *   - Production jitter persistence (when actually needed) belongs in
 *     MarketControlConfigV1 + the existing /api/admin/market-controls
 *     loader chain. Tracked as a separate P2 follow-up.
 *
 * Read order:
 *   1. MarketDataConfig — sole export (UI + handlers)
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 *   - Trading-3qv: marked clearly as demo-only (banner + title), since the
 *     component is mounted only on /market-demo and never persists.
 */

"use client"

import { useState } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { useMarketData } from "@/lib/hooks/MarketDataProvider"
import { useAdminJitterDefault } from "@/lib/hooks/use-admin-jitter-default"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  normalizeDeviationAbsoluteInput,
  normalizeDeviationPercentageInput,
  normalizeInterpolationDurationInput,
  normalizeInterpolationStepsInput,
  normalizeJitterConvergenceInput,
  normalizeJitterIntensityInput,
  normalizeJitterIntervalInput,
} from "@/components/market-data-config-number-utils"

interface MarketDataConfigProps {
  className?: string;
}

export function MarketDataConfig({ className }: MarketDataConfigProps) {
  const { config, updateConfig } = useMarketData()
  const [localConfig, setLocalConfig] = useState(config)
  // Trading-mfk: read the admin-resolved jitter rule so the demo "Reset to admin defaults"
  // button below can populate from the persisted MarketControlConfigV1 rather than the
  // hardcoded hook constants. Read-only — the demo never writes back to the server.
  const adminJitter = useAdminJitterDefault()

  const handleSave = () => {
    updateConfig(localConfig)
  }

  const handleReset = () => {
    setLocalConfig(config)
  }

  /**
   * Trading-mfk: pulls the current admin-resolved jitter into the local form. Engineers
   * who want to feel out the admin-configured baseline (instead of the per-tab hook
   * default) can hit this button. Demo-only — clicking does NOT persist back to the server.
   */
  const handleResetToAdminDefaults = () => {
    setLocalConfig((prev: any) => ({
      ...prev,
      jitter: {
        enabled: adminJitter.enabled,
        interval: adminJitter.intervalMs,
        intensity: adminJitter.intensityPct,
        convergence: adminJitter.convergence,
      },
    }))
  }

  const handleJitterChange = (field: string, value: any) => {
    setLocalConfig((prev: any) => ({
      ...prev,
      jitter: {
        ...prev.jitter,
        [field]: value
      }
    }))
  }

  const handleDeviationChange = (field: string, value: any) => {
    setLocalConfig((prev: any) => ({
      ...prev,
      deviation: {
        ...prev.deviation,
        [field]: value
      }
    }))
  }

  const handleInterpolationChange = (field: string, value: any) => {
    setLocalConfig((prev: any) => ({
      ...prev,
      interpolation: {
        ...prev.interpolation,
        [field]: value
      }
    }))
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Market Data Configuration
          <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            Demo · per-tab
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/60 p-3 text-xs text-amber-900 dark:text-amber-100">
          <p className="font-semibold mb-1">Demo controls — not persisted</p>
          <p className="leading-relaxed">
            These settings live in this browser tab only. They do <strong>not</strong> save to the
            server, do <strong>not</strong> sync across tabs or users, and the production trading
            dashboard does <strong>not</strong> read them. Use this page to feel out the visual
            jitter / deviation / interpolation knobs.
          </p>
        </div>
        {/* Jitter Configuration */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="jitter-enabled">Enable Jitter</Label>
            <Switch
              id="jitter-enabled"
              checked={localConfig.jitter.enabled}
              onCheckedChange={(checked: boolean) => handleJitterChange('enabled', checked)}
            />
          </div>
          
          {localConfig.jitter.enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="jitter-interval">Jitter Interval (ms)</Label>
                <Input
                  id="jitter-interval"
                  type="number"
                  value={localConfig.jitter.interval}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleJitterChange('interval', normalizeJitterIntervalInput(e.target.value))}
                  min="100"
                  max="1000"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="jitter-intensity">Jitter Intensity</Label>
                <Input
                  id="jitter-intensity"
                  type="number"
                  step="0.01"
                  value={localConfig.jitter.intensity}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleJitterChange('intensity', normalizeJitterIntensityInput(e.target.value))}
                  min="0"
                  max="1"
                />
                <p className="text-sm text-muted-foreground">
                  ±0.15 means ±0.15 or ±0.15% of price
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="jitter-convergence">Convergence Rate</Label>
                <Input
                  id="jitter-convergence"
                  type="number"
                  step="0.01"
                  value={localConfig.jitter.convergence}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleJitterChange('convergence', normalizeJitterConvergenceInput(e.target.value))}
                  min="0"
                  max="1"
                />
                <p className="text-sm text-muted-foreground">
                  How fast jitter converges to real price (0-1)
                </p>
              </div>
            </>
          )}
        </div>

        {/* Deviation Configuration */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="deviation-enabled">Enable Deviation</Label>
            <Switch
              id="deviation-enabled"
              checked={localConfig.deviation.enabled}
              onCheckedChange={(checked: boolean) => handleDeviationChange('enabled', checked)}
            />
          </div>
          
          {localConfig.deviation.enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="deviation-percentage">Percentage Deviation (%)</Label>
                <Input
                  id="deviation-percentage"
                  type="number"
                  step="0.1"
                  value={localConfig.deviation.percentage}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleDeviationChange('percentage', normalizeDeviationPercentageInput(e.target.value))}
                  min="0"
                  max="100"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="deviation-absolute">Absolute Deviation</Label>
                <Input
                  id="deviation-absolute"
                  type="number"
                  step="0.01"
                  value={localConfig.deviation.absolute}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleDeviationChange('absolute', normalizeDeviationAbsoluteInput(e.target.value))}
                  min="0"
                />
              </div>
            </>
          )}
        </div>

        {/* Interpolation Configuration */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="interpolation-enabled">Enable Smooth Transitions</Label>
            <Switch
              id="interpolation-enabled"
              checked={localConfig.interpolation.enabled}
              onCheckedChange={(checked: boolean) => handleInterpolationChange('enabled', checked)}
            />
          </div>
          
          {localConfig.interpolation.enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="interpolation-duration">Transition Duration (ms)</Label>
                <Input
                  id="interpolation-duration"
                  type="number"
                  value={localConfig.interpolation.duration}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInterpolationChange('duration', normalizeInterpolationDurationInput(e.target.value))}
                  min="1000"
                  max="10000"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="interpolation-steps">Interpolation Steps</Label>
                <Input
                  id="interpolation-steps"
                  type="number"
                  value={localConfig.interpolation.steps}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInterpolationChange('steps', normalizeInterpolationStepsInput(e.target.value))}
                  min="10"
                  max="200"
                />
              </div>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-4">
          <Button onClick={handleSave} className="flex-1">
            Apply Changes
          </Button>
          <Button onClick={handleReset} variant="outline" className="flex-1">
            Reset
          </Button>
        </div>

        {/* Trading-mfk: pull admin-resolved jitter as a starting point. Demo-only — never persists. */}
        <div className="flex gap-2 -mt-2">
          <Button
            onClick={handleResetToAdminDefaults}
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            title="Load the jitter rule the admin has configured in MarketControlConfigV1. This populates the form only; you still need to click Apply Changes."
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Pull admin jitter defaults
          </Button>
        </div>

        {/* Quick Presets */}
        <div className="space-y-2">
          <Label>Quick Presets</Label>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setLocalConfig({
                  jitter: { enabled: true, interval: 250, intensity: 0.1, convergence: 0.15 },
                  deviation: { enabled: false, percentage: 0, absolute: 0 },
                  interpolation: { enabled: true, steps: 50, duration: 4500 }
                })
              }}
            >
              Subtle
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setLocalConfig({
                  jitter: { enabled: true, interval: 200, intensity: 0.2, convergence: 0.1 },
                  deviation: { enabled: false, percentage: 0, absolute: 0 },
                  interpolation: { enabled: true, steps: 60, duration: 4000 }
                })
              }}
            >
              Active
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setLocalConfig({
                  jitter: { enabled: false, interval: 250, intensity: 0.15, convergence: 0.1 },
                  deviation: { enabled: false, percentage: 0, absolute: 0 },
                  interpolation: { enabled: true, steps: 40, duration: 5000 }
                })
              }}
            >
              Smooth Only
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setLocalConfig({
                  jitter: { enabled: false, interval: 250, intensity: 0.15, convergence: 0.1 },
                  deviation: { enabled: false, percentage: 0, absolute: 0 },
                  interpolation: { enabled: false, steps: 50, duration: 4500 }
                })
              }}
            >
              Disable All
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
