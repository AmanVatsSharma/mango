/**
 * @file tests/api/risk-config-route.test.ts
 * @module tests-api
 * @description Route tests for GET /api/risk/config: auth guard (401 when no session) + F&O optionType steers NRML_OPT vs NRML_FUT precedence.
 * @author StockTrade
 * @created 2026-03-28
 * @updated 2026-03-30 — MIS_OPT precedence for intraday F&O options
 * @updated 2026-04-08 — orderSide steers NRML_OPT_SELL vs shared NRML_OPT
 * @updated 2026-04-08 — `minMarginPerLot` in JSON payload
 * @updated 2026-04-20 — Auth guard: mock auth() for existing tests; add 401 test for unauthenticated callers.
 */

const findManyMock = jest.fn()

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    riskConfig: {
      findMany: (...args: unknown[]) => findManyMock(...args),
    },
  },
}))

import { GET } from "@/app/api/risk/config/route"

const authMock = jest.requireMock("@/auth").auth as jest.Mock

describe("GET /api/risk/config", () => {
  beforeEach(() => {
    findManyMock.mockReset()
    authMock.mockReset()
    authMock.mockResolvedValue({ user: { id: "user-1" } })
  })

  it("returns 400 when segment or productType missing", async () => {
    const res = await GET(new Request("http://localhost/api/risk/config?segment=NFO"))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it("for NFO NRML with optionType=CE, prefers NRML_OPT over shared NRML when both active", async () => {
    findManyMock.mockResolvedValue([
      {
        segment: "NFO",
        productType: "NRML_OPT",
        leverage: 7,
        marginRate: null,
        brokerageFlat: null,
        brokerageRate: null,
        brokerageCap: null,
      },
      {
        segment: "NFO",
        productType: "NRML",
        leverage: 3,
        marginRate: null,
        brokerageFlat: null,
        brokerageRate: null,
        brokerageCap: null,
      },
    ])

    const res = await GET(
      new Request("http://localhost/api/risk/config?segment=NFO&productType=NRML&optionType=CE"),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.leverage).toBe(7)
    expect(body.data.productType).toBe("NRML")
  })

  it("for NFO NRML without optionType, prefers NRML_FUT over shared NRML when both active", async () => {
    findManyMock.mockResolvedValue([
      {
        segment: "NFO",
        productType: "NRML_FUT",
        leverage: 12,
        marginRate: null,
        brokerageFlat: null,
        brokerageRate: null,
        brokerageCap: null,
      },
      {
        segment: "NFO",
        productType: "NRML",
        leverage: 5,
        marginRate: null,
        brokerageFlat: null,
        brokerageRate: null,
        brokerageCap: null,
      },
    ])

    const res = await GET(new Request("http://localhost/api/risk/config?segment=NFO&productType=NRML"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.leverage).toBe(12)
  })

  it("for NFO MIS with optionType=CE, prefers MIS_OPT over shared MIS when both active", async () => {
    findManyMock.mockResolvedValue([
      {
        segment: "NFO",
        productType: "MIS_OPT",
        leverage: 9,
        marginRate: null,
        brokerageFlat: null,
        brokerageRate: null,
        brokerageCap: null,
      },
      {
        segment: "NFO",
        productType: "MIS",
        leverage: 4,
        marginRate: null,
        brokerageFlat: null,
        brokerageRate: null,
        brokerageCap: null,
      },
    ])

    const res = await GET(
      new Request("http://localhost/api/risk/config?segment=NFO&productType=MIS&optionType=CE"),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.leverage).toBe(9)
    expect(body.data.productType).toBe("MIS")
  })

  it("for NFO NRML option CE with orderSide=SELL, prefers NRML_OPT_SELL over NRML_OPT when both active", async () => {
    findManyMock.mockResolvedValue([
      {
        segment: "NFO",
        productType: "NRML_OPT_SELL",
        leverage: 22,
        marginRate: null,
        minMarginPerLot: 7500,
        brokerageFlat: null,
        brokerageRate: null,
        brokerageCap: null,
      },
      {
        segment: "NFO",
        productType: "NRML_OPT",
        leverage: 7,
        marginRate: null,
        minMarginPerLot: null,
        brokerageFlat: null,
        brokerageRate: null,
        brokerageCap: null,
      },
    ])

    const res = await GET(
      new Request(
        "http://localhost/api/risk/config?segment=NFO&productType=NRML&optionType=CE&orderSide=SELL",
      ),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.leverage).toBe(22)
    expect(body.data.minMarginPerLot).toBe(7500)
  })

  it("returns 401 when no session", async () => {
    authMock.mockResolvedValue(null)
    const res = await GET(
      new Request("http://localhost/api/risk/config?segment=NFO&productType=NRML"),
    )
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe("RISK_CONFIG_UNAUTHENTICATED")
  })
})
