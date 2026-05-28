/**
 * @file console-post-deposit-flow.test.ts
 * @module tests-api
 * @description Flow tests for POST /api/console — error envelope and createDepositRequest delegation.
 * @author StockTrade
 * @created 2026-04-01
 * @updated 2026-04-01 — jest.mock before require(); @/auth factory avoids loading auth.ts.
 */

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}))

const createDepositRequestMock = jest.fn()

jest.mock("@/lib/console-data-service", () => ({
  ConsoleDataService: {
    updateUserProfile: jest.fn().mockResolvedValue({ success: true, message: "ok" }),
    updateUserAvatar: jest.fn().mockResolvedValue({ success: true, message: "ok", image: "https://b.s3.r.amazonaws.com/uploads/avatars/x" }),
    clearUserAvatar: jest.fn().mockResolvedValue({ success: true, message: "ok", image: null }),
    addBankAccount: jest.fn().mockResolvedValue({ success: true, message: "ok" }),
    updateBankAccount: jest.fn().mockResolvedValue({ success: true, message: "ok" }),
    deleteBankAccount: jest.fn().mockResolvedValue({ success: true, message: "ok" }),
    createDepositRequest: (...args: unknown[]) => createDepositRequestMock(...args),
    createWithdrawalRequest: jest.fn().mockResolvedValue({ success: true, message: "ok" }),
  },
}))

/* eslint-disable @typescript-eslint/no-require-imports */
const { auth } = require("@/auth")
const { POST } = require("@/app/api/console/route")
/* eslint-enable @typescript-eslint/no-require-imports */

const mockAuth = auth as jest.Mock

describe("POST /api/console — deposit and errors", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: "user-flow-1" } })
    createDepositRequestMock.mockResolvedValue({
      success: true,
      message: "Deposit request created successfully",
      depositId: "dep-1",
    })
  })

  it("returns 401 with success:false when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(
      new Request("http://localhost/api/console", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createDepositRequest", data: { amount: 1000, method: "upi" } }),
      })
    )
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(typeof body.message).toBe("string")
    expect(body.message.length).toBeGreaterThan(0)
  })

  it("returns normalized error for invalid JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/console", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }) as Request
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.message).toMatch(/json/i)
  })

  it("returns normalized error when action is missing", async () => {
    const res = await POST(
      new Request("http://localhost/api/console", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: {} }),
      })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.message).toMatch(/action/i)
  })

  it("delegates createDepositRequest and returns service result", async () => {
    const res = await POST(
      new Request("http://localhost/api/console", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createDepositRequest",
          data: { amount: 5000, method: "upi" },
        }),
      })
    )
    expect(res.status).toBe(200)
    expect(createDepositRequestMock).toHaveBeenCalledWith("user-flow-1", {
      amount: 5000,
      method: "upi",
    })
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.depositId).toBe("dep-1")
  })

  it("returns business failure with HTTP 200 and success:false from service", async () => {
    createDepositRequestMock.mockResolvedValueOnce({
      success: false,
      message: "Minimum deposit for this method is ₹10,000",
    })
    const res = await POST(
      new Request("http://localhost/api/console", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createDepositRequest",
          data: { amount: 100, method: "upi" },
        }),
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.message).toContain("Minimum deposit")
  })
})
