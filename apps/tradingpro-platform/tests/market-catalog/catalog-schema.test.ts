/**
 * @file catalog-schema.test.ts
 * @module tests/market-catalog
 * @description Schema validation + defensive parser tests for MARKET_CATALOG_V1.
 * @author StockTrade
 * @created 2026-05-01
 */

import {
  DEFAULT_MARKET_CATALOG_V1,
  marketCatalogV1Schema,
  parseMarketCatalogJson,
} from "@/lib/market-catalog/catalog-schema"

describe("market-catalog schema", () => {
  it("accepts an empty catalog", () => {
    const result = marketCatalogV1Schema.safeParse({ version: 1, groups: [] })
    expect(result.success).toBe(true)
  })

  it("accepts a catalog with one instrument item", () => {
    const result = marketCatalogV1Schema.safeParse({
      version: 1,
      groups: [
        {
          id: "indices",
          label: "Indices",
          sortOrder: 0,
          items: [
            {
              kind: "instrument",
              token: 256265,
              symbol: "NIFTY 50",
              exchange: "NSE",
              segment: "NSE_INDEX",
            },
          ],
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("accepts an options-chain recipe", () => {
    const result = marketCatalogV1Schema.safeParse({
      version: 1,
      groups: [
        {
          id: "options",
          label: "Options Chains",
          sortOrder: 1,
          items: [
            {
              kind: "options-chain",
              underlying: { token: 256265, symbol: "NIFTY", segment: "NSE_INDEX" },
              expiryStrategy: { mode: "next-n-weekly", count: 3 },
              strikeStrategy: { mode: "atm-window", window: 10 },
              includeCE: true,
              includePE: true,
            },
          ],
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("rejects bad slug", () => {
    const result = marketCatalogV1Schema.safeParse({
      version: 1,
      groups: [{ id: "Has Space!", label: "x", sortOrder: 0, items: [] }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects an invalid item kind", () => {
    const result = marketCatalogV1Schema.safeParse({
      version: 1,
      groups: [
        {
          id: "bad",
          label: "x",
          sortOrder: 0,
          items: [{ kind: "neither-instrument-nor-options-chain", foo: "bar" }],
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("rejects strike window over 40", () => {
    const result = marketCatalogV1Schema.safeParse({
      version: 1,
      groups: [
        {
          id: "g",
          label: "g",
          sortOrder: 0,
          items: [
            {
              kind: "options-chain",
              underlying: { token: 1, symbol: "NIFTY", segment: "NSE_INDEX" },
              expiryStrategy: { mode: "next-n-weekly", count: 1 },
              strikeStrategy: { mode: "atm-window", window: 999 },
              includeCE: true,
              includePE: true,
            },
          ],
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("rejects > 50 groups", () => {
    const groups = Array.from({ length: 51 }, (_, i) => ({
      id: `g-${i}`,
      label: `g-${i}`,
      sortOrder: i,
      items: [],
    }))
    const result = marketCatalogV1Schema.safeParse({ version: 1, groups })
    expect(result.success).toBe(false)
  })

  describe("parseMarketCatalogJson — defensive", () => {
    it("falls back to default on null", () => {
      expect(parseMarketCatalogJson(null)).toEqual(DEFAULT_MARKET_CATALOG_V1)
    })

    it("falls back to default on garbage string", () => {
      expect(parseMarketCatalogJson("not json {")).toEqual(DEFAULT_MARKET_CATALOG_V1)
    })

    it("falls back to default on schema-invalid object", () => {
      expect(parseMarketCatalogJson({ version: 99, groups: "wrong" })).toEqual(
        DEFAULT_MARKET_CATALOG_V1,
      )
    })

    it("parses a valid stringified blob round-trip", () => {
      const blob = JSON.stringify({
        version: 1,
        groups: [
          {
            id: "i",
            label: "Indices",
            sortOrder: 0,
            items: [
              { kind: "instrument", token: 100, symbol: "X", exchange: "NSE", segment: "NSE" },
            ],
          },
        ],
      })
      const parsed = parseMarketCatalogJson(blob)
      expect(parsed.version).toBe(1)
      expect(parsed.groups).toHaveLength(1)
      expect(parsed.groups[0]?.items[0]?.kind).toBe("instrument")
    })
  })
})
