/**
 * @file statement-fetch-batch.ts
 * @module statement
 * @description Batched Prisma reads with strict count-vs-fetched reconciliation for statement exports.
 * @author StockTrade
 * @created 2026-03-30
 */

export const STATEMENT_BATCH_SIZE = 500

export async function fetchAllOrderedRows<T extends { id: string }>(
  count: number,
  fetchBatch: (skip: number, take: number) => Promise<T[]>,
  label: string,
): Promise<T[]> {
  if (count === 0) return []
  const rows: T[] = []
  let skip = 0
  while (skip < count) {
    const batch = await fetchBatch(skip, STATEMENT_BATCH_SIZE)
    rows.push(...batch)
    if (batch.length === 0) {
      throw new Error(`StatementAggregation: ${label} fetch stalled at skip=${skip} (expected ${count} rows)`)
    }
    skip += batch.length
  }
  if (rows.length !== count) {
    throw new Error(`StatementAggregation: ${label} count mismatch (db count=${count}, fetched=${rows.length})`)
  }
  return rows
}
