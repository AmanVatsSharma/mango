/**
 * @file statement-fetch-batch.test.ts
 * @module tests/trading
 * @description Unit tests for batched statement row fetch reconciliation.
 * @author StockTrade
 * @created 2026-03-30
 */

import { fetchAllOrderedRows, STATEMENT_BATCH_SIZE } from "@/lib/services/statement/statement-fetch-batch"

describe("fetchAllOrderedRows", () => {
  it("returns all rows when batches match declared count", async () => {
    const mk = (i: number) => ({ id: `id-${i}` })
    const fetchBatch = jest.fn(async (skip: number, take: number) => {
      const out: { id: string }[] = []
      for (let i = 0; i < take && skip + i < 503; i++) {
        out.push(mk(skip + i))
      }
      return out
    })
    const rows = await fetchAllOrderedRows(503, fetchBatch, "test")
    expect(rows).toHaveLength(503)
    expect(fetchBatch.mock.calls.length).toBe(2)
    expect(fetchBatch.mock.calls[0]).toEqual([0, STATEMENT_BATCH_SIZE])
    expect(fetchBatch.mock.calls[1]).toEqual([STATEMENT_BATCH_SIZE, STATEMENT_BATCH_SIZE])
  })

  it("throws when batch fetch stalls early", async () => {
    const fetchBatch = jest.fn(async () => [])
    await expect(fetchAllOrderedRows(10, fetchBatch, "stall")).rejects.toThrow(/stalled/)
  })

  it("throws when total fetched differs from count", async () => {
    const fetchBatch = jest.fn(async (skip: number) => {
      if (skip === 0) return [{ id: "a" }, { id: "b" }, { id: "c" }]
      return []
    })
    await expect(fetchAllOrderedRows(2, fetchBatch, "mismatch")).rejects.toThrow(/count mismatch/)
  })
})
