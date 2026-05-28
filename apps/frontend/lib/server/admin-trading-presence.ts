/**
 * @file admin-trading-presence.ts
 * @module lib/server
 * @description Shared helpers to attach trading-dashboard SSE presence flags to admin API payloads.
 * @author StockTrade
 * @created 2026-04-03
 *
 * Notes:
 * - Uses getTradingDashboardPresenceMap for Redis / in-process resolution.
 */

import { getTradingDashboardPresenceMap } from "@/lib/services/realtime/trading-dashboard-presence"

export async function withTradingDashboardPresence<T extends { id: string }>(result: {
  users: T[]
  total: number
  pages: number
}): Promise<{
  users: (T & { isTradingDashboardOnline: boolean })[]
  total: number
  pages: number
}> {
  const ids = result.users.map((u) => u.id)
  const presenceMap = await getTradingDashboardPresenceMap(ids)
  return {
    ...result,
    users: result.users.map((u) => ({
      ...u,
      isTradingDashboardOnline: Boolean(presenceMap[u.id]),
    })),
  }
}

export type KycApplicationWithUser = {
  user: { id: string }
  [key: string]: unknown
}

export async function enrichUsersWithTradingPresence<T extends { id: string }>(
  users: T[],
): Promise<(T & { isTradingDashboardOnline: boolean })[]> {
  if (users.length === 0) return []
  const presenceMap = await getTradingDashboardPresenceMap(users.map((u) => u.id))
  return users.map((u) => ({
    ...u,
    isTradingDashboardOnline: Boolean(presenceMap[u.id]),
  }))
}

export async function withKycApplicationsTradingPresence<T extends KycApplicationWithUser>(
  applications: T[],
): Promise<
  (T & {
    user: T["user"] & { isTradingDashboardOnline: boolean }
  })[]
> {
  const uniqueIds = Array.from(new Set(applications.map((a) => a.user.id)))
  const presenceMap = await getTradingDashboardPresenceMap(uniqueIds)
  return applications.map((app) => ({
    ...app,
    user: {
      ...app.user,
      isTradingDashboardOnline: Boolean(presenceMap[app.user.id]),
    },
  }))
}
