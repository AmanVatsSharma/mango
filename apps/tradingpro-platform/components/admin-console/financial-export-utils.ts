/**
 * File:        components/admin-console/financial-export-utils.ts
 * Module:      admin-console · Financial Overview
 * Purpose:     Client-side PDF and CSV generation for the Financial Audit Report —
 *              branded with the centralized Branding/ tokens so both white-label apps
 *              get the correct identity automatically.
 *
 * Exports:
 *   - FinancialExportOptions           — options shape consumed by both builders
 *   - FinancialSummaryData             — summary totals shape from /api/super-admin/finance/summary
 *   - exportFinancialPdf(opts)         — downloads a branded A4 PDF
 *   - exportFinancialCsv(opts)         — downloads a branded CSV
 *
 * Depends on:
 *   - jspdf             — PDF document generation (client-side only)
 *   - jspdf-autotable   — table layout plugin (v5 function-import API)
 *   - @/Branding/identity — company name, email (brand-agnostic)
 *   - @/Branding/theme  — primary hex color for PDF header stripe
 *
 * Side-effects:
 *   - Triggers browser file download via Blob URL (client-only, no SSR)
 *
 * Key invariants:
 *   - NEVER hardcode brand strings — always read from BRAND_IDENTITY / BRAND_THEME
 *   - autoTable v5 API: autoTable(doc, opts) not doc.autoTable(opts)
 *   - lastAutoTable.finalY gives Y after table for stacking multiple tables
 *
 * Read order:
 *   1. FinancialExportOptions / FinancialSummaryData — the data contract
 *   2. exportFinancialPdf — PDF builder
 *   3. exportFinancialCsv — CSV builder
 *   4. helpers (formatCurrency, formatDateIst, hexToRgb) at the bottom
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

// jspdf + jspdf-autotable are heavy (~200 KB+ runtime, 29 MB installed). They're only
// needed inside exportFinancialPdf below, so they load on-demand via dynamic import on
// the user's Export-PDF click. The eager top-level imports were the Wave 2 perf bug.
import { BRAND_IDENTITY } from "@/Branding/identity"
import { BRAND_THEME } from "@/Branding/theme"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExportContent = "deposits" | "withdrawals" | "combined"
export type ExportFormat = "pdf" | "csv"

export interface FinancialSummaryData {
  totalDeposits: number
  totalWithdrawals: number
  netFlow: number
  pendingDeposits: number
  pendingWithdrawals: number
}

export interface DepositExportRow {
  id: string
  depositId: string | null
  status: string
  adminId: string | null
  adminName: string | null
  adminRole: string | null
  reason: string | null
  amount: number | null
  remarks: string | null
  user?: { id: string; name: string | null; email: string | null; clientId: string | null }
  createdAt: string
}

export interface WithdrawalExportRow {
  id: string
  withdrawalId: string | null
  status: string
  adminId: string | null
  adminName: string | null
  adminRole: string | null
  reason: string | null
  amount: number | null
  bankReference: string | null
  beneficiaryMask: string | null
  remarks: string | null
  user?: { id: string; name: string | null; email: string | null; clientId: string | null }
  createdAt: string
}

export interface FinancialExportOptions {
  content: ExportContent
  summary: FinancialSummaryData | null
  deposits: DepositExportRow[]
  withdrawals: WithdrawalExportRow[]
  /** ISO date string or empty — used for display + file name */
  dateFrom: string
  dateTo: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IST_TZ = "Asia/Kolkata"

const INR_FMT = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
})

function formatCurrency(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—"
  return INR_FMT.format(v)
}

function formatDateIst(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("en-IN", { hour12: false, timeZone: IST_TZ })
}

function nowIst(): string {
  return new Date().toLocaleString("en-IN", { hour12: false, timeZone: IST_TZ })
}

function periodLabel(dateFrom: string, dateTo: string): string {
  if (!dateFrom && !dateTo) return "All time"
  const fmt = (s: string) =>
    s
      ? new Date(s).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: IST_TZ,
        })
      : "…"
  return `${fmt(dateFrom)} – ${fmt(dateTo)}`
}

function fileBaseName(content: ExportContent, ext: string): string {
  const today = new Date().toISOString().slice(0, 10)
  return `financial-audit-${content}-${today}.${ext}`
}

/** Parse "#RRGGBB" → [r, g, b] for jsPDF */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "")
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return [Number.isNaN(r) ? 6 : r, Number.isNaN(g) ? 182 : g, Number.isNaN(b) ? 212 : b]
}

// ─── Shared row builders ───────────────────────────────────────────────────────

