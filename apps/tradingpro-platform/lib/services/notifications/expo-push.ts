/**
 * File:        lib/services/notifications/expo-push.ts
 * Module:      Services · Notifications · Expo Push
 * Purpose:     Fire-and-forget Expo Push Notification dispatch. Looks up active PushDevice
 *              rows for a userId and sends a push message to each via the Expo push API.
 *              Called by NotificationService.createNotification — always best-effort so
 *              push failures NEVER block the in-app notification write.
 *
 * Exports:
 *   - dispatchExpoPush(userId, title, body, data?) → Promise<void>
 *   - type ExpoPushPayload
 *
 * Depends on:
 *   - @/lib/prisma — reads PushDevice rows for the user
 *   - @/lib/observability/logger
 *
 * Side-effects:
 *   - POST https://exp.host/--/api/v2/push/send
 *   - DB read: prisma.pushDevice.findMany (indexed on userId)
 *
 * Key invariants:
 *   - All errors are caught and logged — never thrown. Caller is never blocked.
 *   - Tokens with Expo error type "DeviceNotRegistered" are removed from the DB
 *     automatically so stale tokens self-prune.
 *   - The Expo push receipt check (recommended by Expo docs) is intentionally deferred —
 *     receipt polling is a separate worker concern (Trading-1xf follow-up).
 *   - Messages are batched per the Expo SDK limit (100 per request).
 *
 * Author:      StockTrade Mobile Team
 * Last-updated: 2026-04-30
 */

import { prisma } from "@/lib/prisma"
import { baseLogger } from "@/lib/observability/logger"

const log = baseLogger.child({ module: "expo-push" })

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
const EXPO_BATCH_SIZE = 100

export interface ExpoPushPayload {
  title: string
  body: string
  data?: Record<string, unknown>
  sound?: "default" | null
  badge?: number
}

interface ExpoTicket {
  status: "ok" | "error"
  id?: string
  message?: string
  details?: { error?: string }
}

export async function dispatchExpoPush(
  userId: string,
  payload: ExpoPushPayload,
): Promise<void> {
  try {
    const devices = await prisma.pushDevice.findMany({
      where: { userId },
      select: { id: true, expoPushToken: true },
    })

    if (devices.length === 0) return

    // Batch into groups of EXPO_BATCH_SIZE.
    for (let i = 0; i < devices.length; i += EXPO_BATCH_SIZE) {
      const batch = devices.slice(i, i + EXPO_BATCH_SIZE)
      await sendBatch(batch, payload)
    }
  } catch (err) {
    log.warn({ userId, err: (err as Error).message }, "expo-push dispatch failed")
  }
}

async function sendBatch(
  devices: { id: string; expoPushToken: string }[],
  payload: ExpoPushPayload,
): Promise<void> {
  const messages = devices.map((d) => ({
    to: d.expoPushToken,
    title: payload.title,
    body: payload.body,
    data: payload.data,
    sound: payload.sound ?? "default",
    badge: payload.badge,
  }))

  let tickets: ExpoTicket[] = []
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    })

    if (!res.ok) {
      log.warn({ status: res.status }, "expo push batch non-2xx")
      return
    }

    const body = (await res.json()) as { data?: ExpoTicket[] }
    tickets = body.data ?? []
  } catch (err) {
    log.warn({ err: (err as Error).message }, "expo push batch request failed")
    return
  }

  // Auto-prune stale tokens.
  const staleIds: string[] = []
  tickets.forEach((ticket, idx) => {
    if (
      ticket.status === "error" &&
      ticket.details?.error === "DeviceNotRegistered"
    ) {
      const deviceId = devices[idx]?.id
      if (deviceId) staleIds.push(deviceId)
    }
  })

  if (staleIds.length > 0) {
    prisma.pushDevice
      .deleteMany({ where: { id: { in: staleIds } } })
      .catch((err) =>
        log.warn({ staleIds, err: (err as Error).message }, "stale token pruning failed"),
      )
  }
}
