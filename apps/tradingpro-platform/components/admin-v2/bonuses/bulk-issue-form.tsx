/**
 * @file components/admin-v2/bonuses/bulk-issue-form.tsx
 * @module admin-v2/bonuses
 * @description Campaign-style bulk grant issuance — pick rule + amount + paste user-id list,
 *              hit Run. Returns aggregate result with per-row failures rendered.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { Sparkles, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, formatInr } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"
import { useBonusRules } from "./hooks"
import type { BulkIssueResult } from "./types"

export function BulkIssueForm({ onIssued }: { onIssued?: () => void }) {
  const rulesQuery = useBonusRules({ activeOnly: true })
  const rules = rulesQuery.data?.rows ?? []
  const [ruleId, setRuleId] = React.useState("")
  const [amount, setAmount] = React.useState("500")
  const [source, setSource] = React.useState("")
  const [userIdsText, setUserIdsText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<BulkIssueResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (rules.length > 0 && !ruleId) setRuleId(rules[0].id)
  }, [rules.length, ruleId]) // eslint-disable-line react-hooks/exhaustive-deps

  const userIds = React.useMemo(
    () =>
      userIdsText
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [userIdsText],
  )

  async function handleRun() {
    if (!ruleId) {
      setError("Pick a bonus rule")
      return
    }
    if (userIds.length === 0) {
      setError("Paste at least one user id")
      return
    }
    if (userIds.length > 500) {
      setError("Cap is 500 user ids per request")
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/admin/bonuses/grants/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruleId,
          amount: Number(amount),
          userIds,
          source: source.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new ApiError(body?.message || `Bulk issue failed (${res.status})`, res.status)
      }
      const body = (await res.json()) as BulkIssueResult
      setResult(body)
      if (body.granted > 0 && onIssued) onIssued()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk issue failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="v2-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.06] bg-[var(--v2-cobalt-soft)] text-[#9DB6FF]">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-[var(--v2-text)]">Bulk issue</h3>
          <p className="text-[11px] text-[var(--v2-text-mute)]">
            Campaign-style grant issuance · cap 500 ids/request
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Label htmlFor="bi-rule" className="text-xs text-[var(--v2-text-mute)]">
            Rule
          </Label>
          <select
            id="bi-rule"
            value={ruleId}
            onChange={(e) => setRuleId(e.target.value)}
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
          <Label htmlFor="bi-amt" className="text-xs text-[var(--v2-text-mute)]">
            Amount per grant (₹)
            <span className="ml-1 font-mono text-[var(--v2-text-faint)]">
              {Number.isFinite(Number(amount)) ? `≈ ${formatInr(Number(amount))}` : ""}
            </span>
          </Label>
          <Input
            id="bi-amt"
            type="number"
            step="100"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="v2-num-display border-white/[0.08] bg-white/[0.02]"
          />
        </div>
      </div>

      <div className="mt-3">
        <Label htmlFor="bi-src" className="text-xs text-[var(--v2-text-mute)]">
          Campaign source tag (optional)
        </Label>
        <Input
          id="bi-src"
          placeholder="e.g., diwali2026"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="border-white/[0.08] bg-white/[0.02] font-mono text-xs"
        />
      </div>

      <div className="mt-3">
        <Label htmlFor="bi-ids" className="text-xs text-[var(--v2-text-mute)]">
          User ids (comma or newline separated)
          <span className="ml-1 font-mono text-[var(--v2-text-faint)]">
            <Users className="mr-0.5 inline h-3 w-3" />
            {userIds.length} parsed
          </span>
        </Label>
        <Textarea
          id="bi-ids"
          rows={5}
          placeholder="paste one user id per line"
          value={userIdsText}
          onChange={(e) => setUserIdsText(e.target.value)}
          className="border-white/[0.08] bg-white/[0.02] font-mono text-[11px]"
        />
      </div>

      {error ? (
        <div className="mt-3 rounded-md border border-[rgba(255,77,107,0.3)] bg-[var(--v2-loss-soft)] p-2.5 text-xs text-[var(--v2-loss)]">
          {error}
        </div>
      ) : null}

      <div className="mt-3 flex justify-end">
        <Button onClick={handleRun} disabled={busy} className="v2-btn-cta" size="sm">
          {busy ? "Running…" : `Run · grant to ${userIds.length}`}
        </Button>
      </div>

      {result ? (
        <div
          className={cn(
            "mt-4 rounded-xl border p-3 text-xs",
            result.success
              ? "border-[rgba(16,233,160,0.3)] bg-[var(--v2-gain-soft)] text-[var(--v2-gain)]"
              : "border-[rgba(255,176,32,0.3)] bg-[var(--v2-warn-soft)] text-[var(--v2-warn)]",
          )}
        >
          <div className="font-semibold">
            {result.granted} of {result.attempted} granted ·{" "}
            {result.failed.length} failed
          </div>
          {result.failed.length > 0 ? (
            <ol className="mt-2 max-h-40 space-y-1 overflow-y-auto font-mono text-[10px]">
              {result.failed.slice(0, 50).map((f) => (
                <li key={f.userId}>
                  <span className="text-[var(--v2-text-faint)]">{f.userId.slice(0, 12)}…</span>
                  {" · "}
                  <span className="text-[var(--v2-text-mute)]">{f.reason}</span>
                </li>
              ))}
              {result.failed.length > 50 ? (
                <li className="text-[var(--v2-text-faint)]">
                  …{result.failed.length - 50} more
                </li>
              ) : null}
            </ol>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
