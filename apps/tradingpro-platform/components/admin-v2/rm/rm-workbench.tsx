/**
 * @file components/admin-v2/rm/rm-workbench.tsx
 * @module admin-v2/rm
 * @description RM & Teams workbench — segmented control between Roster · Org tree · Leaderboard.
 *              Hero KPI strip uses the same useRmList query so all three views share the cache.
 *
 *              Exports:
 *                - default RmWorkbench
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Activity, GitFork, Layers, Trophy, Users } from "lucide-react"
import { KpiTile, StatusPill } from "@/components/admin-v2/primitives"
import { useRmList } from "./hooks"
import RmRoster from "./rm-roster"
import RmOrgTree from "./rm-org-tree"
import RmLeaderboard from "./rm-leaderboard"

type View = "roster" | "tree" | "leaderboard"
const TABS: { key: View; label: string; icon: React.ReactNode }[] = [
  { key: "roster", label: "Roster", icon: <Layers className="h-3.5 w-3.5" /> },
  { key: "tree", label: "Org tree", icon: <GitFork className="h-3.5 w-3.5" /> },
  {
    key: "leaderboard",
    label: "Leaderboard",
    icon: <Trophy className="h-3.5 w-3.5" />,
  },
]

export default function RmWorkbench() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const view: View = (searchParams.get("view") as View | null) ?? "roster"

  function setView(next: View) {
    const sp = new URLSearchParams(searchParams.toString())
    if (next === "roster") sp.delete("view")
    else sp.set("view", next)
    const qs = sp.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const list = useRmList()
  const rms = list.data?.rms ?? []
  const total = list.data?.total ?? 0
  const adminCount = rms.filter((r) => r.role === "ADMIN").length
  const modCount = rms.filter((r) => r.role === "MODERATOR").length
  const inactiveCount = rms.filter((r) => !r.isActive).length
  const totalManaged = rms.reduce((s, r) => s + r.assignedUsersCount, 0)

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <StatusPill tone="info" label="Sales ops" size="sm" />
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              RM hierarchy · refreshes every 60s
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight v2-text-grad-primary">
            RM &amp; Teams
          </h1>
          <p className="mt-1 text-sm text-[var(--v2-text-mute)]">
            Manage Relationship Managers, view the full org tree, and rank productivity over your
            chosen window.
          </p>
        </div>
      </div>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          label="RMs"
          value={total}
          tone="info"
          icon={<Users className="h-4 w-4" />}
          hint={`${adminCount} admin · ${modCount} moderator`}
        />
        <KpiTile
          label="Active"
          value={total - inactiveCount}
          tone="success"
          icon={<Activity className="h-4 w-4" />}
        />
        <KpiTile
          label="Inactive"
          value={inactiveCount}
          tone={inactiveCount > 0 ? "warning" : "neutral"}
        />
        <KpiTile
          label="Managed clients"
          value={totalManaged}
          tone="neutral"
          icon={<Layers className="h-4 w-4" />}
          hint="Sum across all RMs (USERs only)"
        />
      </section>

      <div className="mb-4 inline-flex items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1 backdrop-blur">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setView(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              view === t.key
                ? "bg-white/[0.08] text-[var(--v2-text)]"
                : "text-[var(--v2-text-mute)] hover:bg-white/[0.04] hover:text-[var(--v2-text)]"
            }`}
            aria-pressed={view === t.key}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {view === "roster" ? (
        <RmRoster />
      ) : view === "tree" ? (
        <RmOrgTree />
      ) : (
        <RmLeaderboard />
      )}
    </div>
  )
}
