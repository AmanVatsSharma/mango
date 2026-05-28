/**
 * @file admin-rm-assignment-requests-route.test.ts
 * @module tests-api
 * @description Tests for GET/PATCH /api/admin/rm-assignment-requests.
 * @author StockTrade
 * @created 2026-03-28
 */

const findManyMock = jest.fn()
const countMock = jest.fn()
const userCountMock = jest.fn()
const findUniqueRequestMock = jest.fn()
const updateRequestMock = jest.fn()

jest.mock("@/lib/prisma", () => ({
  prisma: {
    rmAssignmentRequest: {
      findMany: (...args: unknown[]) => findManyMock(...args),
      count: (...args: unknown[]) => countMock(...args),
      findUnique: (...args: unknown[]) => findUniqueRequestMock(...args),
      update: (...args: unknown[]) => updateRequestMock(...args),
    },
    user: {
      count: (...args: unknown[]) => userCountMock(...args),
    },
  },
}))

const adminCtx = {
  session: { user: { id: "admin-1" } },
  role: "ADMIN",
  permissions: new Set(["admin.users.rm"]),
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}

jest.mock("@/lib/rbac/admin-api", () => ({
  handleAdminApi: async (_req: Request, _opts: unknown, handler: (ctx: typeof adminCtx) => Promise<Response>) => {
    try {
      return await handler(adminCtx)
    } catch (error: unknown) {
      const err = error as { statusCode?: number; message?: string; code?: string }
      const status = typeof err?.statusCode === "number" ? err.statusCode : 500
      return new Response(JSON.stringify({ error: err?.message ?? "failed", code: err?.code }), {
        status,
        headers: { "content-type": "application/json" },
      })
    }
  },
}))

import { GET } from "@/app/api/admin/rm-assignment-requests/route"
import { PATCH } from "@/app/api/admin/rm-assignment-requests/[id]/route"

describe("/api/admin/rm-assignment-requests", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    findManyMock.mockResolvedValue([
      {
        id: "r1",
        userId: "u1",
        status: "PENDING",
        note: null,
        dismissReason: null,
        createdAt: new Date("2026-03-28T10:00:00.000Z"),
        resolvedAt: null,
        resolvedById: null,
        user: {
          id: "u1",
          name: "A",
          email: "a@x.com",
          phone: null,
          clientId: "C1",
          managedById: null,
        },
      },
    ])
    countMock.mockResolvedValue(1)
    userCountMock.mockResolvedValue(5)
  })

  it("GET returns requests and meta", async () => {
    const req = new Request("http://localhost/api/admin/rm-assignment-requests?status=PENDING")
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.requests).toHaveLength(1)
    expect(body.requests[0].user.email).toBe("a@x.com")
    expect(body.meta.pendingCount).toBeDefined()
    expect(body.meta.clientsWithoutRm).toBe(5)
  })

  it("PATCH dismisses pending request", async () => {
    findUniqueRequestMock.mockResolvedValue({ id: "r1", status: "PENDING", userId: "u1" })
    updateRequestMock.mockResolvedValue({
      id: "r1",
      userId: "u1",
      status: "DISMISSED",
      dismissReason: "spam",
      resolvedAt: new Date(),
      user: { id: "u1", name: "A", email: "a@x.com", clientId: "C1" },
    })

    const req = new Request("http://localhost/api/admin/rm-assignment-requests/r1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DISMISSED", dismissReason: "spam" }),
    })
    const res = await PATCH(req, { params: { id: "r1" } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(updateRequestMock).toHaveBeenCalled()
  })

  it("PATCH returns 404 when missing", async () => {
    findUniqueRequestMock.mockResolvedValue(null)
    const req = new Request("http://localhost/api/admin/rm-assignment-requests/x", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DISMISSED" }),
    })
    const res = await PATCH(req, { params: { id: "x" } })
    expect(res.status).toBe(404)
  })
})
