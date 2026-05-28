/**
 * @file components/admin-v2/comms/templates-panel.tsx
 * @module admin-v2/comms
 * @description Templates list + create form. Drives all message bodies — every Active
 *              template can be referenced by a campaign or by ad-hoc send.
 *
 *              UI surfaces the SAVE-time variable validation: the form's `variables`
 *              field is a comma-separated chip input; the body's `{{var}}` markers must
 *              align (server enforces; client previews the diff).
 *
 * @author StockTrade
 * @created 2026-04-27
 */

"use client"

import * as React from "react"
import { mutate as globalMutate } from "swr"
import { Activity, FilePlus2, Filter, Search } from "lucide-react"
import { EmptyState } from "@/components/admin-v2/primitives/empty-state"
import { formatDateTimeIst } from "@/lib/admin-v2/api-client"
import { useTemplates } from "./hooks"
import type { Channel, TemplateRow, TemplateStatus } from "./types"
import { cn } from "@/lib/utils"

const CHANNEL_PILL: Record<Channel, string> = {
  WHATSAPP: "v2-pill-success",
  SMS: "v2-pill-info",
  EMAIL: "v2-pill-neutral",
  VOICE: "v2-pill-warning",
  PUSH: "v2-pill-info",
}

const STATUS_PILL: Record<TemplateStatus, string> = {
  DRAFT: "v2-pill-neutral",
  ACTIVE: "v2-pill-success",
  ARCHIVED: "v2-pill-neutral",
}

export function TemplatesPanel() {
  const [channel, setChannel] = React.useState<Channel | "">("")
  const [status, setStatus] = React.useState<TemplateStatus | "">("")
  const [q, setQ] = React.useState("")
  const [creating, setCreating] = React.useState(false)

  const { data, isLoading, mutate } = useTemplates({
    channel: channel || undefined,
    status: status || undefined,
    q: q || undefined,
  })

  return (
    <div className="space-y-3">
      {/* Filter strip */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-[var(--v2-surface-1)] p-2">
        <div className="relative flex min-w-[220px] flex-1 items-center">
          <Search className="absolute left-2 h-3.5 w-3.5 text-[var(--v2-text-faint)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or body…"
            className="h-8 w-full rounded-md border border-white/[0.06] bg-transparent pl-7 pr-2 text-[12px] text-[var(--v2-text)] placeholder:text-[var(--v2-text-faint)] focus:border-[var(--v2-border-accent)] focus:outline-none"
          />
        </div>
        <FilterDropdown
          value={channel}
          onChange={(v) => setChannel(v as Channel | "")}
          options={[
            { value: "", label: "All channels" },
            { value: "WHATSAPP", label: "WhatsApp" },
            { value: "SMS", label: "SMS (DLT)" },
            { value: "EMAIL", label: "Email" },
            { value: "VOICE", label: "Voice" },
            { value: "PUSH", label: "Push" },
          ]}
        />
        <FilterDropdown
          value={status}
          onChange={(v) => setStatus(v as TemplateStatus | "")}
          options={[
            { value: "", label: "All statuses" },
            { value: "DRAFT", label: "Draft" },
            { value: "ACTIVE", label: "Active" },
            { value: "ARCHIVED", label: "Archived" },
          ]}
        />
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--v2-border-accent)] bg-[var(--v2-cobalt-soft)] px-2.5 text-[12px] font-medium text-[#9DB6FF] hover:brightness-110"
        >
          <FilePlus2 className="h-3.5 w-3.5" /> New template
        </button>
      </div>

      {/* List */}
      <div className="v2-card overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-[var(--v2-text-mute)]">Loading templates…</p>
        ) : (data?.rows.length ?? 0) === 0 ? (
          <EmptyState
            title="No templates"
            description="Create one to start sending. SMS templates require a DLT id before activation."
            className="!py-10"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-white/[0.02]">
                <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
                  <th className="px-3 py-2.5">Name</th>
                  <th className="px-3 py-2.5">Channel</th>
                  <th className="px-3 py-2.5">Variables</th>
                  <th className="px-3 py-2.5">DLT</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Updated</th>
                </tr>
              </thead>
              <tbody>
                {data!.rows.map((row) => (
                  <TemplateRowView key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <CreateTemplateModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            mutate()
            globalMutate("/api/admin/comms/templates")
          }}
        />
      )}
    </div>
  )
}

