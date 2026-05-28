/**
 * @file tests/workers/worker-run-lock.test.ts
 * @module tests-workers
 * @description Unit tests for DB-backed worker run lock helper.
 * @author StockTrade
 * @created 2026-02-15
 */

let latestRow: { id: string; value: string } | null = null

const findFirstMock = jest.fn(async () => latestRow)
const updateMock = jest.fn(async (args: any) => {
  latestRow = { id: args.where.id, value: args.data.value }
  return latestRow
})
const updateManyMock = jest.fn(async () => ({}))
const createMock = jest.fn(async (args: any) => {
  latestRow = { id: "lock-row-1", value: args.data.value }
  return latestRow
})
const executeRawMock = jest.fn(async () => 1)

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(async (fn: any) =>
      fn({
        $executeRaw: executeRawMock,
        systemSettings: {
          findFirst: findFirstMock,
          update: updateMock,
          updateMany: updateManyMock,
          create: createMock,
        },
      }),
    ),
  },
}))

import { releaseWorkerRunLock, tryAcquireWorkerRunLock } from "@/lib/server/workers/worker-run-lock"

describe("worker-run-lock", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    latestRow = null
  })

  it("acquires lock when no active lock exists", async () => {
    const lock = await tryAcquireWorkerRunLock({ workerId: "position_pnl", ttlMs: 60_000 })
    expect(lock.acquired).toBe(true)
    expect(createMock).toHaveBeenCalled()
    expect(executeRawMock).toHaveBeenCalled()
  })

  it("normalizes empty worker ids to a stable unknown lock key", async () => {
    const lock = await tryAcquireWorkerRunLock({ workerId: "   ", ttlMs: 60_000 })
    expect(lock.acquired).toBe(true)
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key: "worker_run_lock_unknown",
        }),
      }),
    )
    expect(lock.key).toBe("worker_run_lock_unknown")
  })

  it("normalizes worker ids with special characters into safe keys", async () => {
    const lock = await tryAcquireWorkerRunLock({ workerId: "  Risk Monitoring@Prod#01  ", ttlMs: 60_000 })
    expect(lock.acquired).toBe(true)
    expect(lock.key).toBe("worker_run_lock_risk_monitoring_prod_01")
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key: "worker_run_lock_risk_monitoring_prod_01",
        }),
      }),
    )
  })

  it("truncates oversized worker ids to a bounded lock key length", async () => {
    const longWorkerId = `risk_${"x".repeat(300)}`
    const lock = await tryAcquireWorkerRunLock({ workerId: longWorkerId, ttlMs: 60_000 })
    expect(lock.acquired).toBe(true)
    expect(lock.key.length).toBeLessThanOrEqual("worker_run_lock_".length + 96)
  })

  it("normalizes invalid ttl values to minimum safe lease duration", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1_000_000)
    const lock = await tryAcquireWorkerRunLock({ workerId: "position_pnl", ttlMs: Number.NaN })
    expect(lock.acquired).toBe(true)
    expect(lock.expiresAtMs).toBe(1_005_000)
    nowSpy.mockRestore()
  })

  it("handles symbol ttl input without throwing and falls back safely", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1_500_000)
    const lock = await tryAcquireWorkerRunLock({ workerId: "position_pnl", ttlMs: Symbol("ttl") as any })
    expect(lock.acquired).toBe(true)
    expect(lock.expiresAtMs).toBe(1_505_000)
    nowSpy.mockRestore()
  })

  it("normalizes oversized ttl values to maximum safe lease duration", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(2_000_000)
    const lock = await tryAcquireWorkerRunLock({ workerId: "position_pnl", ttlMs: 365 * 24 * 60 * 60 * 1000 })
    expect(lock.acquired).toBe(true)
    expect(lock.expiresAtMs).toBe(2_000_000 + 86_400_000)
    nowSpy.mockRestore()
  })

  it("handles malformed acquire input payloads without throwing", async () => {
    const lock = await tryAcquireWorkerRunLock(undefined as any)
    expect(lock.acquired).toBe(true)
    expect(lock.key).toBe("worker_run_lock_unknown")
    expect(lock.expiresAtMs).toBeGreaterThan(Date.now())
  })

  it("returns locked when active lock exists", async () => {
    latestRow = {
      id: "lock-row-1",
      value: JSON.stringify({
        ownerToken: "other-owner",
        acquiredAtMs: Date.now() - 1000,
        expiresAtMs: Date.now() + 60_000,
      }),
    }

    const lock = await tryAcquireWorkerRunLock({ workerId: "position_pnl", ttlMs: 60_000 })
    expect(lock.acquired).toBe(false)
    expect(lock.reason).toBe("locked")
    expect(updateMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
  })

  it("treats numeric-string lock timestamps as active lock metadata", async () => {
    latestRow = {
      id: "lock-row-1",
      value: JSON.stringify({
        ownerToken: "other-owner",
        acquiredAtMs: String(Date.now() - 1000),
        expiresAtMs: String(Date.now() + 60_000),
      }),
    }

    const lock = await tryAcquireWorkerRunLock({ workerId: "position_pnl", ttlMs: 60_000 })
    expect(lock.acquired).toBe(false)
    expect(lock.reason).toBe("locked")
    expect(updateMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
  })

  it("treats ISO-string lock timestamps as active lock metadata", async () => {
    latestRow = {
      id: "lock-row-1",
      value: JSON.stringify({
        ownerToken: "other-owner",
        acquiredAtMs: new Date(Date.now() - 1_000).toISOString(),
        expiresAtMs: new Date(Date.now() + 60_000).toISOString(),
      }),
    }

    const lock = await tryAcquireWorkerRunLock({ workerId: "position_pnl", ttlMs: 60_000 })
    expect(lock.acquired).toBe(false)
    expect(lock.reason).toBe("locked")
    expect(updateMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
  })

  it("treats nested lock payload wrappers as active lock metadata", async () => {
    latestRow = {
      id: "lock-row-1",
      value: JSON.stringify({
        lock: {
          ownerToken: "other-owner",
          acquiredAtMs: Date.now() - 1_000,
          expiresAtMs: Date.now() + 60_000,
        },
        source: "legacy-wrapper",
      }),
    }

    const lock = await tryAcquireWorkerRunLock({ workerId: "position_pnl", ttlMs: 60_000 })
    expect(lock.acquired).toBe(false)
    expect(lock.reason).toBe("locked")
    expect(updateMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
  })

  it("treats alias lock timestamp fields as active lock metadata", async () => {
    latestRow = {
      id: "lock-row-1",
      value: JSON.stringify({
        payload: {
          owner: "other-owner",
          acquiredAt: new Date(Date.now() - 1_000).toISOString(),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      }),
    }

    const lock = await tryAcquireWorkerRunLock({ workerId: "position_pnl", ttlMs: 60_000 })
    expect(lock.acquired).toBe(false)
    expect(lock.reason).toBe("locked")
    expect(updateMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
  })

  it("falls back to alias lock fields when primary fields are malformed", async () => {
    latestRow = {
      id: "lock-row-1",
      value: JSON.stringify({
        payload: {
          ownerToken: 42,
          owner: "other-owner",
          acquiredAtMs: "not-a-number",
          acquiredAt: new Date(Date.now() - 1_000).toISOString(),
          expiresAtMs: "bad-value",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      }),
    }

    const lock = await tryAcquireWorkerRunLock({ workerId: "position_pnl", ttlMs: 60_000 })
    expect(lock.acquired).toBe(false)
    expect(lock.reason).toBe("locked")
    expect(updateMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
  })

  it("falls back to payload wrapper when lock wrapper fields are malformed", async () => {
    latestRow = {
      id: "lock-row-1",
      value: JSON.stringify({
        lock: {
          ownerToken: 123,
          acquiredAtMs: "not-a-number",
          expiresAtMs: "still-bad",
        },
        payload: {
          owner: "other-owner",
          acquiredAt: new Date(Date.now() - 1_000).toISOString(),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      }),
    }

    const lock = await tryAcquireWorkerRunLock({ workerId: "position_pnl", ttlMs: 60_000 })
    expect(lock.acquired).toBe(false)
    expect(lock.reason).toBe("locked")
    expect(updateMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
  })

  it("acquires lock when existing lock is expired", async () => {
    latestRow = {
      id: "lock-row-1",
      value: JSON.stringify({
        ownerToken: "expired-owner",
        acquiredAtMs: Date.now() - 120_000,
        expiresAtMs: Date.now() - 1_000,
      }),
    }

    const lock = await tryAcquireWorkerRunLock({ workerId: "position_pnl", ttlMs: 60_000 })
    expect(lock.acquired).toBe(true)
    expect(updateMock).toHaveBeenCalled()
  })

  it("acquires lock when existing row has malformed value", async () => {
    latestRow = {
      id: "lock-row-1",
      value: "{malformed-json",
    }

    const lock = await tryAcquireWorkerRunLock({ workerId: "position_pnl", ttlMs: 60_000 })
    expect(lock.acquired).toBe(true)
    expect(updateMock).toHaveBeenCalled()
  })

  it("acquires lock when existing row has non-numeric timestamp strings", async () => {
    latestRow = {
      id: "lock-row-1",
      value: JSON.stringify({
        ownerToken: "broken-owner",
        acquiredAtMs: "not-a-number",
        expiresAtMs: "also-bad",
      }),
    }

    const lock = await tryAcquireWorkerRunLock({ workerId: "position_pnl", ttlMs: 60_000 })
    expect(lock.acquired).toBe(true)
    expect(updateMock).toHaveBeenCalled()
  })

  it("releases lock only for matching owner token", async () => {
    const lock = await tryAcquireWorkerRunLock({ workerId: "risk_monitoring", ttlMs: 60_000 })
    expect(lock.acquired).toBe(true)

    await releaseWorkerRunLock(lock)
    expect(updateMock).toHaveBeenCalled()

    const releasedValue = JSON.parse(latestRow?.value || "{}")
    expect(typeof releasedValue.releasedAtMs).toBe("number")
    expect(releasedValue.expiresAtMs).toBeLessThan(Date.now())
  })

  it("releases lock when key/owner token contain surrounding whitespace", async () => {
    const lock = await tryAcquireWorkerRunLock({ workerId: "risk_monitoring", ttlMs: 60_000 })
    expect(lock.acquired).toBe(true)

    await releaseWorkerRunLock({
      ...lock,
      key: `  ${lock.key}  `,
      ownerToken: ` ${lock.ownerToken} `,
    })

    expect(updateMock).toHaveBeenCalled()
    const releasedValue = JSON.parse(latestRow?.value || "{}")
    expect(typeof releasedValue.releasedAtMs).toBe("number")
  })

  it("skips release for malformed lock keys", async () => {
    await releaseWorkerRunLock({
      acquired: true,
      key: "   ",
      ownerToken: "owner",
      expiresAtMs: Date.now() + 60_000,
    })
    expect(executeRawMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it("skips release for malformed owner tokens", async () => {
    await releaseWorkerRunLock({
      acquired: true,
      key: "worker_run_lock_risk_monitoring",
      ownerToken: "   ",
      expiresAtMs: Date.now() + 60_000,
    })
    expect(executeRawMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })
})

