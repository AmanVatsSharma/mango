/**
 * @file components/admin-v2/comms/messages-panel.tsx
 * @module admin-v2/comms
 * @description Global message feed — every send + inbound reply across the platform.
 *              Status pills are tone-aware: SENT/DELIVERED/READ green; FAILED red;
 *              REJECTED red (gates fired); OPTED_OUT amber. Free-text + filter strip.
 *
 *              Auto-refreshes every 15s for live-feed feel.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

"use client"

import * as React from "react"
import { ArrowDownLeft, ArrowUpRight, Filter, Search } from "lucide-react"
import { EmptyState } from "@/components/admin-v2/primitives/empty-state"
import { formatDateTimeIst } from "@/lib/admin-v2/api-client"
import { useMessages } from "./hooks"
import type {
  Channel,
  MessageDirection,
  MessageRow,
  MessageStatus,
} from "./types"
import { cn } from "@/lib/utils"

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

const CHANNEL_PILL: Record<Channel, string> = {
  WHATSAPP: "v2-pill-success",
  SMS: "v2-pill-info",
  EMAIL: "v2-pill-neutral",
  VOICE: "v2-pill-warning",
  PUSH: "v2-pill-info",
}

export function MessagesPanel() {
  const [channel, setChannel] = React.useState<Channel | "">("")
  const [status, setStatus] = React.useState<MessageStatus | "">("")
  const [direction, setDirection] = React.useState<MessageDirection | "">("")
  const [q, setQ] = React.useState("")
  const [page, setPage] = React.useState(1)

  const { data, isLoading } = useMessages(
    {
      channel: channel || undefined,
      status: status || undefined,
      direction: direction || undefined,
      q: q || undefined,
    },
    { page, limit: 50 },
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-[var(--v2-surface-1)] p-2">
        <div className="relative flex min-w-[220px] flex-1 items-center">
          <Search className="absolute left-2 h-3.5 w-3.5 text-[var(--v2-text-faint)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search body / address / provider id…"
            className="h-8 w-full rounded-md border border-white/[0.06] bg-transparent pl-7 pr-2 text-[12px] text-[var(--v2-text)] placeholder:text-[var(--v2-text-faint)] focus:border-[var(--v2-border-accent)] focus:outline-none"
          />
        </div>
        <Dropdown
          value={channel}
          onChange={(v) => setChannel(v as Channel | "")}
          options={[
            { value: "", label: "All channels" },
            { value: "WHATSAPP", label: "WhatsApp" },
            { value: "SMS", label: "SMS" },
            { value: "EMAIL", label: "Email" },
            { value: "VOICE", label: "Voice" },
            { value: "PUSH", label: "Push" },
          ]}
        />
        <Dropdown
          value={status}
          onChange={(v) => setStatus(v as MessageStatus | "")}
          options={[
            { value: "", label: "All statuses" },
            { value: "QUEUED", label: "Queued" },
            { value: "SENT", label: "Sent" },
            { value: "DELIVERED", label: "Delivered" },
            { value: "READ", label: "Read" },
            { value: "FAILED", label: "Failed" },
            { value: "LOGGED", label: "Logged (inbound)" },
            { value: "OPTED_OUT", label: "Opted-out (Gate #2)" },
            { value: "REJECTED", label: "Rejected (Gate #1/#3)" },
          ]}
        />
        <Dropdown
          value={direction}
          onChange={(v) => setDirection(v as MessageDirection | "")}
          options={[
            { value: "", label: "Both directions" },
            { value: "OUTBOUND", label: "Outbound" },
            { value: "INBOUND", label: "Inbound" },
          ]}
        />
      </div>

      <div className="v2-card overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-[var(--v2-text-mute)]">Loading messages…</p>
        ) : (data?.rows.length ?? 0) === 0 ? (
          <EmptyState
            title="No messages match"
            description="Adjust filters or send a test message via Client 360 → Comms tab."
            className="!py-10"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="bg-white/[0.02]">
                  <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
                    <th className="px-3 py-2.5">When</th>
                    <th className="px-3 py-2.5">Dir</th>
                    <th className="px-3 py-2.5">Channel</th>
                    <th className="px-3 py-2.5">Address</th>
                    <th className="px-3 py-2.5">Body</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Provider</th>
                    <th className="px-3 py-2.5">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.rows.map((row) => (
                    <MessageRowView key={row.id} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-white/[0.06] px-3 py-2 text-[11px] text-[var(--v2-text-mute)]">
              <span>
                Showing {(page - 1) * data!.limit + 1}–{(page - 1) * data!.limit + data!.rows.length} of {data!.total}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-7 rounded-md border border-white/[0.08] px-2 text-[11px] text-[var(--v2-text-mute)] hover:bg-white/[0.04] disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={!data!.hasNext}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-7 rounded-md border border-white/[0.08] px-2 text-[11px] text-[var(--v2-text-mute)] hover:bg-white/[0.04] disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MessageRowView({ row }: { row: MessageRow }) {
  return (
    <tr className="border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02]">
      <td className="whitespace-nowrap px-3 py-2.5 v2-num text-[var(--v2-text-faint)]">
        {formatDateTimeIst(row.queuedAt)}
      </td>
      <td className="px-3 py-2.5">
        {row.direction === "OUTBOUND" ? (
          <ArrowUpRight className="h-3.5 w-3.5 text-[#9DB6FF]" aria-label="OUT" />
        ) : (
          <ArrowDownLeft className="h-3.5 w-3.5 text-[#10E9A0]" aria-label="IN" />
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className={cn("v2-pill", CHANNEL_PILL[row.channel])}>{row.channel}</span>
      </td>
      <td className="px-3 py-2.5 v2-num text-[var(--v2-text-mute)]">
        {row.direction === "OUTBOUND" ? row.toAddress ?? "—" : row.fromAddress ?? "—"}
      </td>
      <td className="max-w-[320px] px-3 py-2.5 text-[var(--v2-text)]">
        <div className="line-clamp-1">{row.renderedBody}</div>
      </td>
      <td className="px-3 py-2.5">
        <span className={cn("v2-pill", STATUS_PILL[row.status])}>{row.status}</span>
      </td>
      <td className="px-3 py-2.5 v2-num text-[var(--v2-text-faint)]">
        {row.providerName ?? "—"}
      </td>
      <td className="max-w-[260px] px-3 py-2.5 text-[11px] text-[var(--v2-text-mute)]">
        <div className="line-clamp-1">{row.failureReason ?? "—"}</div>
      </td>
    </tr>
  )
}

function Dropdown({
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
