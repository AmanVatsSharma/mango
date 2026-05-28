/**
 * @file step-up.ts
 * @module session-security
 * @description Create and consume SessionSecurityStepUpChallenge rows for STEP_UP policy logins.
 * @author StockTrade
 * @created 2026-03-28
 */

import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"

const CHALLENGE_TTL_MS = 15 * 60 * 1000

export async function createSessionSecurityStepUpChallenge(args: {
  userId: string
  networkKey: string
}): Promise<string> {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS)
  const row = await prisma.sessionSecurityStepUpChallenge.create({
    data: {
      userId: args.userId,
      networkKey: args.networkKey,
      expiresAt,
    },
  })
  return row.id
}

export async function consumeSessionSecurityStepUpWithMpin(args: {
  challengeId: string
  userId: string
  mPinPlain: string
}): Promise<{ ok: true } | { ok: false; reason: "not_found" | "expired" | "consumed" | "bad_mpin" }> {
  const row = await prisma.sessionSecurityStepUpChallenge.findFirst({
    where: { id: args.challengeId, userId: args.userId },
  })
  if (!row) return { ok: false, reason: "not_found" }
  if (row.consumedAt) return { ok: false, reason: "consumed" }
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" }

  const user = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { mPin: true },
  })
  if (!user?.mPin) return { ok: false, reason: "bad_mpin" }

  const match = await bcrypt.compare(args.mPinPlain, user.mPin)
  if (!match) return { ok: false, reason: "bad_mpin" }

  await prisma.sessionSecurityStepUpChallenge.update({
    where: { id: row.id },
    data: { consumedAt: new Date() },
  })
  return { ok: true }
}
