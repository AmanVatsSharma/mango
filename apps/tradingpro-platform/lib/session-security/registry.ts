/**
 * @file registry.ts
 * @module session-security
 * @description UserSessionRecord lifecycle: create on login, validate jti, revoke, concurrency helpers.
 * @author StockTrade
 * @created 2026-03-28
 * @updated 2026-03-28 — mintLegacy / notes align with TradeBazaar (sessionRegistryJti vs Auth `jti`).
 *
 * Notes:
 * - `mintLegacyCredentialJtiIfPolicyEnabled` heals credential JWTs missing `sessionRegistryJti` (JWT claim `jti` is not used — Auth.js overwrites it).
 * - `evaluateJtiSession` returns reason codes; optional Redis fast path when `lastDbVerifyMs` is fresh.
 */

import { randomUUID } from "crypto"
import type { SessionAuth, UserSessionKind } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getTrustedClientIp } from "@/lib/server/trusted-client-ip"
import { computeNetworkKey, fingerprintIp, hashUserAgent, sessionSecuritySecret } from "./network-key"
import { loadSessionSecurityPolicy } from "./session-security-policy"
import { markJtiActive, markJtiInactive, redisPeekJtiUser } from "@/lib/redis/session-jti-cache"

const WEB_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

const DEVICE_SESSION_KINDS = {
  not: "REGISTRATION_SIGHTING" as const,
}

