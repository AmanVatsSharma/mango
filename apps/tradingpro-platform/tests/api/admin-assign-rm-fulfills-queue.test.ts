/**
 * @file admin-assign-rm-fulfills-queue.test.ts
 * @module tests-api
 * @description Ensures PATCH assign-rm fulfills pending RmAssignmentRequest rows.
 * @author StockTrade
 * @created 2026-03-28
 */

const findUniqueMock = jest.fn()
const updateUserMock = jest.fn()
const updateManyRequestsMock = jest.fn()

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      update: (...args: unknown[]) => updateUserMock(...args),
    },
    rmAssignmentRequest: {
      updateMany: (...args: unknown[]) => updateManyRequestsMock(...args),
    },
  },
}))

const assignCtx = {
  session: { user: { id: "admin-1" } },
  role: "SUPER_ADMIN",
  permissions: new Set(["admin.users.rm"]),
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}

jest.mock("@/lib/rbac/admin-api", () => ({
  handleAdminApi: async (_req: Request, _opts: unknown, handler: (ctx: typeof assignCtx) => Promise<Response>) =>
    handler(assignCtx),
}))

import { PATCH } from "@/app/api/admin/users/[userId]/assign-rm/route"

describe("PATCH /api/admin/users/[userId]/assign-rm — RM queue", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    findUniqueMock.mockImplementation((args: { where: { id: string } }) => {
      const id = args.where.id
      if (id === "client-1") return Promise.resolve({ id: "client-1", role: "USER", managedById: null })
      if (id === "rm-1")
        return Promise.resolve({ id: "rm-1", role: "MODERATOR", managedById: "admin-1" })
      return Promise.resolve(null)
    })
    updateUserMock.mockResolvedValue({
      id: "client-1",
      name: "C",
      email: "c@x.com",
      managedById: "rm-1",
      managedBy: { id: "rm-1", name: "RM", email: "rm@x.com", phone: null, clientId: null },
    })
    updateManyRequestsMock.mockResolvedValue({ count: 1 })
  })

  it("calls updateMany on pending requests when rmId is set", async () => {
    const req = new Request("http://localhost/api/admin/users/client-1/assign-rm", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rmId: "rm-1" }),
    })
    const res = await PATCH(req, { params: { userId: "client-1" } })
    expect(res.status).toBe(200)
    expect(updateManyRequestsMock).toHaveBeenCalledWith({
      where: { userId: "client-1", status: "PENDING" },
      data: expect.objectContaining({
        status: "FULFILLED",
        resolvedById: "admin-1",
      }),
    })
  })

  it("skips queue update when unassigning", async () => {
    findUniqueMock.mockImplementation((args: { where: { id: string } }) => {
      if (args.where.id === "client-1") return Promise.resolve({ id: "client-1", role: "USER" })
      return Promise.resolve(null)
    })
    updateUserMock.mockResolvedValue({
      id: "client-1",
      managedById: null,
      managedBy: null,
      name: "C",
      email: "c@x.com",
    })
    const req = new Request("http://localhost/api/admin/users/client-1/assign-rm", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rmId: null }),
    })
    const res = await PATCH(req, { params: { userId: "client-1" } })
    expect(res.status).toBe(200)
    expect(updateManyRequestsMock).not.toHaveBeenCalled()
  })
})
