/**
 * @file components/admin-v2/home/compliance-home.tsx
 * @module admin-v2/home
 * @description Compliance-persona home variant. Hero + KYC SLA radar tiles + most-overdue
 *              applicants strip + link to the full Compliance Workbench.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  ShieldAlert,
  Timer,
} from "lucide-react"
import {
  EmptyState,
  KpiTile,
  StatusPill,
} from "@/components/admin-v2/primitives"
import { Client360Drawer } from "@/components/admin-v2/client-360/client-360"
import { useKycQueue } from "@/components/admin-v2/compliance/hooks"
import { formatRelativeIst } from "@/lib/admin-v2/api-client"
import HomeHeader from "./home-header"
import type { KycRow } from "@/components/admin-v2/compliance/types"

export default function ComplianceHome() {
  const overdue = useKycQueue({ status: "PENDING", sla: "OVERDUE", limit: 8 })
  const queue = useKycQueue({ status: "PENDING", limit: 1 })
  const counts = queue.data?.statusCounts ?? {}
  const meta = queue.data?.meta
  const overdueRows = overdue.data?.kycApplications ?? []
  const [drawerUserId, setDrawerUserId] = React.useState<string | null>(null)

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <HomeHeader
        chip={{ label: "Compliance", tone: "warning" }}
        title="Compliance home"
        subtitle="SLA-aware KYC queue · AML / suspicious radar · cross-link to Client 360."
        primaryCta={{ href: "/admin-v2/kyc", label: "Open Compliance Workbench" }}
      />

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile
          label="Pending"
          value={counts.PENDING ?? 0}
          tone="info"
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <KpiTile
          label="Approved (today)"
          value={counts.APPROVED ?? 0}
          tone="success"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <KpiTile
          label="SLA breach"
          value={meta?.overdueCount ?? 0}
          tone="danger"
          icon={<Timer className="h-4 w-4" />}
        />
        <KpiTile
          label="AML / flagged"
          value={meta?.flaggedCount ?? 0}
          tone="warning"
          icon={<ShieldAlert className="h-4 w-4" />}
        />
        <KpiTile
          label="Suspicious"
          value={meta?.suspiciousCount ?? 0}
          tone="warning"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </section>

      <div className="v2-card overflow-hidden">
        <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
          <h3 className="text-sm font-semibold text-[var(--v2-text)]">Most overdue</h3>
          <Link
            href="/admin-v2/kyc?status=PENDING&sla=OVERDUE"
            className="text-xs text-[var(--v2-info)] hover:underline"
          >
            See all →
          </Link>
        </header>
        {overdue.isLoading ? (
          <p className="px-4 py-6 text-sm text-[var(--v2-text-mute)]">Loading…</p>
        ) : overdueRows.length === 0 ? (
          <EmptyState
            title="No overdue KYC applications"
            description="Either your team is on top of it, or there are no Pending applications right now."
          />
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {overdueRows.map((row: KycRow) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--v2-cobalt-soft)]"
              >
                <button
                  type="button"
                  onClick={() => setDrawerUserId(row.user.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="truncate text-sm font-medium text-[var(--v2-text)]">
                    {row.user.name ?? "—"}
                  </span>
                  <span className="font-mono text-[11px] text-[var(--v2-text-faint)]">
                    {row.user.clientId ?? row.user.email ?? "—"}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusPill kind={row.amlStatus} size="sm" />
                  <StatusPill kind="OVERDUE" size="sm" />
                  <span className="text-[11px] text-[#FF8AA0]">
                    Submitted {formatRelativeIst(row.submittedAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Client360Drawer
        userId={drawerUserId}
        open={drawerUserId !== null}
        onOpenChange={(open) => {
          if (!open) setDrawerUserId(null)
        }}
        initialTab="compliance"
      />
    </div>
  )
}
