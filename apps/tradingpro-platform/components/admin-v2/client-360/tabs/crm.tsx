/**
 * @file components/admin-v2/client-360/tabs/crm.tsx
 * @module admin-v2/client-360
 * @description CRM tab — composed from the canonical components/admin-v2/crm/* panels
 *              (single source of truth for v2). Notes panel + Tasks panel + comms stub buttons
 *              for direct contact actions. Replaces the inline implementation that shipped
 *              in Phase 2.
 *
 *              Exports:
 *                - default CrmTab — props { user }.
 *
 * @author StockTrade
 * @created 2026-04-26
 * @updated 2026-04-26 — Phase 4: now uses canonical CRM panels.
 */

"use client"

import * as React from "react"
import {
  CrmIntegrationStubButtons,
  CrmNotesPanel,
  CrmTasksPanel,
} from "@/components/admin-v2/crm"
import type { UserDetail } from "../types"

interface CrmTabProps {
  user: UserDetail
}

export default function CrmTab({ user }: CrmTabProps) {
  return (
    <div className="space-y-4">
      <div className="v2-card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
            Direct contact
          </div>
          <p className="mt-1 text-xs text-[var(--v2-text-mute)]">
            OS-level handlers today · WhatsApp / SMS / Voice / Email providers wire in Phase 12.
          </p>
        </div>
        <CrmIntegrationStubButtons phone={user.phone} email={user.email} size="md" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CrmNotesPanel userId={user.id} />
        <CrmTasksPanel userId={user.id} />
      </div>
    </div>
  )
}
