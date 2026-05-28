/**
 * @file components/admin-v2/comms/campaigns-panel.tsx
 * @module admin-v2/comms
 * @description Campaign list with status pills + transition actions. Highest blast-radius
 *              surface in the comms module. Drip campaign creation is left for Phase 12.5
 *              (the engine is wired but the audience-resolver UI is heavyweight); for
 *              Phase 12 admins create empty DRAFT campaigns and the API explicitly enrolls
 *              userIds via the per-campaign endpoint.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

"use client"

import * as React from "react"
import { mutate as globalMutate } from "swr"
import { Megaphone, PauseCircle, PlayCircle, Plus, StopCircle, RotateCw } from "lucide-react"
import { EmptyState } from "@/components/admin-v2/primitives/empty-state"
import { formatDateTimeIst } from "@/lib/admin-v2/api-client"
import { useCampaigns, useTemplates } from "./hooks"
import type {
  CampaignKind,
  CampaignRow,
  CampaignStatus,
  Channel,
  TemplateRow,
} from "./types"
import { cn } from "@/lib/utils"

const STATUS_PILL: Record<CampaignStatus, string> = {
  DRAFT: "v2-pill-neutral",
  SCHEDULED: "v2-pill-info",
  RUNNING: "v2-pill-success",
  PAUSED: "v2-pill-warning",
  COMPLETED: "v2-pill-neutral",
  CANCELLED: "v2-pill-danger",
}

const CHANNEL_PILL: Record<Channel, string> = {
  WHATSAPP: "v2-pill-success",
  SMS: "v2-pill-info",
  EMAIL: "v2-pill-neutral",
  VOICE: "v2-pill-warning",
  PUSH: "v2-pill-info",
}

export function CampaignsPanel() {
  const [creating, setCreating] = React.useState(false)
  const { data, isLoading, mutate } = useCampaigns()

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--v2-border-accent)] bg-[var(--v2-cobalt-soft)] px-2.5 text-[12px] font-medium text-[#9DB6FF] hover:brightness-110"
        >
          <Plus className="h-3.5 w-3.5" /> New campaign
        </button>
      </div>

      <div className="v2-card overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-[var(--v2-text-mute)]">Loading campaigns…</p>
        ) : (data?.rows.length ?? 0) === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="Create a draft, then enroll userIds via the per-campaign API or activate to schedule."
            className="!py-10"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-white/[0.02]">
                <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
                  <th className="px-3 py-2.5">Name</th>
                  <th className="px-3 py-2.5">Channel</th>
                  <th className="px-3 py-2.5">Kind</th>
                  <th className="px-3 py-2.5 text-right">Steps</th>
                  <th className="px-3 py-2.5 text-right">Enrolled</th>
                  <th className="px-3 py-2.5 text-right">Sent</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Schedule</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data!.rows.map((row) => (
                  <CampaignRowView key={row.id} row={row} onChanged={() => mutate()} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <CreateCampaignModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            mutate()
            globalMutate("/api/admin/comms/campaigns")
          }}
        />
      )}
    </div>
  )
}

function CampaignRowView({
  row,
  onChanged,
}: {
  row: CampaignRow
  onChanged: () => void
}) {
  const [busy, setBusy] = React.useState(false)
  const stepsLen = Array.isArray(row.steps) ? row.steps.length : 0

  const transition = async (action: string) => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(
        `/api/admin/comms/campaigns/${row.id}/transition`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      )
      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.message ?? "transition failed")
      } else {
        onChanged()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr className="border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02]">
      <td className="px-3 py-2.5 font-medium text-[var(--v2-text)]">{row.name}</td>
      <td className="px-3 py-2.5">
        <span className={cn("v2-pill", CHANNEL_PILL[row.channel])}>{row.channel}</span>
      </td>
      <td className="px-3 py-2.5 text-[var(--v2-text-mute)]">{row.kind}</td>
      <td className="px-3 py-2.5 text-right v2-num text-[var(--v2-text-mute)]">
        {stepsLen}
      </td>
      <td className="px-3 py-2.5 text-right v2-num text-[var(--v2-text-mute)]">
        {row.enrollmentCount}
      </td>
      <td className="px-3 py-2.5 text-right v2-num text-[var(--v2-text-mute)]">
        {row.messageCount}
      </td>
      <td className="px-3 py-2.5">
        <span className={cn("v2-pill", STATUS_PILL[row.status])}>{row.status}</span>
      </td>
      <td className="px-3 py-2.5 v2-num text-[var(--v2-text-faint)]">
        {row.scheduledAt ? formatDateTimeIst(row.scheduledAt) : "—"}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-1">
          {row.status === "DRAFT" && (
            <ActionBtn icon={<PlayCircle className="h-3.5 w-3.5" />} onClick={() => transition("ACTIVATE")} busy={busy} label="Activate" />
          )}
          {row.status === "PAUSED" && (
            <ActionBtn icon={<PlayCircle className="h-3.5 w-3.5" />} onClick={() => transition("RESUME")} busy={busy} label="Resume" />
          )}
          {(row.status === "RUNNING" || row.status === "SCHEDULED") && (
            <ActionBtn icon={<PauseCircle className="h-3.5 w-3.5" />} onClick={() => transition("PAUSE")} busy={busy} label="Pause" />
          )}
          {row.status === "RUNNING" && (
            <ActionBtn icon={<RotateCw className="h-3.5 w-3.5" />} onClick={() => transition("COMPLETE")} busy={busy} label="Complete" />
          )}
          {row.status !== "COMPLETED" && row.status !== "CANCELLED" && (
            <ActionBtn icon={<StopCircle className="h-3.5 w-3.5" />} onClick={() => transition("CANCEL")} busy={busy} label="Cancel" tone="danger" />
          )}
        </div>
      </td>
    </tr>
  )
}

function ActionBtn({
  icon,
  onClick,
  busy,
  label,
  tone,
}: {
  icon: React.ReactNode
  onClick: () => void
  busy: boolean
  label: string
  tone?: "danger"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={label}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md border border-white/[0.08] px-2 text-[10px] font-medium uppercase tracking-[0.06em] hover:bg-white/[0.04]",
        tone === "danger"
          ? "text-[#FF8FA0]"
          : "text-[var(--v2-text-mute)]",
        busy && "opacity-40",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function CreateCampaignModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = React.useState("")
  const [channel, setChannel] = React.useState<Channel>("WHATSAPP")
  const [kind, setKind] = React.useState<CampaignKind>("ONE_SHOT")
  const [stepTemplateId, setStepTemplateId] = React.useState<string>("")
  const [scheduledAt, setScheduledAt] = React.useState<string>("")
  const [submitting, setSubmitting] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const tpl = useTemplates({ channel, status: "ACTIVE" })

  React.useEffect(() => {
    setStepTemplateId("")
  }, [channel])

  const handleSubmit = async () => {
    setSubmitting(true)
    setErr(null)
    try {
      if (!stepTemplateId) {
        throw new Error("pick at least one template (step 0)")
      }
      const res = await fetch("/api/admin/comms/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          channel,
          kind,
          steps: [{ templateId: stepTemplateId }],
          scheduledAt: scheduledAt || null,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.message ?? "create failed")
      }
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="v2-card w-full max-w-xl space-y-4 p-5">
        <header>
          <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--v2-text)]">
            <Megaphone className="h-4 w-4" /> New campaign
          </h2>
          <p className="mt-0.5 text-[11px] text-[var(--v2-text-mute)]">
            Drafts start without enrollments. Enroll user-ids via the per-campaign API,
            then activate. Audience-resolver UI lands in Phase 12.5.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 w-full rounded-md border border-white/[0.08] bg-transparent px-2 text-sm text-[var(--v2-text)] focus:border-[var(--v2-border-accent)] focus:outline-none"
            />
          </Field>
          <Field label="Channel">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
              className="h-9 w-full rounded-md border border-white/[0.08] bg-[var(--v2-surface-1)] px-2 text-sm text-[var(--v2-text)] focus:border-[var(--v2-border-accent)] focus:outline-none"
            >
              <option value="WHATSAPP">WhatsApp</option>
              <option value="SMS">SMS (DLT)</option>
              <option value="EMAIL">Email</option>
              <option value="VOICE">Voice</option>
              <option value="PUSH">Push</option>
            </select>
          </Field>
          <Field label="Kind">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as CampaignKind)}
              className="h-9 w-full rounded-md border border-white/[0.08] bg-[var(--v2-surface-1)] px-2 text-sm text-[var(--v2-text)] focus:border-[var(--v2-border-accent)] focus:outline-none"
            >
              <option value="ONE_SHOT">One-shot blast</option>
              <option value="DRIP">Drip (multi-step)</option>
              <option value="TRIGGERED">Triggered (event)</option>
            </select>
          </Field>
          <Field label="Schedule (UTC)">
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="h-9 w-full rounded-md border border-white/[0.08] bg-transparent px-2 text-sm text-[var(--v2-text)] focus:border-[var(--v2-border-accent)] focus:outline-none"
            />
          </Field>
          <Field label="Step 0 template" full>
            <select
              value={stepTemplateId}
              onChange={(e) => setStepTemplateId(e.target.value)}
              className="h-9 w-full rounded-md border border-white/[0.08] bg-[var(--v2-surface-1)] px-2 text-sm text-[var(--v2-text)] focus:border-[var(--v2-border-accent)] focus:outline-none"
            >
              <option value="">— pick one —</option>
              {tpl.data?.rows.map((t: TemplateRow) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {err && (
          <div className="rounded-md border border-[#FF4D6B]/30 bg-[#FF4D6B]/10 px-3 py-2 text-[12px] text-[#FFB4C0]">
            {err}
          </div>
        )}

        <footer className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border border-white/[0.08] px-3 text-sm text-[var(--v2-text-mute)] hover:bg-white/[0.04]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || !name || !stepTemplateId}
            onClick={handleSubmit}
            className="h-9 rounded-md bg-[#3B82F6] px-3 text-sm font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Create draft"}
          </button>
        </footer>
      </div>
    </div>
  )
}

function Field({
  label,
  full,
  children,
}: {
  label: string
  full?: boolean
  children: React.ReactNode
}) {
  return (
    <label className={cn("flex flex-col gap-1", full && "sm:col-span-2")}>
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
        {label}
      </span>
      {children}
    </label>
  )
}
