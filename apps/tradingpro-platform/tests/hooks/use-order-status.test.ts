import {
  isTerminalOrderStatus,
  buildOrderStatusUrl,
} from "@/hooks/use-order-status"

describe("isTerminalOrderStatus", () => {
  it("returns true for EXECUTED", () => expect(isTerminalOrderStatus("EXECUTED")).toBe(true))
  it("returns true for REJECTED", () => expect(isTerminalOrderStatus("REJECTED")).toBe(true))
  it("returns true for CANCELLED", () => expect(isTerminalOrderStatus("CANCELLED")).toBe(true))
  it("returns true for EXPIRED", () => expect(isTerminalOrderStatus("EXPIRED")).toBe(true))
  it("returns true for PARTIALLY_FILLED", () => expect(isTerminalOrderStatus("PARTIALLY_FILLED")).toBe(true))
  it("returns false for PENDING", () => expect(isTerminalOrderStatus("PENDING")).toBe(false))
  it("returns false for null", () => expect(isTerminalOrderStatus(null)).toBe(false))
  it("returns false for unknown string", () => expect(isTerminalOrderStatus("QUEUED")).toBe(false))
})

describe("buildOrderStatusUrl", () => {
  it("returns null when orderId is null", () => expect(buildOrderStatusUrl(null)).toBe(null))
  it("builds correct URL when orderId is provided", () => {
    expect(buildOrderStatusUrl("abc123")).toBe("/api/trading/orders/status?orderId=abc123")
  })
})
