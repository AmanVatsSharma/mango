/**
 * @file admin-related-users.ts
 * @module server
 * @description Raw SQL helpers for admin “related accounts” by normalized email/phone; supports optional RM book scope.
 * @author StockTrade
 * @created 2026-04-03
 * @updated 2026-04-03
 *
 * Notes:
 * - `users.id` is TEXT; never cast ids to `::uuid` (non-UUID-shaped legacy ids break Postgres).
 * - `User.clientId` maps to column `client_id` — raw SQL must use `"client_id" AS "clientId"`.
 * - Logs should not include raw email/phone; callers pass requestId only at boundaries.
 * - Uses Prisma.sql for parameter binding (no string concatenation of user input).
 */

import type { PrismaClient } from "@prisma/client"
import { Prisma } from "@prisma/client"

export type AdminRelatedUserRow = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  clientId: string | null
  createdAt: Date
  kycStatus: string | null
}

export type AdminRelatedContactCounts = {
  relatedEmailCount: number
  relatedPhoneCount: number
}

/** IN-list for `users.id` (string/TEXT); no `::uuid` — legacy IDs may not be UUID-shaped. */
function userIdInClause(ids: string[]): Prisma.Sql {
  if (ids.length === 0) {
    return Prisma.sql`(SELECT NULL::text WHERE FALSE)`
  }
  return Prisma.join(ids.map((id) => Prisma.sql`${id}`))
}

/**
 * Users sharing normalized email or phone with `targetUserId`, excluding the target.
 * When `bookScopedRmId` is set, only users assigned to that RM are returned.
 */
export async function queryAdminRelatedUsers(
  prisma: PrismaClient,
  targetUserId: string,
  bookScopedRmId: string | null,
): Promise<AdminRelatedUserRow[]> {
  const scopeSql =
    bookScopedRmId === null
      ? Prisma.empty
      : Prisma.sql` AND u."managedById" = ${bookScopedRmId}`

  return prisma.$queryRaw<AdminRelatedUserRow[]>`
    SELECT
      u.id,
      u.name,
      u.email,
      u.phone,
      u."client_id" AS "clientId",
      u."createdAt" AS "createdAt",
      k.status AS "kycStatus"
    FROM users u
    LEFT JOIN kyc k ON k."userId" = u.id
    WHERE u.id <> ${targetUserId}
    ${scopeSql}
    AND (
      (
        EXISTS (
          SELECT 1 FROM users t
          WHERE t.id = ${targetUserId}
            AND t.email IS NOT NULL
            AND u.email IS NOT NULL
            AND lower(trim(t.email)) = lower(trim(u.email))
        )
      )
      OR (
        EXISTS (
          SELECT 1 FROM users t
          WHERE t.id = ${targetUserId}
            AND t.phone IS NOT NULL
            AND u.phone IS NOT NULL
            AND length(regexp_replace(t.phone, '[^0-9]', '', 'g')) >= 10
            AND length(regexp_replace(u.phone, '[^0-9]', '', 'g')) >= 10
            AND right(regexp_replace(t.phone, '[^0-9]', '', 'g'), 10)
              = right(regexp_replace(u.phone, '[^0-9]', '', 'g'), 10)
        )
      )
    )
    ORDER BY u."createdAt" DESC
  `
}

/**
 * Per-user related counts for list enrichment. Moderator scope counts only peers under the same RM.
 */
