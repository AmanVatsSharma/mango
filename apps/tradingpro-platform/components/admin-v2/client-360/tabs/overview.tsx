/**
 * @file components/admin-v2/client-360/tabs/overview.tsx
 * @module admin-v2/client-360
 * @description Overview tab — KPI strip (balance, P&L, deposits, KYC), identity card,
 *              CRM snapshot (pinned note + upcoming tasks + recent notes). Mounted on
 *              initial render (every other tab is React.lazy).
 *
 *              Reuses:
 *                - useClientCrmNotes / useClientCrmTasks — admin-v2 hooks (SWR 30s).
 *                - KpiTile / EmptyState                 — v2 primitives.
 *                - formatInr / formatDateTimeIst        — admin-v2 helpers.
 *
 *              Premium aesthetic: v2 brand tokens throughout (cobalt accents, gold pin chip,
 *              IBM Plex Mono numerics). No generic zinc.
 *
 * @author StockTrade
 * @created 2026-04-26
 * @updated 2026-04-26 — Phase 9.5/10.5 polish: v2 brand re-skin, RM cross-link, client copy.
 */

"use client"

import * as React from "react"
import Link from "next/link"
import { Briefcase, Calendar, ListChecks, Pin, ShieldCheck, User as UserIcon } from "lucide-react"
import { KpiTile, EmptyState } from "@/components/admin-v2/primitives"
import { formatDateTimeIst, formatInr, formatRelativeIst } from "@/lib/admin-v2/api-client"
import { useClientCrmNotes, useClientCrmTasks } from "../hooks"
import type { UserDetail } from "../types"

interface OverviewTabProps {
  user: UserDetail
}

interface CrmNote {
  id: string
  body: string
  isPinned: boolean
  createdAt: string
  createdBy?: { name?: string | null; email?: string | null } | null
}

interface CrmTask {
  id: string
  title: string
  kind: string
  priority: string
  dueAt: string | null
  status: string
}

const PRIORITY_ACCENT: Record<string, string> = {
  HIGH: "border-[var(--v2-loss)]/40 bg-[var(--v2-loss)]/10 text-[#FFB1BC]",
  MEDIUM: "border-[var(--v2-warning)]/40 bg-[var(--v2-warning)]/10 text-[#FFD995]",
  LOW: "border-white/[0.06] bg-white/[0.03] text-[var(--v2-text-mute)]",
}

