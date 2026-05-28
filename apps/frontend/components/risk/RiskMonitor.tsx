/**
 * File:        components/risk/RiskMonitor.tsx
 * Module:      Risk · UI
 * Purpose:     Displays margin risk warnings and triggers auto-close when thresholds are breached.
 *
 * Exports:
 *   - RiskMonitor({ thresholds?, showSettings?, compact? }) — renders null when risk is SAFE
 *
 * Depends on:
 *   - @/lib/hooks/use-risk-monitoring — computes risk status from context data
 *   - @/components/trading/realtime/trading-realtime-provider — provides positions / account (no independent fetch)
 *
 * Side-effects: none beyond useRiskMonitoring
 *
 * Key invariants:
 *   - Must be rendered inside TradingRealtimeProvider
 *   - Returns null when isLoading, no risk status, or status === SAFE
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-07
 *   - Move statusColor / StatusIcon useMemo calls above the SAFE early-return
 *     guard so the hook count stays stable across SAFE <-> WARNING transitions
 *     (Rules of Hooks). Previously this could throw "Rendered more hooks than
 *     during the previous render" when risk first crossed the threshold.
 *   - Rename statusIcon -> StatusIcon. JSX requires capitalized identifiers to
 *     render a value as a component; the lowercase form was silently rendering
 *     as an HTML <statusicon> element with no glyph (user-visible bug — the
 *     risk-warning card never showed an icon).
 *   - Drop the unreachable SAFE branch in the CardDescription (the early
 *     return above already bails for SAFE).
 */

"use client"

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Label } from '@/components/ui/label'
import {
  Shield,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  TrendingDown,
  X,
  Settings,
} from 'lucide-react'
import { useRiskMonitoring, RiskThresholds } from '@/lib/hooks/use-risk-monitoring'
import { useTradingRealtime } from '@/components/trading/realtime/trading-realtime-provider'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { normalizeRiskMonitorThresholdPercentInput } from '@/components/risk/risk-monitor-number-utils'

interface RiskMonitorProps {
  thresholds?: RiskThresholds
  showSettings?: boolean
  compact?: boolean
}

