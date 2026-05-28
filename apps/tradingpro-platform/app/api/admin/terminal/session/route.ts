/**
 * @file route.ts
 * @module admin-console
 * @description Issue short-lived JWT for browser PTY terminal-gateway WebSocket auth.
 * @author StockTrade
 * @created 2026-03-25
 */

import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"

const TOKEN_TTL_SEC = 90

function isGatewayEnabled(): boolean {
  const v = process.env.TERMINAL_GATEWAY_ENABLED
  return v === "1" || v === "true" || v === "yes"
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/terminal/session",
      required: "admin.terminal.shell",
      fallbackMessage: "Failed to create terminal session",
    },
    async ({ session, role, logger }) => {
      if (!isGatewayEnabled()) {
        return NextResponse.json(
          { success: false, error: "Terminal gateway is disabled", code: "TERMINAL_DISABLED" },
          { status: 503 }
        )
      }

      const wsUrl = process.env.NEXT_PUBLIC_TERMINAL_WS_URL?.trim()
      if (!wsUrl) {
        logger.error({ timeIst: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) }, "NEXT_PUBLIC_TERMINAL_WS_URL missing")
        return NextResponse.json(
          { success: false, error: "Terminal URL not configured", code: "TERMINAL_MISCONFIGURED" },
          { status: 500 }
        )
      }

      const secret = process.env.TERMINAL_GATEWAY_JWT_SECRET
      if (!secret || secret.length < 16) {
        logger.error({ timeIst: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) }, "TERMINAL_GATEWAY_JWT_SECRET missing or too short")
        return NextResponse.json(
          { success: false, error: "Terminal auth not configured", code: "TERMINAL_MISCONFIGURED" },
          { status: 500 }
        )
      }

      const sessionId = randomUUID()
      const jti = randomUUID()
      const user = session.user as { id?: string; email?: string; clientId?: string; name?: string }
      const sub = user.id
      if (!sub) {
        return NextResponse.json({ success: false, error: "Invalid session", code: "UNAUTHORIZED" }, { status: 401 })
      }

      const nowSec = Math.floor(Date.now() / 1000)
      const exp = nowSec + TOKEN_TTL_SEC
      const token = jwt.sign(
        {
          sub,
          role,
          sid: sessionId,
          jti,
          typ: "terminal_gateway",
        },
        secret,
        { algorithm: "HS256", expiresIn: TOKEN_TTL_SEC }
      )

      const requestId = req.headers.get("x-request-id") || undefined
      const ua = req.headers.get("user-agent") || undefined
      const xf = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()

      try {
        await prisma.tradingLog.create({
          data: {
            clientId: user.clientId || "ADMIN_OPS",
            userId: sub,
            level: "INFO",
            category: "SYSTEM",
            action: "ADMIN_TERMINAL_SESSION_ISSUED",
            message: `Admin terminal session token issued (${sessionId})`,
            details: { sessionId, jti } as object,
            metadata: { requestId, userAgent: ua, ip: xf || null } as object,
          },
        })
      } catch (e) {
        logger.warn({ err: e, sessionId }, "terminal session - audit log write failed")
      }

      logger.info({ userId: sub, sessionId, timeIst: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) }, "terminal session issued")

      return NextResponse.json({
        success: true,
        wsUrl,
        token,
        sessionId,
        expiresAt: new Date(exp * 1000).toISOString(),
        expiresInSec: TOKEN_TTL_SEC,
      })
    }
  )
}
