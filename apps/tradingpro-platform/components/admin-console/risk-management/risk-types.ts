/**
 * @file risk-types.ts
 * @module admin-console/risk-management
 * @description Shared TypeScript interfaces for the Risk Management admin tab
 */

export interface RiskLimit {
  id: string
  userId: string
  userName: string
  maxDailyLoss: number
  maxPositionSize: number
  maxLeverage: number
  maxDailyTrades: number
  status: "ACTIVE" | "SUSPENDED" | "WARNING"
  lastUpdated: Date
  /** Per-user threshold overrides — null means "use global default" */
  riskLevelLowPct: number | null
  riskLevelMediumPct: number | null
  riskLevelHighPct: number | null
  autoCloseLevelPct: number | null
  maxDailyLossInr: number | null
}

export interface RiskAlert {
  id: string
  userId: string
  userName: string
  type: "LIMIT_EXCEEDED" | "LARGE_LOSS" | "UNUSUAL_ACTIVITY" | "MARGIN_CALL"
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  message: string
  timestamp: Date
  resolved: boolean
}

export interface RiskConfig {
  id: string
  segment: string
  productType: string
  leverage: number
  brokerageFlat: number | null
  brokerageRate: number | null
  brokerageCap: number | null
  marginRate: number | null
  /** INR floor per lot when writing CE/PE (SELL); null = no floor */
  minMarginPerLot: number | null
  maxOrderValue: number | null
  maxPositions: number | null
  active: boolean
  createdAt: Date
  updatedAt: Date
}

export type RiskThresholdSource = "system_settings" | "env" | "default"

export interface RiskThresholds {
  warningThreshold: number
  autoCloseThreshold: number
  source: RiskThresholdSource
}

export interface PositionPnLWorkerHeartbeat {
  stopLossAutoClosed?: number
  targetAutoClosed?: number
  riskAutoClosed?: number
  riskAlertsCreated?: number
  riskWarningThreshold?: number
  riskAutoCloseThreshold?: number
  riskThresholdSource?: string
}

export interface ProcessPositionPnLResult {
  success: boolean
  scanned: number
  updated: number
  skipped: number
  errors: number
  elapsedMs: number
  heartbeat?: PositionPnLWorkerHeartbeat
}

export interface RiskBackstopRunResult {
  success: boolean
  skipped: boolean
  skippedReason?: string
  pnlWorkerHealth: string
  pnlWorkerLastRunAtIso: string | null
  elapsedMs: number
  result?: unknown
}

export interface RiskBackstopApiResponse {
  success: boolean
  thresholds: RiskThresholds
  result: RiskBackstopRunResult
}

export type ExposureRowPnlMode = "live" | "worker" | "db" | "legacy" | "unpriced"

export interface ExposurePreviewRow {
  tradingAccountId: string
  userId: string
  userName: string
  clientId: string | null
  totalFunds: number
  totalUnrealizedPnL: number
  lossUtilizationPercent: number
  openPositions: number
  wouldWarn: boolean
  wouldAutoClose: boolean
  skipReasons: string[]
  /** Worst-source P&L mode across all positions for this account. */
  pnlMode: ExposureRowPnlMode
}

export interface ExposurePreviewResponse {
  success: boolean
  generatedAt: string
  note?: string
  thresholds: RiskThresholds
  rows: ExposurePreviewRow[]
}

export function isProcessPositionPnLResult(v: unknown): v is ProcessPositionPnLResult {
  if (!v || typeof v !== "object") return false
  const anyV = v as Record<string, unknown>
  return (
    typeof anyV.success === "boolean" &&
    typeof anyV.scanned === "number" &&
    typeof anyV.updated === "number" &&
    typeof anyV.skipped === "number" &&
    typeof anyV.errors === "number" &&
    typeof anyV.elapsedMs === "number"
  )
}
