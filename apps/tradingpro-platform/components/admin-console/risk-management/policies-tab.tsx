/**
 * @file policies-tab.tsx
 * @module admin-console/risk-management
 * @description Trading policies management — create, edit, and manage blocking rules for order placement and position close flows
 */

"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Copy, Edit, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { TradingPolicyWizardDialog } from "./trading-policy-wizard-dialog"
import { summarizePolicyPlainLine } from "./trading-policy-plain-summary"
import {
  compilePolicyDraftFromStudioDraft,
  createDefaultPolicyStudioDraft,
  createPolicyStudioDraftFromDefinition,
  formatConditionSummary,
} from "./trading-policy-studio-state"
import type {
  PolicyContext,
  PolicyStudioDraft,
  TradingPolicyCatalog,
  TradingPolicyDefinition,
  TradingPolicyDraft,
} from "./trading-policy-types"

interface PoliciesTabProps {
  refreshKey: number
}

export function PoliciesTab({ refreshKey }: PoliciesTabProps) {
  const [tradingPolicies, setTradingPolicies] = useState<TradingPolicyDefinition[]>([])
  const [policyCatalog, setPolicyCatalog] = useState<TradingPolicyCatalog | null>(null)
  const [policyStudioDraft, setPolicyStudioDraft] = useState<PolicyStudioDraft>(createDefaultPolicyStudioDraft())
  const [showPolicyDialog, setShowPolicyDialog] = useState(false)
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null)
  const [deletingPolicy, setDeletingPolicy] = useState<TradingPolicyDefinition | null>(null)
  const [policiesLoading, setPoliciesLoading] = useState(false)
  const [savingPolicies, setSavingPolicies] = useState(false)
  const [policyTableSearch, setPolicyTableSearch] = useState("")
  const [policyContextFilter, setPolicyContextFilter] = useState<"all" | PolicyContext>("all")

  const fetchTradingPolicies = async () => {
    setPoliciesLoading(true)
    try {
      const res = await fetch("/api/admin/risk/policies")
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error((errData as { error?: string }).error ?? "Failed to load trading policies")
      }
      const payload = await res.json()
      setTradingPolicies(Array.isArray(payload?.policies) ? payload.policies : [])
      setPolicyCatalog(payload?.catalog ?? null)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load trading policies"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setPoliciesLoading(false)
    }
  }

  useEffect(() => {
    void fetchTradingPolicies()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const openCreatePolicyDialog = () => {
    setEditingPolicyId(null)
    setPolicyStudioDraft(createDefaultPolicyStudioDraft())
    setShowPolicyDialog(true)
  }

  const openEditPolicyDialog = (policy: TradingPolicyDefinition) => {
    setEditingPolicyId(policy.id)
    setPolicyStudioDraft(createPolicyStudioDraftFromDefinition(policy))
    setShowPolicyDialog(true)
  }

  const openDuplicatePolicyDialog = (policy: TradingPolicyDefinition) => {
    const draft = createPolicyStudioDraftFromDefinition(policy)
    setEditingPolicyId(null)
    setPolicyStudioDraft({ ...draft, name: `${draft.name} (copy)`.slice(0, 120) })
    setShowPolicyDialog(true)
  }

  const handleSaveTradingPolicy = async () => {
    let compiledPolicyDraft: TradingPolicyDraft
    try {
      compiledPolicyDraft = compilePolicyDraftFromStudioDraft(policyStudioDraft, policyCatalog)
    } catch (error: unknown) {
      toast({
        title: "Validation Error",
        description: error instanceof Error ? error.message : "Unable to compile policy from current settings.",
        variant: "destructive",
      })
      return
    }
    const trimmedName = compiledPolicyDraft.name.trim()
    const trimmedMessage = compiledPolicyDraft.action.message.trim()
    if (!trimmedName) {
      toast({ title: "Validation Error", description: "Policy name is required", variant: "destructive" })
      return
    }
    if (!trimmedMessage) {
      toast({ title: "Validation Error", description: "Action message is required", variant: "destructive" })
      return
    }
    if (compiledPolicyDraft.conditions.length === 0) {
      toast({ title: "Validation Error", description: "Add at least one condition", variant: "destructive" })
      return
    }

    const requestPayload = {
      ...compiledPolicyDraft,
      ...(editingPolicyId ? { id: editingPolicyId } : {}),
      name: trimmedName,
      description: compiledPolicyDraft.description.trim(),
      conditions: compiledPolicyDraft.conditions.map((condition) => ({
        ...condition,
        value: typeof condition.value === "string" ? condition.value.trim() : condition.value,
      })),
      action: { ...compiledPolicyDraft.action, message: trimmedMessage },
    }

    setSavingPolicies(true)
    try {
      const method = editingPolicyId ? "PUT" : "POST"
      const res = await fetch("/api/admin/risk/policies", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error((errData as { error?: string }).error ?? "Failed to save trading policy")
      }
      setShowPolicyDialog(false)
      setEditingPolicyId(null)
      setPolicyStudioDraft(createDefaultPolicyStudioDraft())
      await fetchTradingPolicies()
      toast({ title: "Success", description: editingPolicyId ? "Trading policy updated" : "Trading policy created" })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to save trading policy"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setSavingPolicies(false)
    }
  }

  const handleDeleteTradingPolicy = async (policy: TradingPolicyDefinition) => {
    if (policy.readOnly || policy.source === "legacy") {
      toast({ title: "Read-only Policy", description: "Legacy compatibility policies cannot be deleted here.", variant: "destructive" })
      setDeletingPolicy(null)
      return
    }
    setSavingPolicies(true)
    try {
      const res = await fetch(`/api/admin/risk/policies?id=${encodeURIComponent(policy.id)}`, { method: "DELETE" })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error((errData as { error?: string }).error ?? "Failed to delete policy")
      }
      setDeletingPolicy(null)
      await fetchTradingPolicies()
      toast({ title: "Success", description: "Trading policy deleted" })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete trading policy"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setSavingPolicies(false)
    }
  }

  const handleToggleTradingPolicy = async (policy: TradingPolicyDefinition, enabled: boolean) => {
    if (policy.readOnly || policy.source === "legacy") {
      toast({ title: "Read-only Policy", description: "Legacy compatibility policies cannot be edited here.", variant: "destructive" })
      return
    }
    setSavingPolicies(true)
    try {
      const res = await fetch("/api/admin/risk/policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...policy, enabled }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error((errData as { error?: string }).error ?? "Failed to update policy")
      }
      await fetchTradingPolicies()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update trading policy"
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setSavingPolicies(false)
    }
  }

  const filteredTradingPolicies = useMemo(() => {
    const needle = policyTableSearch.trim().toLowerCase()
    return tradingPolicies.filter((policy) => {
      if (policyContextFilter !== "all" && policy.context !== policyContextFilter) return false
      if (!needle) return true
      return (
        policy.name.toLowerCase().includes(needle) ||
        (policy.description ?? "").toLowerCase().includes(needle) ||
        summarizePolicyPlainLine(policy).toLowerCase().includes(needle)
      )
    })
  }, [tradingPolicies, policyTableSearch, policyContextFilter])

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-primary">Trading Policies</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Create and manage blocking rules for order placement and position close flows.
          </p>
        </div>
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={openCreatePolicyDialog}
          disabled={!policyCatalog || policiesLoading}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Policy
        </Button>
      </div>

      <Card className="bg-card border-border shadow-sm neon-border">
        <CardContent className="p-4 space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1 min-w-0">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <Input
                value={policyTableSearch}
                onChange={(e) => setPolicyTableSearch(e.target.value)}
                placeholder="Name or description…"
                className="bg-background border-border mt-1"
              />
            </div>
            <div className="w-full sm:w-52">
              <Label className="text-xs text-muted-foreground">Applies when</Label>
              <Select value={policyContextFilter} onValueChange={(v) => setPolicyContextFilter(v as "all" | PolicyContext)}>
                <SelectTrigger className="bg-background border-border mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All contexts</SelectItem>
                  <SelectItem value="ORDER_PLACE">Placing orders</SelectItem>
                  <SelectItem value="POSITION_CLOSE">Closing positions</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="min-w-[1100px] sm:min-w-0 px-4 sm:px-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead>Policy</TableHead>
                    <TableHead>In plain words</TableHead>
                    <TableHead>Context</TableHead>
                    <TableHead>Conditions</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tradingPolicies.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                        No trading policies yet. Click &quot;Add Policy&quot; to create the first protection rule.
                      </TableCell>
                    </TableRow>
                  ) : filteredTradingPolicies.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No policies match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTradingPolicies.map((policy) => (
                      <TableRow key={policy.id} className="border-border hover:bg-muted/20">
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium text-foreground text-sm">{policy.name}</p>
                            <p className="text-xs text-muted-foreground">{policy.description ?? "No description."}</p>
                            {policy.source === "legacy" && (
                              <p className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded px-2 py-1">
                                Note: this rule only applies to positions with unrealized loss (P&amp;L &lt; 0). For all-position time locks, create a &ldquo;Minimum hold time&rdquo; policy in the wizard.
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <p className="text-xs text-foreground leading-snug">{summarizePolicyPlainLine(policy)}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {policy.context === "ORDER_PLACE"
                              ? "Placing orders"
                              : policy.context === "POSITION_CLOSE"
                                ? "Closing positions"
                                : policy.context}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[280px] space-y-1">
                            {policy.conditions.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No conditions.</p>
                            ) : (
                              policy.conditions.map((condition) => (
                                <p key={condition.id} className="text-xs text-muted-foreground truncate">
                                  {formatConditionSummary(condition)}
                                </p>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums text-sm">{policy.priority}</TableCell>
                        <TableCell>
                          <Switch
                            checked={policy.enabled}
                            disabled={policy.readOnly || savingPolicies}
                            onCheckedChange={(checked) => void handleToggleTradingPolicy(policy, checked)}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge variant={policy.source === "legacy" ? "secondary" : "outline"} className="text-xs">
                            {policy.source}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(policy.updatedAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditPolicyDialog(policy)}
                              disabled={policy.readOnly}
                              title="Edit"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDuplicatePolicyDialog(policy)}
                              title="Duplicate"
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeletingPolicy(policy)}
                              disabled={policy.readOnly || savingPolicies}
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchTradingPolicies()}
              disabled={savingPolicies || policiesLoading}
            >
              {policiesLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Refresh
            </Button>
            <div className="sm:ml-auto flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                Total: {tradingPolicies.length}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                Active: {tradingPolicies.filter((p) => p.enabled).length}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deletingPolicy} onOpenChange={(open) => { if (!open) setDeletingPolicy(null) }}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Delete policy?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <span className="font-semibold text-foreground">&ldquo;{deletingPolicy?.name}&rdquo;</span>?
            This cannot be undone. Active enforcement will stop immediately.
          </p>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setDeletingPolicy(null)} disabled={savingPolicies}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingPolicy && void handleDeleteTradingPolicy(deletingPolicy)}
              disabled={savingPolicies}
            >
              {savingPolicies ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TradingPolicyWizardDialog
        key={editingPolicyId ?? "create"}
        open={showPolicyDialog}
        onOpenChange={(open) => {
          setShowPolicyDialog(open)
          if (!open) {
            setEditingPolicyId(null)
            setPolicyStudioDraft(createDefaultPolicyStudioDraft())
          }
        }}
        editingPolicyId={editingPolicyId}
        policyStudioDraft={policyStudioDraft}
        setPolicyStudioDraft={setPolicyStudioDraft}
        policyCatalog={policyCatalog}
        onSave={() => void handleSaveTradingPolicy()}
        savingPolicies={savingPolicies}
      />
    </div>
  )
}
