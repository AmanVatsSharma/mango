/**
 * @file components/admin-v2/client-360/tabs/comms.tsx
 * @module admin-v2/client-360
 * @description Per-client Comms inbox + ad-hoc send + per-channel consent toggle. The
 *              "thread" is derived from CommsMessage queries (no thread row in the DB).
 *
 *              Three columns at desktop; stacked at mobile:
 *                1. Consent strip — 5 chips, click to grant / revoke
 *                2. Quick send  — pick channel + template (or rawBody for non-SMS)
 *                3. Message feed — reverse-chronological, both directions interleaved
 *
 * @author StockTrade
 * @created 2026-04-27
 */

"use client"

import * as React from "react"
import { mutate as globalMutate } from "swr"
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ShieldCheck,
  ShieldOff,
  Send,
  XCircle,
} from "lucide-react"
import { EmptyState } from "@/components/admin-v2/primitives/empty-state"
import { formatRelativeIst } from "@/lib/admin-v2/api-client"
import {
  useMessages,
  useTemplates,
  useUserConsents,
} from "@/components/admin-v2/comms/hooks"
import type {
  Channel,
  ConsentRow,
  MessageRow,
  MessageStatus,
  TemplateRow,
} from "@/components/admin-v2/comms/types"
import type { UserDetail } from "../types"
import { cn } from "@/lib/utils"

const ALL_CHANNELS: Channel[] = ["WHATSAPP", "SMS", "EMAIL", "VOICE", "PUSH"]

const STATUS_PILL: Record<MessageStatus, string> = {
  QUEUED: "v2-pill-neutral",
  SENT: "v2-pill-info",
  DELIVERED: "v2-pill-success",
  READ: "v2-pill-success",
  FAILED: "v2-pill-danger",
  LOGGED: "v2-pill-neutral",
  OPTED_OUT: "v2-pill-warning",
  REJECTED: "v2-pill-danger",
}

interface Props {
  user: UserDetail
}

export default function CommsTab({ user }: Props) {
  const consents = useUserConsents(user.id)
  const messages = useMessages({ userId: user.id }, { limit: 100 })

  const consentByChannel = React.useMemo(() => {
    const map = new Map<Channel, ConsentRow>()
    consents.data?.rows.forEach((r) => map.set(r.channel, r))
    return map
  }, [consents.data])

  const refreshAll = React.useCallback(() => {
    consents.mutate()
    messages.mutate()
    globalMutate(`/api/admin/comms/messages?userId=${encodeURIComponent(user.id)}&limit=100`)
  }, [consents, messages, user.id])

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {/* Header */}
      <header>
        <div className="flex items-center gap-2">
          <span className="v2-pill v2-pill-info">Comms · Multi-channel</span>
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
            Outbound + inbound · derived thread (no separate thread row)
          </span>
        </div>
        <h2 className="mt-1 text-lg font-semibold text-[var(--v2-text)]">Comms inbox</h2>
      </header>

      {/* Consent strip */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {ALL_CHANNELS.map((c) => {
          const row = consentByChannel.get(c)
          const granted = !!row?.optInAt && !row?.optOutAt
          return (
            <ConsentChip
              key={c}
              channel={c}
              granted={granted}
              row={row}
              onChange={refreshAll}
              userId={user.id}
            />
          )
        })}
      </section>

      {/* Quick send + Message feed */}
      <section className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <QuickSend user={user} consents={consentByChannel} onSent={refreshAll} />
        <MessageFeed
          rows={messages.data?.rows ?? []}
          isLoading={messages.isLoading}
        />
      </section>
    </div>
  )
}

