/**
 * @file resolve-catalog.test.ts
 * @module tests/market-catalog
 * @description Resolver tests — Vedpragya client is mocked; we assert ATM math, strike-window
 *              slicing, expiry filtering (future-only), and CE/PE pairing per strike.
 * @author StockTrade
 * @created 2026-05-01
 */

const fetchInstrumentsMock = jest.fn()
const fetchUnderlyingLtpMock = jest.fn()

jest.mock("@/lib/market-catalog/upstream-instruments-client", () => ({
  fetchInstruments: (...args: any[]) => fetchInstrumentsMock(...args),
  fetchUnderlyingLtp: (...args: any[]) => fetchUnderlyingLtpMock(...args),
}))

import {
  invalidateResolveCatalogCache,
  resolveCatalog,
} from "@/lib/market-catalog/resolve-catalog"
import type { MarketCatalogV1 } from "@/lib/market-catalog/catalog-schema"

beforeEach(() => {
  jest.clearAllMocks()
  invalidateResolveCatalogCache()
})

describe("resolveCatalog", () => {
  it("passes instrument items through unchanged", async () => {
    const cat: MarketCatalogV1 = {
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
    const r = await resolveCatalog(cat)
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0]?.items[0]).toMatchObject({
      kind: "instrument",
      token: 256265,
      symbol: "NIFTY 50",
    })
  })

  it("resolves an ATM-window options chain and pairs CE/PE per strike", async () => {
    const future = futureExpiryString(7)
    fetchUnderlyingLtpMock.mockResolvedValue(20_037) // ATM should round to 20050 with step 50
    fetchInstrumentsMock.mockResolvedValue([
      // Two strikes inside window, both CE & PE, future expiry
      {
        token: 1, symbol: "NIFTY24MAY20000CE", strike: 20000,
        expiry: future, option_type: "CE", last_price: 100, lot_size: 50,
      },
      {
        token: 2, symbol: "NIFTY24MAY20000PE", strike: 20000,
        expiry: future, option_type: "PE", last_price: 90, lot_size: 50,
      },
      {
        token: 3, symbol: "NIFTY24MAY20050CE", strike: 20050,
        expiry: future, option_type: "CE", last_price: 80, lot_size: 50,
      },
      {
        token: 4, symbol: "NIFTY24MAY20050PE", strike: 20050,
        expiry: future, option_type: "PE", last_price: 110, lot_size: 50,
      },
      // A past expiry — should be filtered
      {
        token: 99, symbol: "NIFTYOLD20000CE", strike: 20000,
        expiry: "2020-01-01", option_type: "CE", last_price: 1,
      },
    ])

    const cat: MarketCatalogV1 = {
      version: 1,
      groups: [
        {
          id: "options",
          label: "Options",
          sortOrder: 0,
          items: [
            {
              kind: "options-chain",
              underlying: { token: 256265, symbol: "NIFTY", segment: "NSE_INDEX" },
              expiryStrategy: { mode: "next-n-weekly", count: 1 },
              strikeStrategy: { mode: "atm-window", window: 1 },
              includeCE: true,
              includePE: true,
            },
          ],
        },
      ],
    }
    const r = await resolveCatalog(cat)
    const chain: any = r.groups[0]?.items[0]
    expect(chain.kind).toBe("options-chain")
    expect(chain.underlying.atm).toBe(20050)
    expect(chain.expiries).toHaveLength(1)
    expect(chain.expiries[0].expiry).toBe(future)

    const strikes = chain.expiries[0].strikes
    // window=1 + atm=20050 → strikes 20000, 20050, 20100. Past expiry (token 99) ignored.
    expect(strikes.map((s: any) => s.strike)).toEqual([20000, 20050, 20100])
    const atmRow = strikes.find((s: any) => s.strike === 20050)
    expect(atmRow.isAtm).toBe(true)
    expect(atmRow.ce.token).toBe(3)
    expect(atmRow.pe.token).toBe(4)
    const lowerRow = strikes.find((s: any) => s.strike === 20000)
    expect(lowerRow.isAtm).toBe(false)
    expect(lowerRow.ce.token).toBe(1)
    expect(lowerRow.pe.token).toBe(2)
    // 20100 has no upstream rows → strike row exists, ce/pe undefined
    const upperRow = strikes.find((s: any) => s.strike === 20100)
    expect(upperRow.ce).toBeUndefined()
    expect(upperRow.pe).toBeUndefined()
  })

  it("respects includeCE=false / includePE=true", async () => {
    const future = futureExpiryString(7)
    fetchUnderlyingLtpMock.mockResolvedValue(20_000)
    fetchInstrumentsMock.mockResolvedValue([
      { token: 1, symbol: "X", strike: 20000, expiry: future, option_type: "CE", last_price: 1 },
      { token: 2, symbol: "Y", strike: 20000, expiry: future, option_type: "PE", last_price: 1 },
    ])
    const cat: MarketCatalogV1 = {
      version: 1,
      groups: [
        {
          id: "x",
          label: "x",
          sortOrder: 0,
          items: [
            {
              kind: "options-chain",
              underlying: { token: 1, symbol: "NIFTY", segment: "NSE_INDEX" },
              expiryStrategy: { mode: "next-n-weekly", count: 1 },
              strikeStrategy: { mode: "atm-window", window: 0 },
              includeCE: false,
              includePE: true,
            },
          ],
        },
      ],
    }
    const r = await resolveCatalog(cat)
    const chain: any = r.groups[0]?.items[0]
    const row = chain.expiries[0].strikes.find((s: any) => s.strike === 20000)
    expect(row.ce).toBeUndefined()
    expect(row.pe).toBeDefined()
  })

  it("returns empty expiries when underlying LTP unavailable", async () => {
    fetchUnderlyingLtpMock.mockResolvedValue(null)
    fetchInstrumentsMock.mockResolvedValue([])
    const cat: MarketCatalogV1 = {
      version: 1,
      groups: [
        {
          id: "x",
          label: "x",
          sortOrder: 0,
          items: [
            {
              kind: "options-chain",
              underlying: { token: 1, symbol: "NIFTY", segment: "NSE_INDEX" },
              expiryStrategy: { mode: "next-n-weekly", count: 1 },
              strikeStrategy: { mode: "atm-window", window: 5 },
              includeCE: true,
              includePE: true,
            },
          ],
        },
      ],
    }
    const r = await resolveCatalog(cat)
    const chain: any = r.groups[0]?.items[0]
    expect(chain.expiries).toEqual([])
  })

  it("explicit-strike strategy bypasses ATM math", async () => {
    const future = futureExpiryString(14)
    fetchUnderlyingLtpMock.mockResolvedValue(null) // shouldn't matter
    fetchInstrumentsMock.mockResolvedValue([
      { token: 10, symbol: "A", strike: 19500, expiry: future, option_type: "CE", last_price: 1 },
      { token: 11, symbol: "B", strike: 19500, expiry: future, option_type: "PE", last_price: 1 },
    ])
    const cat: MarketCatalogV1 = {
      version: 1,
      groups: [
        {
          id: "x",
          label: "x",
          sortOrder: 0,
          items: [
            {
              kind: "options-chain",
              underlying: { token: 1, symbol: "NIFTY", segment: "NSE_INDEX" },
              expiryStrategy: { mode: "explicit", dates: [future] },
              strikeStrategy: { mode: "explicit", strikes: [19500, 20000] },
              includeCE: true,
              includePE: true,
            },
          ],
        },
      ],
    }
    const r = await resolveCatalog(cat)
    const chain: any = r.groups[0]?.items[0]
    expect(chain.expiries).toHaveLength(1)
    const strikes = chain.expiries[0].strikes
    expect(strikes.map((s: any) => s.strike)).toEqual([19500, 20000])
  })
})

function futureExpiryString(daysAhead: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + daysAhead)
  return d.toISOString().slice(0, 10)
}
