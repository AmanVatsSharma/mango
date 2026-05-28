/**
 * @file trusted-client-ip.test.ts
 * @module session-security-tests
 * @description Unit tests for getTrustedClientIp (XFF, CF-Connecting-IP).
 * @author StockTrade
 * @created 2026-03-28
 */

import { getTrustedClientIp } from "@/lib/server/trusted-client-ip"

describe("getTrustedClientIp", () => {
  const prevDepth = process.env.TRUSTED_PROXY_DEPTH
  afterEach(() => {
    if (prevDepth === undefined) delete process.env.TRUSTED_PROXY_DEPTH
    else process.env.TRUSTED_PROXY_DEPTH = prevDepth
  })

  it("prefers CF-Connecting-IP when present", () => {
    const headers = new Headers()
    headers.set("cf-connecting-ip", "203.0.113.5")
    headers.set("x-forwarded-for", "10.0.0.1, 198.51.100.2")
    expect(getTrustedClientIp({ headers })).toBe("203.0.113.5")
  })

  it("uses first X-Forwarded-For hop by default", () => {
    delete process.env.TRUSTED_PROXY_DEPTH
    const headers = new Headers()
    headers.set("x-forwarded-for", "198.51.100.10, 10.0.0.1")
    expect(getTrustedClientIp({ headers })).toBe("198.51.100.10")
  })

  it("falls back to x-real-ip", () => {
    const headers = new Headers()
    headers.set("x-real-ip", "192.0.2.1")
    expect(getTrustedClientIp({ headers })).toBe("192.0.2.1")
  })

  it("falls back to socket remote address", () => {
    const headers = new Headers()
    expect(getTrustedClientIp({ headers, socketRemoteAddress: "::ffff:127.0.0.1" })).toBe("127.0.0.1")
  })
})