function ConsentChip({
  channel,
  granted,
  row,
  userId,
  onChange,
}: {
  channel: Channel
  granted: boolean
  row: ConsentRow | undefined
  userId: string
  onChange: () => void
}) {
  const [busy, setBusy] = React.useState(false)
  const handle = async (action: "GRANT" | "REVOKE") => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch("/api/admin/comms/consents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          channel,
          action,
          source: "ADMIN_GRANT",
          reason: action === "REVOKE" ? "ADMIN_REVOKE" : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.message ?? "consent op failed")
        return
      }
      onChange()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="v2-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
          {channel}
        </span>
        {granted ? (
          <ShieldCheck className="h-3.5 w-3.5 text-[#10E9A0]" />
        ) : (
          <ShieldOff className="h-3.5 w-3.5 text-[#FFB020]" />
        )}
      </div>
      <p className="mt-1 text-[11px] text-[var(--v2-text-faint)]">
        {row && row.optInAt
          ? granted
            ? `Granted ${formatRelativeIst(row.optInAt)}`
            : `Opted out ${row.optOutAt ? formatRelativeIst(row.optOutAt) : ""}`
          : "Not set"}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => handle(granted ? "REVOKE" : "GRANT")}
        className={cn(
          "mt-2 h-7 w-full rounded-md text-[10px] font-medium uppercase tracking-[0.06em] transition",
          granted
            ? "bg-[#FF4D6B]/15 text-[#FFB4C0] hover:bg-[#FF4D6B]/25"
            : "bg-[#10E9A0]/15 text-[#10E9A0] hover:bg-[#10E9A0]/25",
          busy && "opacity-40",
        )}
      >
        {granted ? "Revoke" : "Grant"}
      </button>
    </div>
  )
}

