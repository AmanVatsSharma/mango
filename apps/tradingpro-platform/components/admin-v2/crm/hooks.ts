/**
 * @file components/admin-v2/crm/hooks.ts
 * @module admin-v2/crm
 * @description SWR hooks + mutator helpers for canonical CRM panels and the Callback Radar.
 *
 *              Exports:
 *                - useCrmNotes(userId)
 *                - useCrmTasks(userId, status)
 *                - useCallbackRadarCounts()
 *                - useCallbackQueue(bucket, limit?)
 *                - createCrmNote(...)
 *                - createCrmTask(...)
 *                - updateCrmTask(...)
 *                - mutateCrmCachesForUser(userId)
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import useSWR from "swr"
import { mutate as globalMutate } from "swr"
import { ApiError, jsonFetcher } from "@/lib/admin-v2/api-client"
import type {
  CrmNote,
  CrmNoteVisibility,
  CrmQueueResp,
  CrmRadarCounts,
  CrmTask,
  CrmTaskDisposition,
  CrmTaskKind,
  CrmTaskPriority,
  CrmTaskStatus,
} from "./types"

const REFRESH_30S = { refreshInterval: 30_000, revalidateOnFocus: false }
const REFRESH_60S = { refreshInterval: 60_000, revalidateOnFocus: false }

export function useCrmNotes(userId: string | null | undefined) {
  return useSWR<{ success: boolean; notes: CrmNote[] }>(
    userId ? `/api/admin/users/${userId}/crm/notes?limit=100` : null,
    jsonFetcher,
    REFRESH_30S,
  )
}

export function useCrmTasks(
  userId: string | null | undefined,
  status: "active" | "done" | "all" = "active",
) {
  return useSWR<{ success: boolean; tasks: CrmTask[] }>(
    userId ? `/api/admin/users/${userId}/crm/tasks?status=${status}&upcoming=1` : null,
    jsonFetcher,
    REFRESH_30S,
  )
}

export function useCallbackRadarCounts() {
  return useSWR<{ success: boolean; radar: CrmRadarCounts }>(
    "/api/admin/crm/callback-radar",
    jsonFetcher,
    REFRESH_60S,
  )
}

export function useCallbackQueue(
  bucket: "overdue" | "due_in_hour" | "due_today",
  limit = 50,
) {
  return useSWR<CrmQueueResp>(
    `/api/admin/crm/queue?bucket=${bucket}&limit=${limit}`,
    jsonFetcher,
    REFRESH_60S,
  )
}

// ── Mutations ─────────────────────────────────────────────────────────────

interface CreateNoteInput {
  userId: string
  body: string
  isPinned?: boolean
  visibility?: CrmNoteVisibility
}

export async function createCrmNote(input: CreateNoteInput): Promise<CrmNote> {
  const res = await fetch(`/api/admin/users/${input.userId}/crm/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      body: input.body,
      isPinned: input.isPinned ?? false,
      visibility: input.visibility ?? "TEAM",
    }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string }
    throw new ApiError(data.message ?? `Failed to create note (${res.status})`, res.status)
  }
  const data = (await res.json()) as { note: CrmNote }
  await mutateCrmCachesForUser(input.userId)
  return data.note
}

interface CreateTaskInput {
  userId: string
  title: string
  kind: CrmTaskKind
  description?: string | null
  priority?: CrmTaskPriority
  dueAt?: string | null
  disposition?: CrmTaskDisposition | null
}

export async function createCrmTask(input: CreateTaskInput): Promise<CrmTask> {
  const res = await fetch(`/api/admin/users/${input.userId}/crm/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      kind: input.kind,
      description: input.description ?? null,
      priority: input.priority ?? "NORMAL",
      dueAt: input.dueAt ?? null,
      disposition: input.disposition ?? null,
    }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string }
    throw new ApiError(data.message ?? `Failed to create task (${res.status})`, res.status)
  }
  const data = (await res.json()) as { task: CrmTask }
  await mutateCrmCachesForUser(input.userId)
  return data.task
}

interface UpdateTaskInput {
  userId: string
  taskId: string
  status?: CrmTaskStatus
  snoozeHours?: number
  disposition?: CrmTaskDisposition | null
  outcomeNote?: string | null
}

export async function updateCrmTask(input: UpdateTaskInput): Promise<CrmTask> {
  const { userId, taskId, ...payload } = input
  const res = await fetch(`/api/admin/users/${userId}/crm/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string }
    throw new ApiError(data.message ?? `Failed to update task (${res.status})`, res.status)
  }
  const data = (await res.json()) as { task: CrmTask }
  await mutateCrmCachesForUser(userId)
  return data.task
}

/**
 * Re-validate every CRM cache key for a given user — used after notes/tasks mutations
 * so every panel showing this client refreshes.
 */
export async function mutateCrmCachesForUser(userId: string): Promise<void> {
  await globalMutate(
    (key) =>
      typeof key === "string" &&
      (key.startsWith(`/api/admin/users/${userId}/crm/`) ||
        key === "/api/admin/crm/callback-radar" ||
        key.startsWith("/api/admin/crm/queue")),
  )
}
