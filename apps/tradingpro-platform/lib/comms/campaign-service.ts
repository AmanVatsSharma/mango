/**
 * File:        lib/comms/campaign-service.ts
 * Module:      Comms · Campaign Service
 * Purpose:     Admin CRUD on CommsCampaign + CampaignEnrollment. Validates `steps`
 *              shape at SAVE; the campaign engine consumes the persisted steps[] at
 *              runtime with no further validation.
 *
 * Exports:
 *   - listCampaigns(filter?) → Promise<CampaignRow[]>
 *   - getCampaign(id) → Promise<CommsCampaign | null>
 *   - createCampaign(input, createdById) → Promise<CommsCampaign>
 *   - updateCampaign(id, patch) → Promise<CommsCampaign>
 *   - transitionCampaign(id, action) → Promise<CommsCampaign>
 *                              (action: ACTIVATE | PAUSE | RESUME | CANCEL | COMPLETE)
 *   - enrollUsers(campaignId, userIds) → Promise<{ enrolled, skipped }>
 *   - parseSteps(rawSteps) → CampaignStep[]                — runtime use too
 *
 * Depends on:
 *   - @/lib/prisma
 *   - @prisma/client — CommsCampaign, CampaignEnrollment, enums
 *
 * Side-effects:
 *   - DB writes on create/update/transition/enroll.
 *
 * Key invariants:
 *   - `steps[]` shape is { templateId: string, delayMinutes?: number }. Validated at
 *     create/update — the engine assumes this shape and does NOT re-validate.
 *   - enrollUsers is idempotent via @@unique([userId, campaignId]).
 *   - Status transitions: DRAFT → SCHEDULED → RUNNING ↔ PAUSED → COMPLETED|CANCELLED.
 *
 * Read order:
 *   1. parseSteps + validateSteps — what the steps[] contract is
 *   2. createCampaign — uses validation
 *   3. transitionCampaign — the state machine
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { prisma } from "@/lib/prisma"
import {
  CommsCampaignStatus,
  Prisma,
  type CommsCampaign,
  type CommsCampaignKind,
  type CommsChannel,
} from "@prisma/client"

export interface CampaignStep {
  templateId: string
  /** Minutes from prior step's send (or campaign start for step 0). */
  delayMinutes?: number
}

export interface CampaignRow extends CommsCampaign {
  enrollmentCount: number
  messageCount: number
}

export function parseSteps(raw: unknown): CampaignStep[] {
  if (!Array.isArray(raw)) {
    throw new Error("steps must be an array")
  }
  const out: CampaignStep[] = []
  raw.forEach((entry, idx) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`step ${idx} must be an object`)
    }
    const stepObj = entry as Record<string, unknown>
    const templateId = stepObj.templateId
    if (typeof templateId !== "string" || !templateId) {
      throw new Error(`step ${idx} missing templateId`)
    }
    const delayRaw = stepObj.delayMinutes
    let delay: number | undefined
    if (delayRaw !== undefined && delayRaw !== null) {
      const d = Number(delayRaw)
      if (!Number.isFinite(d) || d < 0) {
        throw new Error(`step ${idx} delayMinutes must be ≥ 0`)
      }
      delay = d
    }
    out.push({ templateId, delayMinutes: delay })
  })
  return out
}

async function validateStepsAgainstTemplates(
  channel: CommsChannel,
  steps: CampaignStep[],
) {
  if (steps.length === 0) {
    throw new Error("campaign must have at least one step")
  }
  const ids = Array.from(new Set(steps.map((s) => s.templateId)))
  const templates = await prisma.commsTemplate.findMany({
    where: { id: { in: ids } },
    select: { id: true, channel: true, status: true },
  })
  const byId = new Map(templates.map((t) => [t.id, t]))
  for (const id of ids) {
    const t = byId.get(id)
    if (!t) throw new Error(`step references unknown template ${id}`)
    if (t.channel !== channel) {
      throw new Error(
        `step template ${id} channel ${t.channel} ≠ campaign channel ${channel}`,
      )
    }
    if (t.status === "ARCHIVED") {
      throw new Error(`step template ${id} is archived`)
    }
  }
}

