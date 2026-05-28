/**
 * @file map-console-withdrawal.ts
 * @module components/console/withdrawals
 * @description Maps GET /api/console withdrawal payloads into WithdrawalRecord for history UI.
 * @author StockTrade
 * @created 2026-03-25
 */

import type { Withdrawal } from "@/lib/console-data-service"
import type { BankAccount, WithdrawalRecord } from "./withdrawal-types"

const WITHDRAWAL_STATUSES: WithdrawalRecord["status"][] = [
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
]

const FALLBACK_BANK: BankAccount = {
  id: "__unknown__",
  bankName: "—",
  accountNumber: "0000",
  ifscCode: "",
  accountHolderName: "",
  accountType: "savings",
  isDefault: false,
}

function normalizeWithdrawalStatus(raw: string): WithdrawalRecord["status"] {
  const lo = String(raw).toLowerCase()
  if (WITHDRAWAL_STATUSES.includes(lo as WithdrawalRecord["status"])) {
    return lo as WithdrawalRecord["status"]
  }
  return "pending"
}

function splitFromIso(iso: string): { dateIso: string; timeLabel: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return { dateIso: "", timeLabel: "" }
  }
  return {
    dateIso: d.toISOString(),
    timeLabel: d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }),
  }
}

/**
 * Convert console API withdrawal row into a WithdrawalRecord for WithdrawalsList.
 */
export function mapConsoleWithdrawalToRecord(w: Withdrawal): WithdrawalRecord {
  const created = splitFromIso(w.createdAt)
  let processedDate: string | undefined
  let processedTime: string | undefined
  if (w.processedAt) {
    const p = splitFromIso(w.processedAt)
    processedDate = p.dateIso
    processedTime = p.timeLabel
  }

  const ac = w.bankAccount
  const bankAccount: BankAccount = ac
    ? {
        id: `${w.id}-bank`,
        bankName: ac.bankName,
        accountNumber: ac.accountNumber && ac.accountNumber.length > 0 ? ac.accountNumber : "0000",
        ifscCode: ac.ifscCode || "",
        accountHolderName: "",
        accountType: "savings",
        isDefault: true,
      }
    : FALLBACK_BANK

  return {
    id: w.id,
    amount: w.amount,
    bankAccount,
    status: normalizeWithdrawalStatus(w.status),
    requestDate: created.dateIso || w.createdAt,
    requestTime: created.timeLabel,
    processedDate,
    processedTime,
    reference: w.reference ?? "",
    remarks: w.remarks?.trim() ? w.remarks.trim() : undefined,
    charges: w.charges,
  }
}