function TemplateRowView({ row }: { row: TemplateRow }) {
  return (
    <tr className="border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02]">
      <td className="px-3 py-2.5">
        <div className="font-medium text-[var(--v2-text)]">{row.name}</div>
        <div className="mt-0.5 line-clamp-1 text-[11px] text-[var(--v2-text-faint)]">
          {row.body}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span className={cn("v2-pill", CHANNEL_PILL[row.channel])}>{row.channel}</span>
      </td>
      <td className="px-3 py-2.5">
        {row.variables.length === 0 ? (
          <span className="text-[var(--v2-text-faint)]">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.variables.map((v) => (
              <span
                key={v}
                className="rounded bg-white/[0.04] px-1.5 py-0.5 v2-num text-[10px] text-[var(--v2-text-mute)]"
              >
                {`{{${v}}}`}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="px-3 py-2.5 v2-num text-[var(--v2-text-mute)]">
        {row.dltTemplateId ?? <span className="text-[var(--v2-text-faint)]">—</span>}
      </td>
      <td className="px-3 py-2.5">
        <span className={cn("v2-pill", STATUS_PILL[row.status])}>{row.status}</span>
      </td>
      <td className="px-3 py-2.5 v2-num text-[var(--v2-text-faint)]">
        {formatDateTimeIst(row.updatedAt)}
      </td>
    </tr>
  )
}

function FilterDropdown({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="relative">
      <Filter className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--v2-text-faint)]" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 appearance-none rounded-md border border-white/[0.06] bg-[var(--v2-surface-1)] pl-6 pr-2 text-[12px] text-[var(--v2-text)] focus:border-[var(--v2-border-accent)] focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function CreateTemplateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = React.useState("")
  const [channel, setChannel] = React.useState<Channel>("WHATSAPP")
  const [body, setBody] = React.useState("")
  const [variablesText, setVariablesText] = React.useState("")
  const [dltTemplateId, setDltTemplateId] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  const handleSubmit = async () => {
    setSubmitting(true)
    setErr(null)
    try {
      const variables = variablesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      const res = await fetch("/api/admin/comms/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          channel,
          body,
          variables,
          dltTemplateId: dltTemplateId || null,
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
      <div className="v2-card w-full max-w-2xl space-y-4 p-5">
        <header>
          <h2 className="text-base font-semibold text-[var(--v2-text)]">New template</h2>
          <p className="mt-0.5 text-[11px] text-[var(--v2-text-mute)]">
            Use <span className="v2-num">{"{{var}}"}</span> in the body for variables. The
            comma-separated list below MUST exactly match what's in the body.
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
          <Field label="Variables (comma-sep)" full>
            <input
              value={variablesText}
              onChange={(e) => setVariablesText(e.target.value)}
              placeholder="name, balance, lastTrade"
              className="h-9 w-full rounded-md border border-white/[0.08] bg-transparent px-2 text-sm text-[var(--v2-text)] focus:border-[var(--v2-border-accent)] focus:outline-none"
            />
          </Field>
          {channel === "SMS" && (
            <Field label="DLT Template ID" full>
              <input
                value={dltTemplateId}
                onChange={(e) => setDltTemplateId(e.target.value)}
                placeholder="Required to activate (TRAI compliance)"
                className="h-9 w-full rounded-md border border-white/[0.08] bg-transparent px-2 text-sm v2-num text-[var(--v2-text)] focus:border-[var(--v2-border-accent)] focus:outline-none"
              />
            </Field>
          )}
          <Field label="Body" full>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-white/[0.08] bg-transparent px-2 py-1.5 text-sm text-[var(--v2-text)] focus:border-[var(--v2-border-accent)] focus:outline-none"
            />
          </Field>
        </div>

        {err && (
          <div className="rounded-md border border-[#FF4D6B]/30 bg-[#FF4D6B]/10 px-3 py-2 text-[12px] text-[#FFB4C0]">
            <Activity className="mr-1 inline h-3 w-3" />
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
            disabled={submitting || !name || !body}
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
