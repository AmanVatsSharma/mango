/**
 * @file overview.ts
 * @module session-security
 * @description Aggregated session-security metrics for admin command-center (short TTL cache).
 * @author StockTrade
 * @created 2026-03-28
 */

import { prisma } from "@/lib/prisma"
import { isRedisEnabled, redisGet, redisSet } from "@/lib/redis/redis-client"
import { SecurityIncidentStatus } from "@prisma/client"
import { loadSessionSecurityPolicy } from "./session-security-policy"

const CACHE_TTL_SEC = 45
const REDIS_KEY = "tb:session-security:overview:v1"

type OverviewDto = {
  computedAt: string
  activeSessions: number
  openIncidents: number
  totalIncidents: number
  incidents24hByType: Record<string, number>
  incidents7dByType: Record<string, number>
  /** Network keys in policy lookback with distinct users ≥ threshold. */
  multiUserNetworkKeys: number
  sessionsCreated24h: number
  revocations24h: number
  policyEnabled: boolean
  redisCacheEnabled: boolean
}

const globalMem = globalThis as unknown as {
  __ssOverview?: { at: number; payload: OverviewDto }
}

function emptyTypeMap(): Record<string, number> {
  return {
    MULTI_USER_SAME_NETWORK: 0,
    CONCURRENT_SESSIONS_EXCEEDED: 0,
    SESSION_POLICY_BLOCK: 0,
  }
}

async function computeOverview(): Promise<OverviewDto> {
  const policy = await loadSessionSecurityPolicy()
  const now = new Date()
  const idleCut = new Date(now.getTime() - policy.sessionIdleTtlMinutes * 60 * 1000)
  const since24 = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const since7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const lookback = new Date(now.getTime() - policy.multiAccountLookbackHours * 60 * 60 * 1000)

  const [
    activeSessions,
    openIncidents,
    totalIncidents,
    grouped24,
    grouped7,
    sessionsCreated24h,
    revocations24h,
  ] = await Promise.all([
    prisma.userSessionRecord.count({
      where: {
        revokedAt: null,
        kind: { not: "REGISTRATION_SIGHTING" },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        lastSeenAt: { gte: idleCut },
      },
    }),
    prisma.securityIncident.count({ where: { status: SecurityIncidentStatus.OPEN } }),
    prisma.securityIncident.count(),
    prisma.securityIncident.groupBy({
      by: ["type"],
      where: { createdAt: { gte: since24 } },
      _count: { _all: true },
    }),
    prisma.securityIncident.groupBy({
      by: ["type"],
      where: { createdAt: { gte: since7 } },
      _count: { _all: true },
    }),
    prisma.userSessionRecord.count({
      where: {
        createdAt: { gte: since24 },
        kind: { not: "REGISTRATION_SIGHTING" },
      },
    }),
    prisma.userSessionRecord.count({
      where: {
        revokedAt: { gte: since24 },
        kind: { not: "REGISTRATION_SIGHTING" },
      },
    }),
  ])

  const incidents24hByType = emptyTypeMap()
  for (const row of grouped24) {
    incidents24hByType[row.type] = row._count._all
  }
  const incidents7dByType = emptyTypeMap()
  for (const row of grouped7) {
    incidents7dByType[row.type] = row._count._all
  }

  const threshold = policy.multiAccountDistinctUserThreshold
  const rawMulti = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c FROM (
      SELECT "networkKey"
      FROM "user_session_records"
      WHERE "networkKey" IS NOT NULL
        AND "revokedAt" IS NULL
        AND "lastSeenAt" >= ${lookback}
      GROUP BY "networkKey"
      HAVING COUNT(DISTINCT "userId") >= ${threshold}
    ) t
  `
  const multiUserNetworkKeys = Number(rawMulti[0]?.c ?? 0)

  return {
    computedAt: now.toISOString(),
    activeSessions,
    openIncidents,
    totalIncidents,
    incidents24hByType,
    incidents7dByType,
    multiUserNetworkKeys,
    sessionsCreated24h,
    revocations24h,
    policyEnabled: policy.enabled,
    redisCacheEnabled: isRedisEnabled(),
  }
}

export async function getSessionSecurityOverview(): Promise<OverviewDto> {
  const mem = globalMem.__ssOverview
  const now = Date.now()
  if (mem && now - mem.at < CACHE_TTL_SEC * 1000) {
    return mem.payload
  }

  if (isRedisEnabled()) {
    const cached = await redisGet(REDIS_KEY)
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as OverviewDto
        globalMem.__ssOverview = { at: now, payload: parsed }
        return parsed
      } catch {
        /* fall through */
      }
    }
  }

  const payload = await computeOverview()
  globalMem.__ssOverview = { at: now, payload }

  if (isRedisEnabled()) {
    await redisSet(REDIS_KEY, JSON.stringify(payload), CACHE_TTL_SEC)
  }

  return payload
}
