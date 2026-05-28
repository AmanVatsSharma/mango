/**
 * @file worker-run-lock.ts
 * @module workers
 * @description Global overlap guard for scheduled workers using DB-backed lease locking.
 * @author StockTrade
 * @created 2026-02-15
 */

import os from "os"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { parseFiniteWorkerNumber } from "@/lib/server/workers/worker-number-utils"

const WORKER_RUN_LOCK_NS = 910_101

export type WorkerRunLock = {
  key: string
  ownerToken: string
  expiresAtMs: number
  acquired: boolean
  reason?: "locked"
}

type WorkerRunLockValue = {
  ownerToken: string
  acquiredAtMs: number
  expiresAtMs: number
  releasedAtMs?: number
}

function normalizeWorkerLockTtlMs(ttlMs: unknown): number {
  const parsedTtlMs = parseFiniteWorkerNumber(ttlMs)
  if (parsedTtlMs === null) {
    return 5_000
  }
  return Math.max(5_000, Math.min(86_400_000, Math.trunc(parsedTtlMs)))
}

function normalizeWorkerId(workerId: unknown): string {
  if (typeof workerId !== "string") {
    return "unknown"
  }
  const trimmedWorkerId = workerId.trim()
  if (trimmedWorkerId.length === 0) {
    return "unknown"
  }
  const sanitizedWorkerId = trimmedWorkerId
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")

  if (sanitizedWorkerId.length === 0) {
    return "unknown"
  }

  return sanitizedWorkerId.slice(0, 96)
}

function asWorkerLockSql(lockKey: string): Prisma.Sql {
  return Prisma.sql`
    SELECT pg_advisory_xact_lock(
      ((${WORKER_RUN_LOCK_NS}::bigint << 32) | (hashtext(${lockKey}::text)::bigint & 4294967295))
    )
  `
}

function parseWorkerRunLockValue(raw: string | null | undefined): WorkerRunLockValue | null {
  if (!raw) return null
  try {
    const parsedRaw = JSON.parse(raw) as Record<string, unknown>
    const parseLockPayload = (candidate: unknown): Record<string, unknown> | null => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        return null
      }
      return candidate as Record<string, unknown>
    }
    const parseEpochMs = (value: unknown): number | null => {
      if (value instanceof Date) {
        const timestamp = value.getTime()
        return Number.isFinite(timestamp) ? Math.trunc(timestamp) : null
      }
      if (typeof value === "number") {
        return Number.isFinite(value) ? Math.trunc(value) : null
      }
      if (typeof value === "string") {
        const normalizedValue = value.trim()
        if (normalizedValue.length === 0) {
          return null
        }
        const parsedValue = parseFiniteWorkerNumber(normalizedValue)
        if (Number.isFinite(parsedValue)) {
          return Math.trunc(parsedValue)
        }
        const parsedIsoTimestamp = Date.parse(normalizedValue)
        return Number.isFinite(parsedIsoTimestamp) ? parsedIsoTimestamp : null
      }
      return null
    }
    const resolveOwnerToken = (payload: Record<string, unknown>): string => {
      const ownerTokenKeys = ["ownerToken", "owner"] as const
      for (const ownerTokenKey of ownerTokenKeys) {
        const candidateValue = payload[ownerTokenKey]
        if (typeof candidateValue !== "string") {
          continue
        }
        const normalizedToken = candidateValue.trim()
        if (normalizedToken.length > 0) {
          return normalizedToken
        }
      }
      return ""
    }
    const resolveEpochMs = (payload: Record<string, unknown>, timestampKeys: string[]): number | null => {
      for (const timestampKey of timestampKeys) {
        const candidateValue = payload[timestampKey]
        if (candidateValue === undefined || candidateValue === null) {
          continue
        }
        const parsedCandidateValue = parseEpochMs(candidateValue)
        if (parsedCandidateValue !== null) {
          return parsedCandidateValue
        }
      }
      return null
    }
    const parseLockValueFromPayload = (payload: Record<string, unknown>): WorkerRunLockValue | null => {
      const ownerToken = resolveOwnerToken(payload)
      const acquiredAtMs = resolveEpochMs(payload, ["acquiredAtMs", "acquiredAt", "acquired_at", "createdAt", "created_at"])
      const expiresAtMs = resolveEpochMs(payload, ["expiresAtMs", "expiresAt", "expires_at", "expiryAt", "expires_on"])
      const releasedAtMs = resolveEpochMs(payload, ["releasedAtMs", "releasedAt", "released_at"])

      if (!ownerToken || acquiredAtMs === null || expiresAtMs === null) {
        return null
      }
      return {
        ownerToken,
        acquiredAtMs,
        expiresAtMs,
        releasedAtMs: releasedAtMs === null ? undefined : releasedAtMs,
      }
    }

    const payloadCandidates = [
      parseLockPayload((parsedRaw as { lock?: unknown }).lock),
      parseLockPayload((parsedRaw as { payload?: unknown }).payload),
      parseLockPayload(parsedRaw),
    ]

    for (const payloadCandidate of payloadCandidates) {
      if (!payloadCandidate) {
        continue
      }
      const parsedLockValue = parseLockValueFromPayload(payloadCandidate)
      if (parsedLockValue) {
        return parsedLockValue
      }
    }
    return null
  } catch {
    return null
  }
}

