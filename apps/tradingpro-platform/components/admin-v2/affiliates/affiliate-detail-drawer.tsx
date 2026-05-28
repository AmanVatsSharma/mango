/**
 * @file components/admin-v2/affiliates/affiliate-detail-drawer.tsx
 * @module admin-v2/affiliates
 * @description Slide-in drawer with the full affiliate profile: identity, KPIs, commission
 *              rules, sub-affiliate children, parent linkage, and quick actions
 *              (recompute tier, suspend/activate, create payout).
 *
 * @author StockTrade
 * @created 2026-04-27
 */

"use client"

import * as React from "react"
import {
  Activity,
  Banknote,
  Crown,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldOff,
  TreePine,
  X,
} from "lucide-react"
import {
  V2Drawer,
  V2DrawerBody,
  V2DrawerHeader,
} from "@/components/admin-v2/primitives"
import { formatDateTimeIst, formatInr, formatRelativeIst } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"
import { useAffiliateDetail } from "./hooks"
import type { CommissionRule, Status, Tier } from "./types"

interface Props {
  affiliateId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onMutate?: () => void
}

const TIER_CHIP: Record<Tier, string> = {
  BRONZE: "border-white/[0.06] bg-white/[0.04] text-[var(--v2-text-mute)]",
  SILVER: "border-[#C0C0C0]/30 bg-[#C0C0C0]/10 text-[#D4D4D4]",
  GOLD: "border-[var(--v2-warning)]/40 bg-[var(--v2-warning)]/10 text-[#FFD995]",
}

const KIND_TONE: Record<CommissionRule["kind"], string> = {
  SPREAD: "text-[var(--v2-cobalt)]",
  LOSS: "text-[var(--v2-loss)]",
  LOT: "text-[var(--v2-warning)]",
  FIXED: "text-[var(--v2-gain)]",
}

