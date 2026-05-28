/**
 * @file components/admin-v2/winners/winner-control-panel.tsx
 * @module admin-v2/winners
 * @description Per-client mitigation control panel. Renders:
 *                - Current rung at the top (gradient hero)
 *                - 8-step rung ladder (visual; click to set)
 *                - Override fields (spread mult, position cap, blocks, max notional)
 *                - Pin toggle
 *                - Reason field (required for any change)
 *                - Save · Reset to baseline
 *                - History feed (audit trail)
 *
 *              Used by:
 *                - Standalone /admin-v2/house/winners (drawer)
 *                - Client 360 → Winner Controls tab (lazy-loaded via tab registry)
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { mutate as globalMutate } from "swr"
import {
  AlertOctagon,
  Ban,
  Check,
  Lock,
  Pin,
  PinOff,
  RefreshCcw,
  Save,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, formatInr } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"
import { useWinnerControl } from "./hooks"
import { RungPill } from "./rung-pill"
import {
  WINNER_RUNGS,
  WINNER_RUNG_META,
  type WinnerControlSnapshot,
  type WinnerControlUpdateInput,
  type WinnerRung,
} from "./types"

interface WinnerControlPanelProps {
  userId: string
  /** Optional override snapshot — when caller already has it (Client 360 prefetch). */
  initialControl?: WinnerControlSnapshot
}

interface DraftState {
  rung: WinnerRung
  pinned: boolean
  spreadMultiplier: string
  positionCapPct: string
  maxOrderNotional: string
  blockedInstruments: string
  blockedSegments: string
  reason: string
}

function snapshotToDraft(s: WinnerControlSnapshot | undefined): DraftState {
  return {
    rung: s?.rung ?? "NONE",
    pinned: s?.pinned ?? false,
    spreadMultiplier: s?.spreadMultiplier != null ? String(s.spreadMultiplier) : "",
    positionCapPct: s?.positionCapPct != null ? String(s.positionCapPct) : "",
    maxOrderNotional: s?.maxOrderNotional != null ? String(s.maxOrderNotional) : "",
    blockedInstruments: (s?.blockedInstruments ?? []).join(", "),
    blockedSegments: (s?.blockedSegments ?? []).join(", "),
    reason: "",
  }
}

function draftToInput(draft: DraftState): WinnerControlUpdateInput {
  return {
    rung: draft.rung,
    pinned: draft.pinned,
    spreadMultiplier: draft.spreadMultiplier === "" ? null : Number(draft.spreadMultiplier),
    positionCapPct: draft.positionCapPct === "" ? null : Number(draft.positionCapPct),
    maxOrderNotional: draft.maxOrderNotional === "" ? null : Number(draft.maxOrderNotional),
    blockedInstruments: draft.blockedInstruments
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    blockedSegments: draft.blockedSegments
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    reason: draft.reason.trim() || null,
  }
}

