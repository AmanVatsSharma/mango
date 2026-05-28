/**
 * @file trading-policy-wizard-dialog.tsx
 * @module admin-console
 * @description Guided step-by-step dialog to create or edit trading policies with template gallery and plain-language review.
 * @author StockTrade
 * @created 2026-03-30
 */

"use client"

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { normalizeRiskLimitNonNegativeInput, normalizeRiskLimitNonNegativeIntegerInput } from "@/components/admin-console/risk-management-number-utils"
import { MAX_POLICY_CONDITIONS } from "@/lib/services/risk/policy-constants"
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, HelpCircle, Plus, Trash2 } from "lucide-react"
import { previewPolicyFromDraft, summarizePolicyPlainBullets } from "./trading-policy-plain-summary"
import {
  POLICY_STUDIO_BLUEPRINTS,
  compilePolicyDraftFromStudioDraft,
  createDefaultCustomConditionDraft,
  createDefaultPolicyStudioDraft,
  createCustomConditionDraftFromCondition,
  getCatalogFieldsForContext,
  getCatalogOperatorsForDataType,
  getDefaultOperatorForDataType,
  getPolicyStudioBlueprintProfile,
} from "./trading-policy-studio-state"
import type { PolicyStudioBlueprint } from "./trading-policy-types"
import {
  TradingPolicyTemplateGallery,
  type TemplateComplexityFilter,
} from "./trading-policy-template-gallery"
import { TradingPolicyTokenField } from "./trading-policy-token-field"
import type {
  PolicyAuthoringMode,
  PolicyContext,
  PolicyOperator,
  PolicyStudioDraft,
  TradingPolicyCatalog,
} from "./trading-policy-types"

function summarizeDraftPlainBulletsFromCompile(
  draft: PolicyStudioDraft,
  catalog: TradingPolicyCatalog | null,
): string[] {
  try {
    const compiled = compilePolicyDraftFromStudioDraft(draft, catalog)
    return summarizePolicyPlainBullets(previewPolicyFromDraft(compiled))
  } catch {
    return ["Finish the previous steps to see a plain-language summary."]
  }
}

const STEP_LABELS = ["Focus", "Template", "Details", "Message", "Review"]

export interface TradingPolicyWizardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingPolicyId: string | null
  policyStudioDraft: PolicyStudioDraft
  setPolicyStudioDraft: Dispatch<SetStateAction<PolicyStudioDraft>>
  policyCatalog: TradingPolicyCatalog | null
  onSave: () => void | Promise<void>
  savingPolicies: boolean
}

