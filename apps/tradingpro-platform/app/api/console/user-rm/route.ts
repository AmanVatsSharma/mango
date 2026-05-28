/**
 * @file route.ts
 * @module console
 * @description API route for client-safe Relationship Manager details (policy-filtered).
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-03-27
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import { loadGlobalClientRmDisplayPolicy } from "@/lib/console/load-client-rm-display-policy"
import { resolveClientRmView } from "@/lib/types/rm-client-display"

/**
 * GET /api/console/user-rm
 * Returns resolved RM contact for the Account tab per global policy and RM public overrides.
 */
export async function GET() {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id

    const [policy, user] = await Promise.all([
      loadGlobalClientRmDisplayPolicy(),
      prisma.user.findUnique({
        where: { id: userId },
        include: {
          managedBy: {
            select: {
              name: true,
              email: true,
              phone: true,
              image: true,
              rmPublicContact: true,
            },
          },
        },
      }),
    ])

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const payload = resolveClientRmView({
      policy,
      managedBy: user.managedBy,
    })

    return NextResponse.json(payload)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch RM details"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
