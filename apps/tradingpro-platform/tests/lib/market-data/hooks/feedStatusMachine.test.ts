import { deriveFeedStatus } from "@/lib/market-data/hooks/useFeedStatus"

describe("deriveFeedStatus", () => {
  const BASE = { isConnected: "connected" as const, isOffline: false, disconnectedMs: 0 }

  it("returns LIVE when connected and online", () => {
    expect(deriveFeedStatus({ ...BASE })).toBe("LIVE")
  })

  it("returns OFFLINE when navigator is offline regardless of WS state", () => {
    expect(deriveFeedStatus({ ...BASE, isOffline: true })).toBe("OFFLINE")
    expect(deriveFeedStatus({ ...BASE, isConnected: "disconnected", isOffline: true })).toBe("OFFLINE")
  })

  it("returns DEGRADED when disconnected and within escalation window", () => {
    expect(deriveFeedStatus({ ...BASE, isConnected: "disconnected", disconnectedMs: 10_000 })).toBe("DEGRADED")
    expect(deriveFeedStatus({ ...BASE, isConnected: "disconnected", disconnectedMs: 29_999 })).toBe("DEGRADED")
  })

  it("returns STALE when disconnected beyond 30s", () => {
    expect(deriveFeedStatus({ ...BASE, isConnected: "disconnected", disconnectedMs: 30_000 })).toBe("STALE")
    expect(deriveFeedStatus({ ...BASE, isConnected: "disconnected", disconnectedMs: 60_000 })).toBe("STALE")
  })

  it("returns STALE for error and connecting states beyond 30s", () => {
    expect(deriveFeedStatus({ ...BASE, isConnected: "error", disconnectedMs: 35_000 })).toBe("STALE")
    expect(deriveFeedStatus({ ...BASE, isConnected: "connecting", disconnectedMs: 35_000 })).toBe("STALE")
  })

  it("returns DEGRADED for error/connecting within escalation window", () => {
    expect(deriveFeedStatus({ ...BASE, isConnected: "error", disconnectedMs: 5_000 })).toBe("DEGRADED")
  })
})
