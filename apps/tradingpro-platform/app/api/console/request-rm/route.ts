/**
 * @file route.ts
 * @module console
 * @description API route for users to request a Relationship Manager (queued for admin RM tools).
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-03-28
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { withRequest } from "@/lib/observability/logger"

/**
 * POST /api/console/request-rm
 * Idempotent: at most one PENDING queue row per user.
 */
export async function POST(req: Request) {
  const log = withRequest({
    requestId: req.headers.get("x-request-id") || undefined,
    route: "/api/console/request-rm",
  })

  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        managedById: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (user.managedById) {
      return NextResponse.json(
        { error: "You already have a Relationship Manager assigned" },
        { status: 400 },
      )
    }

    const existingPending = await prisma.rmAssignmentRequest.findFirst({
      where: { userId, status: "PENDING" },
      select: { id: true },
    })

    if (existingPending) {
      log.info({ userId }, "request-rm: already pending")
      return NextResponse.json({
        success: true,
        alreadyQueued: true,
        message:
          "You already have a pending request. An admin will assign a Relationship Manager shortly.",
      })
    }

    await prisma.rmAssignmentRequest.create({
      data: {
        userId,
        status: "PENDING",
      },
    })

    log.info({ userId }, "request-rm: created pending queue row")

    return NextResponse.json({
      success: true,
      message: "Your request for a Relationship Manager has been submitted. An admin will assign one shortly.",
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to submit RM request"
    log.error({ err: error }, "request-rm: POST error")
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
