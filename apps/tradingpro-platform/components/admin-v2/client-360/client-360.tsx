/**
 * @file components/admin-v2/client-360/client-360.tsx
 * @module admin-v2/client-360
 * @description Canonical Client 360 component. The same component renders both as a full page
 *              (deep-linkable) and as a drawer (when opened from a list). One implementation,
 *              two presentations. Tabs are URL-driven via ?tab=… so the "send a colleague this
 *              client's KYC" flow is a single copy-paste.
 *
 *              Exports:
 *                - Client360            — props { userId, mode }; "page" or "drawer".
 *                - Client360Drawer      — drawer wrapper that owns open state + URL sync.
 *
 *              Side-effects: SWR fetching for client detail + per-tab augmenters; URL updates
 *              via useSearchParams when the user changes tabs.
 *
 *              Key invariants:
 *                - Tabs are gated by AdminSession permissions (TAB_PERMISSIONS map).
 *                - Lazy tab components are wrapped in <Suspense> with a Skeleton fallback.
 *                - The drawer presentation does NOT update the URL (drawer is ephemeral state);
 *                  the page presentation owns the canonical URL.
 *
 *              Read order:
 *                1. Client360 — main shell.
 *                2. Tab content render — lazy + Suspense.
 *                3. Client360Drawer — the drawer twin.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Loader2 } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import {
  V2Drawer,
  V2DrawerBody,
  V2DrawerHeader,
} from "@/components/admin-v2/primitives"
import { useAdminSession } from "@/components/admin-console/admin-session-provider"
import { ClientStickyHeader } from "./sticky-header"
import { ClientTabStrip, DEFAULT_TAB, TAB_PERMISSIONS, TABS } from "./tab-strip"
import { tabRegistry } from "./tabs"
import { useClientCrmTasks, useClientDetail } from "./hooks"
import type { TabKey } from "./types"

interface Client360Props {
  userId: string
  /** "page" => owns URL ?tab=… ; "drawer" => internal-state only. */
  mode?: "page" | "drawer"
  /** When mode==="drawer", caller sets initial tab. */
  initialTab?: TabKey
}

export function Client360({ userId, mode = "page", initialTab }: Client360Props) {
  const session = useAdminSession()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Tab state. Page mode = URL-driven. Drawer mode = internal.
  const urlTab = (searchParams.get("tab") as TabKey | null) ?? null
  const [drawerTab, setDrawerTab] = React.useState<TabKey>(initialTab ?? DEFAULT_TAB)
  const activeTab: TabKey =
    mode === "page" ? (urlTab && tabRegistry[urlTab] ? urlTab : DEFAULT_TAB) : drawerTab

  function setTab(next: TabKey) {
    if (mode === "page") {
      const sp = new URLSearchParams(searchParams.toString())
      if (next === DEFAULT_TAB) sp.delete("tab")
      else sp.set("tab", next)
      const qs = sp.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    } else {
      setDrawerTab(next)
    }
  }

  const detail = useClientDetail(userId)
  const tasksQ = useClientCrmTasks(userId, "active")
  const taskCount = (tasksQ.data as { tasks?: unknown[] } | undefined)?.tasks?.length ?? 0

  if (detail.isLoading) {
    return (
      <div className="space-y-3 p-5">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (detail.error || !detail.data?.user) {
    return (
      <div className="p-6 text-center text-sm text-rose-400">
        Failed to load client.{" "}
        <button
          className="text-sky-400 hover:underline"
          onClick={() => detail.mutate()}
        >
          Retry
        </button>
      </div>
    )
  }

  const user = detail.data.user
  // Filter tabs by RBAC up-front; if active tab is not permitted, fall back to overview.
  const allowed = TABS.filter((t) =>
    !TAB_PERMISSIONS[t.key] ||
    session.permissions.includes("admin.all") ||
    session.permissions.includes(TAB_PERMISSIONS[t.key]),
  )
  const renderedTab: TabKey = allowed.find((t) => t.key === activeTab) ? activeTab : DEFAULT_TAB
  const TabComponent = tabRegistry[renderedTab]

  return (
    <div>
      {mode === "page" ? (
        <ClientStickyHeader user={user} online={user.isTradingDashboardOnline} />
      ) : null}
      <ClientTabStrip
        active={renderedTab}
        onChange={setTab}
        permissions={session.permissions}
        counts={{ crm: taskCount }}
      />
      <div className="px-5 py-5">
        <React.Suspense
          fallback={
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading {renderedTab}…
            </div>
          }
        >
          <TabComponent user={user} />
        </React.Suspense>
      </div>
    </div>
  )
}

interface Client360DrawerProps {
  userId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTab?: TabKey
}

export function Client360Drawer({
  userId,
  open,
  onOpenChange,
  initialTab,
}: Client360DrawerProps) {
  // Shared SWR cache: this hook + Client360's internal hook hit the same key, no duplicate fetch.
  const detail = useClientDetail(userId)
  const u = detail.data?.user

  const headerTitle = u?.name ?? (userId ? "Loading…" : "Client")
  const headerSubtitle = u
    ? [u.clientId, u.email, u.phone].filter(Boolean).join(" · ")
    : undefined

  return (
    <V2Drawer open={open} onOpenChange={onOpenChange} width="wide">
      <V2DrawerHeader
        title={headerTitle}
        subtitle={headerSubtitle}
        onClose={() => onOpenChange(false)}
        actions={
          userId ? (
            <a
              href={`/admin-v2/clients/${userId}`}
              className="rounded-md border border-zinc-700 bg-zinc-900/40 px-2 py-1 text-xs text-sky-300 hover:border-sky-500/40"
            >
              Open full page
            </a>
          ) : null
        }
      />
      <V2DrawerBody className="px-0 py-0">
        {userId ? <Client360 userId={userId} mode="drawer" initialTab={initialTab} /> : null}
      </V2DrawerBody>
    </V2Drawer>
  )
}
