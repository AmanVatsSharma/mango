/**
 * @file components/admin-v2/rm/hooks.ts
 * @module admin-v2/rm
 * @description SWR hooks + mutators for the v2 RM workbench.
 *
 *              Exports:
 *                - useRmList()
 *                - useRmTeam(rmId)
 *                - useRmLeaderboard(from, to)
 *                - assignClientToRm(userId, rmId | null)  — PATCH /api/admin/users/[userId]/assign-rm
 *
 *              Side-effects: SWR fetch + cache mutation cascade after assignment.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import useSWR, { mutate as globalMutate } from "swr"
import { ApiError, jsonFetcher } from "@/lib/admin-v2/api-client"
import type { LeaderboardResp, RmListResp, RmTeamResp } from "./types"

const REFRESH_60S = { refreshInterval: 60_000, revalidateOnFocus: false }
const REFRESH_5MIN = { refreshInterval: 5 * 60_000, revalidateOnFocus: false }

export function useRmList() {
  return useSWR<RmListResp>("/api/admin/rms", jsonFetcher, REFRESH_60S)
}

export function useRmTeam(rmId: string | null | undefined) {
  return useSWR<RmTeamResp>(
    rmId ? `/api/admin/rms/${rmId}/team` : null,
    jsonFetcher,
    REFRESH_60S,
  )
}

export function useRmLeaderboard(from?: string, to?: string) {
  const sp = new URLSearchParams()
  if (from) sp.set("from", from)
  if (to) sp.set("to", to)
  const qs = sp.toString()
  return useSWR<LeaderboardResp>(
    `/api/admin/rms/leaderboard${qs ? `?${qs}` : ""}`,
    jsonFetcher,
    REFRESH_5MIN,
  )
}

export async function assignClientToRm(
  userId: string,
  rmId: string | null,
): Promise<void> {
  const res = await fetch(`/api/admin/users/${userId}/assign-rm`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rmId }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string }
    throw new ApiError(data.message ?? `Failed to assign RM (${res.status})`, res.status)
  }

  // Cascade: every RM team list, the RM list itself, the user detail (Client 360), and
  // the leaderboard's productivity counts (managedClients).
  await globalMutate(
    (key) =>
      typeof key === "string" &&
      (key.startsWith("/api/admin/rms") ||
        key === `/api/admin/users/${userId}` ||
        key.startsWith("/api/admin/users?")),
  )
}
