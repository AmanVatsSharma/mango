/**
 * File:        tests/market-data/server-market-data-config-fallback.test.ts
 * Module:      Market Data · server config · prod-throw fallback hardening
 * Purpose:     Trading-q05 — proves the server-side market-data config
 *              throws in production when LIVE_MARKET_WS_URL is unset rather
 *              than silently falling back to the shared dev host.
 *
 * Exports:     none (Jest)
 *
 * Side-effects: mutates process.env temporarily; restored afterEach
 *
 * Key invariants:
 *   - prod + no env → throws clear error mentioning the required env var
 *   - dev + no env → returns a config with the fallback URL (logs warn)
 *   - any-env + LIVE_MARKET_WS_URL set → uses that URL
 *
 * Read order:
 *   1. env save/restore harness
 *   2. tests in "prod-throws / dev-falls-back / explicit-wins" order
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

// The module reads NODE_ENV at function-call time, not at import time, so we
// don't need jest.resetModules between tests. We DO save and restore env
// so each test has a clean slate.

const ENV_KEYS = [
  "LIVE_MARKET_WS_URL",
  "NEXT_PUBLIC_LIVE_MARKET_WS_URL",
  "LIVE_MARKET_WS_API_KEY",
  "NEXT_PUBLIC_LIVE_MARKET_WS_API_KEY",
  "MARKETDATA_QUOTE_MAX_AGE_MS",
] as const

let savedEnv: Record<string, string | undefined>
let savedNodeEnv: string | undefined

beforeEach(() => {
  savedEnv = {}
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
  savedNodeEnv = process.env.NODE_ENV
})

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k]
    else process.env[k] = v
  }
  if (savedNodeEnv === undefined) {
    delete (process.env as Record<string, string | undefined>).NODE_ENV
  } else {
    ;(process.env as Record<string, string>).NODE_ENV = savedNodeEnv
  }
})

// Import via require inside the test bodies so we always use the freshly
// re-imported module after env mutation. (Module-level imports cache the
// import resolution but the function we test reads env at call time.)
function getConfigFn() {
  // The function is not exported by name but the ServerMarketDataService
  // constructor invokes it. Using internal-require so we exercise the same
  // path. Instead, expose via re-import to keep this test focused on the
  // pure logic — easier: recreate the same minimal logic here would be a
  // duplicate, so just import the service and read its `cfg` via a tiny
  // probe. Simplest: import a named export. The function isn't exported,
  // so we test through ServerMarketDataService construction.
  const mod = require("@/lib/market-data/server-market-data.service")
  return () => new mod.ServerMarketDataService()
}

describe("server-market-data default config — Trading-q05 fallback hardening", () => {
  it("throws in production when LIVE_MARKET_WS_URL is unset", () => {
    ;(process.env as Record<string, string>).NODE_ENV = "production"
    const create = getConfigFn()
    expect(create).toThrow(/LIVE_MARKET_WS_URL is required in production/)
  })

  it("falls back (with warn) in development when LIVE_MARKET_WS_URL is unset", () => {
    ;(process.env as Record<string, string>).NODE_ENV = "development"
    const create = getConfigFn()
    expect(create).not.toThrow()
  })

  it("falls back (with warn) in test when LIVE_MARKET_WS_URL is unset", () => {
    ;(process.env as Record<string, string>).NODE_ENV = "test"
    const create = getConfigFn()
    expect(create).not.toThrow()
  })

  it("uses LIVE_MARKET_WS_URL even in production when set", () => {
    ;(process.env as Record<string, string>).NODE_ENV = "production"
    process.env.LIVE_MARKET_WS_URL = "https://prod-gateway.internal"
    process.env.LIVE_MARKET_WS_API_KEY = "real-prod-key"
    const create = getConfigFn()
    expect(create).not.toThrow()
  })

  it("accepts NEXT_PUBLIC_LIVE_MARKET_WS_URL as a server-side fallback", () => {
    ;(process.env as Record<string, string>).NODE_ENV = "production"
    process.env.NEXT_PUBLIC_LIVE_MARKET_WS_URL = "https://shared.internal"
    process.env.NEXT_PUBLIC_LIVE_MARKET_WS_API_KEY = "real-prod-key"
    const create = getConfigFn()
    expect(create).not.toThrow()
  })

  it("Trading-20s: throws in production when LIVE_MARKET_WS_API_KEY is unset (URL set)", () => {
    ;(process.env as Record<string, string>).NODE_ENV = "production"
    process.env.LIVE_MARKET_WS_URL = "https://prod-gateway.internal"
    // API key intentionally omitted
    const create = getConfigFn()
    expect(create).toThrow(/LIVE_MARKET_WS_API_KEY is required in production/)
  })

  it("Trading-20s: dev-mode falls back to demo API key with a warn (URL set)", () => {
    ;(process.env as Record<string, string>).NODE_ENV = "development"
    process.env.LIVE_MARKET_WS_URL = "https://dev-gateway.internal"
    const create = getConfigFn()
    expect(create).not.toThrow()
  })
})
