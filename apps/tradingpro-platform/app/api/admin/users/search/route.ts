/**
 * File:        app/api/admin/users/search/route.ts
 * Module:      Admin Console · Users · Search
 * Purpose:     Lightweight typeahead search over users by name, email, or clientId.
 *              Returns at most 10 results for the given query string.
 *
 * Exports:
 *   - GET(req) → NextResponse  — returns { users: UserSearchResult[] }
 *
 * Depends on:
 *   - @/lib/rbac/admin-api   — auth guard requiring admin.users.read
 *   - @/lib/prisma           — Prisma client for user lookup
 *
 * Side-effects:
 *   - DB read: prisma.user.findMany (case-insensitive contains, limit 10)
 *
 * Key invariants:
 *   - Query must be ≥ 2 characters; shorter queries return an empty list immediately
 *   - Only id, name, email, clientId, phone are returned — never passwords or tokens
 *
 * Read order:
 *   1. GET handler — entry point and query validation
 *   2. searchUsers — DB query helper
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"

const SEARCH_LIMIT = 10
const MIN_QUERY_LENGTH = 2

type UserSearchResult = {
  id: string
  name: string | null
  email: string | null
  clientId: string | null
  phone: string | null
}

async function searchUsers(q: string): Promise<UserSearchResult[]> {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { clientId: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      clientId: true,
      phone: true,
    },
    take: SEARCH_LIMIT,
    orderBy: { name: "asc" },
  })
  return users
}

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/users/search",
      required: "admin.users.read",
      fallbackMessage: "Failed to search users",
    },
    async (ctx) => {
      const { searchParams } = new URL(req.url)
      const q = (searchParams.get("q") ?? "").trim()

      if (q.length < MIN_QUERY_LENGTH) {
        return NextResponse.json({ users: [] }, { status: 200 })
      }

      ctx.logger.debug({ queryLength: q.length }, "GET /api/admin/users/search")

      const users = await searchUsers(q)

      ctx.logger.debug({ count: users.length }, "GET /api/admin/users/search - results")

      return NextResponse.json({ users }, { status: 200 })
    }
  )
}
