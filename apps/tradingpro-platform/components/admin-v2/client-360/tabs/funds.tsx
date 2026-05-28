/**
 * File:        components/admin-v2/client-360/tabs/funds.tsx
 * Module:      admin-v2/client-360
 * Purpose:     Funds tab — trading account snapshot, linked banks, and ledger statement with
 *              Phase 15 additions: date-range filter on the ledger + CSV export of the
 *              filtered rows.
 *
 * Exports:
 *   - default FundsTab  — props { user: UserDetail }
 *
 * Depends on:
 *   - @/components/admin-v2/primitives  — KpiTile, EmptyState
 *   - @/lib/admin-v2/api-client         — formatInr, formatDateTimeIst
 *   - ../hooks                          — useClientStatement
 *
 * Side-effects:
 *   - Lazy network fetch for the ledger (only after user clicks "Load statement")
 *   - Creates + revokes Blob URL on CSV export click
 *
 * Key invariants:
 *   - Date filter is applied client-side on the already-loaded ledger (no second API call)
 *   - CSV export covers only the date-filtered rows
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

"use client"

import * as React from "react"
import { ArrowDownToLine, ArrowUpFromLine, Building2, Download, Loader2, ScrollText, X } from "lucide-react"
import { EmptyState, KpiTile } from "@/components/admin-v2/primitives"
import { formatDateTimeIst, formatInr } from "@/lib/admin-v2/api-client"
import { cn } from "@/lib/utils"
import { useClientStatement } from "../hooks"
import type { UserDetail } from "../types"

interface FundsTabProps {
  user: UserDetail
}

interface LedgerRow {
  id?: string
  type?: string
  description?: string | null
  amount?: number | string
  runningBalance?: number | string | null
  createdAt?: string
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === "string" ? Number(v) : v
  return Number.isFinite(n) ? n : 0
}

function exportLedgerCsv(rows: LedgerRow[], userId: string) {
  const header = "Timestamp,Type,Description,Amount,Running balance"
  const body = rows
    .map((r) => {
      const amt = num(r.amount)
      const bal = r.runningBalance != null ? num(r.runningBalance) : ""
      const desc = (r.description ?? "").replace(/"/g, '""')
      return [
        `"${formatDateTimeIst(r.createdAt)}"`,
        r.type ?? "",
        `"${desc}"`,
        amt,
        bal,
      ].join(",")
    })
    .join("\n")
  const csv = `${header}\n${body}`
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `ledger-${userId}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function FundsTab({ user }: FundsTabProps) {
  const [showStatement, setShowStatement] = React.useState(false)
  const [filterFrom, setFilterFrom] = React.useState("")
  const [filterTo, setFilterTo] = React.useState("")
  const stmt = useClientStatement(user.id, showStatement)

  // Statement payload shape varies — extract a flat ledger array if present.
  const allLedger: LedgerRow[] = (() => {
    const data = stmt.data as
      | { ledger?: LedgerRow[]; rows?: LedgerRow[]; transactions?: LedgerRow[] }
      | undefined
    return data?.ledger ?? data?.rows ?? data?.transactions ?? []
  })()

  const ledger = React.useMemo(() => {
    if (!filterFrom && !filterTo) return allLedger
    const from = filterFrom ? new Date(filterFrom).getTime() : 0
    const to = filterTo ? new Date(filterTo + "T23:59:59").getTime() : Infinity
    return allLedger.filter((r) => {
      if (!r.createdAt) return true
      const t = new Date(r.createdAt).getTime()
      return t >= from && t <= to
    })
  }, [allLedger, filterFrom, filterTo])

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="v2-pill v2-pill-info">Funds</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
              wallet · banks · ledger
            </span>
          </div>
          <h2 className="mt-1 text-lg font-semibold text-[var(--v2-text)]">Funds & banking</h2>
        </div>
      </header>

      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Wallet balance"
          value={formatInr(user.tradingAccount?.balance)}
          tone="info"
          hint="Cash + credit"
        />
        <KpiTile
          label="Available margin"
          value={formatInr(user.tradingAccount?.availableMargin)}
          tone="success"
          hint="Free for new orders"
        />
        <KpiTile
          label="Used margin"
          value={formatInr(user.tradingAccount?.usedMargin)}
          tone="warning"
          hint="Locked by open positions"
        />
        <KpiTile
          label="Linked banks"
          value={user.bankAccounts?.length ?? 0}
          tone="neutral"
          hint="for withdrawal routing"
        />
      </section>

      {/* Bank accounts */}
      <section className="v2-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
          <Building2 className="h-3.5 w-3.5" /> Bank accounts
        </h3>
        {!user.bankAccounts || user.bankAccounts.length === 0 ? (
          <EmptyState
            title="No bank accounts linked"
            description="Required for withdrawal routing. Bank verification (lite) lands in Phase 13."
            className="!py-6"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
                  <th className="px-2 py-2">Bank</th>
                  <th className="px-2 py-2">Account</th>
                  <th className="px-2 py-2">IFSC</th>
                  <th className="px-2 py-2">Holder</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {user.bankAccounts.map((b) => (
                  <tr
                    key={b.id}
                    className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                  >
                    <td className="px-2 py-2.5 text-[var(--v2-text)]">{b.bankName}</td>
                    <td className="px-2 py-2.5 v2-num text-[var(--v2-text)]">{b.accountNumber}</td>
                    <td className="px-2 py-2.5 v2-num text-[var(--v2-text-mute)]">{b.ifscCode}</td>
                    <td className="px-2 py-2.5 text-[var(--v2-text-mute)]">{b.accountHolderName}</td>
                    <td className="px-2 py-2.5 text-xs">
                      {b.isDefault ? (
                        <span className="mr-1 rounded-md border border-[var(--v2-border-accent)] bg-[var(--v2-cobalt-soft)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-[#9DB6FF]">
                          default
                        </span>
                      ) : null}
                      {b.isActive ? (
                        <span className="text-[var(--v2-gain)]">active</span>
                      ) : (
                        <span className="text-[var(--v2-text-faint)]">inactive</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Statement */}
      <section className="v2-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
            <ScrollText className="h-3.5 w-3.5" /> Ledger statement
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {showStatement && (
              <>
                <input
                  type="date"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                  title="Filter from date"
                  className="h-7 rounded-lg border border-white/[0.08] bg-[var(--v2-bg-elev-1)] px-2 text-[11px] text-white [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-white/20"
                />
                <span className="text-[10px] text-[var(--v2-text-faint)]">–</span>
                <input
                  type="date"
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value)}
                  title="Filter to date"
                  className="h-7 rounded-lg border border-white/[0.08] bg-[var(--v2-bg-elev-1)] px-2 text-[11px] text-white [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-white/20"
                />
                {(filterFrom || filterTo) && (
                  <button
                    onClick={() => { setFilterFrom(""); setFilterTo("") }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] text-[var(--v2-text-mute)] hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
                <button
                  onClick={() => exportLedgerCsv(ledger, user.id)}
                  disabled={ledger.length === 0}
                  className="flex h-7 items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] font-medium text-[var(--v2-text-mute)] hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-40"
                >
                  <Download className="h-3 w-3" />
                  CSV
                </button>
                <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-faint)]">
                  {ledger.length}{filterFrom || filterTo ? ` / ${allLedger.length}` : ""} rows
                </span>
              </>
            )}
            {!showStatement && (
              <button
                type="button"
                onClick={() => setShowStatement(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--v2-border-accent)] bg-[var(--v2-cobalt-soft)] px-2.5 py-1 text-[11px] font-medium text-[#9DB6FF] hover:brightness-110"
              >
                Load statement
              </button>
            )}
          </div>
        </div>

        {!showStatement ? (
          <p className="text-xs text-[var(--v2-text-faint)]">
            Click load to pull the full ledger (orders, deposits, withdrawals, transactions).
            Defer-loaded to keep this tab snappy on large books.
          </p>
        ) : stmt.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--v2-text-mute)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading statement…
          </div>
        ) : stmt.error ? (
          <p className="text-sm font-medium text-[var(--v2-loss)]">
            Failed to load statement.
          </p>
        ) : ledger.length === 0 ? (
          <EmptyState
            title="No ledger rows"
            description="Statement returned empty for this client (no recent funds movement)."
            className="!py-6"
          />
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[var(--v2-surface)]">
                <tr className="border-b border-white/[0.06] text-left text-[10px] uppercase tracking-[0.08em] text-[var(--v2-text-mute)]">
                  <th className="px-2 py-2">When</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Description</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                  <th className="px-2 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledger.slice(0, 200).map((r, i) => {
                  const amt = num(r.amount)
                  const isCredit = amt > 0
                  return (
                    <tr
                      key={r.id ?? i}
                      className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                    >
                      <td className="whitespace-nowrap px-2 py-1.5 v2-num text-[var(--v2-text-mute)]">
                        {formatDateTimeIst(r.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--v2-text-mute)]">
                          {r.type ?? "—"}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-[var(--v2-text)]">
                        {r.description ?? "—"}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-1.5 text-right v2-num font-semibold",
                          amt === 0 && "text-[var(--v2-text-mute)]",
                          amt > 0 && "text-[var(--v2-gain)]",
                          amt < 0 && "text-[var(--v2-loss)]",
                        )}
                      >
                        <span className="inline-flex items-center justify-end gap-1">
                          {amt > 0 ? (
                            <ArrowDownToLine className="h-3 w-3" />
                          ) : amt < 0 ? (
                            <ArrowUpFromLine className="h-3 w-3" />
                          ) : null}
                          {isCredit ? "+" : ""}
                          {formatInr(amt)}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right v2-num text-[var(--v2-text)]">
                        {r.runningBalance != null ? formatInr(r.runningBalance) : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {allLedger.length > 200 && (
              <p className="mt-2 text-[10px] text-[var(--v2-text-faint)]">
                Showing first 200 of {allLedger.length} rows · use date filter to narrow the window
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
