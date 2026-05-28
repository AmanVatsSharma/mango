/**
 * File:        app/api/notifications/devices/route.ts
 * Module:      API · Notifications · Push device registration
 * Purpose:     Register and deregister Expo push device tokens for the authenticated user.
 *              Called by the mobile RN app on login (POST) and logout (DELETE).
 *
 * Exports:
 *   - POST /api/notifications/devices   — register a device token
 *   - DELETE /api/notifications/devices — deregister a device token
 *
 * Depends on:
 *   - @/auth                    — requireAuthenticatedUserId
 *   - @/lib/prisma              — PushDevice upsert / delete
 *   - zod                       — input validation
 *
 * Side-effects:
 *   - DB write: upsert into push_devices (POST), delete from push_devices (DELETE).
 *
 * Key invariants:
 *   - `@@unique([userId, expoPushToken])` on PushDevice means re-registering the same
 *     token is idempotent — `upsert` updates lastSeenAt without creating duplicates.
 *   - DELETE only removes tokens belonging to the authenticated user — no cross-user pruning.
 *   - `platform` must be "ios" or "android".
 *
 * Author:      StockTrade Mobile Team
 * Last-updated: 2026-04-30
 */

export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuthenticatedUserId } from "@/lib/server/trading-access"

const registerSchema = z.object({
  expoPushToken: z.string().min(1).max(256),
  platform: z.enum(["ios", "android"]),
  deviceId: z.string().max(256).optional(),
})

const deregisterSchema = z.object({
  expoPushToken: z.string().min(1).max(256),
})

// POST /api/notifications/devices — register or refresh a device token.
export async function POST(req: Request): Promise<NextResponse> {
  let userId: string
  try {
    userId = await requireAuthenticatedUserId()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 })
  }

  const { expoPushToken, platform, deviceId } = parsed.data

  try {
    const device = await prisma.pushDevice.upsert({
      where: { userId_expoPushToken: { userId, expoPushToken } },
      create: { userId, expoPushToken, platform, deviceId },
      update: { lastSeenAt: new Date(), platform, deviceId },
    })

    return NextResponse.json({ deviceId: device.id }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: "Failed to register device" }, { status: 500 })
  }
}

// DELETE /api/notifications/devices — deregister a token on logout or permission revoke.
export async function DELETE(req: Request): Promise<NextResponse> {
  let userId: string
  try {
    userId = await requireAuthenticatedUserId()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = deregisterSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }

  const { expoPushToken } = parsed.data

  try {
    await prisma.pushDevice.deleteMany({
      where: { userId, expoPushToken },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Failed to deregister device" }, { status: 500 })
  }
}
