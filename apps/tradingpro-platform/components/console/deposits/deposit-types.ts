/**
 * @file deposit-types.ts
 * @module components/console/deposits
 * @description Shared deposit record types used across deposit sections and history widgets.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-03-25
 */

export interface DepositRecord {
  id: string
  amount: number
  method: string
  status: string
  createdAt?: string
  utr?: string
  reference?: string
  /** Admin notes / rejection reason (e.g. after fund request rejection). */
  remarks?: string
}
