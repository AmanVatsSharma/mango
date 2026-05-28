/**
 * @file referrals-program-panel.tsx
 * @module components/admin-console/referrals
 * @description Program setup: checklist, KPI strip, switches, rule set picker, milestone editor, form-based new set + JSON advanced.
 * @author StockTrade
 * @created 2026-04-03
 */

"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { CheckCircle2, Circle, Plus, Trash2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import {
  readReferralAdminApiError,
  rewardStatusLabel,
} from "@/components/admin-console/referrals/referrals-shared"

export type ReferralAdminSummaryPayload = {
  attributionCount: number
  rewardsByStatus: Record<string, number>
  programActive: boolean
  requireKycApprovedForPayout: boolean
  activeRuleSetId: string | null
  showRulesToUsers: boolean
  showBonusAmountsToUsers: boolean
}

type MilestoneRuleRow = {
  id: string
  sortOrder: number
  minDepositTotal: string | number
  bonusReferrer: string | number
  bonusReferee: string | number
  isActive: boolean
}

type DraftMilestone = {
  localId: string
  sortOrder: number
  minDepositTotal: number
  bonusReferrer: number
  bonusReferee: number
  isActive: boolean
}

function newLocalId() {
  return `d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export type ReferralsProgramPanelProps = {
  canManage: boolean
  summary: ReferralAdminSummaryPayload | null
  program: any
  onProgramDataChanged: () => Promise<void>
}

export function ReferralsProgramPanel({
  canManage,
  summary,
  program,
  onProgramDataChanged,
}: ReferralsProgramPanelProps) {
  const { toast } = useToast()
  const settings = program?.settings

  const [ruleSetNameEdit, setRuleSetNameEdit] = useState("")
  const [milestoneEdits, setMilestoneEdits] = useState<Record<string, Partial<MilestoneRuleRow>>>({})
  const [savingRuleSetMeta, setSavingRuleSetMeta] = useState(false)
  const [publicNoticeDraft, setPublicNoticeDraft] = useState("")

  const [newSetName, setNewSetName] = useState("Standard bonuses")
  const [setActiveAfterCreate, setSetActiveAfterCreate] = useState(true)
  const [draftMilestones, setDraftMilestones] = useState<DraftMilestone[]>(() => [
    {
      localId: newLocalId(),
      sortOrder: 0,
      minDepositTotal: 5000,
      bonusReferrer: 200,
      bonusReferee: 100,
      isActive: true,
    },
    {
      localId: newLocalId(),
      sortOrder: 1,
      minDepositTotal: 25000,
      bonusReferrer: 500,
      bonusReferee: 250,
      isActive: true,
    },
  ])
  const [ruleJson, setRuleJson] = useState(
    JSON.stringify(
      [
        { sortOrder: 0, minDepositTotal: 5000, bonusReferrer: 200, bonusReferee: 100, isActive: true },
        { sortOrder: 1, minDepositTotal: 25000, bonusReferrer: 500, bonusReferee: 250, isActive: true },
      ],
      null,
      2,
    ),
  )

  const activeRules: MilestoneRuleRow[] = (settings?.activeRuleSet?.rules ?? []).map((r: any) => ({
    id: r.id,
    sortOrder: r.sortOrder,
    minDepositTotal: String(r.minDepositTotal),
    bonusReferrer: String(r.bonusReferrer),
    bonusReferee: String(r.bonusReferee),
    isActive: r.isActive,
  }))

  const activeMilestoneCount = activeRules.filter((r) => r.isActive).length

  const checklist = useMemo(
    () => [
      {
        id: "on",
        label: "Referral program is turned on",
        done: !!settings?.isActive,
        scrollId: "referral-step-on",
      },
      {
        id: "ruleset",
        label: "A rule package is selected (defines deposit thresholds and bonus amounts)",
        done: Boolean(settings?.activeRuleSetId),
        scrollId: "referral-step-ruleset",
      },
      {
        id: "milestones",
        label: "At least one active milestone exists in that package",
        done:
          Boolean(settings?.activeRuleSetId) &&
          activeRules.length > 0 &&
          activeMilestoneCount > 0,
        scrollId: "referral-step-milestones",
      },
      {
        id: "visibility",
        label: "Optional: show program rules to users in their Referral Settings",
        done: !!settings?.showRulesToUsers,
        optional: true,
        scrollId: "referral-step-visibility",
      },
    ],
    [settings?.isActive, settings?.activeRuleSetId, settings?.showRulesToUsers, activeRules.length, activeMilestoneCount],
  )

  useEffect(() => {
    setRuleSetNameEdit(settings?.activeRuleSet?.name ?? "")
    setMilestoneEdits({})
  }, [settings?.activeRuleSet?.id, settings?.activeRuleSet?.name])

  useEffect(() => {
    setPublicNoticeDraft(settings?.publicRulesNotice ?? "")
  }, [settings?.publicRulesNotice])

  const patchProgram = async (body: Record<string, unknown>) => {
    if (!canManage) return
    const res = await fetch("/api/admin/referrals/program", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      toast({ title: "Update failed", description: await readReferralAdminApiError(res), variant: "destructive" })
      return
    }
    toast({ title: "Saved" })
    await onProgramDataChanged()
  }

  const saveActiveRuleSetMeta = async () => {
    const id = settings?.activeRuleSetId
    if (!id || !canManage) return
    setSavingRuleSetMeta(true)
    try {
      const res = await fetch(`/api/admin/referrals/rule-sets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: ruleSetNameEdit.trim() || "Rule package" }),
      })
      if (!res.ok) {
        toast({ title: "Save failed", description: await readReferralAdminApiError(res), variant: "destructive" })
        return
      }
      toast({ title: "Package name updated" })
      await onProgramDataChanged()
    } finally {
      setSavingRuleSetMeta(false)
    }
  }

  const saveMilestone = async (ruleId: string, base: MilestoneRuleRow) => {
    if (!canManage) return
    const patch = milestoneEdits[ruleId] ?? {}
    const body = {
      sortOrder: patch.sortOrder !== undefined ? Number(patch.sortOrder) : base.sortOrder,
      minDepositTotal:
        patch.minDepositTotal !== undefined ? Number(patch.minDepositTotal) : Number(base.minDepositTotal),
      bonusReferrer:
        patch.bonusReferrer !== undefined ? Number(patch.bonusReferrer) : Number(base.bonusReferrer),
      bonusReferee:
        patch.bonusReferee !== undefined ? Number(patch.bonusReferee) : Number(base.bonusReferee),
      isActive: patch.isActive !== undefined ? patch.isActive : base.isActive,
    }
    const res = await fetch(`/api/admin/referrals/milestone-rules/${ruleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      toast({ title: "Save failed", description: await readReferralAdminApiError(res), variant: "destructive" })
      return
    }
    toast({ title: "Milestone saved" })
    setMilestoneEdits((prev) => {
      const next = { ...prev }
      delete next[ruleId]
      return next
    })
    await onProgramDataChanged()
  }

  const createFromDraftRows = async () => {
    if (!canManage) return
    const orders = new Set<number>()
    for (const r of draftMilestones) {
      if (orders.has(r.sortOrder)) {
        toast({ title: "Each step number must be unique", variant: "destructive" })
        return
      }
      orders.add(r.sortOrder)
      if (r.minDepositTotal < 0 || r.bonusReferrer < 0 || r.bonusReferee < 0) {
        toast({ title: "Amounts cannot be negative", variant: "destructive" })
        return
      }
    }
    const rules = [...draftMilestones]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((r) => ({
        sortOrder: r.sortOrder,
        minDepositTotal: r.minDepositTotal,
        bonusReferrer: r.bonusReferrer,
        bonusReferee: r.bonusReferee,
        isActive: r.isActive,
      }))
    const res = await fetch("/api/admin/referrals/rule-sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: newSetName.trim() || "Rule package", rules }),
    })
    if (!res.ok) {
      toast({ title: "Create failed", description: await readReferralAdminApiError(res), variant: "destructive" })
      return
    }
    const j = await res.json()
    const createdId = j.data?.id as string | undefined
    toast({ title: "New rule package created" })
    if (setActiveAfterCreate && createdId) {
      await patchProgram({ activeRuleSetId: createdId })
    } else {
      await onProgramDataChanged()
    }
  }

  const createFromJson = async () => {
    if (!canManage) return
    let rules: unknown
    try {
      rules = JSON.parse(ruleJson)
    } catch {
      toast({ title: "Invalid JSON", variant: "destructive" })
      return
    }
    const res = await fetch("/api/admin/referrals/rule-sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: newSetName.trim() || "Imported package", rules }),
    })
    if (!res.ok) {
      toast({ title: "Create failed", description: await readReferralAdminApiError(res), variant: "destructive" })
      return
    }
    const j = await res.json()
    const createdId = j.data?.id as string | undefined
    toast({ title: "Package imported from JSON" })
    if (setActiveAfterCreate && createdId) {
      await patchProgram({ activeRuleSetId: createdId })
    } else {
      await onProgramDataChanged()
    }
  }

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  const rewardKeys = summary?.rewardsByStatus ? Object.keys(summary.rewardsByStatus) : []

  const addDraftRow = () => {
    const nextOrder =
      draftMilestones.length === 0
        ? 0
        : Math.max(...draftMilestones.map((d) => d.sortOrder)) + 1
    setDraftMilestones((rows) => [
      ...rows,
      {
        localId: newLocalId(),
        sortOrder: nextOrder,
        minDepositTotal: 10000,
        bonusReferrer: 0,
        bonusReferee: 0,
        isActive: true,
      },
    ])
  }

  const removeDraftRow = (localId: string) => {
    setDraftMilestones((rows) => rows.filter((r) => r.localId !== localId))
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Setup checklist</CardTitle>
          <CardDescription>
            Complete the steps in order. Bonuses only run when the program is on and a package with milestones is active.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {checklist.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollTo(item.scrollId)}
              className="flex w-full items-start gap-2 rounded-lg border border-transparent px-2 py-2 text-left text-sm hover:bg-muted/50"
            >
              {item.done ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span>
                {item.label}
                {item.optional ? (
                  <span className="ml-1 text-xs text-muted-foreground">(recommended)</span>
                ) : null}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      {summary ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap gap-2"
        >
          <span className="rounded-full border bg-card px-3 py-1 text-sm">
            <strong className="tabular-nums">{summary.attributionCount}</strong> signups linked
          </span>
          <span className="rounded-full border bg-card px-3 py-1 text-sm">
            Program: <strong>{summary.programActive ? "On" : "Off"}</strong>
          </span>
          <span className="rounded-full border bg-card px-3 py-1 text-sm">
            KYC before pay: <strong>{summary.requireKycApprovedForPayout ? "Yes" : "No"}</strong>
          </span>
          {rewardKeys.map((k) => (
            <span key={k} className="rounded-full border bg-muted/40 px-3 py-1 text-sm">
              {rewardStatusLabel(k)}: {summary.rewardsByStatus[k]}
            </span>
          ))}
        </motion.div>
      ) : null}

      <Card id="referral-step-on">
        <CardHeader>
          <CardTitle>1. Program switch</CardTitle>
          <CardDescription>
            When off, no new bonuses are evaluated. Existing ledger rows stay as they are.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-lg">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="ref-active">Program active</Label>
            <Switch
              id="ref-active"
              checked={!!settings?.isActive}
              disabled={!canManage}
              onCheckedChange={(v) => void patchProgram({ isActive: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="ref-kyc">Require KYC approved before paying bonuses</Label>
            <Switch
              id="ref-kyc"
              checked={!!settings?.requireKycApprovedForPayout}
              disabled={!canManage}
              onCheckedChange={(v) => void patchProgram({ requireKycApprovedForPayout: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card id="referral-step-ruleset">
        <CardHeader>
          <CardTitle>2. Active rule package</CardTitle>
          <CardDescription>
            Pick which set of deposit thresholds applies. Edit steps below after selecting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-xl">
          <div className="space-y-2">
            <Label>Package in use</Label>
            <Select
              value={settings?.activeRuleSetId ?? "__none__"}
              disabled={!canManage}
              onValueChange={(v) => void patchProgram({ activeRuleSetId: v === "__none__" ? null : v })}
            >
              <SelectTrigger id="referral-rule-set">
                <SelectValue placeholder="Choose package" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None (program idle)</SelectItem>
                {(program?.ruleSets ?? []).map((rs: { id: string; name: string }) => (
                  <SelectItem key={rs.id} value={rs.id}>
                    {rs.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card id="referral-step-milestones">
        <CardHeader>
          <CardTitle>3. Steps in this package (milestones)</CardTitle>
          <CardDescription>
            When a referee&apos;s <strong>qualified deposits</strong> reach each threshold, bonuses are created per your amounts.
            Save each row after editing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!settings?.activeRuleSetId ? (
            <p className="text-sm text-muted-foreground">Select a package above to edit its steps.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-2 max-w-xl">
                <div className="space-y-2 flex-1 min-w-[200px]">
                  <Label>Package display name</Label>
                  <Input
                    value={ruleSetNameEdit}
                    onChange={(e) => setRuleSetNameEdit(e.target.value)}
                    disabled={!canManage}
                  />
                </div>
                <Button
                  type="button"
                  disabled={!canManage || savingRuleSetMeta}
                  onClick={() => void saveActiveRuleSetMeta()}
                >
                  Save name
                </Button>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                      <th className="p-2">Step</th>
                      <th className="p-2">Min deposit ₹</th>
                      <th className="p-2">Bonus referrer ₹</th>
                      <th className="p-2">Bonus referee ₹</th>
                      <th className="p-2">On</th>
                      <th className="p-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {activeRules.map((row) => {
                      const e = milestoneEdits[row.id] ?? {}
                      const sortOrder = e.sortOrder ?? row.sortOrder
                      const minD = e.minDepositTotal ?? row.minDepositTotal
                      const br = e.bonusReferrer ?? row.bonusReferrer
                      const bf = e.bonusReferee ?? row.bonusReferee
                      const active = e.isActive ?? row.isActive
                      return (
                        <tr key={row.id} className="border-b border-border/50">
                          <td className="p-2">
                            <Input
                              className="h-8 w-16"
                              type="number"
                              value={sortOrder}
                              disabled={!canManage}
                              onChange={(ev) =>
                                setMilestoneEdits((prev) => ({
                                  ...prev,
                                  [row.id]: { ...prev[row.id], sortOrder: Number(ev.target.value) },
                                }))
                              }
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              className="h-8 w-28"
                              type="number"
                              value={minD}
                              disabled={!canManage}
                              onChange={(ev) =>
                                setMilestoneEdits((prev) => ({
                                  ...prev,
                                  [row.id]: { ...prev[row.id], minDepositTotal: ev.target.value },
                                }))
                              }
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              className="h-8 w-28"
                              type="number"
                              value={br}
                              disabled={!canManage}
                              onChange={(ev) =>
                                setMilestoneEdits((prev) => ({
                                  ...prev,
                                  [row.id]: { ...prev[row.id], bonusReferrer: ev.target.value },
                                }))
                              }
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              className="h-8 w-28"
                              type="number"
                              value={bf}
                              disabled={!canManage}
                              onChange={(ev) =>
                                setMilestoneEdits((prev) => ({
                                  ...prev,
                                  [row.id]: { ...prev[row.id], bonusReferee: ev.target.value },
                                }))
                              }
                            />
                          </td>
                          <td className="p-2">
                            <Switch
                              checked={active}
                              disabled={!canManage}
                              onCheckedChange={(v) =>
                                setMilestoneEdits((prev) => ({
                                  ...prev,
                                  [row.id]: { ...prev[row.id], isActive: v },
                                }))
                              }
                            />
                          </td>
                          <td className="p-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={!canManage}
                              onClick={() => void saveMilestone(row.id, row)}
                            >
                              Save
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {!activeRules.length ? (
                <p className="text-sm text-muted-foreground">This package has no steps yet — create a new package below.</p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card id="referral-step-visibility">
        <CardHeader>
          <CardTitle>4. What users see in the app</CardTitle>
          <CardDescription>Referral Settings in the client console — optional transparency for clients.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-lg">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="ref-show-rules">Show milestone rules</Label>
            <Switch
              id="ref-show-rules"
              checked={!!settings?.showRulesToUsers}
              disabled={!canManage}
              onCheckedChange={(v) => void patchProgram({ showRulesToUsers: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="ref-show-amt">Show rupee amounts (not only thresholds)</Label>
            <Switch
              id="ref-show-amt"
              checked={!!settings?.showBonusAmountsToUsers}
              disabled={!canManage}
              onCheckedChange={(v) => void patchProgram({ showBonusAmountsToUsers: v })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ref-notice">Notice text (legal / marketing)</Label>
            <textarea
              id="ref-notice"
              className="min-h-[100px] w-full rounded-md border border-input bg-background p-3 text-sm"
              value={publicNoticeDraft}
              disabled={!canManage}
              onChange={(e) => setPublicNoticeDraft(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!canManage}
              onClick={() => void patchProgram({ publicRulesNotice: publicNoticeDraft.trim() || null })}
            >
              Save notice
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create a new rule package</CardTitle>
          <CardDescription>
            Use the form for normal setup. Each row is one deposit threshold and who gets paid.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-md">
            <Label>Package name</Label>
            <Input value={newSetName} onChange={(e) => setNewSetName(e.target.value)} disabled={!canManage} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="set-active-after"
              checked={setActiveAfterCreate}
              disabled={!canManage}
              onCheckedChange={(v) => setSetActiveAfterCreate(v === true)}
            />
            <Label htmlFor="set-active-after" className="font-normal">
              Use this package immediately after creation
            </Label>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Steps</Label>
              <Button type="button" variant="outline" size="sm" disabled={!canManage} onClick={addDraftRow}>
                <Plus className="mr-1 h-4 w-4" />
                Add step
              </Button>
            </div>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    <th className="p-2">Step</th>
                    <th className="p-2">Min deposit ₹</th>
                    <th className="p-2">Referrer ₹</th>
                    <th className="p-2">Referee ₹</th>
                    <th className="p-2">On</th>
                    <th className="p-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {draftMilestones.map((d) => (
                    <tr key={d.localId} className="border-b">
                      <td className="p-2">
                        <Input
                          className="h-8 w-16"
                          type="number"
                          value={d.sortOrder}
                          disabled={!canManage}
                          onChange={(ev) => {
                            const v = Number(ev.target.value)
                            setDraftMilestones((rows) =>
                              rows.map((r) => (r.localId === d.localId ? { ...r, sortOrder: v } : r)),
                            )
                          }}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          className="h-8 w-24"
                          type="number"
                          value={d.minDepositTotal}
                          disabled={!canManage}
                          onChange={(ev) => {
                            const v = Number(ev.target.value)
                            setDraftMilestones((rows) =>
                              rows.map((r) => (r.localId === d.localId ? { ...r, minDepositTotal: v } : r)),
                            )
                          }}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          className="h-8 w-24"
                          type="number"
                          value={d.bonusReferrer}
                          disabled={!canManage}
                          onChange={(ev) => {
                            const v = Number(ev.target.value)
                            setDraftMilestones((rows) =>
                              rows.map((r) => (r.localId === d.localId ? { ...r, bonusReferrer: v } : r)),
                            )
                          }}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          className="h-8 w-24"
                          type="number"
                          value={d.bonusReferee}
                          disabled={!canManage}
                          onChange={(ev) => {
                            const v = Number(ev.target.value)
                            setDraftMilestones((rows) =>
                              rows.map((r) => (r.localId === d.localId ? { ...r, bonusReferee: v } : r)),
                            )
                          }}
                        />
                      </td>
                      <td className="p-2">
                        <Switch
                          checked={d.isActive}
                          disabled={!canManage}
                          onCheckedChange={(v) =>
                            setDraftMilestones((rows) =>
                              rows.map((r) => (r.localId === d.localId ? { ...r, isActive: v } : r)),
                            )
                          }
                        />
                      </td>
                      <td className="p-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={!canManage || draftMilestones.length <= 1}
                          onClick={() => removeDraftRow(d.localId)}
                          aria-label="Remove step"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Button type="button" disabled={!canManage || draftMilestones.length < 1} onClick={() => void createFromDraftRows()}>
            Create package from form
          </Button>

          <Accordion type="single" collapsible className="w-full border rounded-lg px-2">
            <AccordionItem value="json" className="border-0">
              <AccordionTrigger className="text-sm">Advanced: import JSON</AccordionTrigger>
              <AccordionContent className="space-y-2 pb-4">
                <p className="text-xs text-muted-foreground">
                  For bulk migrations only. Same shape as API: {"{ name, rules: [{ sortOrder, minDepositTotal, bonusReferrer, bonusReferee, isActive? }] }"}.
                </p>
                <textarea
                  className="min-h-[160px] w-full rounded-md border bg-background p-3 font-mono text-xs"
                  value={ruleJson}
                  onChange={(e) => setRuleJson(e.target.value)}
                  disabled={!canManage}
                />
                <Button type="button" variant="secondary" disabled={!canManage} onClick={() => void createFromJson()}>
                  Create from JSON
                </Button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  )
}
