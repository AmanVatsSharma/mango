/**
 * @file components/admin-v2/bonuses/promo-list.tsx
 * @module admin-v2/bonuses
 * @description Promo codes table + add/edit drawer with form. Shows uses progress
 *              (usesCount/maxUses) and expiry distance.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { mutate as globalMutate } from "swr"
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/admin-v2/primitives/empty-state"
import { V2Drawer, V2DrawerBody, V2DrawerHeader } from "@/components/admin-v2/primitives/drawer"
import { ApiError, formatRelativeIst } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"
import { useBonusRules, usePromoCodes } from "./hooks"
import { BONUS_KIND_META, type PromoCodeRow } from "./types"

export function PromoList() {
  const q = usePromoCodes()
  const rules = useBonusRules({ activeOnly: true }).data?.rows ?? []
  const rows = q.data?.rows ?? []
  const [editing, setEditing] = React.useState<PromoCodeRow | null>(null)
  const [creating, setCreating] = React.useState(false)

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--v2-text)]">Promo codes</h3>
          <p className="text-[11px] text-[var(--v2-text-mute)]">
            Codes that map to a bonus rule · redeemed during onboarding or via admin issue.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void q.mutate()}
            className="border-white/[0.08] bg-white/[0.03] text-[var(--v2-text)]"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
          </Button>
          <Button onClick={() => setCreating(true)} size="sm" className="v2-btn-cta">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New code
          </Button>
        </div>
      </div>

      <div className="v2-card overflow-hidden">
        {q.isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--v2-text-mute)]">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No promo codes yet"
            description="Add your first code to support promo redemption flows."
          />
        ) : (
          <table className="min-w-full text-xs">
            <thead className="bg-white/[0.02] text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              <tr>
                <th className="px-3 py-2.5 text-left">Code · Rule</th>
                <th className="px-3 py-2.5 text-right">Uses</th>
                <th className="px-3 py-2.5 text-right">Expires</th>
                <th className="px-3 py-2.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {rows.map((row) => {
                const meta = BONUS_KIND_META[row.ruleKind]
                const usesPct =
                  row.maxUses && row.maxUses > 0
                    ? Math.min(100, (row.usesCount / row.maxUses) * 100)
                    : 0
                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer transition-colors hover:bg-[var(--v2-cobalt-soft)]"
                    onClick={() => setEditing(row)}
                  >
                    <td className="px-3 py-2">
                      <div className="font-mono text-sm font-semibold text-[var(--v2-text)]">
                        {row.code}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--v2-text-mute)]">
                        <span
                          className={cn(
                            "v2-pill",
                            meta.tone === "info"
                              ? "v2-pill-info"
                              : meta.tone === "success"
                                ? "v2-pill-success"
                                : meta.tone === "warning"
                                  ? "v2-pill-warning"
                                  : "v2-pill-neutral",
                          )}
                        >
                          {meta.label}
                        </span>
                        <span className="truncate">{row.ruleName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="v2-num text-sm font-semibold text-[var(--v2-text)]">
                        {row.usesCount}
                        {row.maxUses ? (
                          <span className="font-mono text-[10px] text-[var(--v2-text-faint)]">
                            {" / "}
                            {row.maxUses}
                          </span>
                        ) : null}
                      </div>
                      {row.maxUses ? (
                        <div className="mt-1 ml-auto h-1 w-20 overflow-hidden rounded-full bg-white/[0.04]">
                          <div
                            className="h-full rounded-full bg-[var(--v2-cobalt)]"
                            style={{ width: `${usesPct}%` }}
                          />
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right text-[10px] text-[var(--v2-text-mute)]">
                      {row.expiresAt ? formatRelativeIst(row.expiresAt) : "never"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={cn(
                          "v2-pill",
                          row.isActive ? "v2-pill-success" : "v2-pill-neutral",
                        )}
                      >
                        {row.isActive ? "live" : "off"}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <V2Drawer open={creating} onOpenChange={setCreating}>
        <V2DrawerHeader title="New promo code" subtitle="" onClose={() => setCreating(false)} />
        <V2DrawerBody className="px-4 py-5 sm:px-6">
          <PromoCodeForm
            rules={rules}
            onSaved={() => {
              setCreating(false)
              void q.mutate()
              void globalMutate("/api/admin/bonuses/promo")
            }}
            onCancel={() => setCreating(false)}
          />
        </V2DrawerBody>
      </V2Drawer>

      <V2Drawer open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <V2DrawerHeader
          title="Edit promo code"
          subtitle={editing ? `${editing.code} · ${editing.usesCount} redemptions` : ""}
          onClose={() => setEditing(null)}
        />
        <V2DrawerBody className="px-4 py-5 sm:px-6">
          {editing ? (
            <PromoCodeForm
              rules={rules}
              initial={editing}
              onSaved={() => {
                setEditing(null)
                void q.mutate()
              }}
              onDeleted={() => {
                setEditing(null)
                void q.mutate()
              }}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </V2DrawerBody>
      </V2Drawer>
    </div>
  )
}

interface PromoCodeFormProps {
  rules: { id: string; name: string; kind: string }[]
  initial?: PromoCodeRow
  onSaved: (row: PromoCodeRow) => void
  onDeleted?: () => void
  onCancel?: () => void
}

interface PromoFormState {
  code: string
  ruleId: string
  maxUses: string
  expiresAt: string
  isActive: boolean
  notes: string
}

function PromoCodeForm({ rules, initial, onSaved, onDeleted, onCancel }: PromoCodeFormProps) {
  const [state, setState] = React.useState<PromoFormState>(() => ({
    code: initial?.code ?? "",
    ruleId: initial?.ruleId ?? rules[0]?.id ?? "",
    maxUses: initial?.maxUses != null ? String(initial.maxUses) : "",
    expiresAt: initial?.expiresAt ? initial.expiresAt.slice(0, 10) : "",
    isActive: initial?.isActive ?? true,
    notes: initial?.notes ?? "",
  }))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSave() {
    setBusy(true)
    setError(null)
    try {
      const payload = {
        code: state.code.trim().toUpperCase(),
        ruleId: state.ruleId,
        maxUses: state.maxUses === "" ? null : Number(state.maxUses),
        expiresAt: state.expiresAt ? new Date(state.expiresAt).toISOString() : null,
        isActive: state.isActive,
        notes: state.notes.trim() || null,
      }
      const url = initial ? `/api/admin/bonuses/promo/${initial.id}` : "/api/admin/bonuses/promo"
      const res = await fetch(url, {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new ApiError(body?.message || `Save failed (${res.status})`, res.status)
      }
      const body = await res.json()
      onSaved(body.row as PromoCodeRow)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!initial || !onDeleted) return
    if (!window.confirm(`Delete promo code "${initial.code}"?`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/bonuses/promo/${initial.id}`, { method: "DELETE" })
      if (!res.ok) throw new ApiError(`Delete failed (${res.status})`, res.status)
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="v2-card space-y-3 p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="pc-code" className="text-xs text-[var(--v2-text-mute)]">
            Code
          </Label>
          <Input
            id="pc-code"
            placeholder="e.g., DIWALI100"
            value={state.code}
            onChange={(e) => setState((s) => ({ ...s, code: e.target.value }))}
            className="border-white/[0.08] bg-white/[0.02] font-mono text-sm uppercase tracking-wider"
          />
        </div>
        <div>
          <Label htmlFor="pc-rule" className="text-xs text-[var(--v2-text-mute)]">
            Linked rule
          </Label>
          <select
            id="pc-rule"
            value={state.ruleId}
            onChange={(e) => setState((s) => ({ ...s, ruleId: e.target.value }))}
            className="h-9 w-full rounded-md border border-white/[0.08] bg-white/[0.02] px-2 text-xs text-[var(--v2-text)]"
          >
            {rules.length === 0 ? (
              <option value="">— no active rules —</option>
            ) : (
              rules.map((r) => (
                <option key={r.id} value={r.id} className="bg-[var(--v2-bg-elev-1)]">
                  {r.name} · {r.kind}
                </option>
              ))
            )}
          </select>
        </div>
        <div>
          <Label htmlFor="pc-max" className="text-xs text-[var(--v2-text-mute)]">
            Max uses (blank = unlimited)
          </Label>
          <Input
            id="pc-max"
            type="number"
            step="1"
            min="1"
            placeholder="unlimited"
            value={state.maxUses}
            onChange={(e) => setState((s) => ({ ...s, maxUses: e.target.value }))}
            className="v2-num-display border-white/[0.08] bg-white/[0.02]"
          />
        </div>
        <div>
          <Label htmlFor="pc-exp" className="text-xs text-[var(--v2-text-mute)]">
            Expires (YYYY-MM-DD, blank = never)
          </Label>
          <Input
            id="pc-exp"
            type="date"
            value={state.expiresAt}
            onChange={(e) => setState((s) => ({ ...s, expiresAt: e.target.value }))}
            className="border-white/[0.08] bg-white/[0.02] font-mono text-xs"
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
        Active (redeemable)
      </label>

      <div>
        <Label htmlFor="pc-notes" className="text-xs text-[var(--v2-text-mute)]">
          Notes
        </Label>
        <Textarea
          id="pc-notes"
          rows={2}
          placeholder="e.g., Diwali campaign — first 500 signups"
          value={state.notes}
          onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))}
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
          <Save className="mr-1.5 h-3.5 w-3.5" /> {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  )
}
