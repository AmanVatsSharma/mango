/**
 * @file mock-candles.ts
 * @module lib/charts
 * @description Deterministic mock candle builders for lightweight-chart demos.
 * @author StockTrade
 * @created 2025-12-06
 */

export interface MockCandle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  turnover: number
}

export interface MockLinePoint {
  time: number
  value: number
}

const DEFAULT_BARS = 180
const FIVE_MINUTES = 300 // seconds

const normalizeSeed = (seedKey: string): number => {
  if (!seedKey) return 1
  let hash = 0
  for (let i = 0; i < seedKey.length; i += 1) {
    hash = (hash << 5) - hash + seedKey.charCodeAt(i)
    hash |= 0 // Convert to 32-bit integer
  }
  if (hash === 0) return 1
  return hash >>> 0
}

const createSeededRandom = (seedKey: string) => {
  let state = normalizeSeed(seedKey)
  return () => {
    state = (1664525 * state + 1013904223) % 4294967296
    return (state >>> 0) / 4294967296
  }
}

const clampPrice = (value: number) => Number(value.toFixed(2))

/**
 * Build deterministic mock candlestick data for a given symbol/price baseline.
 */
export function buildMockCandles(basePrice: number, bars: number = DEFAULT_BARS, seedKey: string = "default"): MockCandle[] {
  const safeBase = Number.isFinite(basePrice) && basePrice > 0 ? basePrice : 100
  const random = createSeededRandom(`${seedKey}-${safeBase.toFixed(2)}`)
  const candles: MockCandle[] = []
  const startTime = Math.floor(Date.now() / 1000) - bars * FIVE_MINUTES
  let lastClose = safeBase

  for (let index = 0; index < bars; index += 1) {
    const time = startTime + index * FIVE_MINUTES
    const drift = (random() - 0.5) * 0.35 // ~0.35% drift per bar
    const volatility = 0.0025 + random() * 0.0025
    const open = clampPrice(lastClose)
    const close = clampPrice(open * (1 + drift))
    const high = clampPrice(Math.max(open, close) * (1 + volatility))
    const low = clampPrice(Math.min(open, close) * (1 - volatility))
    const volume = Math.floor(50000 + random() * 150000)
    const turnover = Number((close * volume).toFixed(2))

    candles.push({ time, open, high, low, close, volume, turnover })
    lastClose = close
  }

  return candles
}

/**
 * Convert candle closes into a line/area-series friendly data array.
 */
export function candlesToLineSeries(candles: MockCandle[]): MockLinePoint[] {
  return candles.map((candle) => ({ time: candle.time, value: candle.close }))
}
