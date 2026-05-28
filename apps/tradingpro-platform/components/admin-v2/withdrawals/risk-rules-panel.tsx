/**
 * File:        components/admin-v2/withdrawals/risk-rules-panel.tsx
 * Module:      admin-v2/withdrawals
 * Purpose:     Admin-tunable rule list. Inline-edit `points`, toggle `isActive`. Display-only
 *              for params (JSON; full editor lands in a Phase 13a follow-up).
 *
 * Exports:
 *   - RiskRulesPanel
 *
 * Side-effects: PATCH /api/admin/withdrawals/risk-rules on edit.
 *
 * Key invariants:
 *   - Rule deletion is intentionally absent — disable instead. The UI never offers a destructive
 *     verb, mirroring the server policy.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

"use client"

import * as React from "react"
import { Power, Save, AlertTriangle } from "lucide-react"
import { useRiskRules, postRuleUpdate } from "./hooks"
import type { RuleRow } from "./types"
import { cn } from "@/lib/utils"

export function RiskRulesPanel() {
  const { data, error, isLoading, mutate } = useRiskRules()
  const rules = data?.rules ?? []

  if (error) {
    return (
      <div className="v2-card rounded-lg p-4 text-sm text-[var(--v2-loss)]">
        {(error as Error).message}
      </div>
    )
  }
  if (isLoading) {
    return (
      <div className="v2-card rounded-lg p-6 text-sm text-[var(--v2-text-mute)]">
        Loading rules…
      </div>
    )
  }
  if (rules.length === 0) {
    return (
      <div className="v2-card rounded-lg p-6 text-sm text-[var(--v2-text-mute)]">
        No risk rules registered. Run <code>npm run db:seed:phase-13a</code> to seed defaults.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-[var(--v2-warn)]/30 bg-[var(--v2-warn-soft)] p-3 text-xs text-[var(--v2-warn)]">
        <p className="flex items-center gap-1.5 font-semibold">
          <AlertTriangle className="h-3.5 w-3.5" />
          Tuning is sacred
        </p>
        <p className="mt-1 text-[11px] text-[var(--v2-text-mute)]">
          Editing points or params here changes the engine for all FUTURE evaluations. Existing
          held withdrawals already snapshotted the firing rule_keys — they will not be re-scored
          until an admin runs "Re-evaluate" on each row.
        </p>
      </div>
      <ul className="space-y-2">
        {rules.map((rule) => (
          <RuleCard key={rule.id} rule={rule} onSaved={() => mutate()} />
        ))}
      </ul>
    </div>
  )
}

function RuleCard({ rule, onSaved }: { rule: RuleRow; onSaved: () => void }) {
  const [points, setPoints] = React.useState(rule.points)
  const [isActive, setIsActive] = React.useState(rule.isActive)
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  const dirty = points !== rule.points || isActive !== rule.isActive

  async function save() {
    setErr(null)
    setBusy(true)
    try {
      await postRuleUpdate({ id: rule.id, points, isActive })
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={cn("v2-card rounded-lg p-4", !rule.isActive && "opacity-60")}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="v2-pill v2-pill-info font-mono text-[10px]">{rule.ruleKey}</span>
            {!rule.isActive ? (
              <span className="v2-pill v2-pill-warning">Disabled</span>
            ) : null}
          </div>
          <h3 className="mt-1.5 text-sm font-semibold text-[var(--v2-text)]">{rule.name}</h3>
          {rule.description ? (
            <p className="mt-1 text-xs text-[var(--v2-text-mute)]">{rule.description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsActive((prev) => !prev)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors",
              isActive
                ? "border-[var(--v2-gain)]/40 bg-[var(--v2-gain-soft)] text-[var(--v2-gain)]"
                : "border-white/[0.08] bg-white/[0.03] text-[var(--v2-text-mute)]",
            )}
          >
            <Power className="h-3 w-3" />
            {isActive ? "Active" : "Disabled"}
          </button>
        </div>
      </header>

      <div className="mt-3 flex flex-wrap items-end gap-4">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
            Points
          </label>
          <input
            type="number"
            value={points}
            onChange={(e) => setPoints(Number(e.target.value) || 0)}
            min={0}
            max={100}
            className="v2-num mt-1 w-20 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-sm text-[var(--v2-text)] focus:border-[var(--v2-border-accent)] focus:outline-none"
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
            Params
          </label>
          <pre className="mt-1 max-h-24 overflow-auto rounded-md border border-white/[0.06] bg-white/[0.02] p-2 font-mono text-[10px] text-[var(--v2-text-mute)]">
            {JSON.stringify(rule.params, null, 2)}
          </pre>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--v2-cobalt)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          <Save className="h-3 w-3" />
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {err ? (
        <p className="mt-2 text-xs text-[var(--v2-loss)]">{err}</p>
      ) : null}
    </li>
  )
}
