/**
 * @file admin-transactions-balance-after.ts
 * @module server
 * @description PostgreSQL-backed closing ledger balance after each Transaction (matches statement convention: CREDIT +amount, DEBIT −amount vs `trading_accounts.balance`).
 * @author StockTrade
 * @created 2026-03-31
 *
 * Notes:
 * - Requires PostgreSQL. Scans all `transactions` for each `tradingAccountId` present in the requested id set.
 */

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export async function fetchBalanceAfterByTransactionIds(transactionIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (transactionIds.length === 0) {
    return out
  }
  const idSql = Prisma.join(transactionIds.map((id) => Prisma.sql`${id}`))

  const rows = await prisma.$queryRaw<{ txn_id: string; balance_after: unknown }[]>`
    WITH accounts AS (
      SELECT DISTINCT "tradingAccountId" AS aid
      FROM transactions
      WHERE id IN (${idSql})
    ),
    effects AS (
      SELECT
        t.id,
        t."tradingAccountId",
        SUM(
          CASE WHEN t.type::text = 'CREDIT' THEN t.amount::numeric ELSE -t.amount::numeric END
        ) OVER (
          PARTITION BY t."tradingAccountId"
          ORDER BY t."createdAt" ASC, t.id ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cum_signed
      FROM transactions t
      WHERE t."tradingAccountId" IN (SELECT aid FROM accounts)
    ),
    totals AS (
      SELECT
        t."tradingAccountId",
        COALESCE(
          SUM(
            CASE WHEN t.type::text = 'CREDIT' THEN t.amount::numeric ELSE -t.amount::numeric END
          ),
          0
        ) AS total_signed
      FROM transactions t
      WHERE t."tradingAccountId" IN (SELECT aid FROM accounts)
      GROUP BY t."tradingAccountId"
    ),
    opening AS (
      SELECT
        ta.id AS "tradingAccountId",
        ta.balance::numeric - tot.total_signed AS opening
      FROM trading_accounts ta
      INNER JOIN totals tot ON tot."tradingAccountId" = ta.id
      WHERE ta.id IN (SELECT aid FROM accounts)
    )
    SELECT e.id AS txn_id, ROUND((o.opening + e.cum_signed)::numeric, 2) AS balance_after
    FROM effects e
    INNER JOIN opening o ON o."tradingAccountId" = e."tradingAccountId"
    WHERE e.id IN (${idSql})
  `

  for (const r of rows) {
    const n = parseFiniteMarketNumber(r.balance_after)
    if (n !== null) {
      out.set(r.txn_id, n)
    }
  }
  return out
}