export function RiskMonitor({ thresholds, showSettings = true, compact = false }: RiskMonitorProps) {
  const { positions, account, isLoading: dataLoading, refreshPositions, refreshAll } = useTradingRealtime()

  const {
    riskStatus,
    lastChecked,
    closePosition,
    isLoading,
  } = useRiskMonitoring({ positions, account, isLoading: dataLoading, refreshPositions, refreshAll }, thresholds)

  // ────────────────────────────────────────────────────────────────────────
  // Hooks MUST run unconditionally on every render (Rules of Hooks). The early
  // `return null` for SAFE state used to live above these useMemo calls, which
  // meant the number of hooks called changed when risk transitioned SAFE -> WARNING
  // and React would throw "Rendered more hooks than during the previous render."
  // Both memos defensively handle null/SAFE cases internally, so it's safe to
  // run them ahead of the early return.
  // ────────────────────────────────────────────────────────────────────────
  const statusColor = useMemo(() => {
    if (!riskStatus) return 'bg-gray-500'
    switch (riskStatus.status) {
      case 'CRITICAL':
        return 'bg-red-500'
      case 'WARNING':
        return 'bg-yellow-500'
      default:
        return 'bg-green-500'
    }
  }, [riskStatus])

  // Capitalized name is required for JSX to render it as a component instead
  // of treating it as an HTML element (which is what was silently happening
  // before — `<statusIcon>` was emitting a literal `<statusicon>` element with
  // no icon glyph; user-visible bug that the lowercase name disguised).
  const StatusIcon = useMemo(() => {
    if (!riskStatus) return Shield
    switch (riskStatus.status) {
      case 'CRITICAL':
        return AlertCircle
      case 'WARNING':
        return AlertTriangle
      default:
        return CheckCircle2
    }
  }, [riskStatus])

  // Don't show component when safe (now AFTER all hooks have been called).
  if (isLoading || !riskStatus || riskStatus.status === 'SAFE') {
    return null
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${statusColor}`} />
        <span className="text-xs text-muted-foreground">
          Risk: {riskStatus.marginUtilizationPercent.toFixed(1)}%
        </span>
      </div>
    )
  }

  return (
    <Card className={`border-2 ${
      riskStatus.status === 'CRITICAL' 
        ? 'border-red-500 bg-red-500/10' 
        : riskStatus.status === 'WARNING'
        ? 'border-yellow-500 bg-yellow-500/10'
        : 'border-green-500 bg-green-500/10'
    }`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon className={`w-5 h-5 ${
              riskStatus.status === 'CRITICAL'
                ? 'text-red-500'
                : 'text-yellow-500'
            }`} />
            <CardTitle className="text-lg">Risk Monitor</CardTitle>
          </div>
          {showSettings && <RiskSettingsDialog thresholds={thresholds} />}
        </div>
        <CardDescription>
          {riskStatus.status === 'CRITICAL' && 'Critical risk - Immediate action required'}
          {riskStatus.status === 'WARNING' && 'Warning - Monitor positions closely'}
          {/* SAFE branch unreachable here — the early return above bails out before
              this CardDescription renders. Removed to drop the dead-code TS error. */}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Risk Level Indicator */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Margin Utilization</span>
            <span className={`font-semibold ${
              riskStatus.status === 'CRITICAL' 
                ? 'text-red-500' 
                : riskStatus.status === 'WARNING'
                ? 'text-yellow-500'
                : 'text-green-500'
            }`}>
              {(riskStatus.marginUtilizationPercent * 100).toFixed(1)}%
            </span>
          </div>
          <Progress 
            value={riskStatus.marginUtilizationPercent * 100} 
            className={`h-2 ${
              riskStatus.status === 'CRITICAL' 
                ? '[&>div]:bg-red-500' 
                : riskStatus.status === 'WARNING'
                ? '[&>div]:bg-yellow-500'
                : '[&>div]:bg-green-500'
            }`}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Safe</span>
            <span>Warning (80%)</span>
            <span>Critical (90%)</span>
          </div>
        </div>

        {/* Risk Metrics */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Unrealized P&L</p>
            <p className={`text-lg font-semibold ${
              riskStatus.totalUnrealizedPnL < 0 ? 'text-red-500' : 'text-green-500'
            }`}>
              {riskStatus.totalUnrealizedPnL < 0 ? '-' : '+'}₹{Math.abs(riskStatus.totalUnrealizedPnL).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Available Funds</p>
            <p className="text-lg font-semibold">₹{riskStatus.totalFunds.toFixed(2)}</p>
          </div>
        </div>

        {/* Critical Alert */}
        {riskStatus.status === 'CRITICAL' && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Critical Risk Detected</AlertTitle>
            <AlertDescription>
              Your loss exceeds {(thresholds?.autoCloseThreshold || 0.8) * 100}% of available funds.
              {riskStatus.positionsAtRisk.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium">Positions at risk:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    {riskStatus.positionsAtRisk.slice(0, 3).map((pos) => (
                      <li key={pos.positionId}>
                        {pos.symbol}: ₹{Math.abs(pos.unrealizedPnL).toFixed(2)} loss
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Warning Alert */}
        {riskStatus.status === 'WARNING' && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Risk Warning</AlertTitle>
            <AlertDescription>
              Your loss exceeds {(thresholds?.warningThreshold || 0.75) * 100}% of available funds.
              Consider closing losing positions to reduce risk.
            </AlertDescription>
          </Alert>
        )}

        {/* Positions at Risk */}
        {riskStatus.positionsAtRisk.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Positions at Risk</p>
            <div className="space-y-2">
              {riskStatus.positionsAtRisk
                .sort((a, b) => a.unrealizedPnL - b.unrealizedPnL)
                .slice(0, 5)
                .map((pos) => (
                  <div
                    key={pos.positionId}
                    className="flex items-center justify-between p-2 bg-muted rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium">{pos.symbol}</p>
                      <p className="text-xs text-red-500">
                        Loss: ₹{Math.abs(pos.unrealizedPnL).toFixed(2)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => closePosition(pos.positionId)}
                    >
                      Close
                    </Button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Auto-Close Info */}
        {riskStatus.shouldAutoClose && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Auto-Close Active</AlertTitle>
            <AlertDescription>
              Positions will be automatically closed when loss exceeds {(thresholds?.autoCloseThreshold || 0.8) * 100}% of available funds.
            </AlertDescription>
          </Alert>
        )}

        {lastChecked && (
          <p className="text-xs text-muted-foreground text-center">
            Last checked: {lastChecked.toLocaleTimeString()}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function RiskSettingsDialog({ thresholds }: { thresholds?: RiskThresholds }) {
  const [warningThreshold, setWarningThreshold] = useState(
    (thresholds?.warningThreshold || 0.75) * 100
  )
  const [autoCloseThreshold, setAutoCloseThreshold] = useState(
    (thresholds?.autoCloseThreshold || 0.8) * 100
  )

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Settings className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Risk Monitoring Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Warning Threshold (%)</Label>
            <Input
              type="number"
              min="0"
              max="100"
              value={warningThreshold}
              onChange={(e) => setWarningThreshold(normalizeRiskMonitorThresholdPercentInput(e.target.value, 80))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Show warning when loss exceeds this % of available funds
            </p>
          </div>
          <div>
            <Label>Auto-Close Threshold (%)</Label>
            <Input
              type="number"
              min="0"
              max="100"
              value={autoCloseThreshold}
              onChange={(e) => setAutoCloseThreshold(normalizeRiskMonitorThresholdPercentInput(e.target.value, 90))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Auto-close positions when loss exceeds this % of available funds
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Note: Settings are stored locally in your browser
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
