/**
 * @file components/admin-v2/client-360/sticky-header.tsx
 * @module admin-v2/client-360
 * @description Sticky header for Client 360 (page + drawer twin). Avatar with gradient ring,
 *              identity row with copy-friendly mono fields, status pill cluster, RM badge,
 *              actions slot for the parent's quick-action buttons.
 *
 *              Exports:
 *                - ClientStickyHeader  — props { user, online, actions? }.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { StatusPill } from "@/components/admin-v2/primitives"
import type { UserDetail } from "./types"

interface ClientStickyHeaderProps {
  user: UserDetail
  online?: boolean
  actions?: React.ReactNode
}

function initials(name: string | null | undefined): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase()).join("") || "?"
}

export function ClientStickyHeader({ user, online, actions }: ClientStickyHeaderProps) {
  return (
    <div className="sticky top-0 z-20 v2-glass border-b border-white/[0.06] px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            aria-hidden
            className="v2-ring-grad flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1A2540] to-[#0E1627] text-base font-semibold text-[var(--v2-text)]"
          >
            {initials(user.name)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold v2-text-grad-primary">
                {user.name ?? "—"}
              </h2>
              {online ? (
                <StatusPill tone="success" label="Live" dot size="sm" />
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--v2-text-mute)]">
              {user.clientId ? (
                <span className="font-mono text-[var(--v2-text)]">{user.clientId}</span>
              ) : null}
              {user.email ? <span className="truncate">{user.email}</span> : null}
              {user.phone ? <span className="font-mono">{user.phone}</span> : null}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {user.suspendedAt ? (
                <StatusPill kind="SUSPENDED" size="sm" />
              ) : user.isActive ? (
                <StatusPill kind="ACTIVE" size="sm" />
              ) : (
                <StatusPill kind="INACTIVE" size="sm" />
              )}
              {user.kyc?.status ? (
                <StatusPill kind={user.kyc.status} label={`KYC ${user.kyc.status}`} size="sm" />
              ) : null}
              {user.kyc?.amlStatus &&
              user.kyc.amlStatus !== "PENDING" &&
              user.kyc.amlStatus !== "CLEAR" ? (
                <StatusPill
                  kind={user.kyc.amlStatus}
                  label={`AML ${user.kyc.amlStatus}`}
                  size="sm"
                />
              ) : null}
              {user.role !== "USER" ? (
                <StatusPill tone="info" label={user.role} size="sm" />
              ) : null}
              {user.managedBy?.name ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-[2px] text-[10px] tracking-wide text-[var(--v2-text-mute)]">
                  <span className="text-[var(--v2-text-faint)]">RM</span>
                  <span className="text-[var(--v2-text)]">{user.managedBy.name}</span>
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}
