/**
 * @file components/admin-v2/crm/tasks-panel.tsx
 * @module admin-v2/crm
 * @description Canonical CRM tasks panel for v2 — used by Client 360 CRM tab + Compliance
 *              Workbench drawer. Replaces the inline tasks list previously in
 *              client-360/tabs/crm.tsx and the v1 kyc-crm-tasks-panel.tsx (left untouched).
 *
 *              Capabilities:
 *                - Tabbed view: Active (OPEN + IN_PROGRESS) · Done (DONE + CANCELLED) · All.
 *                - Quick-create: title + kind + due (preset chips: 1h / 4h / tomorrow / +3d).
 *                - Per-row: snooze (1h / 4h / 24h), mark complete with disposition.
 *                - All mutations via the shared CRM hooks; cache mutation cascades to all
 *                  consumers (Compliance KPI, Callback Radar, Client 360 Overview).
 *
 *              Exports:
 *                - default CrmTasksPanel  — props { userId, dense? }.
 *
 *              Side-effects: SWR fetch of /api/admin/users/[userId]/crm/tasks (30s).
 *              POST on create, PATCH on update.
 *
 *              Read order:
 *                1. CrmTasksPanel — top-level component, drives tabs + quick-create.
 *                2. TaskRow — per-row actions (snooze/complete/dispose).
 *                3. QuickCreate — inline form.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { Check, Clock4, Loader2, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EmptyState, StatusPill } from "@/components/admin-v2/primitives"
import { formatRelativeIst } from "@/lib/admin-v2/api-client"
import { createCrmTask, updateCrmTask, useCrmTasks } from "./hooks"
import type {
  CrmTask,
  CrmTaskDisposition,
  CrmTaskKind,
  CrmTaskPriority,
} from "./types"

const TASK_KINDS: CrmTaskKind[] = ["CALLBACK", "FOLLOW_UP", "DOCUMENT", "OTHER"]
const PRIORITIES: CrmTaskPriority[] = ["LOW", "NORMAL", "HIGH"]
const DISPOSITIONS: { value: CrmTaskDisposition; label: string }[] = [
  { value: "SPOKE_FOLLOWUP", label: "Spoke · follow-up" },
  { value: "CALLBACK_SCHEDULED", label: "Callback scheduled" },
  { value: "NO_ANSWER", label: "No answer" },
  { value: "WRONG_NUMBER", label: "Wrong number" },
  { value: "OTHER", label: "Other" },
]

interface CrmTasksPanelProps {
  userId: string
  dense?: boolean
}

type TabKey = "active" | "done" | "all"

export default function CrmTasksPanel({ userId, dense = false }: CrmTasksPanelProps) {
  const [tab, setTab] = React.useState<TabKey>("active")
  const { data, isLoading, mutate } = useCrmTasks(userId, tab)
  const tasks = data?.tasks ?? []

  return (
    <div className="v2-card flex flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex items-center gap-1">
          {(["active", "done", "all"] as TabKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide transition-colors ${
                tab === k
                  ? "bg-white/[0.06] text-[var(--v2-text)]"
                  : "text-[var(--v2-text-mute)] hover:bg-white/[0.04]"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-[var(--v2-text-faint)]">
          <span className="v2-num text-[var(--v2-text-mute)]">{tasks.length}</span> shown
        </span>
      </header>

      <QuickCreate userId={userId} onCreated={() => mutate()} />

      <div className={`overflow-y-auto p-3 ${dense ? "max-h-[260px]" : "max-h-[420px]"}`}>
        {isLoading ? (
          <p className="text-xs text-[var(--v2-text-mute)]">Loading tasks…</p>
        ) : tasks.length === 0 ? (
          <EmptyState
            title={tab === "active" ? "No active tasks" : tab === "done" ? "No completed tasks" : "No tasks"}
            description={
              tab === "active"
                ? "Add a callback above to start tracking outreach."
                : "Switch to Active to see open work."
            }
          />
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} userId={userId} onChange={() => mutate()} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ─── Quick create ────────────────────────────────────────────────────────

function plusHours(h: number): string {
  return new Date(Date.now() + h * 3_600_000).toISOString()
}

function tomorrowMorningIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  return d.toISOString()
}

interface QuickCreateProps {
  userId: string
  onCreated: () => void
}

function QuickCreate({ userId, onCreated }: QuickCreateProps) {
  const [title, setTitle] = React.useState("")
  const [kind, setKind] = React.useState<CrmTaskKind>("CALLBACK")
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  async function add(dueAt: string | null) {
    const trimmed = title.trim()
    if (!trimmed) return
    setBusy(true)
    setErr(null)
    try {
      await createCrmTask({ userId, title: trimmed, kind, dueAt })
      setTitle("")
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 border-b border-white/[0.06] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={kind} onValueChange={(v) => setKind(v as CrmTaskKind)}>
          <SelectTrigger className="h-8 w-32 border-white/[0.08] bg-white/[0.03] text-xs text-[var(--v2-text)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TASK_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title (e.g., 'Confirm bank proof')"
          className="h-8 flex-1 min-w-[180px] border-white/[0.08] bg-white/[0.03] text-sm text-[var(--v2-text)] placeholder:text-[var(--v2-text-faint)] focus-visible:border-[var(--v2-border-accent)] focus-visible:ring-0"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void add(null)
            }
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-[var(--v2-text-faint)]">Due</span>
        <DueChip onClick={() => add(plusHours(1))} disabled={busy || title.trim().length === 0}>
          1h
        </DueChip>
        <DueChip onClick={() => add(plusHours(4))} disabled={busy || title.trim().length === 0}>
          4h
        </DueChip>
        <DueChip
          onClick={() => add(tomorrowMorningIso())}
          disabled={busy || title.trim().length === 0}
        >
          Tomorrow 10am
        </DueChip>
        <DueChip onClick={() => add(plusHours(24 * 3))} disabled={busy || title.trim().length === 0}>
          +3d
        </DueChip>
        <DueChip onClick={() => add(null)} disabled={busy || title.trim().length === 0}>
          No due
        </DueChip>
        {err ? <span className="ml-2 text-[11px] text-[#FF8AA0]">{err}</span> : null}
        {busy ? <Loader2 className="ml-1 h-3 w-3 animate-spin text-[var(--v2-text-mute)]" /> : null}
      </div>
    </div>
  )
}

function DueChip({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[11px] text-[var(--v2-text-mute)] transition-colors hover:border-[var(--v2-border-accent)] hover:text-[var(--v2-text)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

// ─── Task row ────────────────────────────────────────────────────────────

interface TaskRowProps {
  task: CrmTask
  userId: string
  onChange: () => void
}

function TaskRow({ task, userId, onChange }: TaskRowProps) {
  const [busy, setBusy] = React.useState(false)

  async function snooze(hours: number) {
    setBusy(true)
    try {
      await updateCrmTask({ userId, taskId: task.id, snoozeHours: hours })
      onChange()
    } finally {
      setBusy(false)
    }
  }

  async function complete(disposition: CrmTaskDisposition) {
    setBusy(true)
    try {
      await updateCrmTask({ userId, taskId: task.id, status: "DONE", disposition })
      onChange()
    } finally {
      setBusy(false)
    }
  }

  const isDone = task.status === "DONE" || task.status === "CANCELLED"
  const tone =
    task.priority === "HIGH"
      ? "danger"
      : task.priority === "NORMAL"
        ? "info"
        : "neutral"
  const dueOverdue = task.dueAt && new Date(task.dueAt).getTime() < Date.now() && !isDone

  return (
    <li
      className={`rounded-lg border bg-white/[0.02] p-3 transition-colors ${
        isDone
          ? "border-white/[0.04] opacity-70"
          : dueOverdue
            ? "border-rose-500/20"
            : "border-white/[0.06]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-[var(--v2-text-mute)]">
              {task.kind}
            </span>
            <StatusPill tone={tone} label={task.priority} size="sm" />
            {task.snoozeCount > 0 ? (
              <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-[var(--v2-text-faint)]">
                snoozed ×{task.snoozeCount}
              </span>
            ) : null}
            {task.disposition ? (
              <StatusPill tone="neutral" label={task.disposition} size="sm" />
            ) : null}
          </div>
          <p className="text-sm text-[var(--v2-text)]">{task.title}</p>
          {task.description ? (
            <p className="mt-0.5 text-xs text-[var(--v2-text-mute)]">{task.description}</p>
          ) : null}
        </div>
        <div className="shrink-0 text-right text-[11px]">
          <div className={dueOverdue ? "text-[#FF8AA0]" : "text-[var(--v2-text-mute)]"}>
            {task.dueAt ? formatRelativeIst(task.dueAt) : "no due"}
          </div>
          {!isDone ? (
            <div className="mt-1 flex items-center justify-end gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-md border border-white/[0.08] bg-white/[0.03] p-1 text-[var(--v2-text-mute)] hover:border-white/[0.16] disabled:opacity-50"
                    aria-label="Snooze"
                    title="Snooze"
                  >
                    <Clock4 className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-32">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wide">
                    Snooze for
                  </DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => void snooze(1)}>1 hour</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void snooze(4)}>4 hours</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void snooze(24)}>1 day</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-1 text-[#5DF7BC] hover:bg-emerald-500/20 disabled:opacity-50"
                    aria-label="Mark complete"
                    title="Mark complete"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wide">
                    Complete with disposition
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {DISPOSITIONS.map((d) => (
                    <DropdownMenuItem key={d.value} onClick={() => void complete(d.value)}>
                      {d.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  )
}

// re-export for tooling that introspects panel components
export { MoreHorizontal as _Reserved }
