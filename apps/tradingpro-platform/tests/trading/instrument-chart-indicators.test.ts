import {
  computeMA,
  computeEMA,
  computeRSI,
  type IndicatorCandle,
} from "@/components/trading/widgets/instrument-chart-indicators"

function makeCandles(closes: number[]): IndicatorCandle[] {
  return closes.map((c, i) => ({ time: (1000 + i * 60) as any, open: c, high: c, low: c, close: c }))
}

describe("computeMA", () => {
  it("returns empty array when candles < period", () => {
    expect(computeMA(makeCandles([1, 2]), 5)).toEqual([])
  })

  it("computes correct 3-period MA", () => {
    const result = computeMA(makeCandles([10, 20, 30, 40]), 3)
    expect(result).toHaveLength(2)
    expect(result[0].value).toBeCloseTo(20, 5)
    expect(result[1].value).toBeCloseTo(30, 5)
  })
})

describe("computeEMA", () => {
  it("returns empty array when candles < period", () => {
    expect(computeEMA(makeCandles([1, 2]), 5)).toEqual([])
  })

  it("first EMA value equals SMA of first period bars", () => {
    const result = computeEMA(makeCandles([10, 20, 30, 40]), 3)
    expect(result[0].value).toBeCloseTo(20, 5)
  })

  it("subsequent EMA applies smoothing factor", () => {
    const result = computeEMA(makeCandles([10, 20, 30, 40]), 3)
    // k = 2/(3+1) = 0.5; ema1 = 40*0.5 + 20*0.5 = 30
    expect(result[1].value).toBeCloseTo(30, 5)
  })
})

describe("computeRSI", () => {
  it("returns empty array when candles <= period", () => {
    expect(computeRSI(makeCandles([1, 2, 3]), 14)).toEqual([])
  })

  it("returns RSI=100 for all-gain sequence", () => {
    const candles = makeCandles([...Array(15)].map((_, i) => i + 1))
    const result = computeRSI(candles, 14)
    expect(result[0].value).toBeCloseTo(100, 0)
  })

  it("returns RSI=0 for all-loss sequence", () => {
    const candles = makeCandles([...Array(15)].map((_, i) => 15 - i))
    const result = computeRSI(candles, 14)
    expect(result[0].value).toBeCloseTo(0, 0)
  })
})
