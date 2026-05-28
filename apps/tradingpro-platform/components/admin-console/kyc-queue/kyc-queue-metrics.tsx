/**
 * @file kyc-queue-metrics.tsx
 * @module admin-console/kyc-queue
 * @description Compact stat cards for KYC queue summary plus CRM callback radar when permitted.
 * @author StockTrade
 * @created 2026-04-07
 * @updated 2026-04-07
 */

"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Phone } from "lucide-react"
import type { KycQueueMeta } from "./kyc-types"
import { formatDateTime } from "./kyc-types"

export function KycQueueMetrics({
  statusCounts,
  meta,
}: {
  statusCounts: Record<string, number>
  meta: KycQueueMeta | null
}) {
  const radar = meta?.crmCallbackRadar
  return (
    <div className="space-y-2">
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      <Card className="bg-card border-border shadow-sm neon-border">
        <CardContent className="p-2 sm:p-3">
          <p className="text-[10px] sm:text-xs text-muted-foreground">Pending</p>
          <p className="text-lg sm:text-xl font-bold text-yellow-400 tabular-nums">{statusCounts.PENDING || 0}</p>
        </CardContent>
      </Card>
      <Card className="bg-card border-border shadow-sm neon-border">
        <CardContent className="p-2 sm:p-3">
          <p className="text-[10px] sm:text-xs text-muted-foreground">Approved</p>
          <p className="text-lg sm:text-xl font-bold text-green-400 tabular-nums">{statusCounts.APPROVED || 0}</p>
        </CardContent>
      </Card>
      <Card className="bg-card border-border shadow-sm neon-border">
        <CardContent className="p-2 sm:p-3">
          <p className="text-[10px] sm:text-xs text-muted-foreground">Rejected</p>
          <p className="text-lg sm:text-xl font-bold text-red-400 tabular-nums">{statusCounts.REJECTED || 0}</p>
        </CardContent>
      </Card>
      <Card className="bg-card border-border shadow-sm neon-border">
        <CardContent className="p-2 sm:p-3">
          <p className="text-[10px] sm:text-xs text-muted-foreground">AML flagged</p>
          <p className="text-lg sm:text-xl font-bold text-yellow-400 tabular-nums">{meta?.flaggedCount ?? 0}</p>
        </CardContent>
      </Card>
      <Card className="bg-card border-border shadow-sm neon-border">
        <CardContent className="p-2 sm:p-3">
          <p className="text-[10px] sm:text-xs text-muted-foreground">Suspicious</p>
          <p className="text-lg sm:text-xl font-bold text-orange-400 tabular-nums">{meta?.suspiciousCount ?? 0}</p>
        </CardContent>
      </Card>
      <Card className="bg-card border-border shadow-sm neon-border">
        <CardContent className="p-2 sm:p-3">
          <p className="text-[10px] sm:text-xs text-muted-foreground">Overdue SLA</p>
          <p className="text-lg sm:text-xl font-bold text-orange-400 tabular-nums">{meta?.overdueCount ?? 0}</p>
        </CardContent>
      </Card>
    </div>
    {radar ? (
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <Card className="bg-muted/30 border-border/80 shadow-sm sm:col-span-1">
          <CardContent className="p-2 sm:p-3 flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary shrink-0" aria-hidden />
            <div>
              <p className="text-[10px] uppercase text-muted-foreground tracking-wide">CRM callbacks</p>
              <p className="text-[10px] text-muted-foreground">
                As of {formatDateTime(radar.observedAt)} <span className="whitespace-nowrap">(IST labels in drawer)</span>
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border shadow-sm neon-border">
          <CardContent className="p-2 sm:p-3">
            <p className="text-[10px] sm:text-xs text-muted-foreground">CRM overdue</p>
            <p className="text-lg sm:text-xl font-bold text-red-400 tabular-nums">{radar.overdue}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border shadow-sm neon-border">
          <CardContent className="p-2 sm:p-3">
            <p className="text-[10px] sm:text-xs text-muted-foreground">Due in 1h</p>
            <p className="text-lg sm:text-xl font-bold text-amber-400 tabular-nums">{radar.dueInHour}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border shadow-sm neon-border">
          <CardContent className="p-2 sm:p-3">
            <p className="text-[10px] sm:text-xs text-muted-foreground">Due today (IST)</p>
            <p className="text-lg sm:text-xl font-bold text-sky-400 tabular-nums">{radar.dueToday}</p>
          </CardContent>
        </Card>
      </div>
    ) : null}
    </div>
  )
}
