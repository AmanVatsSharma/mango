/**
 * @file app/api/affiliate/auth/login/route.ts
 * @module api/affiliate/auth
 * @description Affiliate self-service login — separate auth boundary from trader auth.
 *              SCAFFOLD ONLY for Phase 11. Validates code+password against the Affiliate
 *              table; on success returns the affiliate id + tier (no session yet).
 *
 *              Phase 11.5 wires:
 *                - Real session (separate JWT/cookie distinct from trader session)
 *                - 2FA enrolment using totpSecretHash
 *                - Rate limiting + lockout
 *                - Self-service password reset via email
 *                - The /affiliate/* dashboard route group
 *
 *              Until Phase 11.5: this endpoint is documentation + correctness check only.
 *              Public traffic should not depend on it.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

interface Body {
  affiliateCode?: string
  password?: string
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null
  if (!body?.affiliateCode || !body.password) {
    return NextResponse.json(
      { success: false, message: "affiliateCode and password are required" },
      { status: 400 },
    )
  }

  const aff = await prisma.affiliate.findUnique({
    where: { affiliateCode: body.affiliateCode.toUpperCase().trim() },
    select: {
      id: true,
      affiliateCode: true,
      name: true,
      tier: true,
      status: true,
      passwordHash: true,
    },
  })

  if (!aff || !aff.passwordHash) {
    // Same generic message regardless of "not found" vs "no password" — anti-enumeration.
    return NextResponse.json(
      { success: false, message: "invalid credentials" },
      { status: 401 },
    )
  }

  if (aff.status !== "ACTIVE") {
    return NextResponse.json(
      { success: false, message: `affiliate account is ${aff.status}` },
      { status: 403 },
    )
  }

  const ok = await bcrypt.compare(body.password, aff.passwordHash)
  if (!ok) {
    return NextResponse.json(
      { success: false, message: "invalid credentials" },
      { status: 401 },
    )
  }

  // Phase 11 — return identity only; no session cookie issued yet (that's Phase 11.5).
  return NextResponse.json({
    success: true,
    affiliate: {
      id: aff.id,
      affiliateCode: aff.affiliateCode,
      name: aff.name,
      tier: aff.tier,
    },
    note: "Session issuance + /affiliate/* dashboard land in Phase 11.5",
  })
}
