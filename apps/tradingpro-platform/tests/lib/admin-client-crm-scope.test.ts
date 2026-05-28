/**
 * @file admin-client-crm-scope.test.ts
 * @module tests-lib
 * @description Unit tests for client CRM book-scope guard (MODERATOR vs ADMIN).
 * @author StockTrade
 * @created 2026-04-07
 */

const findUniqueMock = jest.fn()

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
    },
  },
}))

import { assertAdminCanManageClientCrm } from "@/lib/server/admin-client-crm-scope"

describe("assertAdminCanManageClientCrm", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("returns 404 when user missing", async () => {
    findUniqueMock.mockResolvedValue(null)
    await expect(
      assertAdminCanManageClientCrm({
        actorRole: "ADMIN",
        actorUserId: "admin-1",
        targetUserId: "missing",
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it("returns 403 when target is not an end client", async () => {
    findUniqueMock.mockResolvedValue({ id: "m1", role: "MODERATOR", managedById: null })
    await expect(
      assertAdminCanManageClientCrm({
        actorRole: "ADMIN",
        actorUserId: "admin-1",
        targetUserId: "m1",
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" })
  })

  it("denies MODERATOR for client outside their book", async () => {
    findUniqueMock.mockResolvedValue({ id: "c1", role: "USER", managedById: "other-rm" })
    await expect(
      assertAdminCanManageClientCrm({
        actorRole: "MODERATOR",
        actorUserId: "rm-1",
        targetUserId: "c1",
      }),
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it("allows MODERATOR for assigned book client", async () => {
    findUniqueMock.mockResolvedValue({ id: "c1", role: "USER", managedById: "rm-1" })
    await expect(
      assertAdminCanManageClientCrm({
        actorRole: "MODERATOR",
        actorUserId: "rm-1",
        targetUserId: "c1",
      }),
    ).resolves.toBeUndefined()
  })

  it("allows ADMIN without managedBy match", async () => {
    findUniqueMock.mockResolvedValue({ id: "c1", role: "USER", managedById: "rm-99" })
    await expect(
      assertAdminCanManageClientCrm({
        actorRole: "ADMIN",
        actorUserId: "admin-1",
        targetUserId: "c1",
      }),
    ).resolves.toBeUndefined()
  })
})
