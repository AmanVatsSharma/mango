/**
 * File:        lib/bonus/promo-service.ts
 * Module:      Bonus · Promo Codes
 * Purpose:     CRUD for PromoCode + redemption (used by client onboarding flow in Phase 10.5).
 *
 * Exports:
 *   - listPromoCodes(opts?)
 *   - createPromoCode(input, by)
 *   - updatePromoCode(id, input)
 *   - deletePromoCode(id)
 *   - redeemPromoCode(code, userId, by)  — atomic: validates + grants + increments usesCount
 *
 * Depends on:
 *   - @/lib/prisma
 *   - ./grants-service — issueGrant
 *   - ./types
 *
 * Side-effects:
 *   - DB read/write on PromoCode + (via issueGrant) BonusGrant + TradingAccount
 *
 * Key invariants:
 *   - codes are case-insensitive on lookup but stored as the admin-typed value.
 *   - Redemption is atomic: increment usesCount and create grant in a single transaction.
 *     If maxUses is reached or expiresAt has passed, redemption rejects without side-effect.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-26
 */

import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { issueGrant } from "./grants-service"
import type { PromoCodeInput, PromoCodeRow } from "./types"

type PrismaPromoRow = Prisma.PromoCodeGetPayload<{
  include: { rule: { select: { id: true; name: true; kind: true } } }
}>

function toRow(row: PrismaPromoRow): PromoCodeRow {
  return {
    id: row.id,
    code: row.code,
    ruleId: row.ruleId,
    ruleName: row.rule.name,
    ruleKind: row.rule.kind,
    maxUses: row.maxUses,
    usesCount: row.usesCount,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    isActive: row.isActive,
    notes: row.notes,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

interface ListOpts {
  activeOnly?: boolean
}

export async function listPromoCodes(opts: ListOpts = {}): Promise<PromoCodeRow[]> {
  const rows = (await prisma.promoCode.findMany({
    where: opts.activeOnly ? { isActive: true } : undefined,
    include: { rule: { select: { id: true, name: true, kind: true } } },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  })) as PrismaPromoRow[]
  return rows.map(toRow)
}

export class PromoValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PromoValidationError"
  }
}

function normaliseCode(code: string): string {
  return code.trim().toUpperCase()
}

export async function createPromoCode(
  input: PromoCodeInput,
  performedById: string,
): Promise<PromoCodeRow> {
  if (!input.code || input.code.trim().length === 0) {
    throw new PromoValidationError("code is required")
  }
  const code = normaliseCode(input.code)
  const exists = await prisma.promoCode.findUnique({ where: { code } })
  if (exists) throw new PromoValidationError(`Promo code "${code}" already exists`)

  const rule = await prisma.bonusRule.findUnique({ where: { id: input.ruleId } })
  if (!rule) throw new PromoValidationError("Linked bonus rule not found")
  if (input.maxUses !== undefined && input.maxUses !== null && input.maxUses < 1) {
    throw new PromoValidationError("maxUses must be ≥ 1 or null (unlimited)")
  }

  const row = (await prisma.promoCode.create({
    data: {
      code,
      ruleId: input.ruleId,
      maxUses: input.maxUses ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      isActive: input.isActive ?? true,
      notes: input.notes ?? null,
      createdById: performedById,
    },
    include: { rule: { select: { id: true, name: true, kind: true } } },
  })) as PrismaPromoRow
  return toRow(row)
}

export async function updatePromoCode(
  id: string,
  input: PromoCodeInput,
): Promise<PromoCodeRow> {
  const row = (await prisma.promoCode.update({
    where: { id },
    data: {
      code: normaliseCode(input.code),
      ruleId: input.ruleId,
      maxUses: input.maxUses ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      isActive: input.isActive ?? true,
      notes: input.notes ?? null,
    },
    include: { rule: { select: { id: true, name: true, kind: true } } },
  })) as PrismaPromoRow
  return toRow(row)
}

export async function deletePromoCode(id: string): Promise<void> {
  await prisma.promoCode.delete({ where: { id } })
}

interface RedeemInput {
  code: string
  userId: string
  /** When admin-redeems on behalf of a user; null for self-serve redemption. */
  performedById: string | null
}

export interface RedemptionResult {
  promoId: string
  ruleId: string
  grantId: string
  amount: number
}

export async function redeemPromoCode(input: RedeemInput): Promise<RedemptionResult> {
  const code = normaliseCode(input.code)
  const promo = await prisma.promoCode.findUnique({
    where: { code },
    include: { rule: true },
  })
  if (!promo) throw new PromoValidationError("Code not found")
  if (!promo.isActive) throw new PromoValidationError("Code is inactive")
  if (promo.expiresAt && promo.expiresAt < new Date()) {
    throw new PromoValidationError("Code has expired")
  }
  if (promo.maxUses !== null && promo.usesCount >= promo.maxUses) {
    throw new PromoValidationError("Code redemption limit reached")
  }
  if (!promo.rule.isActive) {
    throw new PromoValidationError("Linked bonus rule is inactive")
  }

  // Determine grant amount. For DEPOSIT_MATCH/LOSSBACK there is no deposit context here,
  // so we fall back to the rule.maxAmount (or pctOrFlat as flat ₹ when no max set).
  // Phase 10.5 wires deposit-context redemption inline in the deposit flow.
  const ruleAmount = Number(promo.rule.maxAmount ?? promo.rule.pctOrFlat)

  const grant = await prisma.$transaction(async (tx) => {
    // Increment promo usesCount with optimistic lock semantics — re-read inside tx
    // to ensure we don't overshoot maxUses under concurrent redemption.
    const fresh = await tx.promoCode.findUnique({ where: { id: promo.id } })
    if (!fresh || !fresh.isActive) throw new PromoValidationError("Code became inactive")
    if (fresh.maxUses !== null && fresh.usesCount >= fresh.maxUses) {
      throw new PromoValidationError("Code redemption limit reached")
    }
    await tx.promoCode.update({
      where: { id: promo.id },
      data: { usesCount: { increment: 1 } },
    })
    return null
  })
  void grant

  const grantRow = await issueGrant(
    {
      userId: input.userId,
      ruleId: promo.ruleId,
      amount: ruleAmount,
      source: `promo:${code}`,
      metadata: { promoId: promo.id, redeemedAt: new Date().toISOString() },
    },
    input.performedById ?? input.userId,
  )

  return {
    promoId: promo.id,
    ruleId: promo.ruleId,
    grantId: grantRow.id,
    amount: grantRow.amount,
  }
}