export async function listCampaigns(filter: {
  status?: CommsCampaignStatus
  channel?: CommsChannel
  q?: string
} = {}): Promise<CampaignRow[]> {
  const where: Prisma.CommsCampaignWhereInput = {}
  if (filter.status) where.status = filter.status
  if (filter.channel) where.channel = filter.channel
  if (filter.q) where.name = { contains: filter.q, mode: "insensitive" }

  const rows = await prisma.commsCampaign.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 200,
  })
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  const [enrollCounts, msgCounts] = await Promise.all([
    prisma.campaignEnrollment.groupBy({
      by: ["campaignId"],
      where: { campaignId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.commsMessage.groupBy({
      by: ["campaignId"],
      where: { campaignId: { in: ids } },
      _count: { _all: true },
    }),
  ])
  const enrollMap = new Map(enrollCounts.map((c) => [c.campaignId, c._count._all]))
  const msgMap = new Map(
    msgCounts
      .filter((c): c is typeof c & { campaignId: string } => c.campaignId !== null)
      .map((c) => [c.campaignId, c._count._all]),
  )

  return rows.map((r) => ({
    ...r,
    enrollmentCount: enrollMap.get(r.id) ?? 0,
    messageCount: msgMap.get(r.id) ?? 0,
  }))
}

export async function getCampaign(id: string): Promise<CommsCampaign | null> {
  return prisma.commsCampaign.findUnique({ where: { id } })
}

export interface CreateCampaignInput {
  name: string
  kind: CommsCampaignKind
  channel: CommsChannel
  steps: CampaignStep[]
  audience?: Record<string, unknown>
  scheduledAt?: Date | null
  defaultTemplateId?: string | null
}

export async function createCampaign(
  input: CreateCampaignInput,
  createdById: string,
): Promise<CommsCampaign> {
  await validateStepsAgainstTemplates(input.channel, input.steps)
  return prisma.commsCampaign.create({
    data: {
      name: input.name.trim(),
      kind: input.kind,
      channel: input.channel,
      steps: input.steps as unknown as Prisma.InputJsonValue,
      audience: (input.audience ?? {}) as object,
      scheduledAt: input.scheduledAt ?? null,
      defaultTemplateId: input.defaultTemplateId ?? null,
      status: CommsCampaignStatus.DRAFT,
      createdById,
    },
  })
}

export interface UpdateCampaignPatch {
  name?: string
  steps?: CampaignStep[]
  audience?: Record<string, unknown>
  scheduledAt?: Date | null
  defaultTemplateId?: string | null
}

export async function updateCampaign(
  id: string,
  patch: UpdateCampaignPatch,
): Promise<CommsCampaign> {
  const current = await prisma.commsCampaign.findUnique({ where: { id } })
  if (!current) throw new Error("campaign not found")
  if (current.status === CommsCampaignStatus.RUNNING) {
    throw new Error("pause the campaign before editing")
  }
  if (patch.steps) {
    await validateStepsAgainstTemplates(current.channel, patch.steps)
  }
  return prisma.commsCampaign.update({
    where: { id },
    data: {
      name: patch.name?.trim() ?? undefined,
      steps: patch.steps
        ? (patch.steps as unknown as Prisma.InputJsonValue)
        : undefined,
      audience:
        patch.audience !== undefined ? (patch.audience as object) : undefined,
      scheduledAt:
        patch.scheduledAt !== undefined ? patch.scheduledAt : undefined,
      defaultTemplateId:
        patch.defaultTemplateId !== undefined ? patch.defaultTemplateId : undefined,
    },
  })
}

export type CampaignTransition =
  | "ACTIVATE"
  | "PAUSE"
  | "RESUME"
  | "CANCEL"
  | "COMPLETE"

const ALLOWED: Record<CampaignTransition, CommsCampaignStatus[]> = {
  ACTIVATE: [CommsCampaignStatus.DRAFT],
  PAUSE: [CommsCampaignStatus.RUNNING, CommsCampaignStatus.SCHEDULED],
  RESUME: [CommsCampaignStatus.PAUSED],
  CANCEL: [
    CommsCampaignStatus.DRAFT,
    CommsCampaignStatus.SCHEDULED,
    CommsCampaignStatus.RUNNING,
    CommsCampaignStatus.PAUSED,
  ],
  COMPLETE: [CommsCampaignStatus.RUNNING],
}

const NEXT: Record<CampaignTransition, CommsCampaignStatus> = {
  ACTIVATE: CommsCampaignStatus.SCHEDULED,
  PAUSE: CommsCampaignStatus.PAUSED,
  RESUME: CommsCampaignStatus.RUNNING,
  CANCEL: CommsCampaignStatus.CANCELLED,
  COMPLETE: CommsCampaignStatus.COMPLETED,
}

export async function transitionCampaign(
  id: string,
  action: CampaignTransition,
): Promise<CommsCampaign> {
  const c = await prisma.commsCampaign.findUnique({ where: { id } })
  if (!c) throw new Error("campaign not found")
  if (!ALLOWED[action].includes(c.status)) {
    throw new Error(
      `cannot ${action} a campaign in status ${c.status}`,
    )
  }
  return prisma.commsCampaign.update({
    where: { id },
    data: { status: NEXT[action] },
  })
}

export async function enrollUsers(
  campaignId: string,
  userIds: string[],
): Promise<{ enrolled: number; skipped: number }> {
  if (userIds.length === 0) return { enrolled: 0, skipped: 0 }
  const c = await prisma.commsCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, scheduledAt: true, status: true },
  })
  if (!c) throw new Error("campaign not found")
  if (
    c.status !== CommsCampaignStatus.DRAFT &&
    c.status !== CommsCampaignStatus.SCHEDULED &&
    c.status !== CommsCampaignStatus.RUNNING
  ) {
    throw new Error(`cannot enroll into status=${c.status}`)
  }

  const result = await prisma.campaignEnrollment.createMany({
    data: userIds.map((userId) => ({
      userId,
      campaignId,
      currentStepIndex: 0,
      nextScheduledAt: c.scheduledAt ?? new Date(),
    })),
    skipDuplicates: true,
  })
  return {
    enrolled: result.count,
    skipped: userIds.length - result.count,
  }
}
