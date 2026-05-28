/**
 * @file admin-contact-clusters.ts
 * @module server
 * @description SQL helpers for admin “contact clusters” (groups sharing normalized email or phone tail); optional RM book scope.
 * @author StockTrade
 * @created 2026-04-03
 * @updated 2026-04-03
 *
 * Notes:
 * - Select `client_id` (mapped column) AS `clientId` for API shape consistency.
 * - Moderator scope: duplicate keys are computed only among users assigned to that RM (matches overlap filter semantics).
 * - Do not log raw cluster keys in client-facing errors; use counts only.
 */

import type { PrismaClient } from "@prisma/client"

export type AdminContactClusterMemberRow = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  clientId: string | null
  createdAt: Date
  kycStatus: string | null
  clusterType: string
  clusterKey: string
}

export type AdminContactClusterApi = {
  clusterType: "email" | "phone"
  clusterKey: string
  members: {
    id: string
    name: string | null
    email: string | null
    phone: string | null
    clientId: string | null
    createdAt: string
    kycStatus: string
  }[]
}

export async function queryAdminContactClusterRows(
  prisma: PrismaClient,
  bookScopedRmId: string | null,
): Promise<AdminContactClusterMemberRow[]> {
  if (bookScopedRmId === null) {
    return prisma.$queryRaw<AdminContactClusterMemberRow[]>`
      SELECT u.id, u.name, u.email, u.phone, u."clientId" AS "clientId",
        u."createdAt" AS "createdAt",
        k.status AS "kycStatus",
        'email' AS "clusterType",
        lower(trim(u.email)) AS "clusterKey"
      FROM users u
      LEFT JOIN kyc k ON k."userId" = u.id
      INNER JOIN (
        SELECT lower(trim(email)) AS k
        FROM users
        WHERE email IS NOT NULL
        GROUP BY 1
        HAVING COUNT(*) > 1
      ) d ON d.k = lower(trim(u.email))
      WHERE u.email IS NOT NULL

      UNION ALL

      SELECT u.id, u.name, u.email, u.phone, u."client_id" AS "clientId",
        u."createdAt" AS "createdAt",
        k.status AS "kycStatus",
        'phone' AS "clusterType",
        right(regexp_replace(u.phone, '[^0-9]', '', 'g'), 10) AS "clusterKey"
      FROM users u
      LEFT JOIN kyc k ON k."userId" = u.id
      INNER JOIN (
        SELECT right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) AS k
        FROM users
        WHERE phone IS NOT NULL
          AND length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 10
        GROUP BY 1
        HAVING COUNT(*) > 1
      ) d ON d.k = right(regexp_replace(u.phone, '[^0-9]', '', 'g'), 10)
      WHERE u.phone IS NOT NULL
        AND length(regexp_replace(u.phone, '[^0-9]', '', 'g')) >= 10
      ORDER BY "clusterType", "clusterKey", "createdAt" DESC
    `
  }

  return prisma.$queryRaw<AdminContactClusterMemberRow[]>`
    SELECT u.id, u.name, u.email, u.phone, u."client_id" AS "clientId",
      u."createdAt" AS "createdAt",
      k.status AS "kycStatus",
      'email' AS "clusterType",
      lower(trim(u.email)) AS "clusterKey"
    FROM users u
    LEFT JOIN kyc k ON k."userId" = u.id
    INNER JOIN (
      SELECT lower(trim(email)) AS k
      FROM users
      WHERE email IS NOT NULL AND "managedById" = ${bookScopedRmId}
      GROUP BY 1
      HAVING COUNT(*) > 1
    ) d ON d.k = lower(trim(u.email))
    WHERE u.email IS NOT NULL AND u."managedById" = ${bookScopedRmId}

    UNION ALL

    SELECT u.id, u.name, u.email, u.phone, u."client_id" AS "clientId",
      u."createdAt" AS "createdAt",
      k.status AS "kycStatus",
      'phone' AS "clusterType",
      right(regexp_replace(u.phone, '[^0-9]', '', 'g'), 10) AS "clusterKey"
    FROM users u
    LEFT JOIN kyc k ON k."userId" = u.id
    INNER JOIN (
      SELECT right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) AS k
      FROM users
      WHERE phone IS NOT NULL
        AND length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 10
        AND "managedById" = ${bookScopedRmId}
      GROUP BY 1
      HAVING COUNT(*) > 1
    ) d ON d.k = right(regexp_replace(u.phone, '[^0-9]', '', 'g'), 10)
    WHERE u.phone IS NOT NULL
      AND length(regexp_replace(u.phone, '[^0-9]', '', 'g')) >= 10
      AND u."managedById" = ${bookScopedRmId}
    ORDER BY "clusterType", "clusterKey", "createdAt" DESC
  `
}

export function buildAdminContactClustersFromRows(rows: AdminContactClusterMemberRow[]): AdminContactClusterApi[] {
  const map = new Map<string, AdminContactClusterMemberRow[]>()
  for (const r of rows) {
    const composite = `${r.clusterType}:${r.clusterKey}`
    const list = map.get(composite) ?? []
    list.push(r)
    map.set(composite, list)
  }
  const out: AdminContactClusterApi[] = []
  for (const [, members] of Array.from(map)) {
    if (!members.length) continue
    const head = members[0]
    out.push({
      clusterType: head.clusterType === "phone" ? "phone" : "email",
      clusterKey: head.clusterKey,
      members: members.map((m: AdminContactClusterMemberRow) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        phone: m.phone,
        clientId: m.clientId,
        createdAt: m.createdAt.toISOString(),
        kycStatus: m.kycStatus ?? "NOT_SUBMITTED",
      })),
    })
  }
  out.sort((a, b) => {
    const byT = a.clusterType.localeCompare(b.clusterType)
    if (byT !== 0) return byT
    return a.clusterKey.localeCompare(b.clusterKey)
  })
  return out
}