export function TradingPolicyWizardDialog({
  open,
  onOpenChange,
  editingPolicyId,
  policyStudioDraft,
  setPolicyStudioDraft,
  policyCatalog,
  onSave,
  savingPolicies,
}: TradingPolicyWizardDialogProps) {
  const [step, setStep] = useState(() => (editingPolicyId ? 2 : 0))
  const [wizardScope, setWizardScope] = useState<PolicyContext | null>(() =>
    editingPolicyId ? policyStudioDraft.context : null,
  )
  const [complexityFilter, setComplexityFilter] = useState<TemplateComplexityFilter>("all")
  const [advancedOpen, setAdvancedOpen] = useState(false)

  useEffect(() => {
    setComplexityFilter("all")
  }, [editingPolicyId])

  const isPresetAuthoringMode = policyStudioDraft.authoringMode === "PRESET"
  const selectedBlueprintProfile = getPolicyStudioBlueprintProfile(policyStudioDraft.blueprint)
  const showRawLock = Boolean(editingPolicyId && policyStudioDraft.blueprint === "RAW_POLICY_LOCK")

  const presetUsesOffsetThreshold = [
    "BUY_ABOVE_LTP_OFFSET",
    "SELL_BELOW_LTP_OFFSET",
    "BUY_PRICE_BELOW_LTP",
    "SELL_PRICE_ABOVE_LTP",
  ].includes(policyStudioDraft.blueprint)
  const presetUsesHoldMinutes = [
    "NEGATIVE_PNL_CLOSE_DELAY",
    "PROFIT_CLOSE_DELAY",
    "ANY_CLOSE_MIN_HOLD",
  ].includes(policyStudioDraft.blueprint)
  const presetUsesMinMargin = [
    "MIN_AVAILABLE_MARGIN",
    "LOW_MARGIN_BUY_GUARD",
    "LOW_MARGIN_SELL_GUARD",
    "HIGH_TURNOVER_AND_LOW_MARGIN",
    "LOW_MARGIN_HIGH_USED_MARGIN",
    "LOW_BALANCE_AND_LOW_MARGIN",
  ].includes(policyStudioDraft.blueprint)
  const presetUsesTurnover = [
    "MAX_ORDER_TURNOVER",
    "HIGH_TURNOVER_AND_LOW_MARGIN",
    "BUY_MAX_TURNOVER",
    "SELL_MAX_TURNOVER",
    "HIGH_TURNOVER_LOW_BALANCE",
  ].includes(policyStudioDraft.blueprint)
  const presetUsesMaxOrderQuantity = policyStudioDraft.blueprint === "MAX_ORDER_QUANTITY_CAP"
  const presetUsesMinOrderQuantity = policyStudioDraft.blueprint === "MIN_ORDER_QUANTITY_FLOOR"
  const presetUsesMinAccountBalance = [
    "MIN_ACCOUNT_BALANCE_ORDER",
    "HIGH_TURNOVER_LOW_BALANCE",
    "LOW_BALANCE_AND_LOW_MARGIN",
  ].includes(policyStudioDraft.blueprint)
  const presetUsesMaxUsedMargin = ["MAX_USED_MARGIN_ORDER", "LOW_MARGIN_HIGH_USED_MARGIN"].includes(
    policyStudioDraft.blueprint,
  )
  const presetUsesLimitPriceMin = policyStudioDraft.blueprint === "MIN_LIMIT_ORDER_PRICE"
  const presetUsesLimitPriceMax = policyStudioDraft.blueprint === "MAX_LIMIT_ORDER_PRICE"
  const presetUsesUserDenylist = ["ORDER_USER_DENYLIST", "POSITION_USER_DENYLIST"].includes(
    policyStudioDraft.blueprint,
  )
  const presetUsesCloseQtyMin = policyStudioDraft.blueprint === "MIN_REQUESTED_CLOSE_QUANTITY"
  const presetUsesCloseQtyMax = policyStudioDraft.blueprint === "MAX_REQUESTED_CLOSE_QUANTITY"
  const presetUsesPositionQtyMax = policyStudioDraft.blueprint === "BLOCK_CLOSE_LARGE_POSITION"
  const presetUsesPositionQtyMin = policyStudioDraft.blueprint === "BLOCK_CLOSE_SMALL_POSITION"
  const presetUsesPnlThreshold = ["BLOCK_CLOSE_WHILE_PROFITABLE", "BLOCK_CLOSE_DEEP_LOSS"].includes(
    policyStudioDraft.blueprint,
  )
  const presetUsesMinCloseLots = policyStudioDraft.blueprint === "MIN_REQUESTED_CLOSE_LOTS"
  const presetUsesMaxRemainingAfterClose = policyStudioDraft.blueprint === "MAX_REMAINING_QUANTITY_AFTER_CLOSE"
  const presetUsesPositionProductDenylist = policyStudioDraft.blueprint === "POSITION_PRODUCT_DENYLIST_CLOSE"

  const customContextFields = getCatalogFieldsForContext(policyCatalog, policyStudioDraft.context)

  const applyBlueprint = (blueprint: PolicyStudioBlueprint) => {
    const nextDefaults = createDefaultPolicyStudioDraft(blueprint)
    setPolicyStudioDraft((prev) => ({
      ...nextDefaults,
      authoringMode: "PRESET" as PolicyAuthoringMode,
      enabled: prev.enabled,
      priority: prev.priority,
      matchType: prev.matchType,
      retryAfterSeconds: prev.retryAfterSeconds,
      metadata: prev.metadata,
      customConditions: prev.customConditions,
      rawConditions: prev.rawConditions,
      name: prev.name.trim().length > 0 && prev.blueprint === blueprint ? prev.name : nextDefaults.name,
      description:
        prev.description.trim().length > 0 && prev.blueprint === blueprint ? prev.description : nextDefaults.description,
      actionMessage:
        prev.actionMessage.trim().length > 0 && prev.blueprint === blueprint
          ? prev.actionMessage
          : nextDefaults.actionMessage,
    }))
  }

  const switchToCustomRule = () => {
    if (!wizardScope) {
      return
    }
    setPolicyStudioDraft((prev) => ({
      ...prev,
      authoringMode: "CUSTOM",
      context: wizardScope,
      customConditions:
        prev.customConditions.length > 0
          ? prev.customConditions
          : [createDefaultCustomConditionDraft(wizardScope, policyCatalog)],
    }))
    setStep(2)
  }

  const updatePolicyAuthoringMode = (authoringMode: PolicyAuthoringMode) => {
    setPolicyStudioDraft((prev) => {
      if (prev.authoringMode === authoringMode) {
        return prev
      }
      if (authoringMode === "CUSTOM") {
        const initialConditions =
          prev.customConditions.length > 0
            ? prev.customConditions
            : prev.rawConditions.length > 0
              ? prev.rawConditions.map((condition) => createCustomConditionDraftFromCondition(condition))
              : [createDefaultCustomConditionDraft(prev.context, policyCatalog)]
        return {
          ...prev,
          authoringMode,
          customConditions: initialConditions,
        }
      }
      return {
        ...prev,
        authoringMode,
        context: getPolicyStudioBlueprintProfile(prev.blueprint).context,
      }
    })
  }

  const updateCustomPolicyContext = (context: PolicyContext) => {
    setPolicyStudioDraft((prev) => {
      const contextFields = getCatalogFieldsForContext(policyCatalog, context)
      if (contextFields.length === 0) {
        // Catalog not yet loaded; preserve existing conditions unchanged
        return { ...prev, context }
      }
      const nextConditions = prev.customConditions.map((condition) => {
        const matchingField =
          contextFields.find((entry) => entry.field === condition.field) ?? contextFields[0]!
        const allowedOperators = getCatalogOperatorsForDataType(policyCatalog, matchingField.dataType)
        const fallbackOperator: PolicyOperator = allowedOperators[0]?.value ?? "EQ"
        return {
          ...condition,
          field: matchingField.field,
          operator: allowedOperators.some((operator) => operator.value === condition.operator)
            ? condition.operator
            : fallbackOperator,
        }
      })
      return {
        ...prev,
        context,
        customConditions: nextConditions,
      }
    })
  }

  const addCustomConditionRow = () => {
    setPolicyStudioDraft((prev) => {
      if (prev.customConditions.length >= MAX_POLICY_CONDITIONS) {
        return prev
      }
      return {
        ...prev,
        customConditions: [...prev.customConditions, createDefaultCustomConditionDraft(prev.context, policyCatalog)],
      }
    })
  }

  const removeCustomConditionRow = (conditionId: string) => {
    setPolicyStudioDraft((prev) => ({
      ...prev,
      customConditions: prev.customConditions.filter((condition) => condition.id !== conditionId),
    }))
  }

  const moveCustomConditionRow = (index: number, direction: "UP" | "DOWN") => {
    setPolicyStudioDraft((prev) => {
      const nextConditions = [...prev.customConditions]
      const targetIndex = direction === "UP" ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= nextConditions.length) {
        return prev
      }
      const [current] = nextConditions.splice(index, 1)
      nextConditions.splice(targetIndex, 0, current)
      return {
        ...prev,
        customConditions: nextConditions,
      }
    })
  }

  const updateCustomConditionField = (conditionId: string, field: string) => {
    setPolicyStudioDraft((prev) => {
      const contextFields = getCatalogFieldsForContext(policyCatalog, prev.context)
      return {
        ...prev,
        customConditions: prev.customConditions.map((condition) => {
          if (condition.id !== conditionId) {
            return condition
          }
          const fieldEntry = contextFields.find((entry) => entry.field === field)
          const nextOperator = getDefaultOperatorForDataType(policyCatalog, fieldEntry?.dataType)
          return {
            ...condition,
            field,
            operator: nextOperator,
            valueInput: "",
          }
        }),
      }
    })
  }

  const updateCustomConditionOperator = (conditionId: string, operator: PolicyOperator) => {
    setPolicyStudioDraft((prev) => ({
      ...prev,
      customConditions: prev.customConditions.map((condition) =>
        condition.id === conditionId ? { ...condition, operator } : condition,
      ),
    }))
  }

  const updateCustomConditionValue = (conditionId: string, valueInput: string) => {
    setPolicyStudioDraft((prev) => ({
      ...prev,
      customConditions: prev.customConditions.map((condition) =>
        condition.id === conditionId ? { ...condition, valueInput } : condition,
      ),
    }))
  }

  const compiledPolicyPreviewState = useMemo(() => {
    try {
      return {
        policy: compilePolicyDraftFromStudioDraft(policyStudioDraft, policyCatalog),
        error: null as string | null,
      }
    } catch (error: unknown) {
      return {
        policy: null,
        error: error instanceof Error ? error.message : "Unable to compile policy.",
      }
    }
  }, [policyStudioDraft, policyCatalog])

  const reviewLines = useMemo(
    () => summarizeDraftPlainBulletsFromCompile(policyStudioDraft, policyCatalog),
    [policyStudioDraft, policyCatalog],
  )

  const maxStep = 4
  const canGoBack = step > 0
  const handleBack = () => setStep((s) => Math.max(0, s - 1))

  const handleNextFromStep0 = () => {
    if (!wizardScope) {
      return
    }
    const first = POLICY_STUDIO_BLUEPRINTS.find(
      (b) => b.context === wizardScope && b.value !== "RAW_POLICY_LOCK",
    )
    if (first) {
      applyBlueprint(first.value)
    }
    setStep(1)
  }

  const handleNext = () => {
    if (step === 0) {
      handleNextFromStep0()
      return
    }
    if (step === 1) {
      setStep(2)
      return
    }
    setStep((s) => Math.min(maxStep, s + 1))
  }

  const handlePrimaryNext = () => {
    if (step < maxStep) {
      handleNext()
    }
  }

  const disableNext =
    (step === 0 && !wizardScope) ||
    (step === 1 && isPresetAuthoringMode && policyStudioDraft.blueprint === "RAW_POLICY_LOCK" && !showRawLock) ||
    savingPolicies

  const matchTypePlain: Record<string, string> = {
    ALL: "All checks must pass (AND)",
    ANY: "Any one check can trigger the block (OR)",
  }

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-5xl bg-card border-border max-h-[90vh] overflow-y-auto mx-2 sm:mx-4">
          <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
            <DialogTitle className="text-lg sm:text-xl font-bold text-primary">
              {editingPolicyId ? "Edit protection rule" : "Create protection rule"}
            </DialogTitle>
            <p className="text-xs text-muted-foreground text-left font-normal pt-1">
              {STEP_LABELS.map((label, i) => (
                <span key={label}>
                  <span className={i === step ? "text-primary font-semibold" : ""}>
                    {i + 1}. {label}
                  </span>
                  {i < STEP_LABELS.length - 1 ? " · " : ""}
                </span>
              ))}
            </p>
          </DialogHeader>

          <div className="space-y-4 px-1 sm:px-2 pb-4">
            {step === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-foreground">What should this rule watch?</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setWizardScope("ORDER_PLACE")}
                    className={`rounded-lg border p-4 text-left transition-colors ${
                      wizardScope === "ORDER_PLACE"
                        ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <p className="font-semibold text-foreground">New orders</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Block or allow trades when users place buy/sell orders.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardScope("POSITION_CLOSE")}
                    className={`rounded-lg border p-4 text-left transition-colors ${
                      wizardScope === "POSITION_CLOSE"
                        ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <p className="font-semibold text-foreground">Closing positions</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Control exits, hold times, and segment restrictions on square-off.
                    </p>
                  </button>
                </div>
              </div>
            )}

            {step === 1 && wizardScope && (
              <div className="space-y-4">
                {isPresetAuthoringMode ? (
                  <>
                    <TradingPolicyTemplateGallery
                      scope={wizardScope}
                      complexityFilter={complexityFilter}
                      onComplexityFilterChange={setComplexityFilter}
                      selected={policyStudioDraft.blueprint}
                      onSelect={(b) => applyBlueprint(b)}
                      showRawLock={showRawLock}
                    />
                    <div className="rounded-md border border-dashed border-border p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <p className="text-sm text-muted-foreground">
                        Need something else? Build checks field-by-field (for advanced users).
                      </p>
                      <Button type="button" variant="secondary" size="sm" onClick={switchToCustomRule}>
                        Build custom rule
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Custom rule mode</p>
                    <p className="text-xs text-muted-foreground">
                      You are editing conditions manually. Continue to the next step to edit rows.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => updatePolicyAuthoringMode("PRESET")}
                    >
                      Back to templates
                    </Button>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="rounded-lg border border-border p-3 space-y-3">
                  <div>
                    <Label>Rule name *</Label>
                    <Input
                      value={policyStudioDraft.name}
                      onChange={(e) => setPolicyStudioDraft((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Short label admins will recognize"
                      className="bg-background border-border"
                    />
                  </div>
                  <div>
                    <Label>Internal note (optional)</Label>
                    <Textarea
                      value={policyStudioDraft.description}
                      onChange={(e) => setPolicyStudioDraft((prev) => ({ ...prev, description: e.target.value }))}
                      placeholder="Why this rule exists"
                      rows={2}
                      className="bg-background border-border"
                    />
                  </div>
                </div>

                {isPresetAuthoringMode && policyStudioDraft.blueprint !== "RAW_POLICY_LOCK" && (
                  <div className="rounded-lg border border-border p-3 space-y-3">
                    <p className="text-sm font-semibold">Rule settings</p>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={policyStudioDraft.enabled}
                        onCheckedChange={(checked) =>
                          setPolicyStudioDraft((prev) => ({ ...prev, enabled: checked }))
                        }
                      />
                      <Label className="text-sm">Rule is active</Label>
                    </div>

                    {presetUsesOffsetThreshold && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label>Price vs LTP (%)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={policyStudioDraft.thresholdPercent}
                            onChange={(e) =>
                              setPolicyStudioDraft((prev) => ({
                                ...prev,
                                thresholdPercent: normalizeRiskLimitNonNegativeInput(
                                  e.target.value,
                                  prev.thresholdPercent,
                                ),
                              }))
                            }
                            className="bg-background border-border"
                          />
                        </div>
                        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                          <div>
                            <div className="text-xs text-muted-foreground">Limit orders only</div>
                            <div className="text-xs">Apply only to LIMIT orders</div>
                          </div>
                          <Switch
                            checked={policyStudioDraft.enforceLimitOnly}
                            onCheckedChange={(checked) =>
                              setPolicyStudioDraft((prev) => ({ ...prev, enforceLimitOnly: checked }))
                            }
                          />
                        </div>
                      </div>
                    )}

                    {presetUsesHoldMinutes && (
                      <div className="max-w-sm">
                        <Label>Minimum hold (minutes)</Label>
                        <Input
                          type="number"
                          min="1"
                          value={policyStudioDraft.holdMinutes}
                          onChange={(e) =>
                            setPolicyStudioDraft((prev) => ({
                              ...prev,
                              holdMinutes: Math.max(
                                1,
                                normalizeRiskLimitNonNegativeIntegerInput(e.target.value, prev.holdMinutes),
                              ),
                            }))
                          }
                          className="bg-background border-border"
                        />
                      </div>
                    )}

                    {presetUsesMinMargin && (
                      <div className="max-w-sm">
                        <Label>Available margin threshold</Label>
                        <Input
                          type="number"
                          min="0"
                          value={policyStudioDraft.minAvailableMargin}
                          onChange={(e) =>
                            setPolicyStudioDraft((prev) => ({
                              ...prev,
                              minAvailableMargin: normalizeRiskLimitNonNegativeInput(
                                e.target.value,
                                prev.minAvailableMargin,
                              ),
                            }))
                          }
                          className="bg-background border-border"
                        />
                      </div>
                    )}

                    {presetUsesTurnover && (
                      <div className="max-w-sm">
                        <Label>Maximum order turnover</Label>
                        <Input
                          type="number"
                          min="1"
                          value={policyStudioDraft.maxOrderTurnover}
                          onChange={(e) =>
                            setPolicyStudioDraft((prev) => ({
                              ...prev,
                              maxOrderTurnover: Math.max(
                                1,
                                normalizeRiskLimitNonNegativeInput(e.target.value, prev.maxOrderTurnover),
                              ),
                            }))
                          }
                          className="bg-background border-border"
                        />
                      </div>
                    )}

                    {presetUsesMaxOrderQuantity && (
                      <div className="max-w-sm">
                        <Label>Maximum quantity per order (block if above)</Label>
                        <Input
                          type="number"
                          min="1"
                          value={policyStudioDraft.maxOrderQuantity}
                          onChange={(e) =>
                            setPolicyStudioDraft((prev) => ({
                              ...prev,
                              maxOrderQuantity: Math.max(
                                1,
                                normalizeRiskLimitNonNegativeIntegerInput(e.target.value, prev.maxOrderQuantity),
                              ),
                            }))
                          }
                          className="bg-background border-border"
                        />
                      </div>
                    )}

                    {presetUsesMinOrderQuantity && (
                      <div className="max-w-sm">
                        <Label>Minimum order quantity (block if below)</Label>
                        <Input
                          type="number"
                          min="1"
                          value={policyStudioDraft.minOrderQuantity}
                          onChange={(e) =>
                            setPolicyStudioDraft((prev) => ({
                              ...prev,
                              minOrderQuantity: Math.max(
                                1,
                                normalizeRiskLimitNonNegativeIntegerInput(e.target.value, prev.minOrderQuantity),
                              ),
                            }))
                          }
                          className="bg-background border-border"
                        />
                      </div>
                    )}

                    {presetUsesMinAccountBalance && (
                      <div className="max-w-sm">
                        <Label>Minimum account balance</Label>
                        <Input
                          type="number"
                          min="0"
                          value={policyStudioDraft.minAccountBalance}
                          onChange={(e) =>
                            setPolicyStudioDraft((prev) => ({
                              ...prev,
                              minAccountBalance: normalizeRiskLimitNonNegativeInput(
                                e.target.value,
                                prev.minAccountBalance,
                              ),
                            }))
                          }
                          className="bg-background border-border"
                        />
                      </div>
                    )}

                    {presetUsesMaxUsedMargin && (
                      <div className="max-w-sm">
                        <Label>Maximum used margin (block if above)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={policyStudioDraft.maxUsedMargin}
                          onChange={(e) =>
                            setPolicyStudioDraft((prev) => ({
                              ...prev,
                              maxUsedMargin: normalizeRiskLimitNonNegativeInput(e.target.value, prev.maxUsedMargin),
                            }))
                          }
                          className="bg-background border-border"
                        />
                      </div>
                    )}

                    {presetUsesLimitPriceMin && (
                      <div className="max-w-sm">
                        <Label>Minimum limit price</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={policyStudioDraft.minOrderPrice}
                          onChange={(e) =>
                            setPolicyStudioDraft((prev) => ({
                              ...prev,
                              minOrderPrice: normalizeRiskLimitNonNegativeInput(e.target.value, prev.minOrderPrice),
                            }))
                          }
                          className="bg-background border-border"
                        />
                      </div>
                    )}

                    {presetUsesLimitPriceMax && (
                      <div className="max-w-sm">
                        <Label>Maximum limit price</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={policyStudioDraft.maxOrderPrice}
                          onChange={(e) =>
                            setPolicyStudioDraft((prev) => ({
                              ...prev,
                              maxOrderPrice: normalizeRiskLimitNonNegativeInput(e.target.value, prev.maxOrderPrice),
                            }))
                          }
                          className="bg-background border-border"
                        />
                      </div>
                    )}

                    {presetUsesUserDenylist && (
                      <div>
                        <Label>Blocked user IDs (comma-separated)</Label>
                        <Input
                          value={policyStudioDraft.userIdDenyCsv}
                          onChange={(e) =>
                            setPolicyStudioDraft((prev) => ({ ...prev, userIdDenyCsv: e.target.value }))
                          }
                          placeholder="user-1, user-2"
                          className="bg-background border-border"
                        />
                      </div>
                    )}

                    {presetUsesCloseQtyMin && (
                      <div className="max-w-sm">
                        <Label>Minimum exit quantity (absolute)</Label>
                        <Input
                          type="number"
                          min="1"
                          value={policyStudioDraft.minCloseQuantity}
                          onChange={(e) =>
                            setPolicyStudioDraft((prev) => ({
                              ...prev,
                              minCloseQuantity: Math.max(
                                1,
                                normalizeRiskLimitNonNegativeIntegerInput(e.target.value, prev.minCloseQuantity),
                              ),
                            }))
                          }
                          className="bg-background border-border"
                        />
                      </div>
                    )}

                    {presetUsesCloseQtyMax && (
                      <div className="max-w-sm">
                        <Label>Maximum exit quantity (absolute)</Label>
                        <Input
                          type="number"
                          min="1"
                          value={policyStudioDraft.maxCloseQuantity}
                          onChange={(e) =>
                            setPolicyStudioDraft((prev) => ({
                              ...prev,
                              maxCloseQuantity: Math.max(
                                1,
                                normalizeRiskLimitNonNegativeIntegerInput(e.target.value, prev.maxCloseQuantity),
                              ),
                            }))
                          }
                          className="bg-background border-border"
                        />
                      </div>
                    )}

                    {presetUsesPositionQtyMax && (
                      <div className="max-w-sm space-y-1">
                        <Label>Block closes when |open quantity| is above</Label>
                        <p className="text-[10px] text-muted-foreground">
                          Uses OR on long and short legs; compiled rule sets match to “any”.
                        </p>
                        <Input
                          type="number"
                          min="1"
                          value={policyStudioDraft.maxPositionQuantity}
                          onChange={(e) =>
                            setPolicyStudioDraft((prev) => ({
                              ...prev,
                              maxPositionQuantity: Math.max(
                                1,
                                normalizeRiskLimitNonNegativeIntegerInput(
                                  e.target.value,
                                  prev.maxPositionQuantity,
                                ),
                              ),
                            }))
                          }
                          className="bg-background border-border"
                        />
                      </div>
                    )}

                    {presetUsesPositionQtyMin && (
                      <div className="max-w-sm space-y-1">
                        <Label>Block closes on small long positions (quantity below)</Label>
                        <p className="text-[10px] text-muted-foreground">Applies when open quantity is positive.</p>
                        <Input
                          type="number"
                          min="0"
                          value={policyStudioDraft.minPositionQuantity}
                          onChange={(e) =>
                            setPolicyStudioDraft((prev) => ({
                              ...prev,
                              minPositionQuantity: normalizeRiskLimitNonNegativeInput(
                                e.target.value,
                                prev.minPositionQuantity,
                              ),
                            }))
                          }
                          className="bg-background border-border"
                        />
                      </div>
                    )}

                    {presetUsesPnlThreshold && (
                      <div className="max-w-sm space-y-1">
                        <Label>
                          {policyStudioDraft.blueprint === "BLOCK_CLOSE_DEEP_LOSS"
                            ? "P&L threshold (block when unrealized P&L is below this; use negative amounts)"
                            : "P&L threshold (block when unrealized P&L is above this)"}
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={policyStudioDraft.pnlAmountThreshold}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            setPolicyStudioDraft((prev) => ({
                              ...prev,
                              pnlAmountThreshold: Number.isFinite(v) ? v : prev.pnlAmountThreshold,
                            }))
                          }}
                          className="bg-background border-border"
                        />
                      </div>
                    )}

                    {presetUsesMinCloseLots && (
                      <div className="max-w-sm">
                        <Label>Minimum exit lots (block if requested lots below)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={policyStudioDraft.minCloseLots}
                          onChange={(e) =>
                            setPolicyStudioDraft((prev) => ({
                              ...prev,
                              minCloseLots: Math.max(
                                0,
                                normalizeRiskLimitNonNegativeIntegerInput(e.target.value, prev.minCloseLots),
                              ),
                            }))
                          }
                          className="bg-background border-border"
                        />
                      </div>
                    )}

                    {presetUsesMaxRemainingAfterClose && (
                      <div className="max-w-sm space-y-1">
                        <Label>Max remaining quantity after close (block if above)</Label>
                        <p className="text-[10px] text-muted-foreground">
                          Set 0 to only allow full flat or valid leftovers per your execution rules.
                        </p>
                        <Input
                          type="number"
                          min="0"
                          value={policyStudioDraft.maxRemainingAfterClose}
                          onChange={(e) =>
                            setPolicyStudioDraft((prev) => ({
                              ...prev,
                              maxRemainingAfterClose: Math.max(
                                0,
                                normalizeRiskLimitNonNegativeIntegerInput(
                                  e.target.value,
                                  prev.maxRemainingAfterClose,
                                ),
                              ),
                            }))
                          }
                          className="bg-background border-border"
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <TradingPolicyTokenField
                        label={
                          policyStudioDraft.context === "POSITION_CLOSE"
                            ? "Limit to segments (optional)"
                            : "Limit to segments (optional)"
                        }
                        presetKind="segment"
                        value={policyStudioDraft.segmentCsv}
                        onChange={(segmentCsv) => setPolicyStudioDraft((prev) => ({ ...prev, segmentCsv }))}
                      />
                      {(policyStudioDraft.context === "ORDER_PLACE" || presetUsesPositionProductDenylist) && (
                        <TradingPolicyTokenField
                          label={
                            policyStudioDraft.blueprint === "POSITION_PRODUCT_DENYLIST_CLOSE"
                              ? "Blocked product types on close"
                              : policyStudioDraft.blueprint === "PRODUCT_TYPE_ALLOWLIST"
                                ? "Allowed product types"
                                : policyStudioDraft.blueprint === "PRODUCT_TYPE_DENYLIST"
                                  ? "Blocked product types"
                                  : "Product types (optional)"
                          }
                          presetKind="product"
                          value={policyStudioDraft.productTypeCsv}
                          onChange={(productTypeCsv) =>
                            setPolicyStudioDraft((prev) => ({ ...prev, productTypeCsv }))
                          }
                        />
                      )}
                    </div>
                  </div>
                )}

                {isPresetAuthoringMode && policyStudioDraft.blueprint === "RAW_POLICY_LOCK" && (
                  <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 space-y-2">
                    <p className="text-xs text-yellow-300">
                      This rule was imported. Switch to custom mode (Advanced in previous steps) or open custom
                      conditions from the table to edit raw rows.
                    </p>
                  </div>
                )}

                {!isPresetAuthoringMode && (
                  <div className="rounded-lg border border-border p-3 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Label className="text-sm font-semibold">Custom checks</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground">
                            <HelpCircle className="w-4 h-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          Each row compares one live value (price, margin, segment, …) to your threshold. Use comma
                          lists for &quot;one of&quot; style checks.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label>Applies when</Label>
                        <Select
                          value={policyStudioDraft.context}
                          onValueChange={(value) => updateCustomPolicyContext(value as PolicyContext)}
                        >
                          <SelectTrigger className="bg-background border-border">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(policyCatalog?.contexts || []).map((contextOption) => (
                              <SelectItem key={contextOption.value} value={contextOption.value}>
                                {contextOption.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>How checks combine</Label>
                        <Select
                          value={policyStudioDraft.matchType}
                          onValueChange={(value) =>
                            setPolicyStudioDraft((prev) => ({ ...prev, matchType: value as PolicyStudioDraft["matchType"] }))
                          }
                        >
                          <SelectTrigger className="bg-background border-border">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(policyCatalog?.matchTypes || []).map((matchTypeOption) => (
                              <SelectItem key={matchTypeOption.value} value={matchTypeOption.value}>
                                {matchTypePlain[matchTypeOption.value] || matchTypeOption.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {policyStudioDraft.customConditions.length}/{MAX_POLICY_CONDITIONS} checks
                        {policyStudioDraft.customConditions.length >= MAX_POLICY_CONDITIONS && " — limit reached"}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addCustomConditionRow}
                        disabled={policyStudioDraft.customConditions.length >= MAX_POLICY_CONDITIONS}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add check
                      </Button>
                    </div>
                    {policyStudioDraft.customConditions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Add at least one check row.</p>
                    ) : (
                      <div className="space-y-3">
                        {policyStudioDraft.customConditions.map((condition, index) => {
                          const selectedField = customContextFields.find((field) => field.field === condition.field)
                          const supportedOperators = getCatalogOperatorsForDataType(
                            policyCatalog,
                            selectedField?.dataType,
                          )
                          const isListOperator = condition.operator === "IN" || condition.operator === "NOT_IN"
                          return (
                            <div key={condition.id} className="rounded-md border border-border p-3 space-y-3 bg-background/40">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs text-muted-foreground">Check {index + 1}</p>
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => moveCustomConditionRow(index, "UP")}
                                    disabled={index === 0}
                                  >
                                    <ArrowUp className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => moveCustomConditionRow(index, "DOWN")}
                                    disabled={index === policyStudioDraft.customConditions.length - 1}
                                  >
                                    <ArrowDown className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeCustomConditionRow(condition.id)}
                                  >
                                    <Trash2 className="w-4 h-4 text-red-400" />
                                  </Button>
                                </div>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <Label>Value to inspect</Label>
                                  <Select
                                    value={condition.field}
                                    onValueChange={(value) => updateCustomConditionField(condition.id, value)}
                                  >
                                    <SelectTrigger className="bg-background border-border">
                                      <SelectValue placeholder="Select field" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {customContextFields.map((field) => (
                                        <SelectItem key={field.field} value={field.field}>
                                          {field.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label>Comparison</Label>
                                  <Select
                                    value={condition.operator}
                                    onValueChange={(value) =>
                                      updateCustomConditionOperator(condition.id, value as PolicyOperator)
                                    }
                                  >
                                    <SelectTrigger className="bg-background border-border">
                                      <SelectValue placeholder="Select operator" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {supportedOperators.map((operator) => (
                                        <SelectItem key={operator.value} value={operator.value}>
                                          {operator.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label>Threshold</Label>
                                  {isListOperator ? (
                                    <Input
                                      value={condition.valueInput}
                                      onChange={(e) => updateCustomConditionValue(condition.id, e.target.value)}
                                      placeholder={
                                        selectedField?.dataType === "number" ? "e.g. 10, 20, 30" : "e.g. NSE, NFO"
                                      }
                                      className="bg-background border-border"
                                    />
                                  ) : (
                                    <Input
                                      type={selectedField?.dataType === "number" ? "number" : "text"}
                                      value={condition.valueInput}
                                      onChange={(e) => updateCustomConditionValue(condition.id, e.target.value)}
                                      placeholder={selectedField?.dataType === "number" ? "Number" : "Text"}
                                      className="bg-background border-border"
                                    />
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="rounded-lg border border-border p-3 space-y-3">
                  <Label className="text-sm font-semibold">What traders see when blocked</Label>
                  <Textarea
                    value={policyStudioDraft.actionMessage}
                    onChange={(e) => setPolicyStudioDraft((prev) => ({ ...prev, actionMessage: e.target.value }))}
                    rows={3}
                    placeholder="Clear sentence shown in the app when this rule blocks them"
                    className="bg-background border-border"
                  />
                </div>
                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="gap-1">
                      <ChevronDown className={`w-4 h-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                      Advanced (priority, match mode, retry)
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3 space-y-3">
                    <div className="rounded-md border border-border p-3 space-y-3 bg-background/40">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <Label>Priority</Label>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex">
                                  <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">
                                Higher priority numbers are checked first when several policies could apply.
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <Input
                            type="number"
                            min="0"
                            max="10000"
                            value={policyStudioDraft.priority}
                            onChange={(e) =>
                              setPolicyStudioDraft((prev) => ({
                                ...prev,
                                priority: normalizeRiskLimitNonNegativeIntegerInput(e.target.value, prev.priority),
                              }))
                            }
                            className="bg-background border-border"
                          />
                        </div>
                        {isPresetAuthoringMode && (
                          <div>
                            <Label>How preset checks combine</Label>
                            <Select
                              value={policyStudioDraft.matchType}
                              onValueChange={(value) =>
                                setPolicyStudioDraft((prev) => ({
                                  ...prev,
                                  matchType: value as PolicyStudioDraft["matchType"],
                                }))
                              }
                            >
                              <SelectTrigger className="bg-background border-border">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(policyCatalog?.matchTypes || []).map((matchTypeOption) => (
                                  <SelectItem key={matchTypeOption.value} value={matchTypeOption.value}>
                                    {matchTypePlain[matchTypeOption.value] || matchTypeOption.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                      <div className="max-w-xs">
                        <Label>Retry hint (seconds, optional)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={policyStudioDraft.retryAfterSeconds ?? ""}
                          onChange={(e) => {
                            const rawValue = e.target.value
                            setPolicyStudioDraft((prev) => ({
                              ...prev,
                              retryAfterSeconds:
                                rawValue === ""
                                  ? null
                                  : normalizeRiskLimitNonNegativeIntegerInput(rawValue, prev.retryAfterSeconds || 0),
                            }))
                          }}
                          className="bg-background border-border"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">Authoring: {policyStudioDraft.authoringMode}</Badge>
                        {isPresetAuthoringMode && (
                          <Badge variant="secondary">Template: {selectedBlueprintProfile.label}</Badge>
                        )}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3">
                <p className="text-sm font-semibold">Review</p>
                <div className="rounded-lg border border-border p-3 bg-background/40 space-y-2">
                  {reviewLines.map((line, idx) => (
                    <p key={`${idx}-${line.slice(0, 24)}`} className="text-sm text-foreground leading-relaxed">
                      {line}
                    </p>
                  ))}
                </div>
                {policyStudioDraft.actionMessage.trim() && (
                  <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 space-y-1">
                    <p className="text-xs font-semibold text-yellow-300 uppercase tracking-wide">
                      What traders see when blocked
                    </p>
                    <p className="text-sm text-foreground">
                      &ldquo;{policyStudioDraft.actionMessage.trim()}&rdquo;
                    </p>
                  </div>
                )}
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Technical detail (optional)</p>
                  {compiledPolicyPreviewState.policy ? (
                    compiledPolicyPreviewState.policy.conditions.map((condition) => (
                      <p key={condition.id} className="text-xs font-mono text-muted-foreground">
                        {condition.field} {condition.operator}{" "}
                        {Array.isArray(condition.value) ? condition.value.join(", ") : String(condition.value)}
                      </p>
                    ))
                  ) : (
                    <p className="text-xs text-destructive">{compiledPolicyPreviewState.error}</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={!canGoBack || savingPolicies}
                className="gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>
              {step < maxStep && (
                <Button
                  type="button"
                  onClick={handlePrimaryNext}
                  disabled={disableNext}
                  className="gap-1 sm:ml-auto"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              )}
              {step === maxStep && (
                <Button
                  type="button"
                  onClick={() => void onSave()}
                  disabled={
                    savingPolicies ||
                    (isPresetAuthoringMode && policyStudioDraft.blueprint === "RAW_POLICY_LOCK") ||
                    !compiledPolicyPreviewState.policy
                  }
                  className="sm:ml-auto w-full sm:w-auto"
                >
                  {savingPolicies
                    ? "Saving…"
                    : editingPolicyId
                      ? "Save changes"
                      : "Create rule"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}