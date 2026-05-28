/**
 * File:        components/admin-console/risk-management/audit-history-tab.tsx
 * Module:      Admin Console · Risk Management · Audit History
 * Purpose:     Paginated table of risk audit events (liquidations, margin overrides, etc.)
 *              with IST timestamps, operator/target user info, and event type display.
 *
 * Exports:
 *   - AuditHistoryTab — client component; fetches and renders risk audit event log
 *
 * Depends on:
 *   - @/lib/utils/format-ist             — IST date/time formatting
 *   - /api/admin/risk/audit-events       — paginated risk audit event list
 *
 * Side-effects:
 *   - HTTP GET /api/admin/risk/audit-events on mount
 *
 * Key invariants:
 *   - Events are newest-first (API returns DESC order by createdAt)
 *   - Empty state is shown when there are no audit events
 *
 * Read order:
 *   1. AuditHistoryTab — state + fetch
 *   2. render — table body with IST formatted timestamps
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ClipboardList } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { formatIstDateTime } from "@/lib/utils/format-ist"
import type { RiskAuditEventRow } from "@/app/api/admin/risk/audit-events/route"

const EVENT_TYPE_LABELS: Record<string, string> = {
  BULK_LIQUIDATE: "Bulk Liquidate",
  MARGIN_OVERRIDE: "Margin Override",
  FORCED_CLOSE: "Forced Close",
  SEGMENT_BLOCK: "Segment Block",
  OTHER: "Other",
}

const EVENT_TYPE_BADGE: Record<string, string> = {
  BULK_LIQUIDATE: "bg-red-500/10 text-red-400 border-red-500/30",
  MARGIN_OVERRIDE: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  FORCED_CLOSE: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  SEGMENT_BLOCK: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  OTHER: "bg-muted/40 text-muted-foreground border-border",
}

async function fetchAuditEvents(): Promise<{ events: RiskAuditEventRow[]; total: number }> {
  const res = await fetch("/api/admin/risk/audit-events?limit=100", { credentials: "include" })
  if (!res.ok) {
    let errBody: { error?: string } = {}
    try { errBody = (await res.json()) as { error?: string } } catch { /* ignore parse failure */ }
    throw new Error(errBody.error ?? "Failed to load audit events")
  }
  const data = (await res.json()) as { events: RiskAuditEventRow[]; total: number }
  return data
}

export function AuditHistoryTab() {
  const [events, setEvents] = useState<RiskAuditEventRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const { events: rows } = await fetchAuditEvents()
        setEvents(rows)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load audit events"
        toast({ title: "Error", description: message, variant: "destructive" })
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-primary">Risk Audit History</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Last 100 risk actions — liquidations, overrides, forced closes, and segment blocks.
        </p>
      </div>

      <Card className="bg-card border-border shadow-sm neon-border">
        <CardContent className="px-0 pb-0 pt-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead>Event Type</TableHead>
                      <TableHead>Target User</TableHead>
                      <TableHead>Operator</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Created At (IST)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-16">
                          <div className="flex flex-col items-center gap-3 text-muted-foreground">
                            <ClipboardList className="w-10 h-10 opacity-30" />
                            <p className="text-sm">No audit events yet.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      events.map((event) => (
                        <TableRow key={event.id} className="border-border hover:bg-muted/20">
                          <TableCell>
                            <Badge
                              className={`text-xs border ${EVENT_TYPE_BADGE[event.eventType] ?? EVENT_TYPE_BADGE.OTHER}`}
                            >
                              {EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {event.targetUserName ?? "—"}
                              </p>
                              <p className="text-xs text-muted-foreground font-mono">
                                {event.targetUserId.slice(0, 8)}…
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm text-foreground">
                              {event.operatorUserName ?? "—"}
                            </p>
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            <p className="text-sm text-muted-foreground line-clamp-2 break-words">
                              {event.reason || "—"}
                            </p>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatIstDateTime(event.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
