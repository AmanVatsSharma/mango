/**
 * File:        app/api/account/demo/route.ts
 * Module:      Account — Demo Account Creation
 * Purpose:     POST endpoint for users to self-create a single demo trading account
 *              with a tiered virtual balance.
 *
 * Exports:
 *   - POST — create demo account
 *
 * Depends on:
 *   - @/lib/prisma                — TradingAccount write
 *   - @/lib/server/trading-access — requireAuthenticatedUserId
 *   - @/lib/constants/demo-tiers  — DEMO_ACCOUNT_TIERS, isValidDemoTier
 *   - @/auth                      — auth session, auth.update()
 *
 * Side-effects:
 *   - DB write: creates one TradingAccount row
 *   - Session update: calls auth.update() to stamp demoTradingAccountId in JWT
 *
 * Key invariants:
 *   - Only one DEMO account per user (Prisma unique constraint + explicit check)
 *   - Virtual balance seeded from tier; no real funds
 *
 * Read order:
 *   1. POST — handler entry point
 *   2. createDemoAccount — core logic (inline)
 *
 * Author:      Claude
 * Last-updated: 2026-05-14
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { DEMO_ACCOUNT_TIERS, isValidDemoTier } from "@/lib/constants/demo-tiers"
import { headers } from "next/headers"

// decode imported directly here and used inline to allow tests to mock the whole module
import { decode } from "@auth/jose"

export const POST = async (req: NextRequest) => {
  // Get userId from session or Bearer token
  let userId: string | null = null

  // Try session auth first
  try {
    const session = await auth()
    userId = (session?.user as { id?: string } | undefined)?.id ?? null
  } catch {
    /* continue to try bearer */
  }

  // Try Bearer token (for API calls from web)
  if (!userId) {
    try {
      const reqHeaders = await headers()
      const authHeader = reqHeaders.get("authorization")
      if (authHeader?.startsWith("Bearer ")) {
        const bearerToken = authHeader.slice(7)
        const secret = process.env.NEXTAUTH_SECRET
        if (secret && bearerToken) {
          const decoded = await decode({ token: bearerToken, secret, salt: "authjs.session-token" }).catch(() => null)
          userId = (decoded as { id?: string } | null)?.id ?? decoded?.sub ?? null
        }
      }
    } catch {
      /* continue */
    }
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Parse tier from request body — default ₹10 Lakh
  let tierValue = "1000000"
  try {
    const body = await req.json().catch(() => ({}))
    if (body?.tier && isValidDemoTier(String(body.tier))) {
      tierValue = String(body.tier)
    }
  } catch {
    /* use default */
  }

  const tier = DEMO_ACCOUNT_TIERS.find((t) => t.value === tierValue) ?? DEMO_ACCOUNT_TIERS[1]

  // Check for existing demo account
  let existing: { id: string } | null = null
  try {
    existing = await prisma.tradingAccount.findFirst({
      where: { userId, accountType: "DEMO" },
      select: { id: true },
    })
  } catch (err) {
    console.error("[demo-account] Check existing failed:", err)
    return NextResponse.json({ error: "Database error checking existing account" }, { status: 500 })
  }
  if (existing) {
    return NextResponse.json(
      { error: "Demo account already exists", code: "DEMO_EXISTS" },
      { status: 409 }
    )
  }

  // Create demo account
  let demoAccount
  try {
    demoAccount = await prisma.tradingAccount.create({
      data: {
        userId,
        accountType: "DEMO",
        balance: tier.amount,
        availableMargin: tier.amount,
        usedMargin: 0,
      },
    })
  } catch (err) {
    console.error("[demo-account] Create failed:", err)
    return NextResponse.json({ error: "Failed to create demo account", details: String(err) }, { status: 500 })
  }
  // Stamp demoTradingAccountId in JWT via _pendingUpdate — the jwt callback
  // picks this up on the next token refresh and applies it to the session.
  // In NextAuth v5 beta, we set a cookie that the jwt callback reads on the next request.
  const response = NextResponse.json(
    {
      id: demoAccount.id,
      accountType: "DEMO",
      balance: demoAccount.balance,
      availableMargin: demoAccount.availableMargin,
      createdAt: demoAccount.createdAt,
    },
    { status: 201 }
  )

  // Set a cookie that the JWT callback reads to stamp the session
  response.cookies.set("demoAccountPending", JSON.stringify({
    demoTradingAccountId: demoAccount.id,
    accountType: "DEMO",
  }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60, // 60 seconds to apply on next request
  })

  return response
}
