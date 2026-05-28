/**
 * @file console-request-rm-route.test.ts
 * @module tests-api
 * @description Tests for POST /api/console/request-rm (idempotent RM queue).
 * @author StockTrade
 * @created 2026-03-28
 */

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}))

const findUniqueUserMock = jest.fn()
const findFirstPendingMock = jest.fn()
const createRequestMock = jest.fn()

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => findUniqueUserMock(...args),
    },
    rmAssignmentRequest: {
      findFirst: (...args: unknown[]) => findFirstPendingMock(...args),
      create: (...args: unknown[]) => createRequestMock(...args),
    },
  },
}))

jest.mock("@/lib/observability/logger", () => ({
  withRequest: () => ({
    info: jest.fn(),
    error: jest.fn(),
  }),
}))

import { auth } from "@/auth"
import { POST } from "@/app/api/console/request-rm/route"

const mockAuth = auth as jest.Mock

describe("POST /api/console/request-rm", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue({
      user: { id: "user-1", email: "c@example.com", name: "Client" },
    })
    findUniqueUserMock.mockResolvedValue({ managedById: null })
    findFirstPendingMock.mockResolvedValue(null)
    createRequestMock.mockResolvedValue({ id: "req-1" })
  })

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(new Request("http://localhost/api/console/request-rm", { method: "POST" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 when user already has RM", async () => {
    findUniqueUserMock.mockResolvedValue({ managedById: "rm-1" })
    const res = await POST(new Request("http://localhost/api/console/request-rm", { method: "POST" }))
    expect(res.status).toBe(400)
  })

  it("creates pending row when none exists", async () => {
    const res = await POST(new Request("http://localhost/api/console/request-rm", { method: "POST" }))
    expect(res.status).toBe(200)
    expect(createRequestMock).toHaveBeenCalledWith({
      data: { userId: "user-1", status: "PENDING" },
    })
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it("returns alreadyQueued when pending exists", async () => {
    findFirstPendingMock.mockResolvedValue({ id: "existing" })
    const res = await POST(new Request("http://localhost/api/console/request-rm", { method: "POST" }))
    expect(res.status).toBe(200)
    expect(createRequestMock).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.alreadyQueued).toBe(true)
  })
})
