/**
 * File:        components/admin-console/financial-export-modal.tsx
 * Module:      admin-console · Financial Overview
 * Purpose:     Export dialog for the Financial Audit Report — lets the admin choose
 *              format (PDF / CSV) and content scope (deposits / withdrawals / combined),
 *              then fetches all matching records + summary before triggering download.
 *
 * Exports:
 *   - FinancialExportModal(props)  — Dialog component wired to the export utils
 *
 * Depends on:
 *   - @/components/admin-console/financial-export-utils — pure PDF/CSV builders
 *   - @/components/ui/dialog, button, badge             — Radix UI primitives
 *   - lucide-react                                      — icons
 *
 * Side-effects:
 *   - Triggers browser file download when export completes
 *   - Makes up to 3 fetch calls: summary + deposits + withdrawals
 *
 * Key invariants:
 *   - Filters are forwarded verbatim from financial-overview.tsx (same query params)
 *   - pageSize=500 is the API hard cap — covers real-world volumes for export
 *   - On fetch error, shows inline error (no toast suppression)
 *
 * Read order:
 *   1. FinancialExportModalProps — the prop contract
 *   2. FinancialExportModal — the component
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Download,
  FileText,
  FileSpreadsheet,
  Loader2,
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  LayoutList,
  CalendarRange,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  exportFinancialPdf,
  exportFinancialCsv,
  type ExportContent,
  type ExportFormat,
  type FinancialExportOptions,
  type DepositExportRow,
  type WithdrawalExportRow,
  type FinancialSummaryData,
} from "./financial-export-utils"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FinancialExportFilters {
  status?: string
  search?: string
  adminId?: string
  adminName?: string
  from?: string
  to?: string
}

export interface FinancialExportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Active deposit filters forwarded from the overview */
  depositFilters: FinancialExportFilters
  /** Active withdrawal filters forwarded from the overview */
  withdrawalFilters: FinancialExportFilters
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildAuditQuery(filters: FinancialExportFilters): string {
  const p = new URLSearchParams()
  if (filters.status && filters.status !== "ALL") p.set("status", filters.status)
  if (filters.search) p.set("search", filters.search)
  if (filters.adminId) p.set("adminId", filters.adminId)
  if (filters.adminName) p.set("adminName", filters.adminName)
  if (filters.from) {
    const d = new Date(`${filters.from}T00:00:00Z`)
    if (!Number.isNaN(d.getTime())) p.set("from", d.toISOString())
  }
  if (filters.to) {
    const d = new Date(`${filters.to}T23:59:59Z`)
    if (!Number.isNaN(d.getTime())) p.set("to", d.toISOString())
  }
  p.set("page", "1")
  p.set("pageSize", "500")
  return p.toString()
}

function buildSummaryQuery(from?: string, to?: string): string {
  const p = new URLSearchParams()
  if (from) {
    const d = new Date(`${from}T00:00:00Z`)
    if (!Number.isNaN(d.getTime())) p.set("from", d.toISOString())
  }
  if (to) {
    const d = new Date(`${to}T23:59:59Z`)
    if (!Number.isNaN(d.getTime())) p.set("to", d.toISOString())
  }
  return p.toString()
}

