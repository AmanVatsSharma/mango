/**
 * @file admin-market-catalog-route.test.ts
 * @module tests-api
 * @description Route-level coverage for /api/admin/market-data/catalog GET + PUT — admin gate
 *              via handleAdminApi mock, Zod validation, transaction-style write call, audit
 *              best-effort, pubsub fire-and-forget.
 * @author StockTrade
 * @created 2026-05-01
 */

const findFirstMock = jest.fn()
const updateManyMock = jest.fn()
const updateMock = jest.fn()
const createMock = jest.fn()
const transactionMock = jest.fn()
const writeAuditMock = jest.fn()
const publishChangedMock = jest.fn()
const invalidateLoaderMock = jest.fn()
const invalidateResolverMock = jest.fn()

jest.mock("@/lib/prisma", () => ({
  prisma: {
    systemSettings: {
      findFirst: (...args: any[]) => findFirstMock(...args),
      updateMany: (...args: any[]) => updateManyMock(...args),
      update: (...args: any[]) => updateMock(...args),
      create: (...args: any[]) => createMock(...args),
    },
    $transaction: (cb: any) => transactionMock(cb),
  },
}))

jest.mock("@/lib/rbac/admin-api", () => ({
  handleAdminApi: async (req: Request, _opts: any, handler: any) => {
    try {
      return await handler({
        req,
        session: { user: { id: "admin-1" } },
        logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
      })
    } catch (error: any) {
      return new Response(
        JSON.stringify({ success: false, error: error?.message || "failed" }),
        { status: error?.statusCode || 500, headers: { "content-type": "application/json" } },
      )
    }
  },
}))

jest.mock("@/lib/market-catalog/market-catalog-loader", () => ({
  invalidateMarketCatalogCache: () => invalidateLoaderMock(),
}))

jest.mock("@/lib/market-catalog/resolve-catalog", () => ({
  invalidateResolveCatalogCache: () => invalidateResolverMock(),
}))

jest.mock("@/lib/market-catalog/market-catalog-audit", () => ({
  writeMarketCatalogAudit: (...args: any[]) => writeAuditMock(...args),
}))

jest.mock("@/lib/market-catalog/market-catalog-pubsub", () => ({
  publishCatalogChanged: (...args: any[]) => publishChangedMock(...args),
}))

import { GET, PUT } from "@/app/api/admin/market-data/catalog/route"

beforeEach(() => {
  jest.clearAllMocks()
  // $transaction passes through to the callback with a fake `tx` exposing the same fns
  transactionMock.mockImplementation(async (cb: any) =>
    cb({
      systemSettings: {
        findFirst: findFirstMock,
        updateMany: updateManyMock,
        update: updateMock,
        create: createMock,
      },
    }),
  )
})

const URL_BASE = "http://localhost/api/admin/market-data/catalog"

describe("GET /api/admin/market-data/catalog", () => {
  it("returns the empty default when no row exists", async () => {
    findFirstMock.mockResolvedValueOnce(null)
    const res = await GET(new Request(URL_BASE))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.version).toBe(1)
    expect(body.data.groups).toEqual([])
  })

  it("parses a valid persisted blob", async () => {
    findFirstMock.mockResolvedValueOnce({
      value: JSON.stringify({
        version: 1,
        groups: [
          {
            id: "indices",
            label: "Indices",
            sortOrder: 0,
            items: [
              { kind: "instrument", token: 100, symbol: "X", exchange: "NSE", segment: "NSE" },
            ],
          },
        ],
      }),
      updatedAt: new Date("2026-05-01T10:00:00Z"),
    })
    const res = await GET(new Request(URL_BASE))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.groups).toHaveLength(1)
    expect(body.updatedAt).toBe("2026-05-01T10:00:00.000Z")
  })

  it("falls back to default on a corrupt blob", async () => {
    findFirstMock.mockResolvedValueOnce({
      value: "not-json {",
      updatedAt: new Date(),
    })
    const res = await GET(new Request(URL_BASE))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.groups).toEqual([])
  })
})

describe("PUT /api/admin/market-data/catalog", () => {
  it("rejects an invalid payload with 400 + VALIDATION_ERROR", async () => {
    const res = await PUT(
      new Request(URL_BASE, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 99 }),
      }),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(createMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it("creates a new row when none exists, audits, invalidates, publishes", async () => {
    // First findFirst (in readRawCatalog) returns null; second (inside transaction) returns null.
    findFirstMock.mockResolvedValue(null)
    createMock.mockResolvedValueOnce({
      id: "ss-1",
      updatedAt: new Date("2026-05-01T11:00:00Z"),
    })

    const payload = {
      version: 1,
      groups: [
        {
          id: "indices",
          label: "Indices",
          sortOrder: 0,
          items: [
            { kind: "instrument", token: 256265, symbol: "NIFTY 50", exchange: "NSE", segment: "NSE_INDEX" },
          ],
        },
      ],
    }
    const res = await PUT(
      new Request(URL_BASE, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.version).toBe(1)
    expect(body.data.updatedAt).toBeTruthy()
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(updateMock).not.toHaveBeenCalled()
    expect(invalidateLoaderMock).toHaveBeenCalledTimes(1)
    expect(invalidateResolverMock).toHaveBeenCalledTimes(1)
    expect(writeAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        action: "MARKET_CATALOG_UPDATED",
      }),
    )
    expect(publishChangedMock).toHaveBeenCalledWith({ scope: "global" })
  })

  it("updates the existing row when one exists", async () => {
    // readRawCatalog returns null → before is empty.
    // Inside transaction findFirst returns an existing row.
    findFirstMock
      .mockResolvedValueOnce(null) // readRawCatalog initial
      .mockResolvedValueOnce({ id: "ss-existing", value: "{}" }) // inside transaction
    updateMock.mockResolvedValueOnce({
      id: "ss-existing",
      updatedAt: new Date(),
    })
    updateManyMock.mockResolvedValueOnce({ count: 0 })

    const payload = { version: 1, groups: [] }
    const res = await PUT(
      new Request(URL_BASE, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    )
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(updateManyMock).toHaveBeenCalledTimes(1)
    expect(createMock).not.toHaveBeenCalled()
  })
})
