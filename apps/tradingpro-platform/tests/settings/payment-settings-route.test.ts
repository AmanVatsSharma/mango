/**
 * File: tests/settings/payment-settings-route.test.ts
 * Module: settings
 * Purpose: Verify payment settings route returns QR/UPI for authenticated users (non-admin) with no-store caching.
 * Author: StockTrade
 * Last-updated: 2026-02-12
 * Notes:
 * - Mocks NextAuth `auth()` and Prisma `SystemSettings` reads.
 * - Ensures response shape is minimal and safe for user console consumption.
 */

import { GET as getPaymentSettings } from "@/app/api/settings/payment/route"

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    systemSettings: {
      findMany: jest.fn(),
    },
  },
}))

jest.mock("@/lib/observability/logger", () => ({
  withRequest: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
  })),
}))

const authMock = jest.requireMock("@/auth").auth as jest.Mock
const prismaMock = jest.requireMock("@/lib/prisma").prisma as {
  systemSettings: { findMany: jest.Mock }
}

describe("/api/settings/payment", () => {
  beforeEach(() => {
    authMock.mockReset()
    prismaMock.systemSettings.findMany.mockReset()
  })

  it("returns 200 + no-store for authenticated user", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } })
    prismaMock.systemSettings.findMany.mockResolvedValue([
      { key: "payment_qr_code", value: "https://bucket.s3.ap-south-1.amazonaws.com/payment-qr-codes/qr.png" },
      { key: "payment_upi_id", value: "trading@upi" },
    ])

    const req = new Request("http://localhost/api/settings/payment", { method: "GET" })
    const res = await getPaymentSettings(req)

    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("no-store")

    const body = await res.json()
    expect(body?.success).toBe(true)
    expect(Object.keys(body?.data || {}).sort()).toEqual(["qrCodeUrl", "upiId"])
    expect(body?.data?.qrCodeUrl).toMatch(/^https:\/\//)
    expect(body?.data?.upiId).toBe("trading@upi")
  })

  it("returns nulls when settings are missing/blank", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } })
    prismaMock.systemSettings.findMany.mockResolvedValue([
      { key: "payment_qr_code", value: "   " },
      { key: "payment_upi_id", value: "" },
    ])

    const req = new Request("http://localhost/api/settings/payment", { method: "GET" })
    const res = await getPaymentSettings(req)

    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("no-store")

    const body = await res.json()
    expect(body?.success).toBe(true)
    expect(body?.data?.qrCodeUrl).toBeNull()
    expect(body?.data?.upiId).toBeNull()
  })

  it("returns 401 + no-store when unauthenticated", async () => {
    authMock.mockResolvedValue(null)

    const req = new Request("http://localhost/api/settings/payment", { method: "GET" })
    const res = await getPaymentSettings(req)

    expect(res.status).toBe(401)
    expect(res.headers.get("Cache-Control")).toBe("no-store")

    const body = await res.json()
    expect(body?.success).toBe(false)
    expect(body?.code).toBe("UNAUTHORIZED")
    expect(prismaMock.systemSettings.findMany).not.toHaveBeenCalled()
  })
})