function formatDateDisplay(s: string): string {
  if (!s) return ""
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ToggleChipProps {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}

function ToggleChip({ active, onClick, icon, label }: ToggleChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all",
        active
          ? "border-primary bg-primary/10 text-primary shadow-sm"
          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FinancialExportModal({
  open,
  onOpenChange,
  depositFilters,
  withdrawalFilters,
}: FinancialExportModalProps) {
  const [format, setFormat] = React.useState<ExportFormat>("pdf")
  const [content, setContent] = React.useState<ExportContent>("combined")
  const [isExporting, setIsExporting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Use deposit date range as the canonical range (both tabs share same dates in practice)
  const dateFrom = depositFilters.from ?? withdrawalFilters.from ?? ""
  const dateTo = depositFilters.to ?? withdrawalFilters.to ?? ""

  const handleExport = async () => {
    setIsExporting(true)
    setError(null)

    try {
      // Fetch summary
      let summary: FinancialSummaryData | null = null
      try {
        const summaryRes = await fetch(
          `/api/super-admin/finance/summary?${buildSummaryQuery(dateFrom, dateTo)}`
        )
        if (summaryRes.ok) {
          const payload = (await summaryRes.json()) as { success: boolean; data: FinancialSummaryData }
          summary = payload.data ?? null
        }
      } catch {
        // non-blocking — export proceeds without summary
      }

      // Fetch deposit records
      let deposits: DepositExportRow[] = []
      if (content === "deposits" || content === "combined") {
        const res = await fetch(
          `/api/super-admin/deposits/audit?${buildAuditQuery(depositFilters)}`
        )
        if (!res.ok) throw new Error(`Failed to fetch deposits (${res.status})`)
        const payload = (await res.json()) as { success: boolean; data: { records: DepositExportRow[] } }
        deposits = payload.data?.records ?? []
      }

      // Fetch withdrawal records
      let withdrawals: WithdrawalExportRow[] = []
      if (content === "withdrawals" || content === "combined") {
        const res = await fetch(
          `/api/super-admin/withdrawals/audit?${buildAuditQuery(withdrawalFilters)}`
        )
        if (!res.ok) throw new Error(`Failed to fetch withdrawals (${res.status})`)
        const payload = (await res.json()) as {
          success: boolean
          data: { records: WithdrawalExportRow[] }
        }
        withdrawals = payload.data?.records ?? []
      }

      const exportOpts: FinancialExportOptions = {
        content,
        summary,
        deposits,
        withdrawals,
        dateFrom,
        dateTo,
      }

      if (format === "pdf") {
        await exportFinancialPdf(exportOpts)
      } else {
        exportFinancialCsv(exportOpts)
      }

      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed. Please try again.")
    } finally {
      setIsExporting(false)
    }
  }

  const contentLabel =
    content === "combined"
      ? "Combined (Deposits + Withdrawals)"
      : content === "deposits"
        ? "Deposits only"
        : "Withdrawals only"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4 text-primary" />
            Export Financial Report
          </DialogTitle>
          <DialogDescription className="text-xs">
            Exports a branded financial audit report with summary totals and the full filtered list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* ── Date range display ── */}
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarRange className="h-3.5 w-3.5 shrink-0" />
              <span className="font-medium">Period:</span>
              <span>
                {dateFrom || dateTo
                  ? `${formatDateDisplay(dateFrom) || "start"} → ${formatDateDisplay(dateTo) || "now"}`
                  : "All time (no date filter active)"}
              </span>
            </div>
          </div>

          {/* ── Format selector ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Format
            </p>
            <div className="flex gap-2">
              <ToggleChip
                active={format === "pdf"}
                onClick={() => setFormat("pdf")}
                icon={<FileText className="h-4 w-4" />}
                label="PDF"
              />
              <ToggleChip
                active={format === "csv"}
                onClick={() => setFormat("csv")}
                icon={<FileSpreadsheet className="h-4 w-4" />}
                label="CSV / Excel"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {format === "pdf"
                ? "Branded A4 landscape PDF with header, summary tables, and page footers."
                : "UTF-8 CSV with BOM — opens natively in Excel / Google Sheets."}
            </p>
          </div>

          <Separator />

          {/* ── Content selector ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Include
            </p>
            <div className="flex flex-wrap gap-2">
              <ToggleChip
                active={content === "combined"}
                onClick={() => setContent("combined")}
                icon={<LayoutList className="h-4 w-4" />}
                label="Combined"
              />
              <ToggleChip
                active={content === "deposits"}
                onClick={() => setContent("deposits")}
                icon={<ArrowDownToLine className="h-4 w-4" />}
                label="Deposits only"
              />
              <ToggleChip
                active={content === "withdrawals"}
                onClick={() => setContent("withdrawals")}
                icon={<ArrowUpFromLine className="h-4 w-4" />}
                label="Withdrawals only"
              />
            </div>
          </div>

          {/* ── Summary preview ── */}
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{contentLabel}</span>
            {" · "}
            {format.toUpperCase()} · up to 500 records per type
            {content === "combined" ? " (deposits + withdrawals)" : ""}
          </div>

          {/* ── Error ── */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isExporting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleExport}
              disabled={isExporting}
              className="gap-2"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Preparing…
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  Export {format.toUpperCase()}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
