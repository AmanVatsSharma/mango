/**
 * @file components/admin-v2/client-360/tabs/affiliate.tsx
 * @module admin-v2/client-360
 * @description Affiliate tab — shows the client's attribution lineage and lifetime commission
 *              they've generated for the attributed IB. Composable with the existing User-to-User
 *              ReferralAttribution band (referredBy) — both can co-exist on one client.
 *
 *              Reuses /api/admin/affiliates/attributions?userId=X (live) and
 *              /api/admin/affiliates/commissions?sourceUserId=X.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

"use client"

import * as React from "react"
import Link from "next/link"
import useSWR from "swr"
import { ExternalLink, Link2, Users } from "lucide-react"
import { EmptyState, KpiTile } from "@/components/admin-v2/primitives"
import {
  formatDateTimeIst,
  formatInr,
  formatRelativeIst,
  jsonFetcher,
} from "@/lib/admin-v2/api-client"
import type { UserDetail } from "../types"
import type { AttributionListResp, CommissionListResp } from "@/components/admin-v2/affiliates/types"

interface Props {
  user: UserDetail
}

export default function AffiliateTab({ user }: Props) {
  const attribution = useSWR<AttributionListResp>(
    `/api/admin/affiliates/attributions?userId=${encodeURIComponent(user.id)}&limit=10`,
    jsonFetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  )
  const commissions = useSWR<CommissionListResp>(
    `/api/admin/affiliates/commissions?sourceUserId=${encodeURIComponent(user.id)}&limit=20`,
    jsonFetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  )

  const liveAttr = attribution.data?.rows?.find(
    (r) => !r.replacedById && (!r.expiresAt || new Date(r.expiresAt) > new Date()),
  )
  const totalGross = commissions.data?.sumGrossRupees ?? 0
  const totalTds = commissions.data?.sumTdsRupees ?? 0
  const commissionCount = commissions.data?.total ?? 0

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="v2-pill v2-pill-info">Affiliate · IB</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              external IB attribution · independent of User-to-User referral
            </span>
          </div>
          <h2 className="mt-1 text-lg font-semibold text-[var(--v2-text)]">Attribution & lifetime value</h2>
        </div>
        <Link
          href="/admin-v2/affiliates"
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--v2-border-accent)] bg-[var(--v2-cobalt-soft)] px-2.5 py-1 text-[11px] font-medium text-[#9DB6FF] hover:brightness-110"
        >
          <Users className="h-3 w-3" /> Affiliate workbench
          <ExternalLink className="h-3 w-3 opacity-60" />
        </Link>
      </header>

      {/* Bands: peer-referral and IB attribution */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Peer-referral band (existing system) */}
        <div className="v2-card p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
            Peer referral (User → User)
          </h3>
          {user.referredByUserId ? (
            <p className="text-sm text-[var(--v2-text)]">
              Referred by another user (legacy referral system).{" "}
              <Link
                href={`/admin-v2/clients/${user.referredByUserId}`}
                className="text-[#9DB6FF] hover:underline"
              >
                View referrer
              </Link>
            </p>
          ) : (
            <p className="text-sm text-[var(--v2-text-faint)]">Not referred by another user.</p>
          )}
        </div>

        {/* IB attribution band */}
        <div className="v2-card p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
            IB attribution (external affiliate)
          </h3>
          {liveAttr ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Link2 className="h-3.5 w-3.5 text-[#9DB6FF]" />
                <span className="v2-num text-[var(--v2-text)]">{liveAttr.affiliate?.affiliateCode ?? "—"}</span>
                <span className="text-sm text-[var(--v2-text-mute)]">— {liveAttr.affiliate?.name ?? "(unknown name)"}</span>
              </div>
              <p className="text-[11px] text-[var(--v2-text-faint)]">
                First touch {formatRelativeIst(liveAttr.firstTouchAt)} · source {liveAttr.source}
                {liveAttr.expiresAt ? ` · expires ${formatDateTimeIst(liveAttr.expiresAt)}` : ""}
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--v2-text-faint)]">
              No live IB attribution. Either signed up directly or attribution expired/replaced.
            </p>
          )}
        </div>
      </section>

      {/* Lifetime KPI */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiTile
          label="Lifetime IB commission"
          value={formatInr(totalGross)}
          tone="info"
          hint={`${commissionCount} accruals attributed to this client`}
        />
        <KpiTile
          label="TDS withheld"
          value={formatInr(totalTds)}
          tone="warning"
          hint="Total TDS recorded across paid commissions"
        />
        <KpiTile
          label="Net to IB"
          value={formatInr(Math.max(0, totalGross - totalTds))}
          tone="success"
          hint="Gross − TDS (rough estimate; per-payout exact)"
        />
      </section>

      {/* Commission feed */}
      <section className="v2-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
            Recent commissions from this client
          </h3>
          <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
            {commissionCount} total
          </span>
        </div>
        {commissions.isLoading ? (
          <p className="p-4 text-sm text-[var(--v2-text-mute)]">Loading commissions…</p>
        ) : (commissions.data?.rows?.length ?? 0) === 0 ? (
          <EmptyState
            title="No commissions accrued"
            description="This client either has no IB attribution, or no settled trades have triggered an accrual rule yet."
            className="!py-6"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.02]">
                <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
                  <th className="px-3 py-2.5">When</th>
                  <th className="px-3 py-2.5">Affiliate</th>
                  <th className="px-3 py-2.5">Kind</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {commissions.data!.rows.map((r) => (
                  <tr key={r.id} className="border-b border-white/[0.04]">
                    <td className="whitespace-nowrap px-3 py-2.5 v2-num text-[var(--v2-text-faint)]">
                      {formatRelativeIst(r.accruedAt)}
                    </td>
                    <td className="px-3 py-2.5 v2-num text-[var(--v2-text)]">
                      {r.affiliate?.affiliateCode ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[10px] uppercase tracking-[0.06em] text-[var(--v2-text-mute)]">
                      {r.kind}
                    </td>
                    <td className="px-3 py-2.5 text-right v2-num font-semibold text-[var(--v2-text)]">
                      {formatInr(r.amount)}
                    </td>
                    <td className="px-3 py-2.5 text-[10px] uppercase tracking-[0.06em] text-[var(--v2-text-mute)]">
                      {r.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
