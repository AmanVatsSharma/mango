/**
 * @file system-settings.ts
 * @module workers
 * @description Safe read/write helpers for global SystemSettings keys (ownerId=null) used by worker management.
 * @author StockTrade
 * @created 2026-02-04
 *
 * Notes:
 * - `SystemSettings` uses a UNIQUE(ownerId,key) with nullable ownerId. In Postgres, NULLs do not collide, so
 *   multiple global rows can exist for the same key. We always select the latest by `updatedAt`.
 * - Writes soft-disable duplicates for safety.
 */

import { prisma } from "@/lib/prisma"

export type GlobalSettingRow = {
  key: string
  value: string
  updatedAt: Date
}

function normalizeGlobalSettingKey(key: unknown): string | null {
  if (typeof key !== "string") {
    return null
  }
  const normalizedKey = key.trim()
  if (!normalizedKey || normalizedKey.length > 128) {
    return null
  }
  return normalizedKey
}

export async function getLatestActiveGlobalSettings(keys: string[]): Promise<Map<string, GlobalSettingRow>> {
  const unique = Array.from(
    new Set(keys.map((key) => normalizeGlobalSettingKey(key)).filter((key): key is string => Boolean(key))),
  )
  const out = new Map<string, GlobalSettingRow>()
  if (unique.length === 0) return out

  const rows = await prisma.systemSettings.findMany({
    where: {
      ownerId: null,
      isActive: true,
      key: { in: unique },
    },
    orderBy: { updatedAt: "desc" },
    select: { key: true, value: true, updatedAt: true },
  })

  for (const r of rows) {
    if (!out.has(r.key)) {
      out.set(r.key, { key: r.key, value: r.value, updatedAt: r.updatedAt })
    }
  }

  return out
}

export async function upsertGlobalSetting(input: {
  key: string
  value: string
  category?: string
  description?: string
  isActive?: boolean
}): Promise<void> {
  const normalizedKey = normalizeGlobalSettingKey(input.key)
  if (!normalizedKey) {
    throw new Error("Invalid global setting key")
  }

  const { value, category, description } = input
  const isActive = input.isActive !== undefined ? input.isActive : true

  await prisma.$transaction(async (tx) => {
    const existing = await tx.systemSettings.findFirst({
      where: { key: normalizedKey, ownerId: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    })

    if (existing) {
      await tx.systemSettings.update({
        where: { id: existing.id },
        data: {
          value,
          category: category || "GENERAL",
          description,
          isActive,
          updatedAt: new Date(),
        },
      })

      // Soft-disable accidental duplicates for the same global key.
      await tx.systemSettings.updateMany({
        where: { key: normalizedKey, ownerId: null, id: { not: existing.id } },
        data: { isActive: false, updatedAt: new Date() },
      })

      return
    }

    await tx.systemSettings.create({
      data: {
        key: normalizedKey,
        value,
        category: category || "GENERAL",
        description,
        isActive,
      },
    })
  })
}

export function parseBooleanSetting(value: string | null | undefined): boolean | null {
  if (value == null) return null
  const normalizedValue = value.trim().toLowerCase()
  if (!normalizedValue) return null
  if (
    normalizedValue === "true" ||
    normalizedValue === "1" ||
    normalizedValue === "yes" ||
    normalizedValue === "on" ||
    normalizedValue === "y" ||
    normalizedValue === "t" ||
    normalizedValue === "enabled"
  )
    return true
  if (
    normalizedValue === "false" ||
    normalizedValue === "0" ||
    normalizedValue === "no" ||
    normalizedValue === "off" ||
    normalizedValue === "n" ||
    normalizedValue === "f" ||
    normalizedValue === "disabled"
  )
    return false
  return null
}

// Simple Registration Setting
export const SIMPLE_REGISTRATION_KEY = "simple_registration_enabled"

export async function isSimpleRegistrationEnabled(): Promise<boolean> {
  const settings = await getLatestActiveGlobalSettings([SIMPLE_REGISTRATION_KEY])
  const setting = settings.get(SIMPLE_REGISTRATION_KEY)
  return parseBooleanSetting(setting?.value) === true
}

export async function enableSimpleRegistration(): Promise<void> {
  await upsertGlobalSetting({
    key: SIMPLE_REGISTRATION_KEY,
    value: "true",
    category: "REGISTRATION",
    description: "When enabled, allows registration with just name + password (no email/phone required)",
    isActive: true,
  })
}

export async function disableSimpleRegistration(): Promise<void> {
  await upsertGlobalSetting({
    key: SIMPLE_REGISTRATION_KEY,
    value: "false",
    category: "REGISTRATION",
    description: "When disabled, requires email and phone for registration",
    isActive: true,
  })
}

