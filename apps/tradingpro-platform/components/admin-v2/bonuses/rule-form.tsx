/**
 * @file components/admin-v2/bonuses/rule-form.tsx
 * @module admin-v2/bonuses
 * @description Add/edit form for a bonus rule. Renders kind-aware help text + live amount preview.
 *              Premium broker aesthetic — glass card, brand chips, IBM Plex Mono numerics.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, formatInr } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"
import {
  BONUS_KIND_META,
  BONUS_KINDS,
  type BonusKind,
  type BonusRuleInput,
  type BonusRuleRow,
} from "./types"

interface RuleFormProps {
  initial?: BonusRuleRow
  onSaved: (row: BonusRuleRow) => void
  onDeleted?: () => void
  onCancel?: () => void
}

interface FormState {
  name: string
  kind: BonusKind
  pctOrFlat: string
  maxAmount: string
  turnoverMultiplier: string
  expiryDays: string
  isActive: boolean
  description: string
}

function rowToState(r?: BonusRuleRow): FormState {
  return {
    name: r?.name ?? "",
    kind: r?.kind ?? "DEPOSIT_MATCH",
    pctOrFlat: r?.pctOrFlat != null ? String(r.pctOrFlat) : "",
    maxAmount: r?.maxAmount != null ? String(r.maxAmount) : "",
    turnoverMultiplier: r?.turnoverMultiplier != null ? String(r.turnoverMultiplier) : "5",
    expiryDays: r?.expiryDays != null ? String(r.expiryDays) : "30",
    isActive: r?.isActive ?? true,
    description: r?.description ?? "",
  }
}

export function RuleForm({ initial, onSaved, onDeleted, onCancel }: RuleFormProps) {
  const [state, setState] = React.useState<FormState>(() => rowToState(initial))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const meta = BONUS_KIND_META[state.kind]
  const pctVal = Number(state.pctOrFlat)
  const validPct = Number.isFinite(pctVal) && pctVal > 0
  const maxVal = Number(state.maxAmount)
  const turnoverPreview =
    Number.isFinite(Number(state.turnoverMultiplier)) && Number(state.turnoverMultiplier) >= 1
      ? `${state.turnoverMultiplier}× the grant amount`
      : ""

  async function handleSave() {
    setBusy(true)
    setError(null)
    try {
      const payload: BonusRuleInput = {
        name: state.name.trim(),
        kind: state.kind,
        pctOrFlat: pctVal,
        maxAmount: state.maxAmount === "" ? null : maxVal,
        turnoverMultiplier: Number(state.turnoverMultiplier),
        expiryDays: state.expiryDays === "" ? null : Number(state.expiryDays),
        isActive: state.isActive,
        description: state.description.trim() || null,
      }
      const url = initial
        ? `/api/admin/bonuses/rules/${initial.id}`
        : "/api/admin/bonuses/rules"
      const method = initial ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new ApiError(body?.message || `Save failed (${res.status})`, res.status)
      }
      const body = await res.json()
      onSaved(body.row as BonusRuleRow)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!initial || !onDeleted) return
    if (!window.confirm("Delete this rule? Refused if any grants reference it.")) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/bonuses/rules/${initial.id}`, { method: "DELETE" })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new ApiError(body?.message || `Delete failed (${res.status})`, res.status)
      }
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="v2-card space-y-3 p-5">
      <div>
        <Label htmlFor="rf-name" className="text-xs text-[var(--v2-text-mute)]">
          Rule name
        </Label>
        <Input
          id="rf-name"
          placeholder="e.g., Welcome 100% Deposit Match"
          value={state.name}
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          className="border-white/[0.08] bg-white/[0.02] text-sm"
        />
      </div>

      <div>
        <Label className="text-xs text-[var(--v2-text-mute)]">Kind</Label>
        <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {BONUS_KINDS.map((k) => {
            const m = BONUS_KIND_META[k]
            const active = state.kind === k
            const tone =
              m.tone === "info"
                ? "border-[var(--v2-border-accent)] bg-[var(--v2-cobalt-soft)]"
                : m.tone === "success"
                  ? "border-[rgba(16,233,160,0.3)] bg-[var(--v2-gain-soft)]"
                  : m.tone === "warning"
                    ? "border-[rgba(255,176,32,0.3)] bg-[var(--v2-warn-soft)]"
                    : "border-white/[0.08] bg-white/[0.02]"
            return (
              <button
                key={k}
                type="button"
                onClick={() => setState((s) => ({ ...s, kind: k }))}
                className={cn(
                  "rounded-lg border p-2 text-left transition-all",
                  active
                    ? `${tone} shadow-[0_0_24px_-12px_rgba(77,124,254,0.5)]`
                    : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]",
                )}
              >
                <div className="text-xs font-semibold text-[var(--v2-text)]">{m.label}</div>
                <div className="mt-0.5 text-[10px] leading-tight text-[var(--v2-text-mute)]">
                  {m.description}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="rf-pct" className="text-xs text-[var(--v2-text-mute)]">
            {meta.isPercentage ? "Percentage (%)" : "Flat amount (₹)"}
            <span className="ml-1 font-mono text-[var(--v2-text-faint)]">
              {validPct
                ? meta.isPercentage
                  ? `≈ ${pctVal.toFixed(1)}%`
                  : `≈ ${formatInr(pctVal)}`
                : ""}
            </span>
          </Label>
          <Input
            id="rf-pct"
            type="number"
            step={meta.isPercentage ? "1" : "100"}
            min="0"
            max={meta.isPercentage ? "100" : undefined}
            value={state.pctOrFlat}
            onChange={(e) => setState((s) => ({ ...s, pctOrFlat: e.target.value }))}
            className="v2-num-display border-white/[0.08] bg-white/[0.02]"
          />
        </div>
        <div>
          <Label htmlFor="rf-cap" className="text-xs text-[var(--v2-text-mute)]">
            Max amount cap (₹)
            <span className="ml-1 font-mono text-[var(--v2-text-faint)]">
              {state.maxAmount && Number.isFinite(maxVal) ? `≈ ${formatInr(maxVal)}` : ""}
            </span>
          </Label>
          <Input
            id="rf-cap"
            type="number"
            step="500"
            min="0"
            placeholder="no cap"
            value={state.maxAmount}
            onChange={(e) => setState((s) => ({ ...s, maxAmount: e.target.value }))}
            className="v2-num-display border-white/[0.08] bg-white/[0.02]"
          />
        </div>
        <div>
          <Label htmlFor="rf-mult" className="text-xs text-[var(--v2-text-mute)]">
            Turnover multiplier ×
            <span className="ml-1 text-[var(--v2-text-faint)]">{turnoverPreview}</span>
          </Label>
          <Input
            id="rf-mult"
            type="number"
            step="0.5"
            min="1"
            max="100"
            value={state.turnoverMultiplier}
            onChange={(e) => setState((s) => ({ ...s, turnoverMultiplier: e.target.value }))}
            className="v2-num-display border-white/[0.08] bg-white/[0.02]"
          />
        </div>
        <div>
          <Label htmlFor="rf-exp" className="text-xs text-[var(--v2-text-mute)]">
            Expiry (days, blank = never)
          </Label>
          <Input
            id="rf-exp"
            type="number"
            step="1"
            min="1"
            placeholder="never"
            value={state.expiryDays}
            onChange={(e) => setState((s) => ({ ...s, expiryDays: e.target.value }))}
            className="v2-num-display border-white/[0.08] bg-white/[0.02]"
          />
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--v2-text-mute)]">
        <input
          type="checkbox"
          checked={state.isActive}
          onChange={(e) => setState((s) => ({ ...s, isActive: e.target.checked }))}
          className="h-4 w-4 accent-[var(--v2-cobalt)]"
        />
        Active (available for issuance + promo redemption)
      </label>

      <div>
        <Label htmlFor="rf-desc" className="text-xs text-[var(--v2-text-mute)]">
          Description / context
        </Label>
        <Textarea
          id="rf-desc"
          rows={2}
          placeholder="e.g., 100% match on first deposit, capped at ₹10,000"
          value={state.description}
          onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
          className="border-white/[0.08] bg-white/[0.02] text-xs"
        />
      </div>

      {error ? (
        <div className="rounded-md border border-[rgba(255,77,107,0.3)] bg-[var(--v2-loss-soft)] p-2.5 text-xs text-[var(--v2-loss)]">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {initial && onDeleted ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={busy}
            className="border-[rgba(255,77,107,0.3)] bg-[var(--v2-loss-soft)] text-[var(--v2-loss)] hover:bg-[rgba(255,77,107,0.18)]"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
          </Button>
        ) : null}
        {onCancel ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={busy}
            className="border-white/[0.08] bg-white/[0.03] text-[var(--v2-text-mute)]"
          >
            Cancel
          </Button>
        ) : null}
        <Button onClick={handleSave} disabled={busy} className="v2-btn-cta" size="sm">
          <Save className="mr-1.5 h-3.5 w-3.5" /> {busy ? "Saving…" : "Save rule"}
        </Button>
      </div>
    </div>
  )
}
