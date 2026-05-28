/**
 * @file kyc-detail-dialog.tsx
 * @module admin-console/kyc-queue
 * @description Full KYC compliance review dialog (assignment, AML, approve/reject) — unchanged behavior from legacy monolith.
 * @author StockTrade
 * @created 2026-04-07
 */

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AlertTriangle, CheckCircle, FileSearch, ShieldOff, User } from "lucide-react"
import { StatusBadge } from "@/components/admin-console/shared"
import { normalizeAmlFlags } from "@/lib/admin/kyc-utils"
import { useAdminTradingPresenceStream } from "@/lib/hooks/use-admin-trading-presence-sse"
import { toast } from "@/hooks/use-toast"
import { buildRouteWithQuery, getAdminConsoleRoute } from "@/lib/branding-routes"
import {
  AML_STATUS_OPTIONS,
  formatDateTime,
  maskAadhaar,
  SUSPICIOUS_STATUS_OPTIONS,
  UNASSIGNED_ASSIGNEE_VALUE,
  type KycApplication,
  type KycAssignee,
  type KycRelatedUserBrief,
  type KycReviewLog,
} from "./kyc-types"

export type KycDetailDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  kycId: string
  assignees: KycAssignee[]
  onUpdated: () => void
}

export function KycDetailDialog({ open, onOpenChange, kycId, assignees, onUpdated }: KycDetailDialogProps) {
  const [kyc, setKyc] = useState<KycApplication | null>(null)
  const [relatedUsers, setRelatedUsers] = useState<KycRelatedUserBrief[]>([])
  const [reviewLogs, setReviewLogs] = useState<KycReviewLog[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const detailFetchAbortRef = useRef<AbortController | null>(null)

  const [assignedToId, setAssignedToId] = useState<string>(UNASSIGNED_ASSIGNEE_VALUE)
  const [slaDueAt, setSlaDueAt] = useState<string>("")
  const [amlStatus, setAmlStatus] = useState("PENDING")
  const [amlFlagsInput, setAmlFlagsInput] = useState("")
  const [amlFlags, setAmlFlags] = useState<string[]>([])
  const [suspiciousStatus, setSuspiciousStatus] = useState("NONE")
  const [note, setNote] = useState("")
  const [rejectReason, setRejectReason] = useState("")

  const detailApplicantId = kyc?.user?.id ?? ""
  const detailLivePresence = useAdminTradingPresenceStream(
    detailApplicantId ? [detailApplicantId] : [],
    open && Boolean(detailApplicantId),
  )

  const loadDetail = useCallback(async () => {
    if (!kycId) return
    detailFetchAbortRef.current?.abort()
    const ac = new AbortController()
    detailFetchAbortRef.current = ac
    setLoading(true)
    setError(null)
    setKyc(null)
    setRelatedUsers([])

    try {
      const response = await fetch(`/api/admin/kyc/${kycId}`, { signal: ac.signal })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error || "Failed to load KYC detail")
      }

      const data = await response.json()
      const record = data.kyc as KycApplication & { reviewLogs?: KycReviewLog[] }
      const related = (data.relatedUsers || []) as KycRelatedUserBrief[]
      setKyc(record)
      setRelatedUsers(related)
      setReviewLogs(record.reviewLogs || [])
      setAssignedToId(record.assignedToId || UNASSIGNED_ASSIGNEE_VALUE)
      setSlaDueAt(record.slaDueAt ? record.slaDueAt.slice(0, 16) : "")
      setAmlStatus(record.amlStatus)
      setAmlFlags(record.amlFlags || [])
      setSuspiciousStatus(record.suspiciousStatus)
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return
      }
      const message = err instanceof Error ? err.message : "Failed to load KYC detail"
      setError(message)
    } finally {
      if (!ac.signal.aborted) {
        setLoading(false)
      }
    }
  }, [kycId])

  useEffect(() => {
    if (open) {
      void loadDetail()
    } else {
      detailFetchAbortRef.current?.abort()
      setLoading(false)
    }
    return () => {
      detailFetchAbortRef.current?.abort()
    }
  }, [open, loadDetail])

  const updateMetadata = async (payload: Record<string, unknown>, action: string, actionNote?: string) => {
    setSaving(true)
    setError(null)

    try {
      const response = await fetch("/api/admin/kyc", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kycId,
          action,
          note: actionNote || note || undefined,
          ...payload,
        }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || "Failed to update KYC")
      }
      toast({ title: "KYC updated", description: "Changes saved successfully." })
      setNote("")
      await loadDetail()
      onUpdated()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update KYC"
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (status: "APPROVED" | "REJECTED") => {
    setSaving(true)
    setError(null)

    try {
      const response = await fetch("/api/admin/kyc", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kycId,
          status,
          reason: status === "REJECTED" ? rejectReason : undefined,
        }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || "Failed to update status")
      }
      toast({ title: `KYC ${status.toLowerCase()}`, description: "Status updated successfully." })
      setRejectReason("")
      await loadDetail()
      onUpdated()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update status"
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const addFlag = () => {
    const updated = normalizeAmlFlags([...amlFlags, amlFlagsInput])
    setAmlFlags(updated)
    setAmlFlagsInput("")
  }

  if (!kyc) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>KYC Review</DialogTitle>
            <DialogDescription>Loading KYC record...</DialogDescription>
          </DialogHeader>
          {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[98vw] max-w-[1600px] h-[92vh] p-0 overflow-hidden flex flex-col gap-0">
        <DialogHeader className="border-b border-border px-6 py-4 shrink-0 bg-background z-10">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>KYC Review</DialogTitle>
              <DialogDescription>Review documents and manage verification status.</DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={kyc.status} type="kyc" />
              <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
                <span className="sr-only">Close</span>
                <span aria-hidden="true" className="text-xl">
                  &times;
                </span>
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          <div className="w-full lg:w-5/12 xl:w-4/12 border-b lg:border-b-0 lg:border-r border-border bg-muted/10 overflow-y-auto">
            <div className="p-6 space-y-6">
              <Card className="border-border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    Applicant Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Name</p>
                    <p className="font-medium text-base flex items-center gap-2 flex-wrap">
                      {(() => {
                        const live = detailLivePresence[kyc.user.id]
                        const on = live !== undefined ? live : Boolean(kyc.user.isTradingDashboardOnline)
                        return on ? (
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.85)] ring-2 ring-green-500/35"
                            aria-label="Trading dashboard online"
                            title="On trading dashboard (live SSE connection)"
                          />
                        ) : null
                      })()}
                      {kyc.user.name || "Unknown"}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Client ID</p>
                      <p className="font-medium">{kyc.user.clientId || kyc.user.id}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Email</p>
                      <p className="font-medium truncate" title={kyc.user.email || ""}>
                        {kyc.user.email || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Aadhaar</p>
                      <p className="font-medium font-mono">{maskAadhaar(kyc.aadhaarNumber)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">PAN</p>
                      <p className="font-medium font-mono">{kyc.panNumber}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Submitted</p>
                      <p className="text-muted-foreground">{formatDateTime(kyc.submittedAt)}</p>
                    </div>
                    {kyc.approvedAt ? (
                      <div>
                        <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Approved</p>
                        <p className="text-muted-foreground">{formatDateTime(kyc.approvedAt)}</p>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 flex-wrap pt-1">
                    <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
                      <Link
                        href={buildRouteWithQuery(getAdminConsoleRoute("users"), {
                          userId: kyc.user.id,
                          contactDuplicate: "1",
                        })}
                      >
                        Open in User Management
                      </Link>
                    </Button>
                    <Button variant="secondary" size="sm" asChild className="w-full sm:w-auto">
                      <Link
                        href={buildRouteWithQuery(getAdminConsoleRoute("kyc"), { relatedContactOverlap: "1" })}
                      >
                        Show all overlap applicants
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {relatedUsers.length > 0 ? (
                <Alert className="border-amber-500/40 bg-amber-500/5">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertTitle>Related accounts (normalized email / mobile)</AlertTitle>
                  <AlertDescription className="text-sm space-y-2 mt-2">
                    <p className="text-muted-foreground">
                      Other client IDs sharing the same normalized email or the same last-10 phone digits (within your
                      visibility rules).
                    </p>
                    <ul className="list-disc pl-4 space-y-1">
                      {relatedUsers.map((r) => (
                        <li key={r.id}>
                          <Link
                            href={buildRouteWithQuery(getAdminConsoleRoute("users"), {
                              userId: r.id,
                              contactDuplicate: "1",
                            })}
                            className="text-primary underline-offset-2 hover:underline font-medium"
                          >
                            {r.clientId || r.id}
                          </Link>
                          <span className="text-muted-foreground">
                            {" "}
                            — {r.name || "Unknown"} · KYC {r.kycStatus}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}

              <Card className="border-border shadow-sm h-full flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <FileSearch className="h-4 w-4 text-muted-foreground" />
                    Bank Proof
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col items-center justify-center min-h-[200px] bg-muted/20 rounded-b-lg p-6 border-t border-border border-dashed">
                  {kyc.bankProofUrl ? (
                    <div className="text-center space-y-4 w-full">
                      <div className="relative w-full aspect-video bg-background rounded-lg border border-border flex items-center justify-center overflow-hidden group">
                        <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                          <FileSearch className="h-12 w-12 text-muted-foreground/50" />
                        </div>
                        <a
                          href={kyc.bankProofUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors"
                        >
                          <span className="sr-only">Open</span>
                        </a>
                      </div>
                      <div>
                        <a
                          href={kyc.bankProofUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
                        >
                          Open Document in New Tab
                        </a>
                        <p className="text-xs text-muted-foreground mt-2">If link expired, reopen dialog to refresh.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <ShieldOff className="h-10 w-10 mx-auto mb-2 opacity-20" />
                      <p>No document uploaded</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="w-full lg:w-7/12 xl:w-8/12 overflow-y-auto bg-background">
            <div className="p-6 max-w-4xl mx-auto space-y-6">
              {error ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-border shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Assignment</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Assignee</Label>
                      <Select value={assignedToId} onValueChange={setAssignedToId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNASSIGNED_ASSIGNEE_VALUE}>Unassigned</SelectItem>
                          {assignees.map((assignee) => (
                            <SelectItem key={assignee.id} value={assignee.id}>
                              {assignee.name || assignee.email || assignee.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">SLA Deadline</Label>
                      <Input type="datetime-local" value={slaDueAt} onChange={(e) => setSlaDueAt(e.target.value)} />
                    </div>
                    <Button
                      onClick={() => {
                        const normalizedAssignedToId =
                          assignedToId === UNASSIGNED_ASSIGNEE_VALUE ? null : assignedToId
                        return updateMetadata(
                          { assignedToId: normalizedAssignedToId, slaDueAt: slaDueAt || null },
                          normalizedAssignedToId ? "ASSIGNED" : "UNASSIGNED",
                        )
                      }}
                      disabled={saving}
                      variant="secondary"
                      className="w-full"
                    >
                      {saving ? "Saving..." : "Update Assignment"}
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-border shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Risk Assessment</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs">AML Status</Label>
                        <Select value={amlStatus} onValueChange={setAmlStatus}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AML_STATUS_OPTIONS.filter((o) => o !== "ALL").map((o) => (
                              <SelectItem key={o} value={o}>
                                {o}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Suspicious</Label>
                        <Select value={suspiciousStatus} onValueChange={setSuspiciousStatus}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SUSPICIOUS_STATUS_OPTIONS.filter((o) => o !== "ALL").map((o) => (
                              <SelectItem key={o} value={o}>
                                {o}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">AML Flags</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Flag (e.g. PEP)"
                          value={amlFlagsInput}
                          onChange={(e) => setAmlFlagsInput(e.target.value)}
                          className="h-9"
                        />
                        <Button variant="outline" size="sm" onClick={addFlag} disabled={!amlFlagsInput.trim()}>
                          Add
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 min-h-[24px]">
                        {amlFlags.length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">No flags</span>
                        ) : null}
                        {amlFlags.map((flag) => (
                          <Badge key={flag} variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                            {flag}
                            <button
                              type="button"
                              onClick={() => setAmlFlags(amlFlags.filter((item) => item !== flag))}
                              className="ml-1.5 hover:text-red-500"
                            >
                              &times;
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <Button
                      onClick={() => updateMetadata({ amlStatus, amlFlags, suspiciousStatus }, "AML_UPDATED")}
                      disabled={saving}
                      variant="secondary"
                      className="w-full"
                    >
                      {saving ? "Saving..." : "Update Risk Profile"}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-border shadow-sm bg-muted/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">Decision & Notes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Internal Notes</Label>
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Add internal notes about this review..."
                      rows={2}
                      className="resize-none"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateMetadata({}, "NOTE_ADDED", note)}
                        disabled={saving || !note.trim()}
                      >
                        Save Note Only
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border">
                    <Label>Rejection Reason (Required for Reject)</Label>
                    <Textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Explain why the KYC is being rejected..."
                      rows={2}
                      className="resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <Button
                      variant="destructive"
                      onClick={() => updateStatus("REJECTED")}
                      disabled={saving || !rejectReason.trim()}
                      className="w-full"
                    >
                      <ShieldOff className="w-4 h-4 mr-2" />
                      Reject Application
                    </Button>
                    <Button
                      className="bg-green-600 hover:bg-green-700 text-white w-full"
                      onClick={() => updateStatus("APPROVED")}
                      disabled={saving}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve Application
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Review History</h3>
                <div className="space-y-3 pl-2 border-l-2 border-border">
                  {reviewLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground pl-2">No history logged.</p>
                  ) : (
                    reviewLogs.map((log) => (
                      <div key={log.id} className="relative pl-4 pb-1">
                        <div className="absolute -left-[9px] top-1.5 h-4 w-4 rounded-full border-2 border-background bg-muted-foreground/20" />
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                          <p className="text-sm font-medium">{log.action.replace(/_/g, " ")}</p>
                          <span className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                            {log.reviewer?.name || "System"}
                          </Badge>
                          {log.note ? <span className="text-sm text-muted-foreground">&quot;{log.note}&quot;</span> : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