export async function batchAdminRelatedContactCounts(
  prisma: PrismaClient,
  userIds: string[],
  bookScopedRmId: string | null,
): Promise<Map<string, AdminRelatedContactCounts>> {
  const out = new Map<string, AdminRelatedContactCounts>()
  if (userIds.length === 0) {
    return out
  }
  for (const id of userIds) {
    out.set(id, { relatedEmailCount: 0, relatedPhoneCount: 0 })
  }

  const idList = userIdInClause(userIds)

  if (bookScopedRmId === null) {
    const rows = await prisma.$queryRaw<
      { id: string; relatedEmailCount: bigint; relatedPhoneCount: bigint }[]
    >`
      WITH page AS (
        SELECT u.id, u.email, u.phone
        FROM users u
        WHERE u.id IN (${idList})
      ),
      email_counts AS (
        SELECT lower(trim(email)) AS k, COUNT(*)::int AS c
        FROM users
        WHERE email IS NOT NULL
        GROUP BY 1
      ),
      phone_counts AS (
        SELECT
          right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) AS k,
          COUNT(*)::int AS c
        FROM users
        WHERE phone IS NOT NULL
          AND length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 10
        GROUP BY 1
      )
      SELECT
        p.id::text AS id,
        CASE
          WHEN p.email IS NULL THEN 0
          ELSE GREATEST(0, COALESCE(ec.c, 0) - 1)
        END AS "relatedEmailCount",
        CASE
          WHEN p.phone IS NULL
            OR length(regexp_replace(p.phone, '[^0-9]', '', 'g')) < 10
          THEN 0
          ELSE GREATEST(0, COALESCE(pc.c, 0) - 1)
        END AS "relatedPhoneCount"
      FROM page p
      LEFT JOIN email_counts ec
        ON p.email IS NOT NULL
        AND ec.k = lower(trim(p.email))
      LEFT JOIN phone_counts pc
        ON p.phone IS NOT NULL
        AND length(regexp_replace(p.phone, '[^0-9]', '', 'g')) >= 10
        AND pc.k = right(regexp_replace(p.phone, '[^0-9]', '', 'g'), 10)
    `

    for (const r of rows) {
      out.set(r.id, {
        relatedEmailCount: Number(r.relatedEmailCount),
        relatedPhoneCount: Number(r.relatedPhoneCount),
      })
    }
    return out
  }

  const rows = await prisma.$queryRaw<
    { id: string; relatedEmailCount: bigint; relatedPhoneCount: bigint }[]
  >`
    WITH page AS (
      SELECT u.id, u.email, u.phone
      FROM users u
      WHERE u.id IN (${idList})
        AND u."managedById" = ${bookScopedRmId}
    )
    SELECT
      p.id::text AS id,
      COALESCE(
        (
          SELECT COUNT(*)::int
          FROM users v
          WHERE v."managedById" = ${bookScopedRmId}
            AND v.id <> p.id
            AND p.email IS NOT NULL
            AND v.email IS NOT NULL
            AND lower(trim(v.email)) = lower(trim(p.email))
        ),
        0
      ) AS "relatedEmailCount",
      COALESCE(
        (
          SELECT COUNT(*)::int
          FROM users v
          WHERE v."managedById" = ${bookScopedRmId}
            AND v.id <> p.id
            AND p.phone IS NOT NULL
            AND v.phone IS NOT NULL
            AND length(regexp_replace(p.phone, '[^0-9]', '', 'g')) >= 10
            AND length(regexp_replace(v.phone, '[^0-9]', '', 'g')) >= 10
            AND right(regexp_replace(p.phone, '[^0-9]', '', 'g'), 10)
              = right(regexp_replace(v.phone, '[^0-9]', '', 'g'), 10)
        ),
        0
      ) AS "relatedPhoneCount"
    FROM page p
  `

  for (const r of rows) {
    out.set(r.id, {
      relatedEmailCount: Number(r.relatedEmailCount),
      relatedPhoneCount: Number(r.relatedPhoneCount),
    })
  }
  return out
}

/** User IDs that have at least one other account with overlapping normalized email or phone. */
export async function fetchAdminUserIdsWithContactOverlap(
  prisma: PrismaClient,
  bookScopedRmId: string | null,
): Promise<string[]> {
  const scopePeer =
    bookScopedRmId === null
      ? Prisma.empty
      : Prisma.sql` AND u2."managedById" = ${bookScopedRmId}`

  const whereManaged =
    bookScopedRmId === null
      ? Prisma.empty
      : Prisma.sql` AND u."managedById" = ${bookScopedRmId}`

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT u.id::text AS id
    FROM users u
    WHERE 1 = 1
    ${whereManaged}
    AND (
      EXISTS (
        SELECT 1 FROM users u2
        WHERE u2.id <> u.id
        ${scopePeer}
        AND u.email IS NOT NULL
        AND u2.email IS NOT NULL
        AND lower(trim(u2.email)) = lower(trim(u.email))
      )
      OR EXISTS (
        SELECT 1 FROM users u2
        WHERE u2.id <> u.id
        ${scopePeer}
        AND u.phone IS NOT NULL
        AND u2.phone IS NOT NULL
        AND length(regexp_replace(u.phone, '[^0-9]', '', 'g')) >= 10
        AND length(regexp_replace(u2.phone, '[^0-9]', '', 'g')) >= 10
        AND right(regexp_replace(u.phone, '[^0-9]', '', 'g'), 10)
          = right(regexp_replace(u2.phone, '[^0-9]', '', 'g'), 10)
      )
    )
  `
  return rows.map((r) => r.id)
}