function QuickSend({
  user,
  consents,
  onSent,
}: {
  user: UserDetail
  consents: Map<Channel, ConsentRow>
  onSent: () => void
}) {
  const [channel, setChannel] = React.useState<Channel>("WHATSAPP")
  const [templateId, setTemplateId] = React.useState<string>("")
  const [rawBody, setRawBody] = React.useState<string>("")
  const [variablesText, setVariablesText] = React.useState<string>("")
  const [submitting, setSubmitting] = React.useState(false)
  const [last, setLast] = React.useState<{
    status: MessageStatus
    reason?: string
  } | null>(null)

  const tpl = useTemplates({ channel, status: "ACTIVE" })

  const granted =
    !!consents.get(channel)?.optInAt && !consents.get(channel)?.optOutAt

  const handleSend = async () => {
    setSubmitting(true)
    setLast(null)
    try {
      let variables: Record<string, string | number> = {}
      if (variablesText.trim()) {
        for (const piece of variablesText.split(",")) {
          const [k, v] = piece.split("=").map((s) => s.trim())
          if (k) variables[k] = v ?? ""
        }
      }
      const res = await fetch("/api/admin/comms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          channel,
          templateId: templateId || undefined,
          rawBody: rawBody || undefined,
          variables,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setLast({ status: "FAILED", reason: json.message ?? "send failed" })
        return
      }
      setLast({ status: json.status, reason: json.reason })
      onSent()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="v2-card flex flex-col gap-3 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
        Quick send
      </h3>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
          Channel
        </span>
        <select
          value={channel}
          onChange={(e) => {
            setChannel(e.target.value as Channel)
            setTemplateId("")
          }}
          className="h-9 rounded-md border border-white/[0.08] bg-[var(--v2-surface-1)] px-2 text-sm text-[var(--v2-text)] focus:border-[var(--v2-border-accent)] focus:outline-none"
        >
          {ALL_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      {!granted && (
        <p className="rounded-md border border-[#FFB020]/30 bg-[#FFB020]/10 px-3 py-1.5 text-[11px] text-[#FFD78A]">
          Channel has no active consent → send will be recorded as <strong>OPTED_OUT</strong> (Gate #2).
          Toggle consent above first to actually dispatch.
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
          Template
        </span>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="h-9 rounded-md border border-white/[0.08] bg-[var(--v2-surface-1)] px-2 text-sm text-[var(--v2-text)] focus:border-[var(--v2-border-accent)] focus:outline-none"
        >
          <option value="">{channel === "SMS" ? "— required for SMS —" : "— or use raw body —"}</option>
          {tpl.data?.rows.map((t: TemplateRow) => (
            <option key={t.id} value={t.id}>
              {t.name} {t.variables.length > 0 ? `(${t.variables.join(", ")})` : ""}
            </option>
          ))}
        </select>
      </label>

      {!templateId && channel !== "SMS" && (
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
            Raw body
          </span>
          <textarea
            value={rawBody}
            onChange={(e) => setRawBody(e.target.value)}
            rows={3}
            placeholder="One-off message body…"
            className="rounded-md border border-white/[0.08] bg-transparent px-2 py-1.5 text-sm text-[var(--v2-text)] focus:border-[var(--v2-border-accent)] focus:outline-none"
          />
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
          Variables (key=value, comma-sep)
        </span>
        <input
          value={variablesText}
          onChange={(e) => setVariablesText(e.target.value)}
          placeholder="name=Aman, balance=12500"
          className="h-9 rounded-md border border-white/[0.08] bg-transparent px-2 text-sm text-[var(--v2-text)] focus:border-[var(--v2-border-accent)] focus:outline-none"
        />
      </label>

      <button
        type="button"
        disabled={submitting || (!templateId && (!rawBody || channel === "SMS"))}
        onClick={handleSend}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#3B82F6] px-3 text-sm font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Send className="h-3.5 w-3.5" />
        {submitting ? "Sending…" : "Send"}
      </button>

      {last && (
        <div
          className={cn(
            "flex items-start gap-1.5 rounded-md border px-3 py-2 text-[11px]",
            last.status === "SENT" || last.status === "QUEUED"
              ? "border-[#10E9A0]/30 bg-[#10E9A0]/10 text-[#A7F0D2]"
              : last.status === "OPTED_OUT"
                ? "border-[#FFB020]/30 bg-[#FFB020]/10 text-[#FFD78A]"
                : "border-[#FF4D6B]/30 bg-[#FF4D6B]/10 text-[#FFB4C0]",
          )}
        >
          {last.status === "SENT" || last.status === "QUEUED" ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5" />
          ) : (
            <XCircle className="mt-0.5 h-3.5 w-3.5" />
          )}
          <div>
            <div className="font-semibold uppercase tracking-[0.06em]">{last.status}</div>
            {last.reason && <div>{last.reason}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

function MessageFeed({
  rows,
  isLoading,
}: {
  rows: MessageRow[]
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className="v2-card p-6 text-sm text-[var(--v2-text-mute)]">Loading…</div>
    )
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No messages yet"
        description="Send a test message — opt-in WhatsApp first to see a green DELIVERED."
        className="v2-card !py-10"
      />
    )
  }
  return (
    <div className="v2-card divide-y divide-white/[0.04] overflow-hidden">
      {rows.map((m) => (
        <MessageRowCard key={m.id} row={m} />
      ))}
    </div>
  )
}

function MessageRowCard({ row }: { row: MessageRow }) {
  return (
    <div className="flex gap-3 p-3">
      <div className="mt-0.5">
        {row.direction === "OUTBOUND" ? (
          <ArrowUpRight className="h-3.5 w-3.5 text-[#9DB6FF]" />
        ) : (
          <ArrowDownLeft className="h-3.5 w-3.5 text-[#10E9A0]" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
            {row.channel}
          </span>
          <span className={cn("v2-pill", STATUS_PILL[row.status])}>{row.status}</span>
          <span className="v2-num text-[10px] text-[var(--v2-text-faint)]">
            {formatRelativeIst(row.queuedAt)}
          </span>
          {row.providerName && (
            <span className="v2-num text-[10px] text-[var(--v2-text-faint)]">
              · {row.providerName}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-[var(--v2-text)]">{row.renderedBody}</p>
        {row.failureReason && (
          <p className="mt-1 text-[11px] text-[#FFB4C0]">{row.failureReason}</p>
        )}
      </div>
    </div>
  )
}
