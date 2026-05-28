/**
 * File:        lib/bonus/rules-service.ts
 * Module:      Bonus · Rules CRUD
 * Purpose:     Admin CRUD for BonusRule + small derivations (active/total grant counts).
 *
 * Exports:
 *   - listRules(opts?)                     — paginated list + per-rule grant counts
 *   - getRule(id)                          — single row
 *   - createRule(input, by)                — insert with kind-aware validation
 *   - updateRule(id, input)                — update; archives rule by isActive=false
 *   - deleteRule(id)                       — hard delete (only if zero grants reference it)
 *   - validateRuleInput(input)             — shared validator used by API + UI prefilters
 *
 * Depends on:
 *   - @/lib/prisma
 *   - ./types
 *
 * Side-effects:
 *   - DB read/write on BonusRule
 *
 * Key invariants:
 *   - DEPOSIT_MATCH and LOSSBACK rules MUST have pctOrFlat between 0 and 100 (interpreted as %).
 *   - NO_DEPOSIT and REFERRAL rules MUST have pctOrFlat > 0 (interpreted as flat ₹).
 *   - turnoverMultiplier MUST be ≥ 1 (a 0.5× multiplier would unlock immediately and is
 *     almost always a config bug).
 *   - deleteRule refuses if any grants reference the rule (use isActive=false instead).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-26
 */

import type { BonusKind, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  BONUS_KIND_META,
  type BonusRuleInput,
  type BonusRuleRow,
} from "./types"

type PrismaRuleRow = Prisma.BonusRuleGetPayload<true>

function toRow(row: PrismaRuleRow, counts?: { active: number; total: number }): BonusRuleRow {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    pctOrFlat: Number(row.pctOrFlat),
    maxAmount: row.maxAmount ? Number(row.maxAmount) : null,
    turnoverMultiplier: Number(row.turnoverMultiplier),
    expiryDays: row.expiryDays,
    isActive: row.isActive,
    description: row.description,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    activeGrantCount: counts?.active,
    totalGrantCount: counts?.total,
  }
}

interface ListOpts {
  activeOnly?: boolean
  kind?: BonusKind
  withCounts?: boolean
}

export async function listRules(opts: ListOpts = {}): Promise<BonusRuleRow[]> {
  const where: Prisma.BonusRuleWhereInput = {
    ...(opts.activeOnly ? { isActive: true } : {}),
    ...(opts.kind ? { kind: opts.kind } : {}),
  }
  const rules = await prisma.bonusRule.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  })
  if (!opts.withCounts || rules.length === 0) return rules.map((r) => toRow(r))

  const ids = rules.map((r) => r.id)
  const grantGroups = await prisma.bonusGrant.groupBy({
    by: ["ruleId", "status"],
    where: { ruleId: { in: ids } },
    _count: { _all: true },
  })

  const counts = new Map<string, { active: number; total: number }>()
  for (const r of rules) counts.set(r.id, { active: 0, total: 0 })
  for (const g of grantGroups) {
    const c = counts.get(g.ruleId)!
    c.total += g._count._all
    if (g.status === "ACTIVE") c.active += g._count._all
  }

  return rules.map((r) => toRow(r, counts.get(r.id)))
}

export async function getRule(id: string): Promise<BonusRuleRow | null> {
  const row = await prisma.bonusRule.findUnique({ where: { id } })
  return row ? toRow(row) : null
}

export interface ValidationFail {
  error: string
}

export type ValidatedRule = { input: BonusRuleInput }

export function validateRuleInput(
  body: Partial<BonusRuleInput>,
): ValidatedRule | ValidationFail {
  if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
    return { error: "name is required" }
  }
  if (!body.kind || !BONUS_KIND_META[body.kind as BonusKind]) {
    return { error: "kind must be one of DEPOSIT_MATCH | NO_DEPOSIT | LOSSBACK | REFERRAL" }
  }
  if (typeof body.pctOrFlat !== "number" || !Number.isFinite(body.pctOrFlat) || body.pctOrFlat <= 0) {
    return { error: "pctOrFlat must be a positive finite number" }
  }
  const meta = BONUS_KIND_META[body.kind as BonusKind]
  if (meta.isPercentage && body.pctOrFlat > 100) {
    return { error: `${body.kind} interprets pctOrFlat as %, must be <= 100` }
  }
  if (
    typeof body.turnoverMultiplier !== "number" ||
    !Number.isFinite(body.turnoverMultiplier) ||
    body.turnoverMultiplier < 1
  ) {
    return { error: "turnoverMultiplier must be a finite number ≥ 1" }
  }
  if (body.maxAmount !== undefined && body.maxAmount !== null && body.maxAmount < 0) {
    return { error: "maxAmount must be non-negative" }
  }
  if (body.expiryDays !== undefined && body.expiryDays !== null && body.expiryDays < 1) {
    return { error: "expiryDays must be ≥ 1 or null (no expiry)" }
  }
  return {
    input: {
      name: body.name.trim(),
      kind: body.kind as BonusKind,
      pctOrFlat: body.pctOrFlat,
      maxAmount: body.maxAmount ?? null,
      turnoverMultiplier: body.turnoverMultiplier,
      expiryDays: body.expiryDays ?? null,
      isActive: body.isActive ?? true,
      description: body.description ?? null,
    },
  }
}

export async function createRule(
  input: BonusRuleInput,
  performedById: string,
): Promise<BonusRuleRow> {
  const row = await prisma.bonusRule.create({
    data: {
      name: input.name,
      kind: input.kind,
      pctOrFlat: input.pctOrFlat,
      maxAmount: input.maxAmount ?? null,
      turnoverMultiplier: input.turnoverMultiplier,
      expiryDays: input.expiryDays ?? null,
      isActive: input.isActive ?? true,
      description: input.description ?? null,
      createdById: performedById,
    },
  })
  return toRow(row)
}

export async function updateRule(id: string, input: BonusRuleInput): Promise<BonusRuleRow> {
  const row = await prisma.bonusRule.update({
    where: { id },
    data: {
      name: input.name,
      kind: input.kind,
      pctOrFlat: input.pctOrFlat,
      maxAmount: input.maxAmount ?? null,
      turnoverMultiplier: input.turnoverMultiplier,
      expiryDays: input.expiryDays ?? null,
      isActive: input.isActive ?? true,
      description: input.description ?? null,
    },
  })
  return toRow(row)
}

export async function deleteRule(id: string): Promise<void> {
  const grantCount = await prisma.bonusGrant.count({ where: { ruleId: id } })
  if (grantCount > 0) {
    throw new Error(
      `Rule has ${grantCount} grant(s) — set isActive=false instead of deleting to preserve audit trail`,
    )
  }
  await prisma.bonusRule.delete({ where: { id } })
}
