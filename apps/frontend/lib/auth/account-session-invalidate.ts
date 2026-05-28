/**
 * @file account-session-invalidate.ts
 * @module auth
 * @description Revoke registry JWTs, NextAuth DB sessions, and mobile SessionAuth rows for a user.
 * @author StockTrade
 * @created 2026-04-01
 */

import { prisma } from "@/lib/prisma"
import { revokeAllSessionsForUser } from "@/lib/session-security/registry"

export async function invalidateAllLoginSessionsForUser(userId: string): Promise<void> {
  await revokeAllSessionsForUser(userId)
  await prisma.session.deleteMany({ where: { userId } })
  await prisma.sessionAuth.deleteMany({ where: { userId } })
}
