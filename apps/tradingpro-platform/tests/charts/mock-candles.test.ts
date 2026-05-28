import { buildMockCandles, candlesToLineSeries } from "@/lib/charts/mock-candles"

describe("buildMockCandles", () => {
  it("generates the requested number of bars with positive prices", () => {
    const candles = buildMockCandles(250, 12, "RELIANCE")
    expect(candles).toHaveLength(12)
    candles.forEach((candle) => {
      expect(candle.open).toBeGreaterThan(0)
      expect(candle.close).toBeGreaterThan(0)
      expect(candle.volume).toBeGreaterThan(0)
      expect(candle.turnover).toBeGreaterThan(0)
    })
  })

  it("produces deterministic data for the same symbol seed", () => {
    const firstPass = buildMockCandles(180, 8, "SBIN")
    const secondPass = buildMockCandles(180, 8, "SBIN")
    expect(secondPass).toEqual(firstPass)
  })
})

describe("candlesToLineSeries", () => {
  it("maps candle closes into line series data", () => {
    const candles = buildMockCandles(120, 4, "HDFCBANK")
    const lineSeries = candlesToLineSeries(candles)
    expect(lineSeries).toHaveLength(candles.length)
    lineSeries.forEach((point, index) => {
      expect(point.time).toBe(candles[index].time)
      expect(point.value).toBe(candles[index].close)
    })
  })
})