export function WinnerControlPanel({ userId, initialControl }: WinnerControlPanelProps) {
  const q = useWinnerControl(userId)
  const control = q.data?.control ?? initialControl
  const history = q.data?.history ?? []

  const [draft, setDraft] = React.useState<DraftState>(() => snapshotToDraft(control))
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [savedAt, setSavedAt] = React.useState<number | null>(null)

  // Re-sync draft when the underlying snapshot changes (e.g., another admin updated it).
  React.useEffect(() => {
    if (control) setDraft((d) => (d.reason ? d : snapshotToDraft(control)))
  }, [control?.id, control?.rung, control?.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = control
    ? draft.rung !== control.rung ||
      draft.pinned !== control.pinned ||
      Number(draft.spreadMultiplier) !== (control.spreadMultiplier ?? NaN) ||
      Number(draft.positionCapPct) !== (control.positionCapPct ?? NaN) ||
      Number(draft.maxOrderNotional) !== (control.maxOrderNotional ?? NaN) ||
      draft.blockedInstruments !== (control.blockedInstruments ?? []).join(", ") ||
      draft.blockedSegments !== (control.blockedSegments ?? []).join(", ")
    : true

  async function handleSave(action: "MANUAL_SET" | "MANUAL_OVERRIDE" = "MANUAL_SET") {
    if (!draft.reason.trim()) {
      setError("Reason is required for every winner-control change.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/winners/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draftToInput(draft), action }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new ApiError(body?.message || `Save failed (${res.status})`, res.status)
      }
      await Promise.all([q.mutate(), globalMutate("/api/admin/winners/list")])
      setSavedAt(Date.now())
      setDraft((d) => ({ ...d, reason: "" }))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    const reason = window.prompt("Reset this client to baseline. Reason for audit log?")
    if (!reason || !reason.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/winners/${userId}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new ApiError(body?.message || `Reset failed (${res.status})`, res.status)
      }
      await Promise.all([q.mutate(), globalMutate("/api/admin/winners/list")])
      setSavedAt(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed")
    } finally {
      setSaving(false)
    }
  }

  if (q.isLoading && !initialControl) {
    return (
      <div className="v2-card flex h-48 items-center justify-center text-sm text-[var(--v2-text-mute)]">
        Loading winner control…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <CurrentRungHero control={control} />

      <div className="v2-card p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
          Mitigation ladder
        </h3>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {WINNER_RUNGS.map((r) => {
            const meta = WINNER_RUNG_META[r]
            const active = draft.rung === r
            return (
              <button
                key={r}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, rung: r }))}
                className={cn(
                  "group flex items-start gap-2 rounded-xl border p-3 text-left transition-all",
                  active
                    ? "border-[var(--v2-border-accent)] bg-[var(--v2-cobalt-soft)] shadow-[0_0_28px_-12px_rgba(77,124,254,0.5)]"
                    : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[10px]",
                    active
                      ? "bg-[var(--v2-cobalt)] text-white"
                      : "bg-white/[0.04] text-[var(--v2-text-mute)]",
                  )}
                >
                  {meta.severity}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-[var(--v2-text)]">
                    {meta.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-tight text-[var(--v2-text-mute)]">
                    {meta.description}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="v2-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
            Overrides
          </h3>
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, pinned: !d.pinned }))}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
              draft.pinned
                ? "border-[var(--v2-warn)] bg-[var(--v2-warn-soft)] text-[var(--v2-warn)]"
                : "border-white/[0.08] bg-white/[0.03] text-[var(--v2-text-mute)] hover:text-[var(--v2-text)]",
            )}
          >
            {draft.pinned ? (
              <>
                <Pin className="h-3 w-3" /> Pinned (auto-engine off)
              </>
            ) : (
              <>
                <PinOff className="h-3 w-3" /> Auto-engine active
              </>
            )}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="spread-mult" className="text-xs text-[var(--v2-text-mute)]">
              Spread multiplier
              <span className="ml-1 text-[var(--v2-text-faint)]">×</span>
            </Label>
            <Input
              id="spread-mult"
              type="number"
              step="0.05"
              min="0.5"
              max="10"
              placeholder="tier default"
              value={draft.spreadMultiplier}
              onChange={(e) => setDraft((d) => ({ ...d, spreadMultiplier: e.target.value }))}
              className="v2-num-display border-white/[0.08] bg-white/[0.02]"
            />
          </div>
          <div>
            <Label htmlFor="cap-pct" className="text-xs text-[var(--v2-text-mute)]">
              Position cap %
            </Label>
            <Input
              id="cap-pct"
              type="number"
              step="5"
              min="0"
              max="200"
              placeholder="tier default"
              value={draft.positionCapPct}
              onChange={(e) => setDraft((d) => ({ ...d, positionCapPct: e.target.value }))}
              className="v2-num-display border-white/[0.08] bg-white/[0.02]"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="max-notional" className="text-xs text-[var(--v2-text-mute)]">
              Max order notional (₹)
              <span className="ml-1 font-mono text-[var(--v2-text-faint)]">
                {draft.maxOrderNotional !== "" && Number.isFinite(Number(draft.maxOrderNotional))
                  ? `≈ ${formatInr(Number(draft.maxOrderNotional))}`
                  : ""}
              </span>
            </Label>
            <Input
              id="max-notional"
              type="number"
              step="10000"
              min="0"
              placeholder="no cap"
              value={draft.maxOrderNotional}
              onChange={(e) => setDraft((d) => ({ ...d, maxOrderNotional: e.target.value }))}
              className="v2-num-display border-white/[0.08] bg-white/[0.02]"
            />
          </div>
          <div>
            <Label htmlFor="block-instruments" className="text-xs text-[var(--v2-text-mute)]">
              Blocked instruments
            </Label>
            <Input
              id="block-instruments"
              placeholder="RELIANCE, NIFTY-FUT"
              value={draft.blockedInstruments}
              onChange={(e) => setDraft((d) => ({ ...d, blockedInstruments: e.target.value }))}
              className="border-white/[0.08] bg-white/[0.02] font-mono text-xs"
            />
          </div>
          <div>
            <Label htmlFor="block-segments" className="text-xs text-[var(--v2-text-mute)]">
              Blocked segments
            </Label>
            <Input
              id="block-segments"
              placeholder="NFO, MCX"
              value={draft.blockedSegments}
              onChange={(e) => setDraft((d) => ({ ...d, blockedSegments: e.target.value }))}
              className="border-white/[0.08] bg-white/[0.02] font-mono text-xs"
            />
          </div>
        </div>
      </div>

      <div className="v2-card p-5">
        <Label htmlFor="reason" className="mb-2 block text-xs uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
          Reason for change <span className="text-[var(--v2-loss)]">*</span>
        </Label>
        <Textarea
          id="reason"
          rows={2}
          placeholder="e.g., Promoted to SPREAD_WIDEN — flagged latency-arb on NIFTY options"
          value={draft.reason}
          onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))}
          className="border-white/[0.08] bg-white/[0.02] text-sm"
        />

        {error ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-[rgba(255,77,107,0.3)] bg-[var(--v2-loss-soft)] p-2.5 text-xs text-[var(--v2-loss)]">
            <AlertOctagon className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        {savedAt ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-[var(--v2-gain)]">
            <Check className="h-3.5 w-3.5" /> Saved · auto-engine signal sent
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={saving}
            className="border-white/[0.08] bg-white/[0.03] text-[var(--v2-text-mute)] hover:text-[var(--v2-text)]"
          >
            <RefreshCcw className="mr-1.5 h-3.5 w-3.5" /> Reset to baseline
          </Button>
          <Button
            onClick={() => handleSave("MANUAL_SET")}
            disabled={saving || !dirty}
            className="v2-btn-cta"
            size="sm"
          >
            <Save className="mr-1.5 h-3.5 w-3.5" /> {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <HistoryFeed history={history} />
    </div>
  )
}

function CurrentRungHero({ control }: { control?: WinnerControlSnapshot }) {
  if (!control) return null
  const meta = WINNER_RUNG_META[control.rung]
  const tone =
    meta.tone === "danger"
      ? "from-[rgba(255,77,107,0.18)] to-transparent border-[rgba(255,77,107,0.32)]"
      : meta.tone === "warning"
        ? "from-[rgba(255,176,32,0.16)] to-transparent border-[rgba(255,176,32,0.32)]"
        : meta.tone === "info"
          ? "from-[rgba(91,193,255,0.14)] to-transparent border-[rgba(91,193,255,0.32)]"
          : "from-white/[0.04] to-transparent border-white/[0.08]"

  return (
    <div
      className={cn(
        "v2-card relative overflow-hidden bg-gradient-to-br p-5",
        tone,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/[0.04] blur-3xl"
      />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--v2-text-faint)]">
            <Sparkles className="h-3 w-3" /> Current rung
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-3xl font-semibold tracking-tight v2-text-grad-primary">
              {meta.label}
            </span>
            <RungPill rung={control.rung} size="md" showSeverity />
          </div>
          <p className="mt-1.5 max-w-2xl text-xs text-[var(--v2-text-mute)]">{meta.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          {control.spreadMultiplier ? (
            <Stat label="Spread ×" value={`${control.spreadMultiplier}×`} />
          ) : null}
          {control.positionCapPct ? (
            <Stat label="Pos cap" value={`${control.positionCapPct}%`} />
          ) : null}
          {control.maxOrderNotional ? (
            <Stat label="Max notional" value={formatInr(control.maxOrderNotional)} />
          ) : null}
          {control.blockedInstruments.length ? (
            <Stat label="Blocked instr" value={String(control.blockedInstruments.length)} icon={<Ban className="h-3 w-3" />} />
          ) : null}
          {control.blockedSegments.length ? (
            <Stat label="Blocked seg" value={String(control.blockedSegments.length)} icon={<Ban className="h-3 w-3" />} />
          ) : null}
          {control.pinned ? (
            <Stat label="Pinned" value="auto-off" icon={<Lock className="h-3 w-3" />} />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-black/20 px-2 py-1">
      {icon ? <span className="text-[var(--v2-text-faint)]">{icon}</span> : null}
      <span className="font-mono text-[var(--v2-text-mute)]">{label}</span>
      <span className="v2-num font-semibold text-[var(--v2-text)]">{value}</span>
    </div>
  )
}

function HistoryFeed({ history }: { history: import("./types").WinnerHistoryEntry[] }) {
  if (history.length === 0) {
    return (
      <div className="v2-card p-4 text-center text-xs text-[var(--v2-text-mute)]">
        No history yet — the audit trail will populate after the first action.
      </div>
    )
  }
  return (
    <div className="v2-card overflow-hidden">
      <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
          Audit trail
        </h3>
        <span className="text-[10px] text-[var(--v2-text-faint)]">{history.length} entries</span>
      </header>
      <ol className="divide-y divide-white/[0.04]">
        {history.map((h) => (
          <li key={h.id} className="grid grid-cols-12 items-center gap-3 px-4 py-2.5 text-xs">
            <span className="col-span-2 font-mono text-[10px] text-[var(--v2-text-faint)]">
              {new Date(h.createdAt).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </span>
            <span className="col-span-2 font-mono text-[10px] uppercase text-[var(--v2-text-mute)]">
              {h.action}
            </span>
            <span className="col-span-3 flex items-center gap-1.5">
              <RungPill rung={h.fromRung} size="xs" />
              <span className="text-[var(--v2-text-faint)]">→</span>
              <RungPill rung={h.toRung} size="xs" />
            </span>
            <span className="col-span-2 truncate text-[var(--v2-text-mute)]">
              {h.triggeredByName ?? "auto"}
            </span>
            <span className="col-span-3 truncate text-[var(--v2-text-mute)]">
              {h.reason ?? ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
