/**
 * @file components/admin-v2/comms/consent-lookup-panel.tsx
 * @module admin-v2/comms
 * @description Lookup the per-channel consent state for a single user. Per-channel toggle
 *              between GRANTED / REVOKED. Used by ops to investigate "why was this send
 *              blocked" or "manually grant consent for an imported user".
 *
 * @author StockTrade
 * @created 2026-04-27
 */

"use client"

import * as React from "react"
import { Search, ShieldCheck, ShieldOff } from "lucide-react"
import { EmptyState } from "@/components/admin-v2/primitives/empty-state"
import { formatDateTimeIst } from "@/lib/admin-v2/api-client"
import { useUserConsents } from "./hooks"
import type { Channel, ConsentRow } from "./types"
import { cn } from "@/lib/utils"

const ALL_CHANNELS: Channel[] = ["WHATSAPP", "SMS", "EMAIL", "VOICE", "PUSH"]

export function ConsentLookupPanel() {
  const [userId, setUserId] = React.useState("")
  const [resolved, setResolved] = React.useState<string | null>(null)
  const { data, isLoading, mutate } = useUserConsents(resolved)

  const consentByChannel = React.useMemo(() => {
    const map = new Map<Channel, ConsentRow>()
    data?.rows.forEach((r) => map.set(r.channel, r))
    return map
  }, [data])

  const handleToggle = async (channel: Channel, action: "GRANT" | "REVOKE") => {
    if (!resolved) return
    const res = await fetch("/api/admin/comms/consents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: resolved,
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
    mutate()
  }

  return (
    <div className="space-y-4">
      <div className="v2-card flex items-center gap-2 p-3">
        <Search className="h-3.5 w-3.5 text-[var(--v2-text-faint)]" />
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="Paste a userId — UUID from the clients workbench"
          className="h-8 flex-1 rounded-md border border-white/[0.06] bg-transparent px-2 text-[12px] v2-num text-[var(--v2-text)] placeholder:text-[var(--v2-text-faint)] focus:border-[var(--v2-border-accent)] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setResolved(userId.trim() || null)}
          disabled={!userId.trim()}
          className="h-8 rounded-md bg-[#3B82F6] px-3 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-40"
        >
          Look up
        </button>
      </div>

      {!resolved ? (
        <EmptyState
          title="Paste a user id to view consent"
          description="The grid shows all 5 channels — granted, revoked, or never set."
          className="!py-10"
        />
      ) : isLoading ? (
        <p className="text-sm text-[var(--v2-text-mute)]">Loading consent rows…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ALL_CHANNELS.map((c) => {
            const row = consentByChannel.get(c)
            const granted = !!row?.optInAt && !row?.optOutAt
            return (
              <div key={c} className="v2-card p-3">
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "v2-pill",
                      granted ? "v2-pill-success" : "v2-pill-warning",
                    )}
                  >
                    {c}
                  </span>
                  {granted ? (
                    <ShieldCheck className="h-3.5 w-3.5 text-[#10E9A0]" />
                  ) : (
                    <ShieldOff className="h-3.5 w-3.5 text-[#FFB020]" />
                  )}
                </div>
                <p className="mt-2 text-[11px] text-[var(--v2-text-mute)]">
                  {!row
                    ? "No consent record."
                    : granted
                      ? `Granted ${formatDateTimeIst(row.optInAt)} via ${row.source}.`
                      : `Opted out ${row.optOutAt ? formatDateTimeIst(row.optOutAt) : ""}${row.optOutReason ? " (" + row.optOutReason + ")" : ""}.`}
                </p>
                <div className="mt-3 flex gap-1">
                  {!granted && (
                    <button
                      type="button"
                      onClick={() => handleToggle(c, "GRANT")}
                      className="h-7 flex-1 rounded-md bg-[#10E9A0]/15 text-[10px] font-medium uppercase tracking-[0.06em] text-[#10E9A0] hover:bg-[#10E9A0]/25"
                    >
                      Grant
                    </button>
                  )}
                  {granted && (
                    <button
                      type="button"
                      onClick={() => handleToggle(c, "REVOKE")}
                      className="h-7 flex-1 rounded-md bg-[#FF4D6B]/15 text-[10px] font-medium uppercase tracking-[0.06em] text-[#FFB4C0] hover:bg-[#FF4D6B]/25"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
