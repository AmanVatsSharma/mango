/**
 * File:        lib/affiliate/affiliate-service.ts
 * Module:      Affiliate / IB Program · Admin CRUD
 * Purpose:     CRUD + list aggregations for the admin workbench. Wraps Prisma calls so the
 *              API routes stay thin and testable. Lifetime / pending / paid aggregates are
 *              computed in a single round-trip per affiliate via groupBy.
 *
 * Exports:
 *   - listAffiliates(filter)       — paginated + filtered list with aggregate columns
 *   - getAffiliateDetail(id)       — single affiliate with rules + child summary + parent
 *   - createAffiliate(input)       — admin-create with auto affiliateCode generation
 *   - updateAffiliate(id, patch)   — partial update (admin)
 *   - addCommissionRule(input)     — append a commission rule
 *   - updateCommissionRule(id, p)  — patch a rule
 *
 * Depends on:
 *   - @/lib/prisma
 *   - bcryptjs (for optional passwordHash on create)
 *   - ./types
 *
 * Side-effects:
 *   - DB writes on Affiliate, AffiliateCommissionRule.
 *
 * Key invariants:
 *   - affiliateCode is uppercase, 8-12 chars, [A-Z0-9]; auto-generated when not provided.
 *   - Email is lowercased on write to keep the @unique constraint case-insensitive in practice.
 *   - createAffiliate does NOT issue a session — affiliate auth is a separate surface
 *     (/api/affiliate/auth — Phase 11.5). Admin can set passwordHash here so the affiliate
 *     can log in once the auth surface ships.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import bcrypt from "bcryptjs"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  toNumber,
  type AffiliateRow,
  type AffiliateStatus,
  type AffiliateTier,
} from "./types"

interface ListFilter {
  q?: string
  tier?: AffiliateTier
  status?: AffiliateStatus
  parentAffiliateId?: string | null
  page?: number
  limit?: number
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no I/O/0/1 to avoid confusion
function generateAffiliateCode(): string {
  let s = "AFF-"
  for (let i = 0; i < 8; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return s
}

export async function listAffiliates(
  filter: ListFilter,
): Promise<{ rows: AffiliateRow[]; total: number }> {
  const limit = Math.max(1, Math.min(filter.limit ?? 25, 200))
  const page = Math.max(0, filter.page ?? 0)

  const where: Prisma.AffiliateWhereInput = {}
  if (filter.tier) where.tier = filter.tier
  if (filter.status) where.status = filter.status
  if (filter.parentAffiliateId !== undefined) {
    where.parentAffiliateId = filter.parentAffiliateId
  }
  if (filter.q && filter.q.trim()) {
    const q = filter.q.trim()
    where.OR = [
      { affiliateCode: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ]
  }

  const [total, rows] = await Promise.all([
    prisma.affiliate.count({ where }),
    prisma.affiliate.findMany({
      where,
      skip: page * limit,
      take: limit,
      orderBy: [{ tier: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        affiliateCode: true,
        email: true,
        name: true,
        tier: true,
        status: true,
        parentAffiliateId: true,
        createdAt: true,
      },
    }),
  ])

  if (rows.length === 0) return { rows: [], total }

  const ids = rows.map((r) => r.id)
  const [childCounts, attributedCounts, commissionAggs] = await Promise.all([
    prisma.affiliate.groupBy({
      by: ["parentAffiliateId"],
      where: { parentAffiliateId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.affiliateAttribution.groupBy({
      by: ["affiliateId"],
      where: { affiliateId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.affiliateCommission.groupBy({
      by: ["affiliateId", "status"],
      where: { affiliateId: { in: ids } },
      _sum: { amount: true },
    }),
  ])

  const childMap = new Map<string, number>()
  for (const r of childCounts) {
    if (r.parentAffiliateId) childMap.set(r.parentAffiliateId, r._count._all)
  }
  const attrMap = new Map<string, number>()
  for (const r of attributedCounts) {
    attrMap.set(r.affiliateId, r._count._all)
  }
  const commMap = new Map<string, { lifetime: number; pending: number; paid: number }>()
  for (const r of commissionAggs) {
    const cur = commMap.get(r.affiliateId) ?? { lifetime: 0, pending: 0, paid: 0 }
    const amt = toNumber(r._sum.amount)
    if (r.status === "PAID") cur.paid += amt
    if (r.status === "ACCRUED" || r.status === "PAYABLE") cur.pending += amt
    if (r.status === "PAID" || r.status === "PAYABLE" || r.status === "ACCRUED") {
      cur.lifetime += amt
    }
    commMap.set(r.affiliateId, cur)
  }

  const projection: AffiliateRow[] = rows.map((r) => {
    const comm = commMap.get(r.id) ?? { lifetime: 0, pending: 0, paid: 0 }
    return {
      id: r.id,
      affiliateCode: r.affiliateCode,
      email: r.email,
      name: r.name,
      tier: r.tier,
      status: r.status,
      parentAffiliateId: r.parentAffiliateId,
      childCount: childMap.get(r.id) ?? 0,
      attributedCount: attrMap.get(r.id) ?? 0,
      lifetimeAccruedRupees: comm.lifetime,
      pendingPayableRupees: comm.pending,
      paidRupees: comm.paid,
      createdAt: r.createdAt,
    }
  })

  return { rows: projection, total }
}

export async function getAffiliateDetail(id: string) {
  const aff = await prisma.affiliate.findUnique({
    where: { id },
    include: {
      parentAffiliate: { select: { id: true, affiliateCode: true, name: true, tier: true } },
      children: {
        select: { id: true, affiliateCode: true, name: true, tier: true, status: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      commissionRules: {
        orderBy: { createdAt: "desc" },
      },
      linkedUser: {
        select: { id: true, name: true, email: true, clientId: true },
      },
    },
  })
  if (!aff) return null
  // Aggregates inline.
  const [attributedCount, commAgg] = await Promise.all([
    prisma.affiliateAttribution.count({ where: { affiliateId: id } }),
    prisma.affiliateCommission.groupBy({
      by: ["status"],
      where: { affiliateId: id },
      _sum: { amount: true },
    }),
  ])
  const totals = { lifetime: 0, pending: 0, paid: 0, clawedBack: 0 }
  for (const r of commAgg) {
    const amt = toNumber(r._sum.amount)
    if (r.status === "PAID") totals.paid += amt
    if (r.status === "ACCRUED" || r.status === "PAYABLE") totals.pending += amt
    if (r.status === "CLAWED_BACK") totals.clawedBack += amt
    if (r.status === "PAID" || r.status === "PAYABLE" || r.status === "ACCRUED") {
      totals.lifetime += amt
    }
  }
  return { ...aff, attributedCount, totals }
}

interface CreateInput {
  email: string
  name: string
  phone?: string | null
  tier?: AffiliateTier
  status?: AffiliateStatus
  parentAffiliateId?: string | null
  linkedUserId?: string | null
  payoutMethod?: unknown
  kycLite?: unknown
  notes?: string | null
  password?: string | null
  createdById?: string | null
  affiliateCode?: string | null
}

export async function createAffiliate(input: CreateInput) {
  if (!input.email || !input.name) {
    throw new Error("email and name are required")
  }
  const passwordHash = input.password
    ? await bcrypt.hash(input.password, 10)
    : null

  // Generate code with a small retry loop in case of collisions.
  let affiliateCode = input.affiliateCode?.toUpperCase().trim() || generateAffiliateCode()
  for (let attempts = 0; attempts < 5; attempts++) {
    const existing = await prisma.affiliate.findUnique({
      where: { affiliateCode },
      select: { id: true },
    })
    if (!existing) break
    if (input.affiliateCode) {
      throw new Error(`affiliateCode ${affiliateCode} is already taken`)
    }
    affiliateCode = generateAffiliateCode()
  }

  const created = await prisma.affiliate.create({
    data: {
      affiliateCode,
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      tier: input.tier ?? "BRONZE",
      status: input.status ?? "PENDING",
      parentAffiliateId: input.parentAffiliateId ?? null,
      linkedUserId: input.linkedUserId ?? null,
      payoutMethod: (input.payoutMethod ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      kycLite: (input.kycLite ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      notes: input.notes ?? null,
      passwordHash,
      createdById: input.createdById ?? null,
    },
  })
  return created
}

interface UpdateInput {
  name?: string
  phone?: string | null
  tier?: AffiliateTier
  status?: AffiliateStatus
  parentAffiliateId?: string | null
  linkedUserId?: string | null
  payoutMethod?: unknown
  kycLite?: unknown
  notes?: string | null
  password?: string | null
  updatedById?: string | null
}

export async function updateAffiliate(id: string, patch: UpdateInput) {
  const data: Prisma.AffiliateUpdateInput = {}
  if (patch.name !== undefined) data.name = patch.name
  if (patch.phone !== undefined) data.phone = patch.phone
  if (patch.tier !== undefined) data.tier = patch.tier
  if (patch.status !== undefined) data.status = patch.status
  if (patch.parentAffiliateId !== undefined) {
    data.parentAffiliate = patch.parentAffiliateId
      ? { connect: { id: patch.parentAffiliateId } }
      : { disconnect: true }
  }
  if (patch.linkedUserId !== undefined) {
    data.linkedUser = patch.linkedUserId
      ? { connect: { id: patch.linkedUserId } }
      : { disconnect: true }
  }
  if (patch.payoutMethod !== undefined) {
    data.payoutMethod = (patch.payoutMethod ?? Prisma.JsonNull) as Prisma.InputJsonValue
  }
  if (patch.kycLite !== undefined) {
    data.kycLite = (patch.kycLite ?? Prisma.JsonNull) as Prisma.InputJsonValue
  }
  if (patch.notes !== undefined) data.notes = patch.notes
  if (patch.password) {
    data.passwordHash = await bcrypt.hash(patch.password, 10)
  }
  if (patch.updatedById !== undefined) {
    data.updatedBy = patch.updatedById ? { connect: { id: patch.updatedById } } : { disconnect: true }
  }
  return prisma.affiliate.update({ where: { id }, data })
}

interface RuleInput {
  affiliateId: string
  kind: "SPREAD" | "LOSS" | "LOT" | "FIXED"
  rate: number
  perEventCap?: number | null
  perMonthCap?: number | null
  isActive?: boolean
  validFrom?: Date | null
  validTo?: Date | null
  notes?: string | null
}

export async function addCommissionRule(input: RuleInput) {
  if (!Number.isFinite(input.rate) || input.rate < 0) {
    throw new Error("rate must be a non-negative number")
  }
  return prisma.affiliateCommissionRule.create({
    data: {
      affiliateId: input.affiliateId,
      kind: input.kind,
      rate: new Prisma.Decimal(input.rate.toString()),
      perEventCap:
        input.perEventCap != null ? new Prisma.Decimal(input.perEventCap.toFixed(2)) : null,
      perMonthCap:
        input.perMonthCap != null ? new Prisma.Decimal(input.perMonthCap.toFixed(2)) : null,
      isActive: input.isActive ?? true,
      validFrom: input.validFrom ?? null,
      validTo: input.validTo ?? null,
      notes: input.notes ?? null,
    },
  })
}

export async function updateCommissionRule(
  ruleId: string,
  patch: Partial<Omit<RuleInput, "affiliateId">>,
) {
  const data: Prisma.AffiliateCommissionRuleUpdateInput = {}
  if (patch.kind !== undefined) data.kind = patch.kind
  if (patch.rate !== undefined) {
    if (!Number.isFinite(patch.rate) || patch.rate < 0) throw new Error("rate must be ≥ 0")
    data.rate = new Prisma.Decimal(patch.rate.toString())
  }
  if (patch.perEventCap !== undefined) {
    data.perEventCap = patch.perEventCap != null ? new Prisma.Decimal(patch.perEventCap.toFixed(2)) : null
  }
  if (patch.perMonthCap !== undefined) {
    data.perMonthCap = patch.perMonthCap != null ? new Prisma.Decimal(patch.perMonthCap.toFixed(2)) : null
  }
  if (patch.isActive !== undefined) data.isActive = patch.isActive
  if (patch.validFrom !== undefined) data.validFrom = patch.validFrom
  if (patch.validTo !== undefined) data.validTo = patch.validTo
  if (patch.notes !== undefined) data.notes = patch.notes
  return prisma.affiliateCommissionRule.update({ where: { id: ruleId }, data })
}

export async function deactivateCommissionRule(ruleId: string) {
  return prisma.affiliateCommissionRule.update({
    where: { id: ruleId },
    data: { isActive: false },
  })
}
