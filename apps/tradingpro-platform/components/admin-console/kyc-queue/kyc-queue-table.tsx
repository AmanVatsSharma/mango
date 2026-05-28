/**
 * @file kyc-queue-table.tsx
 * @module admin-console/kyc-queue
 * @description Scrollable KYC applications table with CRM row affordance and compliance review action.
 * @author StockTrade
 * @created 2026-04-07
 * @updated 2026-04-07
 */

"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Building2, FileSearch } from "lucide-react"
import { StatusBadge, Pagination } from "@/components/admin-console/shared"
import { getSlaState } from "@/lib/admin/kyc-utils"
import { cn } from "@/lib/utils"
import {
  formatDateTime,
  lifecycleSegmentBadgeClassName,
  lifecycleSegmentDescription,
  lifecycleSegmentShortLabel,
  type KycApplication,
} from "./kyc-types"

export function KycQueueTable({
  items,
  loading,
  livePresence,
  crmHighlightId,
  page,
  totalPages,
  onPageChange,
  onOpenCrm,
  onOpenReview,
}: {
  items: KycApplication[]
  loading: boolean
  livePresence: Record<string, boolean>
  crmHighlightId: string | null
  page: number
  totalPages: number
  onPageChange: (p: number) => void
  onOpenCrm: (item: KycApplication) => void
  onOpenReview: (item: KycApplication) => void
}) {
  return (
    <Card className="bg-card border-border shadow-sm neon-border">
      <CardHeader className="px-3 sm:px-4 py-2 sm:py-3 border-b border-border/60">
        <CardTitle className="text-sm sm:text-base font-semibold text-primary flex items-center gap-2">
          <FileSearch className="h-4 w-4 shrink-0" />
          Applications
          <span className="text-muted-foreground font-normal text-xs">({items.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-2 sm:pb-3 pt-0">
        <div className="max-h-[min(70vh,560px)] overflow-auto border-y border-border/40">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap h-9">
                  Applicant
                </TableHead>
                <TableHead className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap h-9">
                  Pipeline
                </TableHead>
                <TableHead className="text-[10px] sm:text-xs text-muted-foreground">Status</TableHead>
                <TableHead className="text-[10px] sm:text-xs text-muted-foreground">AML</TableHead>
                <TableHead className="text-[10px] sm:text-xs text-muted-foreground">Risk</TableHead>
                <TableHead className="text-[10px] sm:text-xs text-muted-foreground">Assigned</TableHead>
                <TableHead className="text-[10px] sm:text-xs text-muted-foreground">SLA</TableHead>
                <TableHead className="text-[10px] sm:text-xs text-muted-foreground">Submitted</TableHead>
                <TableHead className="text-[10px] sm:text-xs text-muted-foreground text-right pr-3">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground text-sm py-8">
                    Loading applications…
                  </TableCell>
                </TableRow>
              ) : null}
              {!loading && items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground text-sm py-8">
                    No KYC applications found
                  </TableCell>
                </TableRow>
              ) : null}
              {!loading &&
                items.map((item) => {
                  const slaState = getSlaState(item.slaDueAt, item.status)
                  const dup = Boolean(item.user.hasRelatedContactOverlap)
                  const crmHint = item.user.crmTaskHint
                  const rowActive = crmHighlightId === item.id
                  const pipeClass = lifecycleSegmentBadgeClassName(item.user.lifecycleSegment)
                  return (
                    <TableRow
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpenCrm(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          onOpenCrm(item)
                        }
                      }}
                      className={cn(
                        "border-border cursor-pointer transition-colors",
                        rowActive && "bg-primary/5 ring-1 ring-inset ring-primary/20",
                      )}
                    >
                      <TableCell className="align-top py-2">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground text-sm flex items-center gap-1.5 flex-wrap">
                            {(() => {
                              const live = livePresence[item.user.id]
                              const on = live !== undefined ? live : Boolean(item.user.isTradingDashboardOnline)
                              return on ? (
                                <span
                                  className="inline-block h-2 w-2 shrink-0 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.85)] ring-2 ring-green-500/35"
                                  aria-label="Trading dashboard online"
                                  title="On trading dashboard"
                                />
                              ) : null
                            })()}
                            <span className="truncate max-w-[140px] sm:max-w-[180px]">{item.user.name || "—"}</span>
                            {dup ? (
                              <Badge variant="outline" className="text-[9px] border-amber-500/50 text-amber-600 px-1">
                                Dup
                              </Badge>
                            ) : null}
                            {crmHint && crmHint.overdueCount > 0 ? (
                              <Badge
                                variant="outline"
                                className="text-[9px] border-red-400/50 text-red-500 px-1"
                                title={`${crmHint.overdueCount} open task(s) past due`}
                              >
                                CRM overdue
                              </Badge>
                            ) : null}
                            {crmHint && crmHint.overdueCount === 0 && crmHint.nextDueAt ? (
                              <Badge
                                variant="outline"
                                className="text-[9px] border-sky-500/40 text-sky-600 px-1"
                                title={`Next open task due ${formatDateTime(crmHint.nextDueAt)}`}
                              >
                                Callback
                              </Badge>
                            ) : null}
                          </p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground font-mono truncate">
                            {item.user.clientId || item.user.id.slice(0, 8)}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">{item.user.email || "—"}</p>
                        </div>
                      </TableCell>
                      <TableCell className="align-top py-2">
                        <Badge
                          variant="outline"
                          className={cn("text-[9px] px-1.5 font-medium", pipeClass)}
                          title={lifecycleSegmentDescription(item.user.lifecycleSegment)}
                        >
                          {lifecycleSegmentShortLabel(item.user.lifecycleSegment)}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top py-2">
                        <StatusBadge status={item.status} type="kyc" />
                      </TableCell>
                      <TableCell className="align-top py-2">
                        <div className="flex flex-col gap-0.5">
                          <StatusBadge status={item.amlStatus} type="risk" />
                          {item.amlFlags?.length > 0 ? (
                            <span className="text-[10px] text-muted-foreground">{item.amlFlags.length} flag(s)</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="align-top py-2">
                        <StatusBadge status={item.suspiciousStatus} type="risk" />
                      </TableCell>
                      <TableCell className="align-top py-2 text-xs max-w-[100px] truncate">
                        {item.assignedTo?.name || item.assignedTo?.email || "—"}
                      </TableCell>
                      <TableCell className="align-top py-2">
                        <div className="text-[10px] sm:text-xs space-y-0.5">
                          <span className="whitespace-nowrap">{formatDateTime(item.slaDueAt)}</span>
                          {slaState === "OVERDUE" ? (
                            <Badge className="text-[9px] px-1 py-0 bg-red-400/15 text-red-500 border-red-400/25">
                              Overdue
                            </Badge>
                          ) : null}
                          {slaState === "DUE_SOON" ? (
                            <Badge className="text-[9px] px-1 py-0 bg-yellow-400/15 text-yellow-600 border-yellow-400/25">
                              Soon
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="align-top py-2 text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(item.submittedAt)}
                      </TableCell>
                      <TableCell className="align-top py-2 text-right pr-2">
                        <div className="flex flex-col sm:flex-row gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] px-2 gap-0.5"
                            onClick={() => onOpenCrm(item)}
                          >
                            <Building2 className="h-3 w-3" />
                            CRM
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            className="h-7 text-[10px] px-2"
                            onClick={() => onOpenReview(item)}
                          >
                            Review
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
            </TableBody>
          </Table>
        </div>
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={onPageChange} loading={loading} />
      </CardContent>
    </Card>
  )
}