export function AffiliateDetailDrawer({ affiliateId, open, onOpenChange, onMutate }: Props) {
  const detail = useAffiliateDetail(affiliateId)
  const [busy, setBusy] = React.useState<"recompute" | "suspend" | "activate" | "payout" | null>(null)
  const [actionMsg, setActionMsg] = React.useState<string | null>(null)
  const [tdsRate, setTdsRate] = React.useState<number>(0.05) // 5% default UI value (admin must confirm)
  const [showRuleForm, setShowRuleForm] = React.useState(false)

  const aff = detail.data?.row

  async function postAction(url: string, body: Record<string, unknown> | null = null): Promise<void> {
    setActionMsg(null)
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = (await res.json().catch(() => null)) as { success?: boolean; message?: string } | null
    if (!res.ok || !json?.success) {
      throw new Error(json?.message ?? `Failed (${res.status})`)
    }
  }

  async function recomputeTier() {
    if (!aff) return
    setBusy("recompute")
    try {
      await postAction(`/api/admin/affiliates/${aff.id}/recompute-tier`)
      setActionMsg("Tier recomputed.")
      await detail.mutate()
      onMutate?.()
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(null)
    }
  }

  async function setStatus(next: Status) {
    if (!aff) return
    setBusy(next === "ACTIVE" ? "activate" : "suspend")
    try {
      const res = await fetch(`/api/admin/affiliates/${aff.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ status: next }),
      })
      const json = (await res.json().catch(() => null)) as { success?: boolean; message?: string } | null
      if (!res.ok || !json?.success) throw new Error(json?.message ?? `Failed (${res.status})`)
      setActionMsg(`Status set to ${next}`)
      await detail.mutate()
      onMutate?.()
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(null)
    }
  }

  async function createPayout() {
    if (!aff) return
    if (!Number.isFinite(tdsRate) || tdsRate < 0 || tdsRate > 1) {
      setActionMsg("TDS rate must be a fraction in [0, 1]")
      return
    }
    if (!window.confirm(
      `Bundle all ACCRUED/PAYABLE commissions into a payout with ${(tdsRate * 100).toFixed(1)}% TDS?`,
    )) return
    setBusy("payout")
    try {
      await postAction("/api/admin/affiliates/payouts", {
        affiliateId: aff.id,
        tdsRate,
      })
      setActionMsg("Payout created — visit the Payouts tab to approve + mark paid.")
      await detail.mutate()
      onMutate?.()
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(null)
    }
  }

  return (
    <V2Drawer open={open} onOpenChange={onOpenChange} width="wide">
      <V2DrawerHeader
        title={aff?.name ?? (affiliateId ? "Loading…" : "Affiliate")}
        subtitle={aff ? `${aff.affiliateCode} · ${aff.email}` : undefined}
        onClose={() => onOpenChange(false)}
        actions={
          aff && (
            <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]", TIER_CHIP[aff.tier])}>
              {aff.tier}
            </span>
          )
        }
      />
      <V2DrawerBody className="px-5 py-5 space-y-4">
        {detail.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--v2-text-mute)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading affiliate…
          </div>
        ) : !aff ? (
          <p className="text-sm text-[var(--v2-loss)]">Failed to load affiliate.</p>
        ) : (
          <>
            {/* KPI strip */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Lifetime accrued" value={formatInr(aff.totals?.lifetime ?? 0)} tone="info" />
              <Stat label="Pending" value={formatInr(aff.totals?.pending ?? 0)} tone="warning" />
              <Stat label="Paid out" value={formatInr(aff.totals?.paid ?? 0)} tone="success" />
              <Stat label="Clients" value={String(aff.attributedCount)} tone="neutral" />
            </section>

            {/* Identity + lineage */}
            <section className="v2-card p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">Identity</h3>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
                <Row k="Code"><span className="v2-num">{aff.affiliateCode}</span></Row>
                <Row k="Status">{aff.status}</Row>
                <Row k="Phone">{aff.phone ?? "—"}</Row>
                <Row k="Joined">{formatDateTimeIst(aff.createdAt)}</Row>
                <Row k="Parent IB">
                  {aff.parentAffiliate ? (
                    <span className="v2-num text-[#9DB6FF]">{aff.parentAffiliate.affiliateCode}</span>
                  ) : (
                    <span className="text-[var(--v2-text-faint)]">root</span>
                  )}
                </Row>
                <Row k="Sub-IBs">
                  <span className="inline-flex items-center gap-1 text-[var(--v2-text)]">
                    <TreePine className="h-3.5 w-3.5 text-[var(--v2-text-mute)]" /> {aff.children?.length ?? 0}
                  </span>
                </Row>
                {aff.linkedUser ? (
                  <Row k="Linked trader">
                    <a
                      href={`/admin-v2/clients/${aff.linkedUser.id}`}
                      className="inline-flex items-center gap-1 text-[#9DB6FF] hover:underline"
                    >
                      {aff.linkedUser.name ?? aff.linkedUser.email ?? aff.linkedUser.id}
                      <ExternalLink className="h-3 w-3 opacity-70" />
                    </a>
                  </Row>
                ) : null}
              </dl>
            </section>

            {/* Children */}
            {aff.children && aff.children.length > 0 ? (
              <section className="v2-card p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
                  Sub-affiliates ({aff.children.length})
                </h3>
                <ul className="space-y-1.5 text-xs">
                  {aff.children.map((c) => (
                    <li key={c.id} className="flex items-center justify-between rounded-md border border-white/[0.04] bg-white/[0.02] px-2 py-1.5">
                      <span className="v2-num text-[var(--v2-text)]">{c.affiliateCode}</span>
                      <span className="text-[var(--v2-text-mute)]">{c.name}</span>
                      <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]", TIER_CHIP[c.tier])}>
                        {c.tier}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* Commission rules */}
            <section className="v2-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
                  Commission rules
                </h3>
                <button
                  type="button"
                  onClick={() => setShowRuleForm((s) => !s)}
                  className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#9DB6FF] hover:underline"
                >
                  {showRuleForm ? "Cancel" : "+ Add rule"}
                </button>
              </div>
              {showRuleForm && (
                <RuleForm
                  affiliateId={aff.id}
                  onSaved={async () => {
                    setShowRuleForm(false)
                    await detail.mutate()
                    onMutate?.()
                  }}
                />
              )}
              {aff.commissionRules && aff.commissionRules.length > 0 ? (
                <ul className="space-y-1.5 text-xs">
                  {aff.commissionRules.map((r) => (
                    <li
                      key={r.id}
                      className={cn(
                        "flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/[0.04] bg-white/[0.02] px-2 py-1.5",
                        !r.isActive && "opacity-50",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className={cn("font-semibold uppercase tracking-[0.06em] text-[10px]", KIND_TONE[r.kind])}>
                          {r.kind}
                        </span>
                        <span className="v2-num text-[var(--v2-text)]">
                          {r.kind === "SPREAD" || r.kind === "LOSS"
                            ? `${(Number(r.rate) * 100).toFixed(2)}%`
                            : r.kind === "LOT"
                              ? `₹${Number(r.rate).toFixed(2)}/lot`
                              : `₹${Number(r.rate).toFixed(2)} fixed`}
                        </span>
                        {r.perEventCap != null ? (
                          <span className="text-[10px] text-[var(--v2-text-faint)]">
                            cap/event {formatInr(r.perEventCap)}
                          </span>
                        ) : null}
                        {r.perMonthCap != null ? (
                          <span className="text-[10px] text-[var(--v2-text-faint)]">
                            cap/mo {formatInr(r.perMonthCap)}
                          </span>
                        ) : null}
                      </div>
                      <span className="text-[10px] text-[var(--v2-text-faint)]">
                        {r.isActive ? "active" : "deactivated"} · added {formatRelativeIst(r.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[var(--v2-text-faint)]">No commission rules — no commissions will accrue.</p>
              )}
            </section>

            {/* Actions */}
            <section className="v2-card p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
                Actions
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={recomputeTier}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--v2-border-accent)] bg-[var(--v2-cobalt-soft)] px-2.5 py-1.5 text-[11px] font-medium text-[#9DB6FF] hover:brightness-110 disabled:opacity-50"
                >
                  <RefreshCw className="h-3 w-3" /> Recompute tier
                </button>
                {aff.status === "ACTIVE" ? (
                  <button
                    type="button"
                    onClick={() => setStatus("SUSPENDED")}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--v2-loss)]/40 bg-[var(--v2-loss)]/10 px-2.5 py-1.5 text-[11px] font-semibold text-[#FFB1BC] hover:bg-[var(--v2-loss)]/15 disabled:opacity-50"
                  >
                    <ShieldOff className="h-3 w-3" /> Suspend
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setStatus("ACTIVE")}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--v2-gain)]/40 bg-[var(--v2-gain)]/10 px-2.5 py-1.5 text-[11px] font-semibold text-[#7CF6C5] hover:bg-[var(--v2-gain)]/15 disabled:opacity-50"
                  >
                    <Crown className="h-3 w-3" /> Activate
                  </button>
                )}
                <div className="ml-auto flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
                  <label className="text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
                    TDS %
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
                    value={(tdsRate * 100).toFixed(1)}
                    onChange={(e) => setTdsRate(Number(e.target.value) / 100)}
                    className="w-14 rounded border border-white/[0.06] bg-white/[0.02] px-1 py-0.5 text-right text-xs text-[var(--v2-text)]"
                  />
                  <button
                    type="button"
                    onClick={createPayout}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--v2-border-accent)] bg-[var(--v2-cobalt-soft)] px-2.5 py-1 text-[11px] font-semibold text-[#9DB6FF] hover:brightness-110 disabled:opacity-50"
                  >
                    <Banknote className="h-3 w-3" /> Create payout
                  </button>
                </div>
              </div>
              {actionMsg && (
                <p className="mt-2 text-xs text-[var(--v2-text)]">{actionMsg}</p>
              )}
              <p className="mt-3 text-[10px] text-[var(--v2-text-faint)]">
                The TDS rate is recorded per-payout and audit-logged. Engage finance/legal counsel
                before approving real disbursements.
              </p>
            </section>
          </>
        )}
      </V2DrawerBody>
    </V2Drawer>
  )
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone: "info" | "warning" | "success" | "neutral" }) {
  const toneCls =
    tone === "info"
      ? "text-[var(--v2-cobalt)]"
      : tone === "warning"
        ? "text-[var(--v2-warning)]"
        : tone === "success"
          ? "text-[var(--v2-gain)]"
          : "text-[var(--v2-text)]"
  return (
    <div className="v2-card p-3">
      <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
        {label}
      </div>
      <div className={cn("mt-1 v2-num-display text-2xl font-semibold", toneCls)}>{value}</div>
    </div>
  )
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-[var(--v2-text-mute)]">{k}</dt>
      <dd className="text-[var(--v2-text)]">{children}</dd>
    </>
  )
}

const RULE_INPUT = "rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-xs text-[var(--v2-text)] placeholder:text-[var(--v2-text-faint)] focus:border-[var(--v2-border-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--v2-border-accent)]"

function RuleForm({ affiliateId, onSaved }: { affiliateId: string; onSaved: () => void | Promise<void> }) {
  const [kind, setKind] = React.useState<CommissionRule["kind"]>("SPREAD")
  const [rate, setRate] = React.useState<string>("0.30")
  const [perEventCap, setPerEventCap] = React.useState<string>("")
  const [perMonthCap, setPerMonthCap] = React.useState<string>("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const rateNum = Number(rate)
      if (!Number.isFinite(rateNum) || rateNum < 0) throw new Error("rate must be ≥ 0")
      const res = await fetch(`/api/admin/affiliates/${affiliateId}/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          kind,
          rate: rateNum,
          perEventCap: perEventCap ? Number(perEventCap) : null,
          perMonthCap: perMonthCap ? Number(perMonthCap) : null,
        }),
      })
      const body = (await res.json().catch(() => null)) as { success?: boolean; message?: string } | null
      if (!res.ok || !body?.success) throw new Error(body?.message ?? `Failed (${res.status})`)
      await onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mb-3 space-y-2 rounded-md border border-[var(--v2-border-accent)] bg-[var(--v2-cobalt-soft)]/60 p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value as CommissionRule["kind"])} className={cn(RULE_INPUT, "mt-1 w-full")}>
            <option value="SPREAD">SPREAD (% of spread revenue)</option>
            <option value="LOSS">LOSS (% of broker gain)</option>
            <option value="LOT">LOT (₹ per lot)</option>
            <option value="FIXED">FIXED (₹ per closing trade)</option>
          </select>
        </label>
        <label className="text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
          Rate
          <input
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder={kind === "SPREAD" || kind === "LOSS" ? "0.30 = 30%" : "10.00"}
            className={cn(RULE_INPUT, "mt-1 w-full")}
          />
        </label>
        <label className="text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
          Per-event cap (₹)
          <input
            value={perEventCap}
            onChange={(e) => setPerEventCap(e.target.value)}
            placeholder="optional"
            className={cn(RULE_INPUT, "mt-1 w-full")}
          />
        </label>
        <label className="text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
          Per-month cap (₹)
          <input
            value={perMonthCap}
            onChange={(e) => setPerMonthCap(e.target.value)}
            placeholder="optional"
            className={cn(RULE_INPUT, "mt-1 w-full")}
          />
        </label>
      </div>
      {error && <p className="text-xs text-[var(--v2-loss)]">{error}</p>}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--v2-border-accent)] bg-[var(--v2-cobalt-soft)] px-2.5 py-1 text-[11px] font-semibold text-[#9DB6FF] hover:brightness-110 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Save rule
        </button>
      </div>
    </form>
  )
}
