import { resolveRejection } from "@/lib/order/rejection-codes"

describe("resolveRejection", () => {
  it("marks INSUFFICIENT_MARGIN as fixable", () => {
    const result = resolveRejection("INSUFFICIENT_MARGIN")
    expect(result.fixable).toBe(true)
    expect(result.humanMessage).toContain("margin")
  })

  it("marks MARKET_CLOSED as hard reject", () => {
    const result = resolveRejection("MARKET_CLOSED")
    expect(result.fixable).toBe(false)
  })

  it("marks RISK_LIMIT_EXCEEDED as hard reject", () => {
    expect(resolveRejection("RISK_LIMIT_EXCEEDED").fixable).toBe(false)
  })

  it("marks INVALID_QTY as fixable", () => {
    expect(resolveRejection("INVALID_QTY").fixable).toBe(true)
  })

  it("marks PRICE_OUT_OF_RANGE as fixable", () => {
    expect(resolveRejection("PRICE_OUT_OF_RANGE").fixable).toBe(true)
  })

  it("returns fixable=false for unknown code", () => {
    const result = resolveRejection("SOME_UNKNOWN_CODE_XYZ")
    expect(result.fixable).toBe(false)
    expect(result.humanMessage).toBeTruthy()
  })

  it("returns fixable=false for null code", () => {
    expect(resolveRejection(null).fixable).toBe(false)
  })

  it("returns fixable=false for undefined code", () => {
    expect(resolveRejection(undefined).fixable).toBe(false)
  })
})
