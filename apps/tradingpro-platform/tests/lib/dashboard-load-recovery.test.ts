/**
 * @file dashboard-load-recovery.test.ts
 * @module tests/lib
 * @description Unit tests for dashboard load recovery sessionStorage cap logic.
 * @author StockTrade
 * @created 2026-03-30
 */

import {
  clearDashboardLoadRecoveryCounter,
  DASHBOARD_LOAD_RECOVERY_MAX_ATTEMPTS,
  prepareDashboardLoadRecoveryReload,
} from "@/lib/navigation/dashboard-load-recovery"

describe("dashboard-load-recovery", () => {
  const key = "dashboard-load-recovery-v1"
  let mem: Record<string, string>

  beforeEach(() => {
    mem = {}
    const sessionStorageMock = {
      getItem: (k: string) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
      setItem: (k: string, v: string) => {
        mem[k] = v
      },
      removeItem: (k: string) => {
        delete mem[k]
      },
      clear: () => {
        mem = {}
      },
    }
    ;(globalThis as unknown as { window: object }).window = {
      sessionStorage: sessionStorageMock,
    }
  })

  afterEach(() => {
    delete (globalThis as unknown as { window?: object }).window
  })

  it("allows reload until max attempts then gives up", () => {
    expect(prepareDashboardLoadRecoveryReload()).toBe("reload")
    expect(mem[key]).toBe("1")
    expect(prepareDashboardLoadRecoveryReload()).toBe("reload")
    expect(mem[key]).toBe("2")
    expect(prepareDashboardLoadRecoveryReload()).toBe("reload")
    expect(mem[key]).toBe("3")
    expect(prepareDashboardLoadRecoveryReload()).toBe("give_up")
    expect(mem[key]).toBe("3")
  })

  it("clearDashboardLoadRecoveryCounter resets counter", () => {
    prepareDashboardLoadRecoveryReload()
    clearDashboardLoadRecoveryCounter()
    expect(mem[key]).toBeUndefined()
  })

  it("max attempts matches exported constant", () => {
    for (let i = 0; i < DASHBOARD_LOAD_RECOVERY_MAX_ATTEMPTS; i += 1) {
      expect(prepareDashboardLoadRecoveryReload()).toBe("reload")
    }
    expect(prepareDashboardLoadRecoveryReload()).toBe("give_up")
  })
})
