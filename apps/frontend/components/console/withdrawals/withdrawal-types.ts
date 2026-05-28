/**
 * @file withdrawal-types.ts
 * @module components/console/withdrawals
 * @description Shared withdrawal domain types used across console withdrawal and bank-account surfaces.
 * @author StockTrade
 * @created 2026-02-16
 */

export interface BankAccount {
  id: string
  bankName: string
  accountNumber: string
  ifscCode: string
  accountHolderName: string
  accountType: "savings" | "current"
  isDefault: boolean
}

export interface WithdrawalRecord {
  id: string
  amount: number
  bankAccount: BankAccount
  status: "pending" | "processing" | "completed" | "failed" | "cancelled"
  requestDate: string
  requestTime: string
  processedDate?: string
  processedTime?: string
  reference: string
  remarks?: string
  charges: number
}
