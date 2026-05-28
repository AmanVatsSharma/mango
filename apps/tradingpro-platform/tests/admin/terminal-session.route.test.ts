/**
 * @file terminal-session.route.test.ts
 * @module admin-console
 * @description Tests for POST /api/admin/terminal/session issuance and gating.
 * @author StockTrade
 * @created 2026-03-25
 */

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}))

jest.mock("@/lib/services/admin/AccessControlService", () => ({
  AccessControlService: {
    getConfig: jest.fn(),
  },
}))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    tradingLog: {
      create: jest.fn(async () => ({})),
    },
  },
}))

import { auth } from "@/auth"
import { AccessControlService } from "@/lib/services/admin/AccessControlService"
import { POST } from "@/app/api/admin/terminal/session/route"

const mockAuth = auth as jest.Mock
const mockGetConfig = AccessControlService.getConfig as jest.Mock

describe("POST /api/admin/terminal/session", () => {
  const prevEnabled = process.env.TERMINAL_GATEWAY_ENABLED
  const prevWs = process.env.NEXT_PUBLIC_TERMINAL_WS_URL
  const prevSecret = process.env.TERMINAL_GATEWAY_JWT_SECRET

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.TERMINAL_GATEWAY_ENABLED = "true"
    process.env.NEXT_PUBLIC_TERMINAL_WS_URL = "wss://example.com/ws"
    process.env.TERMINAL_GATEWAY_JWT_SECRET = "x".repeat(32)
    mockAuth.mockResolvedValue({
      user: {
        id: "admin-1",
        email: "ops@example.com",
        clientId: "C_ADMIN",
        role: "SUPER_ADMIN",
      },
    })
    mockGetConfig.mockResolvedValue({
      config: {
        roles: {
          USER: [],
          MODERATOR: [],
          ADMIN: [],
          SUPER_ADMIN: ["admin.all"],
        },
      },
    })
  })

  afterAll(() => {
    process.env.TERMINAL_GATEWAY_ENABLED = prevEnabled
    process.env.NEXT_PUBLIC_TERMINAL_WS_URL = prevWs
    process.env.TERMINAL_GATEWAY_JWT_SECRET = prevSecret
  })

  it("returns 503 when gateway disabled", async () => {
    process.env.TERMINAL_GATEWAY_ENABLED = "false"
    const res = await POST(new Request("http://localhost/api/admin/terminal/session", { method: "POST" }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.code).toBe("TERMINAL_DISABLED")
  })

  it("returns token payload when super-admin and gateway configured", async () => {
    const res = await POST(new Request("http://localhost/api/admin/terminal/session", { method: "POST" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.wsUrl).toBe("wss://example.com/ws")
    expect(typeof body.token).toBe("string")
    expect(body.token.split(".").length).toBe(3)
    expect(body.sessionId).toBeDefined()
  })
})
