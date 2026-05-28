/**
 * File:        lib/comms/template-service.ts
 * Module:      Comms · Template Service
 * Purpose:     Admin CRUD on CommsTemplate. Enforces SAVE-time variable validation
 *              (Gate #3 from the schema) and SMS DLT requirement (Gate #1).
 *
 * Exports:
 *   - listTemplates(filter?) → Promise<CommsTemplate[]>
 *   - getTemplate(id) → Promise<CommsTemplate | null>
 *   - createTemplate(input, createdById) → Promise<CommsTemplate>
 *   - updateTemplate(id, patch) → Promise<CommsTemplate>
 *   - archiveTemplate(id) → Promise<CommsTemplate>
 *
 * Depends on:
 *   - @/lib/prisma — DB access
 *   - ./template-render — validateTemplate (raises TemplateValidationError)
 *   - @prisma/client — CommsTemplate, CommsChannel, CommsTemplateStatus
 *
 * Side-effects:
 *   - DB writes on create/update/archive.
 *
 * Key invariants:
 *   - Variable validation runs on every create/update where `body` or `variables`
 *     change. Saving an invalid template is impossible.
 *   - SMS templates with status=ACTIVE MUST have dltTemplateId. Enforced at activation
 *     and at body update.
 *
 * Read order:
 *   1. createTemplate — covers all the gates inline
 *   2. updateTemplate — partial-update equivalent
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { prisma } from "@/lib/prisma"
import {
  CommsChannel,
  CommsTemplateStatus,
  type CommsTemplate,
  type Prisma,
} from "@prisma/client"
import { validateTemplate } from "./template-render"

export interface ListTemplatesFilter {
  channel?: CommsChannel
  status?: CommsTemplateStatus
  q?: string
}

export async function listTemplates(
  filter: ListTemplatesFilter = {},
): Promise<CommsTemplate[]> {
  const where: Prisma.CommsTemplateWhereInput = {}
  if (filter.channel) where.channel = filter.channel
  if (filter.status) where.status = filter.status
  if (filter.q) {
    where.OR = [
      { name: { contains: filter.q, mode: "insensitive" } },
      { body: { contains: filter.q, mode: "insensitive" } },
    ]
  }
  return prisma.commsTemplate.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 200,
  })
}

export async function getTemplate(id: string): Promise<CommsTemplate | null> {
  return prisma.commsTemplate.findUnique({ where: { id } })
}

export interface CreateTemplateInput {
  name: string
  channel: CommsChannel
  body: string
  variables?: string[]
  meta?: Record<string, unknown>
  dltTemplateId?: string | null
  status?: CommsTemplateStatus
}

export async function createTemplate(
  input: CreateTemplateInput,
  createdById: string,
): Promise<CommsTemplate> {
  const declared = input.variables ?? []
  validateTemplate({ body: input.body, declared })
  enforceSmsDltRule(input.channel, input.dltTemplateId, input.status)

  return prisma.commsTemplate.create({
    data: {
      name: input.name.trim(),
      channel: input.channel,
      body: input.body,
      variables: declared,
      meta: (input.meta ?? {}) as object,
      dltTemplateId: input.dltTemplateId ?? null,
      status: input.status ?? CommsTemplateStatus.DRAFT,
      createdById,
    },
  })
}

export interface UpdateTemplatePatch {
  name?: string
  body?: string
  variables?: string[]
  meta?: Record<string, unknown>
  dltTemplateId?: string | null
  status?: CommsTemplateStatus
}

export async function updateTemplate(
  id: string,
  patch: UpdateTemplatePatch,
): Promise<CommsTemplate> {
  const current = await prisma.commsTemplate.findUnique({ where: { id } })
  if (!current) throw new Error("template not found")

  const nextBody = patch.body ?? current.body
  const nextVariables = patch.variables ?? current.variables
  validateTemplate({ body: nextBody, declared: nextVariables })

  const nextChannel = current.channel // immutable at update time
  const nextDlt =
    patch.dltTemplateId !== undefined ? patch.dltTemplateId : current.dltTemplateId
  const nextStatus = patch.status ?? current.status
  enforceSmsDltRule(nextChannel, nextDlt, nextStatus)

  return prisma.commsTemplate.update({
    where: { id },
    data: {
      name: patch.name?.trim() ?? undefined,
      body: patch.body ?? undefined,
      variables: patch.variables ?? undefined,
      meta: patch.meta !== undefined ? (patch.meta as object) : undefined,
      dltTemplateId: patch.dltTemplateId !== undefined ? patch.dltTemplateId : undefined,
      status: patch.status ?? undefined,
    },
  })
}

export async function archiveTemplate(id: string): Promise<CommsTemplate> {
  return prisma.commsTemplate.update({
    where: { id },
    data: { status: CommsTemplateStatus.ARCHIVED },
  })
}

function enforceSmsDltRule(
  channel: CommsChannel,
  dltTemplateId: string | null | undefined,
  status: CommsTemplateStatus | undefined,
) {
  if (channel !== CommsChannel.SMS) return
  if ((status ?? CommsTemplateStatus.DRAFT) === CommsTemplateStatus.ACTIVE) {
    if (!dltTemplateId) {
      throw new Error(
        "SMS templates cannot be ACTIVE without a dltTemplateId (DLT compliance)",
      )
    }
  }
}
