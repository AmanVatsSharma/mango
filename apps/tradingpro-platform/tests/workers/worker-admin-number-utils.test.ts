/**
 * @file tests/workers/worker-admin-number-utils.test.ts
 * @module tests-workers
 * @description Unit tests for workers admin console numeric formatting and run-once parameter normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  formatWorkerAdminDurationMs,
  formatWorkerAdminNumber,
  normalizeOrderWorkerRunOnceParams,
  normalizePositionWorkerRunOnceParams,
} from "@/components/admin-console/worker-admin-number-utils"

describe("worker-admin-number-utils", () => {
  it("formats worker numbers and elapsed durations safely", () => {
    expect(formatWorkerAdminNumber("42")).toBe("42")
    expect(formatWorkerAdminNumber("Infinity")).toBe("—")
    expect(formatWorkerAdminDurationMs("250")).toBe("250 ms")
    expect(formatWorkerAdminDurationMs("2500")).toBe("2.50 s")
    expect(formatWorkerAdminDurationMs("-1")).toBe("—")
  })

  it("normalizes order-worker run-once params with strict bounds", () => {
    expect(normalizeOrderWorkerRunOnceParams({ limit: "250", maxAgeMs: "-100" })).toEqual({
      limit: 200,
      maxAgeMs: 0,
    })
    expect(normalizeOrderWorkerRunOnceParams({ limit: "abc", maxAgeMs: "abc" })).toEqual({
      limit: 25,
      maxAgeMs: 0,
    })
  })

  it("normalizes position-worker run-once params with finite guardrails", () => {
    expect(
      normalizePositionWorkerRunOnceParams({
        limit: "5000",
        updateThreshold: "-2",
        dryRun: true,
      }),
    ).toEqual({
      limit: 2000,
      updateThreshold: 0,
      dryRun: true,
    })
    expect(
      normalizePositionWorkerRunOnceParams({
        limit: "abc",
        updateThreshold: "Infinity",
        dryRun: 0,
      }),
    ).toEqual({
      limit: 500,
      updateThreshold: 1,
      dryRun: false,
    })
  })
})