function depositRows(deposits: DepositExportRow[]): string[][] {
  return deposits.map((d) => [
    formatDateIst(d.createdAt),
    d.depositId ?? "—",
    d.user?.name ?? "Unknown",
    d.user?.clientId ?? d.user?.id?.slice(0, 8) ?? "—",
    d.user?.email ?? "—",
    formatCurrency(d.amount),
    d.status,
    d.adminName ?? "—",
    d.adminRole ?? "—",
    d.reason ?? d.remarks ?? "—",
  ])
}

function withdrawalRows(withdrawals: WithdrawalExportRow[]): string[][] {
  return withdrawals.map((w) => [
    formatDateIst(w.createdAt),
    w.withdrawalId ?? "—",
    w.user?.name ?? "Unknown",
    w.user?.clientId ?? w.user?.id?.slice(0, 8) ?? "—",
    w.user?.email ?? "—",
    formatCurrency(w.amount),
    w.bankReference ?? "—",
    w.status,
    w.adminName ?? "—",
    w.adminRole ?? "—",
    w.reason ?? w.remarks ?? "—",
  ])
}

const DEPOSIT_HEADERS = [
  "Timestamp (IST)",
  "Deposit ID",
  "User",
  "Client ID",
  "Email",
  "Amount",
  "Status",
  "Admin",
  "Role",
  "Reason / Remarks",
]

const WITHDRAWAL_HEADERS = [
  "Timestamp (IST)",
  "Withdrawal ID",
  "User",
  "Client ID",
  "Email",
  "Amount",
  "Bank Ref",
  "Status",
  "Admin",
  "Role",
  "Reason / Remarks",
]

// ─── PDF export ────────────────────────────────────────────────────────────────

export async function exportFinancialPdf(opts: FinancialExportOptions): Promise<void> {
  // Load jspdf + autotable only when the user actually clicks Export-PDF.
  // This keeps both libs out of the admin-console initial chunk.
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ])

  const { content, summary, deposits, withdrawals, dateFrom, dateTo } = opts
  const brand = BRAND_IDENTITY.names.full
  const email = BRAND_IDENTITY.email.support
  const tagline = BRAND_IDENTITY.messaging.shortTagline
  const [pr, pg, pb] = hexToRgb(BRAND_THEME.palette.primaryHex)

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 14

  // ── Header stripe ──────────────────────────────────────────────────────────
  doc.setFillColor(pr, pg, pb)
  doc.rect(0, 0, pageW, 18, "F")

  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.text(brand, margin, 12)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text("FINANCIAL AUDIT REPORT", pageW - margin, 12, { align: "right" })

  // ── Sub-header row ─────────────────────────────────────────────────────────
  doc.setFillColor(240, 250, 255)
  doc.rect(0, 18, pageW, 10, "F")

  doc.setTextColor(80, 80, 100)
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.text(email, margin, 25)
  doc.text(`Period: ${periodLabel(dateFrom, dateTo)}`, pageW / 2, 25, { align: "center" })
  doc.text(`Generated: ${nowIst()} IST`, pageW - margin, 25, { align: "right" })

  let y = 34

  // ── Summary section ────────────────────────────────────────────────────────
  doc.setTextColor(pr, pg, pb)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.text("SUMMARY", margin, y)
  y += 2

  const summaryBody: string[][] = summary
    ? [
        [
          "Total Deposits (completed)",
          formatCurrency(summary.totalDeposits),
          "Pending Deposits",
          String(summary.pendingDeposits),
        ],
        [
          "Total Withdrawals (completed)",
          formatCurrency(summary.totalWithdrawals),
          "Pending Withdrawals",
          String(summary.pendingWithdrawals),
        ],
        ["Net Flow (In − Out)", formatCurrency(summary.netFlow), "", ""],
      ]
    : [["No summary data", "", "", ""]]

  autoTable(doc, {
    startY: y,
    head: [],
    body: summaryBody,
    theme: "plain",
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: "bold", textColor: [60, 60, 80], cellWidth: 70 },
      1: { textColor: [pr, pg, pb], fontStyle: "bold", cellWidth: 50 },
      2: { fontStyle: "bold", textColor: [60, 60, 80], cellWidth: 50 },
      3: { textColor: [pr, pg, pb], fontStyle: "bold" },
    },
    margin: { left: margin, right: margin },
  })

  y = (doc as any).lastAutoTable?.finalY ?? y + 20
  y += 4

  // ── Separator line ─────────────────────────────────────────────────────────
  doc.setDrawColor(pr, pg, pb)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageW - margin, y)
  y += 4

  // ── Helper to add a data section ───────────────────────────────────────────
  const addSection = (title: string, headers: string[], rows: string[][]) => {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.setTextColor(pr, pg, pb)
    doc.text(`${title} — ${rows.length} record${rows.length === 1 ? "" : "s"}`, margin, y)
    y += 2

    autoTable(doc, {
      startY: y,
      head: [headers],
      body: rows.length > 0 ? rows : [["No records found for the selected filters."]],
      theme: "striped",
      headStyles: {
        fillColor: [pr, pg, pb],
        textColor: [255, 255, 255],
        fontSize: 7,
        fontStyle: "bold",
        halign: "left",
      },
      bodyStyles: { fontSize: 7, textColor: [40, 40, 60] },
      alternateRowStyles: { fillColor: [248, 252, 255] },
      margin: { left: margin, right: margin },
      didDrawPage: (data) => {
        // Re-draw header stripe on each new page
        doc.setFillColor(pr, pg, pb)
        doc.rect(0, 0, pageW, 8, "F")
        doc.setTextColor(255, 255, 255)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(8)
        doc.text(`${brand} · Financial Audit Report (continued)`, margin, 5.5)
      },
    })

    y = (doc as any).lastAutoTable?.finalY ?? y + 10
    y += 6
  }

  // ── Deposit table ──────────────────────────────────────────────────────────
  if (content === "deposits" || content === "combined") {
    addSection("DEPOSITS", DEPOSIT_HEADERS, depositRows(deposits))
  }

  // ── Withdrawal table ───────────────────────────────────────────────────────
  if (content === "withdrawals" || content === "combined") {
    addSection("WITHDRAWALS", WITHDRAWAL_HEADERS, withdrawalRows(withdrawals))
  }

  // ── Footer on every page ───────────────────────────────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFillColor(245, 247, 250)
    doc.rect(0, pageH - 8, pageW, 8, "F")
    doc.setTextColor(130, 130, 150)
    doc.setFont("helvetica", "italic")
    doc.setFontSize(7)
    doc.text(`Confidential · ${brand} · ${tagline}`, margin, pageH - 3)
    doc.text(`Page ${i} of ${totalPages}`, pageW - margin, pageH - 3, { align: "right" })
  }

  doc.save(fileBaseName(content, "pdf"))
}