export async function countActiveSessions(userId: string): Promise<number> {
  const now = new Date()
  return prisma.userSessionRecord.count({
    where: {
      userId,
      kind: DEVICE_SESSION_KINDS,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  })
}

export async function revokeOldestSessions(userId: string, count: number): Promise<number> {
  if (count <= 0) return 0
  const now = new Date()
  const victims = await prisma.userSessionRecord.findMany({
    where: {
      userId,
      kind: DEVICE_SESSION_KINDS,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: count,
    select: { id: true, jti: true },
  })
  for (const v of victims) {
    await prisma.userSessionRecord.update({
      where: { id: v.id },
      data: { revokedAt: new Date() },
    })
    if (v.jti) await markJtiInactive(v.jti)
  }
  return victims.length
}

export async function revokeJti(jti: string): Promise<void> {
  await prisma.userSessionRecord.updateMany({
    where: { jti, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  await markJtiInactive(jti)
}

export async function revokeAllSessionsForUser(userId: string): Promise<number> {
  const active = await prisma.userSessionRecord.findMany({
    where: { userId, revokedAt: null },
    select: { jti: true },
  })
  const r = await prisma.userSessionRecord.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  for (const row of active) {
    if (row.jti) await markJtiInactive(row.jti)
  }
  return r.count
}

function secret(): string {
  return sessionSecuritySecret()
}

/**
 * Synthetic `Request` for JWT refresh paths with no browser `Request` (legacy credential JWT missing `jti`).
 */
export function legacyCredentialJtiHealRequest(): Request {
  return new Request("https://internal/legacy-credential-jti-heal", {
    headers: { "user-agent": "NextAuth/legacy-credential-jti-heal" },
  })
}

export async function createOrRotateWebCredentialSession(args: {
  userId: string
  request: Request
  sessionAuth: SessionAuth | null
}): Promise<{ jti: string }> {
  const ip = getTrustedClientIp({ headers: args.request.headers })
  const ua = args.request.headers.get("user-agent") ?? "unknown"
  const policy = await loadSessionSecurityPolicy()
  const sec = secret()
  const networkKey = computeNetworkKey(ip, policy.networkClusterMode, sec)
  const ipFingerprint = fingerprintIp(ip, sec)
  const userAgentHash = hashUserAgent(ua, sec)
  const expiresAt = new Date(Date.now() + WEB_SESSION_MAX_AGE_MS)
  const jti = randomUUID()

  if (args.sessionAuth) {
    const existing = await prisma.userSessionRecord.findUnique({
      where: { sessionAuthId: args.sessionAuth.id },
    })
    if (existing) {
      if (existing.jti) await markJtiInactive(existing.jti)
      await prisma.userSessionRecord.update({
        where: { id: existing.id },
        data: {
          jti,
          ipFingerprint,
          networkKey,
          userAgentHash,
          deviceId: args.sessionAuth.deviceId,
          lastSeenAt: new Date(),
          revokedAt: null,
          expiresAt,
        },
      })
      await markJtiActive(args.userId, jti, Math.floor(WEB_SESSION_MAX_AGE_MS / 1000))
      return { jti }
    }
  }

  await prisma.userSessionRecord.create({
    data: {
      userId: args.userId,
      kind: (args.sessionAuth ? "MOBILE_SESSION_AUTH" : "WEB_JWT") as UserSessionKind,
      jti,
      sessionAuthId: args.sessionAuth?.id ?? null,
      ipFingerprint,
      networkKey,
      userAgentHash,
      deviceId: args.sessionAuth?.deviceId ?? null,
      expiresAt,
    },
  })
  await markJtiActive(args.userId, jti, Math.floor(WEB_SESSION_MAX_AGE_MS / 1000))
  return { jti }
}

/**
 * Mint registry + jti for credential JWTs missing `sessionRegistryJti` (legacy or first load after fix).
 * Returns `undefined` when policy is disabled or minting fails.
 */
export async function mintLegacyCredentialJtiIfPolicyEnabled(userId: string): Promise<string | undefined> {
  try {
    const policy = await loadSessionSecurityPolicy()
    if (!policy.enabled) return undefined
    const { jti } = await createOrRotateWebCredentialSession({
      userId,
      request: legacyCredentialJtiHealRequest(),
      sessionAuth: null,
    })
    return jti
  } catch {
    return undefined
  }
}

export type JtiSessionEvalReason =
  | "ok"
  | "ok_cache"
  | "policy_off"
  | "missing_jti_or_uid"
  | "row_not_found"
  | "user_mismatch"
  | "revoked"
  | "expired_row"
  | "idle_ttl_exceeded"

export type JtiSessionEval = { valid: boolean; reason: JtiSessionEvalReason }

export const JTI_REDIS_FAST_PATH_MAX_AGE_MS = 45_000

export type EvaluateJtiSessionOptions = {
  lastDbVerifyMs?: number
}

export async function evaluateJtiSession(
  jti: string | undefined,
  userId: string | undefined,
  options?: EvaluateJtiSessionOptions,
): Promise<JtiSessionEval> {
  const policy = await loadSessionSecurityPolicy()
  if (!policy.enabled) {
    return { valid: true, reason: "policy_off" }
  }
  if (!jti || !userId) {
    return { valid: false, reason: "missing_jti_or_uid" }
  }
  const lastDb = options?.lastDbVerifyMs
  if (
    typeof lastDb === "number" &&
    lastDb > 0 &&
    Date.now() - lastDb < JTI_REDIS_FAST_PATH_MAX_AGE_MS
  ) {
    const cachedUid = await redisPeekJtiUser(jti)
    if (cachedUid === userId) {
      return { valid: true, reason: "ok_cache" }
    }
  }
  const now = new Date()
  const row = await prisma.userSessionRecord.findUnique({ where: { jti } })
  if (!row) {
    return { valid: false, reason: "row_not_found" }
  }
  if (row.userId !== userId) {
    return { valid: false, reason: "user_mismatch" }
  }
  if (row.revokedAt) {
    return { valid: false, reason: "revoked" }
  }
  if (row.expiresAt && row.expiresAt < now) {
    return { valid: false, reason: "expired_row" }
  }
  const idleMs = policy.sessionIdleTtlMinutes * 60 * 1000
  if (now.getTime() - row.lastSeenAt.getTime() > idleMs) {
    return { valid: false, reason: "idle_ttl_exceeded" }
  }
  return { valid: true, reason: "ok" }
}

export async function isJtiSessionValid(jti: string | undefined, userId: string | undefined): Promise<boolean> {
  const r = await evaluateJtiSession(jti, userId)
  return r.valid
}

export async function touchSessionByJti(jti: string, minIntervalMs: number): Promise<void> {
  const row = await prisma.userSessionRecord.findUnique({ where: { jti } })
  if (!row || row.revokedAt) return
  if (Date.now() - row.lastSeenAt.getTime() < minIntervalMs) return
  await prisma.userSessionRecord.update({
    where: { id: row.id },
    data: { lastSeenAt: new Date() },
  })
}

/** Link mobile SessionAuth row to registry (no browser jti yet). */
export async function registerMobileSessionAuthRow(args: {
  userId: string
  sessionAuthId: string
  ip: string
  userAgent: string
  deviceId?: string | null
  expiresAt: Date
  networkClusterMode: import("./types").NetworkClusterMode
}): Promise<void> {
  const sec = secret()
  const networkKey = computeNetworkKey(args.ip, args.networkClusterMode, sec)
  const ipFingerprint = fingerprintIp(args.ip, sec)
  const userAgentHash = hashUserAgent(args.userAgent, sec)

  await prisma.userSessionRecord.upsert({
    where: { sessionAuthId: args.sessionAuthId },
    create: {
      userId: args.userId,
      kind: "MOBILE_SESSION_AUTH",
      sessionAuthId: args.sessionAuthId,
      jti: null,
      ipFingerprint,
      networkKey,
      userAgentHash,
      deviceId: args.deviceId ?? null,
      expiresAt: args.expiresAt,
    },
    update: {
      ipFingerprint,
      networkKey,
      userAgentHash,
      deviceId: args.deviceId ?? null,
      expiresAt: args.expiresAt,
      lastSeenAt: new Date(),
      revokedAt: null,
    },
  })
}

export async function listSessionsForUser(userId: string, take = 50) {
  return prisma.userSessionRecord.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
    take,
  })
}

/** Lightweight network row after signup so clustering can detect many accounts before first login. */
export async function createRegistrationSighting(args: { userId: string; request: Request }): Promise<void> {
  const policy = await loadSessionSecurityPolicy()
  if (!policy.enabled) return

  const ip = getTrustedClientIp({ headers: args.request.headers })
  const ua = args.request.headers.get("user-agent") ?? "unknown"
  const sec = secret()
  const networkKey = computeNetworkKey(ip, policy.networkClusterMode, sec)
  const ipFingerprint = fingerprintIp(ip, sec)
  const userAgentHash = hashUserAgent(ua, sec)
  const ttlMs = Math.max(1, policy.multiAccountLookbackHours) * 60 * 60 * 1000
  const expiresAt = new Date(Date.now() + ttlMs)

  await prisma.userSessionRecord.create({
    data: {
      userId: args.userId,
      kind: "REGISTRATION_SIGHTING",
      jti: null,
      ipFingerprint,
      networkKey,
      userAgentHash,
      expiresAt,
    },
  })
}
