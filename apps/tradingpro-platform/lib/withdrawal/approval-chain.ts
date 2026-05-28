/**
 * File:        lib/withdrawal/approval-chain.ts
 * Module:      Withdrawal · Risk Engine · Approval Chain
 * Purpose:     Helpers for the JSON `Withdrawal.approvalChain` ladder. Builds the default
 *              chain at hold-time, advances on admin approve, escalates on rejection, and
 *              tells the API whether the chain is complete (all steps APPROVED).
 *
 * Exports:
 *   - buildDefaultChain(amount) → ApprovalChain
 *   - advanceChain(chain, by, action, note?) → ApprovalChain
 *   - isChainComplete(chain) → boolean
 *   - currentRequiredStep(chain) → ApprovalStep | null
 *
 * Depends on:
 *   - ./types — ApprovalChain / ApprovalStep / ApprovalStepAction.
 *
 * Side-effects: none (pure functions). Persistence happens in the API route.
 *
 * Key invariants:
 *   - The chain is mutated immutably — every helper returns a NEW array. Callers always
 *     overwrite the JSON column with the returned value.
 *   - "Complete" = every step has action === "APPROVED". Any REJECTED step short-circuits.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import type {
  ApprovalChain,
  ApprovalStep,
  ApprovalStepAction,
} from "./types"
import { APPROVAL_CHAIN_DEFAULT } from "./types"

const LARGE_AMOUNT_THRESHOLD = 500_000 // ₹5L — escalate to SUPER_ADMIN

export function buildDefaultChain(amount: number): ApprovalChain {
  if (amount >= LARGE_AMOUNT_THRESHOLD) {
    return [
      { stepIndex: 0, role: "OPS", action: "REQUIRED" },
      { stepIndex: 1, role: "SUPER_ADMIN", action: "REQUIRED" },
    ]
  }
  return APPROVAL_CHAIN_DEFAULT.map((s) => ({ ...s }))
}

export interface AdvanceInput {
  approverId: string
  approverName: string
  action: Extract<ApprovalStepAction, "APPROVED" | "REJECTED" | "ESCALATED">
  note?: string | null
}

export function advanceChain(
  chain: ApprovalChain,
  input: AdvanceInput,
): ApprovalChain {
  const next = chain.map((s) => ({ ...s }))
  const idx = next.findIndex((s) => s.action === "REQUIRED")
  if (idx === -1) return next // chain already complete
  next[idx] = {
    ...next[idx],
    action: input.action,
    approverId: input.approverId,
    approverName: input.approverName,
    at: new Date().toISOString(),
    note: input.note ?? null,
  }
  return next
}

export function isChainComplete(chain: ApprovalChain): boolean {
  if (chain.length === 0) return true
  return chain.every((s) => s.action === "APPROVED")
}

export function isChainRejected(chain: ApprovalChain): boolean {
  return chain.some((s) => s.action === "REJECTED")
}

export function currentRequiredStep(chain: ApprovalChain): ApprovalStep | null {
  return chain.find((s) => s.action === "REQUIRED") ?? null
}