// ─── CSV export ────────────────────────────────────────────────────────────────

export function exportFinancialCsv(opts: FinancialExportOptions): void {
  const { content, summary, deposits, withdrawals, dateFrom, dateTo } = opts
  const brand = BRAND_IDENTITY.names.full
  const contentLabel =
    content === "combined"
      ? "Combined (Deposits + Withdrawals)"
      : content === "deposits"
        ? "Deposits only"
        : "Withdrawals only"

  const esc = (cell: string | number | null | undefined) =>
    `"${String(cell ?? "").replace(/"/g, '""')}"`

  const lines: string[][] = []

  // ── Branding header ────────────────────────────────────────────────────────
  lines.push([`${brand} - Financial Audit Report`])
  lines.push(["Generated", nowIst() + " IST"])
  lines.push(["Period", periodLabel(dateFrom, dateTo)])
  lines.push(["Report", contentLabel])
  lines.push([])

  // ── Summary ────────────────────────────────────────────────────────────────
  lines.push(["SUMMARY"])
  if (summary) {
    lines.push(["Total Deposits In (completed)", formatCurrency(summary.totalDeposits)])
    lines.push(["Total Withdrawals Out (completed)", formatCurrency(summary.totalWithdrawals)])
    lines.push(["Net Flow (In − Out)", formatCurrency(summary.netFlow)])
    lines.push(["Pending Deposits (count)", String(summary.pendingDeposits)])
    lines.push(["Pending Withdrawals (count)", String(summary.pendingWithdrawals)])
  } else {
    lines.push(["Summary unavailable", ""])
  }
  lines.push([])

  // ── Deposits section ───────────────────────────────────────────────────────
  if (content === "deposits" || content === "combined") {
    lines.push([`DEPOSITS — ${deposits.length} record${deposits.length === 1 ? "" : "s"}`])
    lines.push(DEPOSIT_HEADERS)
    for (const row of depositRows(deposits)) {
      lines.push(row)
    }
    lines.push([])
  }

  // ── Withdrawals section ────────────────────────────────────────────────────
  if (content === "withdrawals" || content === "combined") {
    lines.push([`WITHDRAWALS — ${withdrawals.length} record${withdrawals.length === 1 ? "" : "s"}`])
    lines.push(WITHDRAWAL_HEADERS)
    for (const row of withdrawalRows(withdrawals)) {
      lines.push(row)
    }
    lines.push([])
  }

  const csv = lines.map((row) => row.map(esc).join(",")).join("\n")
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileBaseName(content, "csv")
  a.click()
  URL.revokeObjectURL(url)
}
