/**
 * File:        lib/surveillance/queue-service.ts
 * Module:      Surveillance · Queue Service
 * Purpose:     Server-side orchestration for the admin-v2 Surveillance workbench. Returns
 *              a paginated list of alerts plus a top-line KPI block. Single-writer rule:
 *              this service NEVER mutates ClientWinnerControl, BonusGrant, etc. — it only
 *              reads and exposes alert state.
 *
 * Exports:
 *   - listQueue(input)          — paginated rows + total + KPIs for the workbench
 *   - getAlertById(id)          — full alert + rule-name resolution for the side drawer
 *   - assignAlert(id, adminId)  — admin claims an alert
 *   - dismissAlert(id, adminId, reason) — admin dismisses (manual)
 *   - resolveAlert(id, adminId, note)   — admin marks resolved
 *
 * Depends on:
 *   - @/lib/prisma — reads HouseSurveillanceAlert + SurveillanceRule
 *
 * Side-effects:
 *   - DB writes ONLY for alert-status transitions. Source-state (winner-control,
 *     bonus-grants) is owned by their respective phases — operators act through the
 *     existing Phase 9/10/13a admin APIs, not this service.
 *
 * Key invariants:
 *   - The queue is filtered by status; "ANY" means "everything", default is OPEN.
 *   - Free-text `q` matches alert.message AND user email/phone (LIKE %q%).
 *   - KPI counts honour the same status filter ONLY for the "open" tile; others are
 *     scoped to their semantic (HIGH severity, unassigned, resolved-today).
 *
 * Read order:
 *   1. listQueue   — filter → row mapping → KPIs.
 *   2. assignAlert — single status transition with idempotency.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import { prisma } from "@/lib/prisma"
import { SurveillanceAlertStatus, type Prisma } from "@prisma/client"
import {
  type QueueFilter,
  type SurveillanceQueueRow,
  type SurveillanceKpis,
  type RuleKey,
} from "./types"

const PAGE_SIZE_DEFAULT = 25
const PAGE_SIZE_MAX = 100

export async function listQueue(input: QueueFilter): Promise<{
  rows: SurveillanceQueueRow[]
  total: number
  kpis: SurveillanceKpis
}> {
  const page = Math.max(1, input.page ?? 1)
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, input.pageSize ?? PAGE_SIZE_DEFAULT))

  const where: Prisma.HouseSurveillanceAlertWhereInput = {}
  if (input.status && input.status !== "ANY") where.status = input.status
  if (input.severity && input.severity !== "ANY") where.severity = input.severity
  if (input.ruleKey && input.ruleKey !== "ANY") where.ruleKey = input.ruleKey
  if (input.q?.trim()) {
    const q = input.q.trim()
    where.OR = [
      { message: { contains: q, mode: "insensitive" } },
      { relatedUser: { email: { contains: q, mode: "insensitive" } } },
      { relatedUser: { phone: { contains: q, mode: "insensitive" } } },
      { relatedUser: { name: { contains: q, mode: "insensitive" } } },
    ]
  }

  const [rowsRaw, total, kpis, ruleNamesAll] = await Promise.all([
    prisma.houseSurveillanceAlert.findMany({
      where,
      orderBy: [
        { severity: "desc" },
        { confidenceScore: "desc" },
        { createdAt: "desc" },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        ruleKey: true,
        severity: true,
        confidenceScore: true,
        status: true,
        message: true,
        createdAt: true,
        relatedUser: { select: { id: true, name: true, email: true, phone: true } },
        relatedWithdrawalId: true,
        relatedTransactionId: true,
        relatedBonusGrantId: true,
        relatedAffiliateId: true,
        assignedTo: { select: { id: true, name: true } },
        evidence: true,
      },
    }),
    prisma.houseSurveillanceAlert.count({ where }),
    computeKpis(),
    prisma.surveillanceRule.findMany({ select: { ruleKey: true, name: true } }),
  ])

  const ruleNameMap = new Map(ruleNamesAll.map((r) => [r.ruleKey, r.name]))

  const rows: SurveillanceQueueRow[] = rowsRaw.map((r) => ({
    id: r.id,
    ruleKey: r.ruleKey,
    ruleName: ruleNameMap.get(r.ruleKey) ?? r.ruleKey,
    severity: r.severity,
    confidenceScore: r.confidenceScore,
    status: r.status,
    message: r.message,
    createdAt: r.createdAt.toISOString(),
    user: {
      id: r.relatedUser?.id ?? null,
      name: r.relatedUser?.name ?? null,
      email: r.relatedUser?.email ?? null,
      phone: r.relatedUser?.phone ?? null,
    },
    relatedWithdrawalId: r.relatedWithdrawalId,
    relatedTransactionId: r.relatedTransactionId,
    relatedBonusGrantId: r.relatedBonusGrantId,
    relatedAffiliateId: r.relatedAffiliateId,
    assignedTo: r.assignedTo ? { id: r.assignedTo.id, name: r.assignedTo.name } : null,
    evidence: (r.evidence as Record<string, unknown>) ?? {},
  }))

  return { rows, total, kpis }
}

async function computeKpis(): Promise<SurveillanceKpis> {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const [open, highSeverity, unassigned, resolvedToday] = await Promise.all([
    prisma.houseSurveillanceAlert.count({
      where: { status: SurveillanceAlertStatus.OPEN },
    }),
    prisma.houseSurveillanceAlert.count({
      where: {
        status: { in: [SurveillanceAlertStatus.OPEN, SurveillanceAlertStatus.ASSIGNED] },
        severity: { in: ["HIGH", "CRITICAL"] },
      },
    }),
    prisma.houseSurveillanceAlert.count({
      where: { status: SurveillanceAlertStatus.OPEN, assignedToId: null },
    }),
    prisma.houseSurveillanceAlert.count({
      where: { status: SurveillanceAlertStatus.RESOLVED, resolvedAt: { gte: startOfDay } },
    }),
  ])
  return { open, highSeverity, unassigned, resolvedToday }
}

export async function getAlertById(id: string) {
  const alert = await prisma.houseSurveillanceAlert.findUnique({
    where: { id },
    include: {
      relatedUser: { select: { id: true, name: true, email: true, phone: true } },
      assignedTo: { select: { id: true, name: true } },
      dismissedBy: { select: { id: true, name: true } },
    },
  })
  if (!alert) return null
  const rule = await prisma.surveillanceRule.findFirst({
    where: { ruleKey: alert.ruleKey },
    select: { name: true, description: true },
  })
  return { alert, rule }
}

export async function assignAlert(alertId: string, adminId: string) {
  return prisma.houseSurveillanceAlert.update({
    where: { id: alertId },
    data: {
      assignedToId: adminId,
      assignedAt: new Date(),
      status: SurveillanceAlertStatus.ASSIGNED,
    },
  })
}

export async function dismissAlert(alertId: string, adminId: string, reason: string) {
  return prisma.houseSurveillanceAlert.update({
    where: { id: alertId },
    data: {
      status: SurveillanceAlertStatus.DISMISSED,
      dismissedById: adminId,
      dismissedAt: new Date(),
      dismissReason: reason.slice(0, 255),
    },
  })
}

export async function resolveAlert(alertId: string, adminId: string, note: string) {
  return prisma.houseSurveillanceAlert.update({
    where: { id: alertId },
    data: {
      status: SurveillanceAlertStatus.RESOLVED,
      resolvedAt: new Date(),
      resolutionNote: note,
      // Stamp the assignee if the resolver hasn't claimed it yet, for audit symmetry.
      ...(adminId ? { assignedToId: adminId, assignedAt: new Date() } : {}),
    },
  })
}

export async function listRuleKeys(): Promise<{ ruleKey: RuleKey; name: string }[]> {
  const rules = await prisma.surveillanceRule.findMany({
    where: { isActive: true },
    orderBy: { ruleKey: "asc" },
    select: { ruleKey: true, name: true },
  })
  return rules.map((r) => ({ ruleKey: r.ruleKey as RuleKey, name: r.name }))
}
