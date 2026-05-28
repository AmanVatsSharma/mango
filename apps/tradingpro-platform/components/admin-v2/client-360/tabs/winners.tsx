/**
 * @file components/admin-v2/client-360/tabs/winners.tsx
 * @module admin-v2/client-360
 * @description Winner Controls tab — embeds the WinnerControlPanel for this client.
 *              Permission-gated to admin.house.winner; rendered when ops needs to set
 *              spread, position cap, instrument blocks, or rung directly from Client 360.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import Link from "next/link"
import { ExternalLink } from "lucide-react"
import { WinnerControlPanel } from "@/components/admin-v2/winners"
import type { UserDetail } from "../types"

export default function WinnersTab({ user }: { user: UserDetail }) {
  return (
    <div className="space-y-3 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-[var(--v2-text)]">Winner mitigation</h2>
          <p className="text-xs text-[var(--v2-text-mute)]">
            B-book counterparty defence — set rung, override knobs, and audit trail for this client.
          </p>
        </div>
        <Link
          href="/admin-v2/house/winners"
          className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-[var(--v2-text-mute)] hover:border-[var(--v2-border-accent)] hover:text-[var(--v2-text)]"
        >
          <ExternalLink className="h-3 w-3" /> All flagged winners
        </Link>
      </div>
      <WinnerControlPanel userId={user.id} />
    </div>
  )
}
