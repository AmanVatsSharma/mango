/**
 * File: tests/console/statements-feature-flag.test.ts
 * Module: console
 * Purpose: Verify global + per-user statements enablement resolution.
 * Author: StockTrade
 * Last-updated: 2026-02-03
 * Notes:
 * - Mocks Prisma SystemSettings reads to validate precedence rules.
 */

import { getEffectiveStatementsEnabledForUser, invalidateConsoleStatementsCache } from "@/lib/server/console-statements"

jest.mock("@/lib/prisma", () => {
  return {
    prisma: {
      systemSettings: {
        findFirst: jest.fn(),
      },
    },
  }
})

const prismaMock = jest.requireMock("@/lib/prisma").prisma as {
  systemSettings: { findFirst: jest.Mock }
}

describe("console statements feature flag", () => {
  beforeEach(() => {
    invalidateConsoleStatementsCache()
    prismaMock.systemSettings.findFirst.mockReset()
  })

  it("force_disable override wins over global", async () => {
    prismaMock.systemSettings.findFirst.mockImplementation(async (args: any) => {
      if (args?.where?.ownerId === "user-1") return { value: "force_disable" }
      if (args?.where?.ownerId === null) return { value: "true" }
      return null
    })

    const res = await getEffectiveStatementsEnabledForUser("user-1")
    expect(res.enabled).toBe(false)
    expect(res.source).toBe("override_force_disable")
  })

  it("force_enable override wins over global", async () => {
    prismaMock.systemSettings.findFirst.mockImplementation(async (args: any) => {
      if (args?.where?.ownerId === "user-1") return { value: "force_enable" }
      if (args?.where?.ownerId === null) return { value: "false" }
      return null
    })

    const res = await getEffectiveStatementsEnabledForUser("user-1")
    expect(res.enabled).toBe(true)
    expect(res.source).toBe("override_force_enable")
  })

  it("falls back to global when no override set", async () => {
    prismaMock.systemSettings.findFirst.mockImplementation(async (args: any) => {
      if (args?.where?.ownerId === "user-1") return null
      if (args?.where?.ownerId === null) return { value: "false" }
      return null
    })

    const res = await getEffectiveStatementsEnabledForUser("user-1")
    expect(res.enabled).toBe(false)
    expect(res.source).toBe("global")
  })

  it("defaults to enabled when global missing/invalid and no override", async () => {
    prismaMock.systemSettings.findFirst.mockImplementation(async (args: any) => {
      if (args?.where?.ownerId === "user-1") return null
      if (args?.where?.ownerId === null) return null
      return null
    })

    const res = await getEffectiveStatementsEnabledForUser("user-1")
    expect(res.enabled).toBe(true)
    // In this path the global reader emits default_enabled and user resolver reports source=global
    // (it means "follow global/default").
    expect(res.source).toBe("global")
  })
})

