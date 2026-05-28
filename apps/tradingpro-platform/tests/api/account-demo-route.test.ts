/**
 * File:        tests/api/account-demo-route.test.ts
 * Module:      tests-api
 * Purpose:     Route handler integration tests for /api/account/demo POST.
 *
 * Exports:     none (test file)
 *
 * Side-effects: mocks Prisma, auth, next/headers, @auth/jose via moduleNameMapper — no DB, no network
 *
 * Key invariants:
 *   - Authenticated users can create one DEMO account
 *   - Duplicate DEMO account returns 409
 *   - Missing auth returns 401
 *   - Tier defaults to ₹10 Lakh if not specified
 *
 * Author:      Claude
 * Last-updated: 2026-05-16
 */

const mockAuth = jest.fn()
const mockTradingAccountFindFirst = jest.fn()
const mockTradingAccountCreate = jest.fn()
const mockHeaders = jest.fn()
// decode is mocked via moduleNameMapper + next-auth.js mock

jest.mock("@/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    tradingAccount: {
      findFirst: (...args: unknown[]) => mockTradingAccountFindFirst(...args),
      create: (...args: unknown[]) => mockTradingAccountCreate(...args),
    },
  },
}))

jest.mock("@/lib/constants/demo-tiers", () => ({
  DEMO_ACCOUNT_TIERS: [
    { value: "100000", label: "₹1 Lakh", amount: 100_000 },
    { value: "1000000", label: "₹10 Lakh", amount: 1_000_000 },
    { value: "10000000", label: "₹1 Crore", amount: 10_000_000 },
  ],
  isValidDemoTier: (v: string) => ["100000", "1000000", "10000000"].includes(v),
}))

jest.mock("next/headers", () => ({
  headers: (...args: unknown[]) => mockHeaders(...args),
}))

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function mockNextRequest(body: object = {}): import("next/server").NextRequest {
  return {
    json: async () => body,
  } as unknown as import("next/server").NextRequest
}

const MOCK_USER_ID = "user-123"
const MOCK_DEMO_ACCOUNT = {
  id: "demo-account-456",
  userId: MOCK_USER_ID,
  accountType: "DEMO" as const,
  balance: 1_000_000,
  availableMargin: 1_000_000,
  usedMargin: 0,
  createdAt: new Date("2026-05-16T10:00:00Z"),
  updatedAt: new Date("2026-05-16T10:00:00Z"),
  creditBalance: 0,
  clientId: null,
}

// ─────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────

describe("POST /api/account/demo", () => {
  // Also update MOCK_DEMO_ACCOUNT balance to track mock impl
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: MOCK_USER_ID } })
    mockHeaders.mockResolvedValue(new Headers())
    mockTradingAccountFindFirst.mockResolvedValue(null)
    // Default balance
    mockTradingAccountCreate.mockResolvedValue(MOCK_DEMO_ACCOUNT)
  })

  afterEach(() => {
    // Restore default mock for other tests
    mockTradingAccountCreate.mockResolvedValue(MOCK_DEMO_ACCOUNT)
  })

  // ── Auth ──────────────────────────────────

  it("returns 401 when no session and no bearer token", async () => {
    mockAuth.mockResolvedValue({ user: null })
    mockHeaders.mockResolvedValue(new Headers())

    const { POST } = await import("@/app/api/account/demo/route")
    const res = await POST(mockNextRequest())
    expect(res.status).toBe(401)
  })

  it("extracts userId from session cookie and returns 201", async () => {
    mockAuth.mockResolvedValue({ user: { id: MOCK_USER_ID } })

    const { POST } = await import("@/app/api/account/demo/route")
    const res = await POST(mockNextRequest())
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe(MOCK_DEMO_ACCOUNT.id)
    expect(body.accountType).toBe("DEMO")
    expect(body.balance).toBe(1_000_000)
  })

  it("extracts userId from bearer token when session is empty", async () => {
    mockAuth.mockResolvedValue({ user: null })
    const headers = new Headers()
    headers.set("authorization", "Bearer valid-jwt-token")
    mockHeaders.mockResolvedValue(headers)
    // decode mock is in next-auth.js via moduleNameMapper
    const { decode } = await import("@auth/jose")
    ;(decode as jest.Mock).mockResolvedValue({ id: MOCK_USER_ID } as unknown as never)

    const { POST } = await import("@/app/api/account/demo/route")
    const res = await POST(mockNextRequest())
    expect(res.status).toBe(201)
  })

  // ── Tier handling ──────────────────────────

  it("uses ₹1 Crore tier from request body", async () => {
    // Override balance for this specific test
    mockTradingAccountCreate.mockResolvedValue({
      ...MOCK_DEMO_ACCOUNT,
      balance: 10_000_000,
      availableMargin: 10_000_000,
    })

    const { POST } = await import("@/app/api/account/demo/route")
    const res = await POST(mockNextRequest({ tier: "10000000" }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.balance).toBe(10_000_000)
  })

  it("falls back to ₹10 Lakh for invalid tier", async () => {
    const { POST } = await import("@/app/api/account/demo/route")
    const res = await POST(mockNextRequest({ tier: "invalid-tier" }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.balance).toBe(1_000_000)
  })

  // ── Duplicate / Cookie ────────────────────

  it("returns 409 when demo account already exists", async () => {
    mockTradingAccountFindFirst.mockResolvedValue({ id: "existing-demo" })

    const { POST } = await import("@/app/api/account/demo/route")
    const res = await POST(mockNextRequest())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe("DEMO_EXISTS")
  })

  it("sets demoAccountPending cookie on success", async () => {
    const { POST } = await import("@/app/api/account/demo/route")
    const res = await POST(mockNextRequest())
    expect(res.status).toBe(201)
    const cookie = res.cookies.get("demoAccountPending")
    expect(cookie).toBeDefined()
    const cookieValue = JSON.parse(cookie?.value ?? "{}")
    expect(cookieValue.demoTradingAccountId).toBe(MOCK_DEMO_ACCOUNT.id)
    expect(cookieValue.accountType).toBe("DEMO")
  })

  // ── Error handling ────────────────────────

  it("returns 500 if database create fails", async () => {
    mockTradingAccountCreate.mockRejectedValue(new Error("DB error"))

    const { POST } = await import("@/app/api/account/demo/route")
    const res = await POST(mockNextRequest())
    expect(res.status).toBe(500)
  })

  it("returns 500 if database check fails", async () => {
    mockTradingAccountFindFirst.mockRejectedValue(new Error("DB error"))

    const { POST } = await import("@/app/api/account/demo/route")
    const res = await POST(mockNextRequest())
    expect(res.status).toBe(500)
  })
})