export async function tryAcquireWorkerRunLock(input: {
  workerId: string
  ttlMs: number
}): Promise<WorkerRunLock> {
  const nowMs = Date.now()
  const normalizedInput = (input && typeof input === "object" ? input : {}) as Partial<{
    workerId: string
    ttlMs: number
  }>
  const ttlMs = normalizeWorkerLockTtlMs(normalizedInput.ttlMs)
  const key = `worker_run_lock_${normalizeWorkerId(normalizedInput.workerId)}`
  const ownerToken = `${os.hostname()}:${process.pid}:${nowMs}:${Math.random().toString(36).slice(2, 10)}`

  const acquired = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(asWorkerLockSql(key))

    const existing = await tx.systemSettings.findFirst({
      where: { key, ownerId: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true, value: true },
    })

    const current = parseWorkerRunLockValue(existing?.value)
    const lockActive = current && current.expiresAtMs > nowMs

    if (lockActive && current.ownerToken !== ownerToken) {
      return false
    }

    const nextValue = JSON.stringify({
      ownerToken,
      acquiredAtMs: nowMs,
      expiresAtMs: nowMs + ttlMs,
    } satisfies WorkerRunLockValue)

    if (existing?.id) {
      await tx.systemSettings.update({
        where: { id: existing.id },
        data: {
          value: nextValue,
          category: "TRADING",
          description: "Global overlap guard lock for worker runs.",
          isActive: true,
          updatedAt: new Date(),
        },
      })
      await tx.systemSettings.updateMany({
        where: { key, ownerId: null, id: { not: existing.id } },
        data: { isActive: false, updatedAt: new Date() },
      })
      return true
    }

    await tx.systemSettings.create({
      data: {
        key,
        value: nextValue,
        category: "TRADING",
        description: "Global overlap guard lock for worker runs.",
        isActive: true,
      },
    })
    return true
  })

  if (!acquired) {
    return { key, ownerToken, expiresAtMs: nowMs + ttlMs, acquired: false, reason: "locked" }
  }

  return { key, ownerToken, expiresAtMs: nowMs + ttlMs, acquired: true }
}

export async function releaseWorkerRunLock(lock: WorkerRunLock): Promise<void> {
  const normalizedLockKey = typeof lock?.key === "string" ? lock.key.trim() : ""
  const normalizedOwnerToken = typeof lock?.ownerToken === "string" ? lock.ownerToken.trim() : ""

  if (
    !lock?.acquired ||
    normalizedLockKey.length === 0 ||
    normalizedOwnerToken.length === 0
  ) {
    return
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(asWorkerLockSql(normalizedLockKey))

    const existing = await tx.systemSettings.findFirst({
      where: { key: normalizedLockKey, ownerId: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true, value: true },
    })

    if (!existing?.id) return

    const current = parseWorkerRunLockValue(existing.value)
    if (!current || current.ownerToken !== normalizedOwnerToken) return

    await tx.systemSettings.update({
      where: { id: existing.id },
      data: {
        value: JSON.stringify({
          ...current,
          expiresAtMs: Date.now() - 1,
          releasedAtMs: Date.now(),
        } satisfies WorkerRunLockValue),
        updatedAt: new Date(),
      },
    })
  })
}

