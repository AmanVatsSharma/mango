/**
 * File:        components/admin-v2/observability/index.ts
 * Module:      admin-v2/observability
 * Purpose:     Barrel — public surface of the observability module.
 *
 * Exports:
 *   - ObservabilityWorkbench          — main dashboard component
 *   - useSystemHealth, useMarketDataHealth, useQueueStatus, useQuotesBatcherStatus  — hooks
 *   - SystemHealthResp, MarketDataHealthResp, QueueStatusResp, ServiceStatus — types
 *
 * Side-effects: none.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

export { ObservabilityWorkbench } from "./observability-workbench"
export { useSystemHealth, useMarketDataHealth, useQueueStatus, useQuotesBatcherStatus } from "./hooks"
export type {
  SystemHealthResp,
  MarketDataHealthResp,
  QueueStatusResp,
  QuotesBatcherStatusResp,
  ServiceStatus,
  ServiceStatusKind,
  MetricStatus,
  Signal,
} from "./types"