export default function OverviewTab({ user }: OverviewTabProps) {
  const notes = useClientCrmNotes(user.id)
  const tasks = useClientCrmTasks(user.id, "active")

  const balance = user.tradingAccount?.balance
  const availableMargin = user.tradingAccount?.availableMargin
  const usedMargin = user.tradingAccount?.usedMargin
  const kycStatus = user.kyc?.status ?? "NOT_SUBMITTED"

  const pinnedNote = (notes.data as { notes?: CrmNote[] } | undefined)?.notes?.find((n) => n.isPinned)
  const recentNotes = (notes.data as { notes?: CrmNote[] } | undefined)?.notes
    ?.filter((n) => n.id !== pinnedNote?.id)
    .slice(0, 3) ?? []
  const upcomingTasks =
    (tasks.data as { tasks?: CrmTask[] } | undefined)?.tasks?.slice(0, 4) ?? []

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {/* KPI strip */}
      <section aria-labelledby="overview-kpis">
        <h3 id="overview-kpis" className="sr-only">Key metrics</h3>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile
            label="Wallet balance"
            value={formatInr(balance)}
            tone="info"
            hint="Cash + credit (incl. used margin)"
          />
          <KpiTile
            label="Available margin"
            value={formatInr(availableMargin)}
            tone="success"
            hint="Free for new orders"
          />
          <KpiTile
            label="Used margin"
            value={formatInr(usedMargin)}
            tone="warning"
            hint="Locked by open positions"
          />
          <KpiTile
            label="KYC"
            value={
              <span className="text-base">
                {kycStatus === "NOT_SUBMITTED" ? "Not submitted" : kycStatus.replace("_", " ")}
              </span>
            }
            tone={
              kycStatus === "APPROVED"
                ? "success"
                : kycStatus === "REJECTED"
                  ? "danger"
                  : kycStatus === "PENDING"
                    ? "warning"
                    : "neutral"
            }
            hint={
              user.kyc?.submittedAt
                ? `Submitted ${formatRelativeIst(user.kyc.submittedAt)}`
                : "Not submitted"
            }
          />
        </div>
      </section>

      {/* Identity + CRM snapshot */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Identity card */}
        <div className="v2-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
              <UserIcon className="h-3.5 w-3.5" /> Identity
            </h3>
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              <Calendar className="h-3 w-3" />
              Joined {formatDateTimeIst(user.createdAt)}
            </span>
          </div>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-[var(--v2-text-mute)]">Name</dt>
            <dd className="text-[var(--v2-text)]">{user.name ?? "—"}</dd>
            <dt className="text-[var(--v2-text-mute)]">Client ID</dt>
            <dd className="v2-num text-[var(--v2-text)]">{user.clientId ?? "—"}</dd>
            <dt className="text-[var(--v2-text-mute)]">Email</dt>
            <dd className="truncate text-[var(--v2-text)]">{user.email ?? "—"}</dd>
            <dt className="text-[var(--v2-text-mute)]">Phone</dt>
            <dd className="v2-num text-[var(--v2-text)]">{user.phone ?? "—"}</dd>
            <dt className="text-[var(--v2-text-mute)]">RM</dt>
            <dd className="text-[var(--v2-text)]">
              {user.managedBy ? (
                <Link
                  href={`/admin-v2/rms?focus=${user.managedBy.id}`}
                  className="inline-flex items-center gap-1 text-[#9DB6FF] underline-offset-4 hover:underline"
                >
                  <Briefcase className="h-3 w-3" />
                  {user.managedBy.name ?? user.managedBy.email ?? "—"}
                </Link>
              ) : (
                <span className="text-[var(--v2-text-faint)]">unassigned</span>
              )}
            </dd>
            <dt className="text-[var(--v2-text-mute)]">OTP-on-login</dt>
            <dd className="text-[var(--v2-text)]">
              {user.requireOtpOnLogin ? (
                <span className="inline-flex items-center gap-1 text-[var(--v2-gain)]">
                  <ShieldCheck className="h-3 w-3" /> Required
                </span>
              ) : (
                <span className="text-[var(--v2-text-mute)]">Not required</span>
              )}
            </dd>
          </dl>
        </div>

        {/* CRM snapshot */}
        <div className="v2-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
              <ListChecks className="h-3.5 w-3.5" /> CRM snapshot
            </h3>
            <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              30s refresh
            </span>
          </div>

          {pinnedNote ? (
            <div className="mb-3 rounded-md border border-[var(--v2-warning)]/30 bg-[var(--v2-warning)]/[0.06] p-2.5">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#FFD995]">
                <Pin className="h-3 w-3" /> Pinned
              </div>
              <p className="mt-1 line-clamp-3 text-sm text-[var(--v2-text)]">{pinnedNote.body}</p>
              <div className="mt-1.5 text-[11px] text-[var(--v2-text-faint)]">
                {pinnedNote.createdBy?.name ?? pinnedNote.createdBy?.email ?? "system"} ·{" "}
                {formatRelativeIst(pinnedNote.createdAt)}
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
                Upcoming tasks
              </div>
              {upcomingTasks.length === 0 ? (
                <p className="text-xs text-[var(--v2-text-faint)]">No active tasks.</p>
              ) : (
                <ul className="space-y-1.5">
                  {upcomingTasks.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-start justify-between gap-2 text-xs text-[var(--v2-text)]"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 truncate">
                        <span
                          className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] ${PRIORITY_ACCENT[t.priority] ?? PRIORITY_ACCENT.LOW}`}
                        >
                          {t.kind}
                        </span>
                        <span className="truncate">{t.title}</span>
                      </span>
                      <span className="shrink-0 text-[var(--v2-text-faint)]">
                        {t.dueAt ? formatRelativeIst(t.dueAt) : "no due"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
                Recent notes
              </div>
              {recentNotes.length === 0 ? (
                <p className="text-xs text-[var(--v2-text-faint)]">No notes yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {recentNotes.map((n) => (
                    <li key={n.id} className="text-xs">
                      <span className="line-clamp-2 text-[var(--v2-text)]">{n.body}</span>
                      <span className="mt-0.5 block text-[var(--v2-text-faint)]">
                        {formatRelativeIst(n.createdAt)} · {n.createdBy?.name ?? n.createdBy?.email ?? "system"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {!pinnedNote && upcomingTasks.length === 0 && recentNotes.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="No CRM activity"
                description="Open the CRM tab to add the first note or schedule a callback."
                className="!py-6"
              />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
