/**
 * @file route.ts
 * @module api/ready/session
 * @description Node-only guard: confirms JWT session has a real user and is not in session-security step-up (mirrors TradeBazaar /api/ready/session).
 * @author StockTrade
 * @created 2026-03-28
 */

import { NextResponse } from "next/server"
import { auth } from "@/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await auth()
  const user = session?.user as
    | {
        id?: string
        sessionSecurityStepUpPending?: boolean
        sessionSecurityStepUpChallengeId?: string
      }
    | undefined

  if (!user?.id) {
    return NextResponse.json({ ready: false, code: "UNAUTHORIZED" }, { status: 401 })
  }

  if (user.sessionSecurityStepUpPending) {
    return NextResponse.json(
      {
        ready: false,
        code: "SESSION_SECURITY_STEP_UP",
        challengeId: user.sessionSecurityStepUpChallengeId,
      },
      { status: 403 },
    )
  }

  return NextResponse.json({ ready: true, userId: user.id })
}
