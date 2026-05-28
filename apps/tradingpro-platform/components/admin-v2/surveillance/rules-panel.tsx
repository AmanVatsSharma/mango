/**
 * File:        components/admin-v2/surveillance/rules-panel.tsx
 * Module:      admin-v2/surveillance
 * Purpose:     Admin-tunable surveillance rule registry. Inline edit base confidence,
 *              severity, and active toggle. JSON params view (read-only — params edits
 *              ship in 13b.5; tuning the load-bearing knobs requires a dedicated form).
 *
 * Exports:
 *   - RulesPanel — props: { canEdit }
 *
 * Depends on:
 *   - ./hooks   — useSurveillanceRules + patchRule + runBatch
 *   - ./severity-pill
 *
 * Side-effects: SWR + PATCH mutators.
 *
 * Key invariants:
 *   - "Tuning is sacred" — tweaking baseConfidence/severity/isActive is an audited mutation.
 *     Past alerts already snapshotted their params at fire-time so this never rewrites history.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

"use client"

import * as React from "react"
import { Loader2, PlayCircle, ShieldAlert, ToggleLeft, ToggleRight } from "lucide-react"
import { useSurveillanceRules, patchRule, runBatch } from "./hooks"
import { SeverityPill } from "./severity-pill"
import type { SurveillanceRuleRow, SurveillanceSeverity } from "./types"
import { ApiError } from "@/lib/admin-v2/api-client"

const SEVERITY_VALUES: SurveillanceSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

export interface RulesPanelProps {
  canEdit: boolean
}

export function RulesPanel({ canEdit }: RulesPanelProps) {
  const { data, mutate, isLoading } = useSurveillanceRules()
  const [savingKey, setSavingKey] = React.useState<string | null>(null)
  const [batching, setBatching] = React.useState(false)
  const [batchReport, setBatchReport] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function save(rule: SurveillanceRuleRow, patch: Partial<SurveillanceRuleRow>) {
    if (!canEdit) {
      setError("You don't have permission to edit rules. Super-admin only.")
      return
    }
    setSavingKey(rule.ruleKey)
    setError(null)
    try {
      await patchRule({
        ruleKey: rule.ruleKey,
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        ...(patch.severity ? { severity: patch.severity } : {}),
        ...(patch.baseConfidence !== undefined
          ? { baseConfidence: patch.baseConfidence }
          : {}),
      })
      await mutate()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setSavingKey(null)
    }
  }

  async function triggerBatch() {
    if (!canEdit) {
      setError("Manual batch trigger requires super-admin.")
      return
    }
    setBatching(true)
    setBatchReport(null)
    setError(null)
    try {
      const r = await runBatch()
      const totalFires = r.reports.reduce((sum, x) => sum + x.fires, 0)
      const errored = r.reports.filter((x) => x.errored).length
      setBatchReport(`Batch ran. Total fires: ${totalFires}. Errored rules: ${errored}.`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setBatching(false)
    }
  }

  const rules = data?.rules ?? []

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--v2-text)]">Surveillance rules</h2>
          <p className="text-xs text-[var(--v2-text-mute)]">
            Tune the engine. Changes take effect immediately for new alerts; past alerts keep their original
            params snapshot.
          </p>
        </div>
        <button
          type="button"
          onClick={triggerBatch}
          disabled={!canEdit || batching}
          className="inline-flex items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-[var(--v2-text)] hover:border-[var(--v2-border-accent)] disabled:cursor-not-allowed disabled:opacity-40"
          title={canEdit ? "Run the batch immediately" : "Super-admin only"}
        >
          {batching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
          Run batch now
        </button>
      </header>

      {batchReport ? (
        <div className="rounded-md border border-white/[0.06] bg-[var(--v2-info-soft)] px-3 py-2 text-xs text-[var(--v2-info)]">
          {batchReport}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-[var(--v2-loss)] bg-[var(--v2-loss-soft)] px-3 py-2 text-xs text-[var(--v2-loss)]">
          {error}
        </div>
      ) : null}

      {!canEdit ? (
        <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-[var(--v2-text-mute)]">
          <ShieldAlert className="mr-2 inline-block h-3.5 w-3.5" />
          Read-only — surveillance rule editing requires super-admin.
        </div>
      ) : null}

      {isLoading ? (
        <div className="text-xs text-[var(--v2-text-mute)]">Loading rules…</div>
      ) : (
        <div className="grid gap-3">
          {rules.map((rule) => {
            const saving = savingKey === rule.ruleKey
            return (
              <div
                key={rule.ruleKey}
                className="v2-card flex flex-col gap-3 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-[var(--v2-text)]">{rule.name}</h3>
                      <SeverityPill severity={rule.severity} />
                      <code className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-[var(--v2-text-mute)]">
                        {rule.ruleKey}
                      </code>
                    </div>
                    {rule.description ? (
                      <p className="mt-1 max-w-2xl text-xs text-[var(--v2-text-mute)]">
                        {rule.description}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => save(rule, { isActive: !rule.isActive })}
                    disabled={!canEdit || saving}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] px-2.5 py-1 text-[11px] hover:border-[var(--v2-border-accent)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {rule.isActive ? (
                      <ToggleRight className="h-4 w-4 text-[var(--v2-gain)]" />
                    ) : (
                      <ToggleLeft className="h-4 w-4 text-[var(--v2-text-mute)]" />
                    )}
                    {rule.isActive ? "Active" : "Disabled"}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="text-[10px] uppercase tracking-wider text-[var(--v2-text-mute)]">
                    Severity
                    <select
                      value={rule.severity}
                      disabled={!canEdit || saving}
                      onChange={(e) => save(rule, { severity: e.target.value as SurveillanceSeverity })}
                      className="mt-1 block w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-xs text-[var(--v2-text)] outline-none focus:border-[var(--v2-border-accent)] disabled:opacity-50"
                    >
                      {SEVERITY_VALUES.map((s) => (
                        <option key={s} value={s} className="bg-[var(--v2-bg-deep)]">
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-[10px] uppercase tracking-wider text-[var(--v2-text-mute)]">
                    Base confidence (0-100)
                    <input
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={rule.baseConfidence}
                      disabled={!canEdit || saving}
                      onBlur={(e) => {
                        const n = Number(e.target.value)
                        if (Number.isFinite(n) && n !== rule.baseConfidence) {
                          save(rule, { baseConfidence: Math.max(0, Math.min(100, Math.round(n))) })
                        }
                      }}
                      className="mt-1 block w-full rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-xs text-[var(--v2-text)] outline-none focus:border-[var(--v2-border-accent)] disabled:opacity-50"
                    />
                  </label>

                  <div className="text-[10px] uppercase tracking-wider text-[var(--v2-text-mute)]">
                    Updated
                    <div className="mt-1 text-[11px] font-mono text-[var(--v2-text)]">
                      {new Date(rule.updatedAt).toLocaleString("en-IN")}
                    </div>
                  </div>
                </div>

                <details className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-[var(--v2-text-mute)]">
                  <summary className="cursor-pointer select-none text-[var(--v2-text)]">Params (JSON)</summary>
                  <pre className="mt-2 overflow-auto text-[10px] leading-relaxed">
                    {JSON.stringify(rule.params, null, 2)}
                  </pre>
                </details>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
