/**
 * @file admin-bank-display.ts
 * @module admin-console
 * @description Masking and formatting helpers for admin-facing bank account / payout displays.
 * @author StockTrade
 * @created 2026-04-01
 *
 * Notes:
 * - Used by fund management, user profile, and audit tables for consistent PCI-adjacent handling.
 */

/** Normalize Prisma/JSON account numbers (handles unexpected object shapes). */
export function normalizeAdminAccountNumber(raw: unknown): string {
  if (raw === null || raw === undefined) return ""
  if (typeof raw === "string") return raw.trim()
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw)
  if (typeof raw === "object" && raw !== null && "toString" in raw) {
    try {
      const s = String((raw as { toString: () => string }).toString())
      if (s !== "[object Object]") return s.trim()
    } catch {
      /* empty */
    }
  }
  return String(raw).trim()
}

/** Last 4 digits for display, or placeholder when missing/short. */
export function formatAdminMaskedAccountLast4(accountNumber: unknown): string {
  const n = normalizeAdminAccountNumber(accountNumber)
  if (n.length === 0) return "—"
  if (n.length <= 4) return `****${n}`
  return `****${n.slice(-4)}`
}

/** Single-line summary: bank name + masked account (fund table column). */
export function formatAdminBankAccountSummary(
  bankName: unknown,
  accountNumber: unknown
): string {
  const name = typeof bankName === "string" && bankName.trim() ? bankName.trim() : "Bank"
  const tail = formatAdminMaskedAccountLast4(accountNumber)
  if (tail === "—") return `${name} —`
  return `${name} · ${tail}`
}

/** IFSC: show last 4 chars masked prefix for standard 11-char codes; otherwise partial mask. */
export function formatAdminMaskedIfsc(ifsc: unknown): string {
  const code = typeof ifsc === "string" ? ifsc.trim().toUpperCase() : ""
  if (!code) return "—"
  if (code.length <= 4) return "****"
  return `****${code.slice(-4)}`
}

/** Full values for ops (only when RBAC allows `admin.all` or `admin.users.bank.sensitive`). */
export function formatAdminFullAccountForDisplay(accountNumber: unknown): string {
  const n = normalizeAdminAccountNumber(accountNumber)
  return n || "—"
}

export type AdminBankAccountLike = {
  id?: string
  bankName?: string | null
  accountNumber?: unknown
  ifscCode?: string | null
  accountHolderName?: string | null
  accountType?: string | null
  isDefault?: boolean
  isActive?: boolean
  createdAt?: string | Date
}

/** Payout / audit one-liner: bank, holder, masked acct, masked IFSC. */
export function formatAdminBeneficiaryMask(row: AdminBankAccountLike | null | undefined): string {
  if (!row) return "—"
  const summary = formatAdminBankAccountSummary(row.bankName, row.accountNumber)
  const ifsc = formatAdminMaskedIfsc(row.ifscCode)
  const holder =
    typeof row.accountHolderName === "string" && row.accountHolderName.trim()
      ? row.accountHolderName.trim()
      : "—"
  return `${summary} · IFSC ${ifsc} · ${holder}`
}
