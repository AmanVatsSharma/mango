/**
 * @file components/admin-v2/crm/callback-radar.tsx
 * @module admin-v2/crm
 * @description Callback Radar — the centerpiece of the v2 Sales workbench. Three KPI tiles
 *              (Overdue / Due in 1h / Due today) act as bucket selectors; the active bucket's
 *              tasks list renders below. Each row click opens Client 360 to the CRM tab.
 *
 *              Exports:
 *                - default CallbackRadar  — props { initialBucket?, embedded? }.
 *
 *              Side-effects: SWR fetches of /api/admin/crm/callback-radar (counts) and
 *              /api/admin/crm/queue (rows). 60s refresh.
 *
 *              Key invariants:
 *                - The displayed bucket is internal state; not URL-driven by default. Set
 *                  `initialBucket` from the parent if it owns URL state.
 *                - Counts and rows can disagree by ≤60s (independent SWR keys). Acceptable
 *                  staleness for a triage radar.
 *                - Book-scoped server-side (MODERATOR sees only their assigned clients).
 *
 *              Read order:
 *                1. CallbackRadar — top-level component, KPI bucket selectors + queue list.
 *                2. RadarRow — per-task row with quick-call + drawer-open actions.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { AlertTriangle, Clock, Sun } from "lucide-react"
import { KpiTile, EmptyState, StatusPill } from "@/components/admin-v2/primitives"
import { Client360Drawer } from "@/components/admin-v2/client-360/client-360"
import { formatRelativeIst } from "@/lib/admin-v2/api-client"
import { useCallbackQueue, useCallbackRadarCounts } from "./hooks"
import CrmIntegrationStubButtons from "./integration-stub-buttons"
import CrmQuickNotePopover from "./quick-note-popover"
import type { CrmQueueRow } from "./types"

type Bucket = "overdue" | "due_in_hour" | "due_today"

interface CallbackRadarProps {
  initialBucket?: Bucket
  /** When embedded inside a larger page, suppress the section heading + outer max-width. */
  embedded?: boolean
}

const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: "Overdue",
  due_in_hour: "Due in 1h",
  due_today: "Due today",
}

export default function CallbackRadar({
  initialBucket = "overdue",
  embedded = false,
}: CallbackRadarProps) {
  const [bucket, setBucket] = React.useState<Bucket>(initialBucket)
  const counts = useCallbackRadarCounts()
  const queue = useCallbackQueue(bucket, 50)
  const [drawerUserId, setDrawerUserId] = React.useState<string | null>(null)

  const c = counts.data?.radar
  const tasks = queue.data?.tasks ?? []

  return (
    <section className={embedded ? undefined : "mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8"}>
      {!embedded ? (
        <header className="mb-5">
          <div className="flex items-center gap-2">
            <StatusPill tone="warning" label="Sales workbench" size="sm" />
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              Book-scoped · refreshes every 60s
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight v2-text-grad-primary">
            Callback Radar
          </h1>
          <p className="mt-1 text-sm text-[var(--v2-text-mute)]">
            Triage list of due CRM tasks across your assigned clients. Click a tile to switch
            buckets · click a row to open Client 360.
          </p>
        </header>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <BucketTile
          bucket="overdue"
          active={bucket === "overdue"}
          onSelect={setBucket}
          label="Overdue"
          tone="danger"
          value={c?.overdue ?? 0}
          icon={<AlertTriangle className="h-4 w-4" />}
          hint="Past due — call first"
        />
        <BucketTile
          bucket="due_in_hour"
          active={bucket === "due_in_hour"}
          onSelect={setBucket}
          label="Due in 1h"
          tone="warning"
          value={c?.dueInHour ?? 0}
          icon={<Clock className="h-4 w-4" />}
          hint="Next 60 minutes"
        />
        <BucketTile
          bucket="due_today"
          active={bucket === "due_today"}
          onSelect={setBucket}
          label="Due today"
          tone="info"
          value={c?.dueToday ?? 0}
          icon={<Sun className="h-4 w-4" />}
          hint="IST end-of-day"
        />
      </div>

      <div className="mt-5 v2-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
          <h3 className="text-sm font-semibold text-[var(--v2-text)]">
            {BUCKET_LABEL[bucket]} · queue
          </h3>
          <span className="text-[11px] text-[var(--v2-text-faint)]">
            <span className="v2-num text-[var(--v2-text-mute)]">{tasks.length}</span> shown
          </span>
        </div>
        {queue.isLoading ? (
          <div className="px-4 py-6 text-sm text-[var(--v2-text-mute)]">Loading queue…</div>
        ) : tasks.length === 0 ? (
          <EmptyState
            title={`Nothing ${BUCKET_LABEL[bucket].toLowerCase()}`}
            description="Pick another bucket or come back after the next callback wave."
          />
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {tasks.map((t) => (
              <RadarRow
                key={t.id}
                task={t}
                onOpen={() => setDrawerUserId(t.user.id)}
              />
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
        initialTab="crm"
      />
    </section>
  )
}

interface BucketTileProps {
  bucket: Bucket
  active: boolean
  onSelect: (b: Bucket) => void
  label: string
  tone: "danger" | "warning" | "info"
  value: number
  icon: React.ReactNode
  hint: string
}

function BucketTile({
  bucket,
  active,
  onSelect,
  label,
  tone,
  value,
  icon,
  hint,
}: BucketTileProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(bucket)}
      className={`group block rounded-2xl text-left transition-all ${
        active
          ? "ring-2 ring-[var(--v2-cobalt)]"
          : "ring-0 hover:ring-1 hover:ring-white/[0.1]"
      }`}
      aria-pressed={active}
    >
      <KpiTile label={label} value={value} tone={tone} icon={icon} hint={hint} />
    </button>
  )
}

interface RadarRowProps {
  task: CrmQueueRow
  onOpen: () => void
}

function RadarRow({ task, onOpen }: RadarRowProps) {
  const overdue = task.dueAt && new Date(task.dueAt).getTime() < Date.now()
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--v2-cobalt-soft)]">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          className={`shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] ${
            task.priority === "HIGH"
              ? "border-rose-500/30 bg-rose-500/10 text-[#FF8AA0]"
              : task.priority === "NORMAL"
                ? "border-sky-500/30 bg-sky-500/10 text-[#8AD3FF]"
                : "border-white/[0.08] bg-white/[0.03] text-[var(--v2-text-mute)]"
          }`}
        >
          {task.kind}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-[var(--v2-text)]">
              {task.user.name ?? "—"}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-[var(--v2-text-faint)]">
              {task.user.clientId ?? task.user.phone ?? task.user.id.slice(0, 8)}
            </span>
          </div>
          <div className="truncate text-xs text-[var(--v2-text-mute)]">{task.title}</div>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-3">
        <span
          className={`text-xs ${overdue ? "text-[#FF8AA0]" : "text-[var(--v2-text-mute)]"}`}
        >
          {task.dueAt ? formatRelativeIst(task.dueAt) : "no due"}
        </span>
        <CrmIntegrationStubButtons phone={task.user.phone} email={task.user.email} />
        <CrmQuickNotePopover userId={task.user.id} />
      </div>
    </li>
  )
}
