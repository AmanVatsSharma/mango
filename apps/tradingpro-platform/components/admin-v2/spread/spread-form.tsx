/**
 * @file components/admin-v2/spread/spread-form.tsx
 * @module admin-v2/spread
 * @description Add/edit form for a spread config row. Used in both the create modal
 *              and inline-edit drawer.
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
import { ApiError } from "@/lib/admin-v2/api-client"
import type { SpreadConfigInput, SpreadConfigRow } from "./types"

interface SpreadFormProps {
  initial?: SpreadConfigRow
  onSaved: (row: SpreadConfigRow) => void
  onDeleted?: () => void
  onCancel?: () => void
}

interface FormState {
  instrument: string
  segment: string
  clientTier: string
  bidMarkupBps: string
  askMarkupBps: string
  isActive: boolean
  reason: string
}

function rowToState(r?: SpreadConfigRow): FormState {
  return {
    instrument: r?.instrument ?? "",
    segment: r?.segment ?? "",
    clientTier: r?.clientTier ?? "",
    bidMarkupBps: r?.bidMarkupBps != null ? String(r.bidMarkupBps) : "",
    askMarkupBps: r?.askMarkupBps != null ? String(r.askMarkupBps) : "",
    isActive: r?.isActive ?? true,
    reason: r?.reason ?? "",
  }
}

export function SpreadForm({ initial, onSaved, onDeleted, onCancel }: SpreadFormProps) {
  const [state, setState] = React.useState<FormState>(() => rowToState(initial))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSave() {
    setBusy(true)
    setError(null)
    try {
      const payload: SpreadConfigInput = {
        instrument: state.instrument.trim() || null,
        segment: state.segment.trim() || null,
        clientTier: state.clientTier.trim() || null,
        bidMarkupBps: Number(state.bidMarkupBps),
        askMarkupBps: Number(state.askMarkupBps),
        isActive: state.isActive,
        reason: state.reason.trim() || null,
      }
      const url = initial
        ? `/api/admin/spread/configs/${initial.id}`
        : "/api/admin/spread/configs"
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
      onSaved(body.row as SpreadConfigRow)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!initial || !onDeleted) return
    if (!window.confirm("Delete this spread config? This is reversible only by re-creating it.")) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/spread/configs/${initial.id}`, { method: "DELETE" })
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
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="sf-instr" className="text-xs text-[var(--v2-text-mute)]">
            Instrument
          </Label>
          <Input
            id="sf-instr"
            placeholder="all"
            value={state.instrument}
            onChange={(e) => setState((s) => ({ ...s, instrument: e.target.value }))}
            className="border-white/[0.08] bg-white/[0.02] font-mono text-xs"
          />
        </div>
        <div>
          <Label htmlFor="sf-seg" className="text-xs text-[var(--v2-text-mute)]">
            Segment
          </Label>
          <Input
            id="sf-seg"
            placeholder="all"
            value={state.segment}
            onChange={(e) => setState((s) => ({ ...s, segment: e.target.value }))}
            className="border-white/[0.08] bg-white/[0.02] font-mono text-xs"
          />
        </div>
        <div>
          <Label htmlFor="sf-tier" className="text-xs text-[var(--v2-text-mute)]">
            Client tier
          </Label>
          <Input
            id="sf-tier"
            placeholder="all"
            value={state.clientTier}
            onChange={(e) => setState((s) => ({ ...s, clientTier: e.target.value }))}
            className="border-white/[0.08] bg-white/[0.02] font-mono text-xs"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="sf-bid" className="text-xs text-[var(--v2-text-mute)]">
            Bid markup (bps)
            <span className="ml-1 font-mono text-[var(--v2-text-faint)]">
              {state.bidMarkupBps && Number.isFinite(Number(state.bidMarkupBps))
                ? `≈ ${(Number(state.bidMarkupBps) / 100).toFixed(3)}%`
                : ""}
            </span>
          </Label>
          <Input
            id="sf-bid"
            type="number"
            step="0.5"
            min="0"
            max="10000"
            value={state.bidMarkupBps}
            onChange={(e) => setState((s) => ({ ...s, bidMarkupBps: e.target.value }))}
            className="v2-num-display border-white/[0.08] bg-white/[0.02]"
          />
        </div>
        <div>
          <Label htmlFor="sf-ask" className="text-xs text-[var(--v2-text-mute)]">
            Ask markup (bps)
            <span className="ml-1 font-mono text-[var(--v2-text-faint)]">
              {state.askMarkupBps && Number.isFinite(Number(state.askMarkupBps))
                ? `≈ ${(Number(state.askMarkupBps) / 100).toFixed(3)}%`
                : ""}
            </span>
          </Label>
          <Input
            id="sf-ask"
            type="number"
            step="0.5"
            min="0"
            max="10000"
            value={state.askMarkupBps}
            onChange={(e) => setState((s) => ({ ...s, askMarkupBps: e.target.value }))}
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
        Active (applies to live quote pipeline)
      </label>

      <div>
        <Label htmlFor="sf-reason" className="text-xs text-[var(--v2-text-mute)]">
          Reason / context
        </Label>
        <Textarea
          id="sf-reason"
          rows={2}
          placeholder="e.g., Wider spread on F&O for VIP tier (post-earnings)"
          value={state.reason}
          onChange={(e) => setState((s) => ({ ...s, reason: e.target.value }))}
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
          <Save className="mr-1.5 h-3.5 w-3.5" /> {busy ? "Saving…" : "Save config"}
        </Button>
      </div>
    </div>
  )
}
