/**
 * @file referrals-activity-panel.tsx
 * @module components/admin-console/referrals
 * @description Attributions and rewards tables with pagination, search, status filter, cancel dialog.
 * @author StockTrade
 * @created 2026-04-03
 */

"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import {
  readReferralAdminApiError,
  rewardStatusLabel,
  KYC_STATUS_HINT,
} from "@/components/admin-console/referrals/referrals-shared"

const REWARD_STATUSES = ["", "PENDING", "ELIGIBLE", "PAID", "CANCELLED", "FROZEN"] as const

type ListPayload = { rows: unknown[]; total: number; page: number; limit: number }

export type ReferralsActivityPanelProps = {
  canManage: boolean
  /** Refresh summary KPIs after ledger mutation */
  onLedgerMutated: () => void
}

export function ReferralsActivityPanel({ canManage, onLedgerMutated }: ReferralsActivityPanelProps) {
  const { toast } = useToast()
  const [attrData, setAttrData] = useState<ListPayload | null>(null)
  const [rewData, setRewData] = useState<ListPayload | null>(null)
  const [attrLoading, setAttrLoading] = useState(false)
  const [rewLoading, setRewLoading] = useState(false)

  const [attrPage, setAttrPage] = useState(1)
  const [attrLimit, setAttrLimit] = useState(20)
  const [attrSearchDraft, setAttrSearchDraft] = useState("")
  const [attrSearch, setAttrSearch] = useState("")

  const [rewPage, setRewPage] = useState(1)
  const [rewLimit, setRewLimit] = useState(20)
  const [rewStatus, setRewStatus] = useState<string>("")
  const [rewSearchDraft, setRewSearchDraft] = useState("")
  const [rewSearch, setRewSearch] = useState("")

  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelRewardId, setCancelRewardId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState("")

  const fetchAttributions = useCallback(async () => {
    setAttrLoading(true)
    try {
      const sp = new URLSearchParams({
        page: String(attrPage),
        limit: String(attrLimit),
      })
      if (attrSearch.trim()) sp.set("search", attrSearch.trim())
      const res = await fetch(`/api/admin/referrals/attributions?${sp}`, { credentials: "include" })
      if (!res.ok) throw new Error(await readReferralAdminApiError(res))
      const j = await res.json()
      setAttrData(j.data)
    } catch (e) {
      toast({
        title: "Could not load relationships",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setAttrLoading(false)
    }
  }, [attrPage, attrLimit, attrSearch, toast])

  const fetchRewards = useCallback(async () => {
    setRewLoading(true)
    try {
      const sp = new URLSearchParams({
        page: String(rewPage),
        limit: String(rewLimit),
      })
      if (rewStatus) sp.set("status", rewStatus)
      if (rewSearch.trim()) sp.set("search", rewSearch.trim())
      const res = await fetch(`/api/admin/referrals/rewards?${sp}`, { credentials: "include" })
      if (!res.ok) throw new Error(await readReferralAdminApiError(res))
      const j = await res.json()
      setRewData(j.data)
    } catch (e) {
      toast({
        title: "Could not load rewards",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setRewLoading(false)
    }
  }, [rewPage, rewLimit, rewStatus, rewSearch, toast])

  useEffect(() => {
    void fetchAttributions()
  }, [fetchAttributions])

  useEffect(() => {
    void fetchRewards()
  }, [fetchRewards])

  const attrTotalPages = attrData
    ? Math.max(1, Math.ceil(attrData.total / (attrData.limit || 1)))
    : 1
  const rewTotalPages = rewData
    ? Math.max(1, Math.ceil(rewData.total / (rewData.limit || 1)))
    : 1

  const openCancel = (rewardId: string) => {
    setCancelRewardId(rewardId)
    setCancelReason("")
    setCancelOpen(true)
  }

  const submitCancel = async () => {
    if (!cancelRewardId || !cancelReason.trim()) {
      toast({ title: "Reason required", variant: "destructive" })
      return
    }
    const res = await fetch(`/api/admin/referrals/rewards/${cancelRewardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ reason: cancelReason.trim() }),
    })
    if (!res.ok) {
      toast({
        title: "Cancel failed",
        description: await readReferralAdminApiError(res),
        variant: "destructive",
      })
      return
    }
    toast({ title: "Reward cancelled" })
    setCancelOpen(false)
    setCancelRewardId(null)
    await fetchRewards()
    onLedgerMutated()
  }

  return (
    <div className="space-y-4">
      <Card className="border-dashed bg-muted/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">How this list works</CardTitle>
          <CardDescription>
            <strong>Qualified ₹</strong> is the sum of the referee&apos;s <strong>COMPLETED</strong> deposits, excluding{" "}
            <code className="rounded bg-muted px-1">admin_credit</code>. Use it to see deposit progress toward milestones.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="relationships" className="w-full">
        <TabsList className="h-auto flex-wrap gap-1">
          <TabsTrigger value="relationships">Who referred whom</TabsTrigger>
          <TabsTrigger value="rewards">Bonuses &amp; payouts</TabsTrigger>
        </TabsList>

        <TabsContent value="relationships" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1 min-w-[200px] flex-1">
              <Label htmlFor="attr-search">Search (client ID or email)</Label>
              <Input
                id="attr-search"
                value={attrSearchDraft}
                onChange={(e) => setAttrSearchDraft(e.target.value)}
                placeholder="Min. 2 characters"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setAttrSearch(attrSearchDraft)
                setAttrPage(1)
              }}
            >
              Apply
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setAttrSearchDraft("")
                setAttrSearch("")
                setAttrPage(1)
              }}
            >
              Clear
            </Button>
            <div className="space-y-1 w-[100px]">
              <Label>Per page</Label>
              <Select
                value={String(attrLimit)}
                onValueChange={(v) => {
                  setAttrLimit(Number(v))
                  setAttrPage(1)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Referral relationships</CardTitle>
              <CardDescription title={KYC_STATUS_HINT}>
                Referee ↔ referrer mapping. KYC shows referee verification state.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {attrLoading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="p-2">Referee</th>
                        <th className="p-2">Referrer</th>
                        <th className="p-2">Qualified ₹</th>
                        <th className="p-2">KYC</th>
                        <th className="p-2">Rewards</th>
                        <th className="p-2">Code</th>
                        <th className="p-2">Linked</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(attrData?.rows ?? []).map((r: any) => {
                        const rc = (r.rewards?.length ?? 0) as number
                        return (
                          <tr key={r.id} className="border-b border-border/50">
                            <td className="p-2">
                              {r.referee?.clientId} · {r.referee?.name || "—"}
                            </td>
                            <td className="p-2">
                              {r.referrer?.clientId} · {r.referrer?.name || "—"}
                            </td>
                            <td className="p-2 tabular-nums">
                              ₹{Number(r.refereeQualifiedDepositTotal ?? 0).toLocaleString("en-IN")}
                            </td>
                            <td className="p-2">{r.refereeKycStatus ?? "—"}</td>
                            <td className="p-2">
                              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{rc}</span>
                              {rc ? (
                                <span className="ml-1 text-xs text-muted-foreground">
                                  {(r.rewards ?? [])
                                    .slice(0, 3)
                                    .map((x: { status: string }) => rewardStatusLabel(x.status))
                                    .join(", ")}
                                </span>
                              ) : null}
                            </td>
                            <td className="p-2">{r.referralLink?.code ?? r.rawCode ?? "—"}</td>
                            <td className="p-2 text-muted-foreground whitespace-nowrap">
                              {new Date(r.createdAt).toLocaleString("en-IN")}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {!attrData?.rows?.length ? (
                    <p className="py-8 text-center text-muted-foreground">No rows match.</p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                    <span>
                      Page {attrPage} of {attrTotalPages} · {attrData?.total ?? 0} total
                    </span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={attrPage <= 1 || attrLoading}
                        onClick={() => setAttrPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={attrPage >= attrTotalPages || attrLoading}
                        onClick={() => setAttrPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rewards" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1 min-w-[160px]">
              <Label>Status</Label>
              <Select
                value={rewStatus || "all"}
                onValueChange={(v) => {
                  setRewStatus(v === "all" ? "" : v)
                  setRewPage(1)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  {REWARD_STATUSES.map((s) => (
                    <SelectItem key={s || "all"} value={s || "all"}>
                      {s ? rewardStatusLabel(s) : "All statuses"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-[200px] flex-1">
              <Label htmlFor="rew-search">Search (client ID or email)</Label>
              <Input
                id="rew-search"
                value={rewSearchDraft}
                onChange={(e) => setRewSearchDraft(e.target.value)}
                placeholder="Beneficiary, referrer, or referee"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setRewSearch(rewSearchDraft)
                setRewPage(1)
              }}
            >
              Apply
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setRewSearchDraft("")
                setRewSearch("")
                setRewStatus("")
                setRewPage(1)
              }}
            >
              Clear
            </Button>
            <div className="space-y-1 w-[100px]">
              <Label>Per page</Label>
              <Select
                value={String(rewLimit)}
                onValueChange={(v) => {
                  setRewLimit(Number(v))
                  setRewPage(1)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Bonus ledger</CardTitle>
              <CardDescription>
                Pending and eligible rows can be cancelled with a reason (audited). Paid rows cannot be reversed here.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {rewLoading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="p-2">Beneficiary</th>
                        <th className="p-2">Amount</th>
                        <th className="p-2">Role</th>
                        <th className="p-2">Status</th>
                        <th className="p-2">Note</th>
                        <th className="p-2 w-[100px]">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(rewData?.rows ?? []).map((r: any) => {
                        const cancellable = r.status === "PENDING" || r.status === "ELIGIBLE"
                        return (
                          <tr key={r.id} className="border-b border-border/50">
                            <td className="p-2">{r.beneficiary?.clientId}</td>
                            <td className="p-2">₹{Number(r.amount).toLocaleString("en-IN")}</td>
                            <td className="p-2">{r.role}</td>
                            <td className="p-2 font-medium">{rewardStatusLabel(r.status)}</td>
                            <td className="p-2 max-w-[200px] truncate text-xs text-muted-foreground">
                              {r.failureReason ?? "—"}
                            </td>
                            <td className="p-2">
                              {cancellable && canManage ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openCancel(r.id)}
                                >
                                  Cancel
                                </Button>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {!rewData?.rows?.length ? (
                    <p className="py-8 text-center text-muted-foreground">No rows match.</p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                    <span>
                      Page {rewPage} of {rewTotalPages} · {rewData?.total ?? 0} total
                    </span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={rewPage <= 1 || rewLoading}
                        onClick={() => setRewPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={rewPage >= rewTotalPages || rewLoading}
                        onClick={() => setRewPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel this bonus?</DialogTitle>
            <DialogDescription>
              Only pending or eligible rows can be cancelled. The reason is stored for audit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Reason (required)</Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Duplicate attribution, compliance hold…"
              className="min-h-[100px]"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setCancelOpen(false)}>
              Back
            </Button>
            <Button type="button" variant="destructive" onClick={() => void submitCancel()}>
              Confirm cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
