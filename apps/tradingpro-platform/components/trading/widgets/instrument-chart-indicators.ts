/**
 * File:        components/trading/widgets/instrument-chart-indicators.ts
 * Module:      Trading · Chart Indicators
 * Purpose:     Pure math functions for MA, EMA, and RSI indicators — no React, no side effects.
 *
 * Exports:
 *   - IndicatorCandle                            — minimal candle shape required by all functions
 *   - computeMA(candles, period) → LineData[]    — simple moving average of close prices
 *   - computeEMA(candles, period) → LineData[]   — exponential moving average (k = 2/(n+1))
 *   - computeRSI(candles, period) → LineData[]   — Wilder RSI, values 0–100
 *
 * Depends on:
 *   - lightweight-charts — LineData type only (type import, no runtime cost)
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - All functions return [] when candles.length < minimum required (period, or period+1 for RSI)
 *   - RSI avgLoss=0 edge case → value 100 (no losses = overbought)
 *   - time values are copied verbatim from input candles
 *
 * Read order:
 *   1. IndicatorCandle — input shape
 *   2. computeMA — simplest, reference implementation
 *   3. computeEMA — builds on MA seed
 *   4. computeRSI — two-pass Wilder smoothing
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-10
 */

import type { LineData, Time } from "lightweight-charts"

export type IndicatorCandle = {
  time: Time
  open: number
  high: number
  low: number
  close: number
}

/** Simple moving average of close prices. Returns [] when candles.length < period. */
export function computeMA(candles: IndicatorCandle[], period: number): LineData[] {
  if (candles.length < period) return []
  const result: LineData[] = []
  let windowSum = candles.slice(0, period).reduce((s, c) => s + c.close, 0)
  result.push({ time: candles[period - 1].time, value: windowSum / period })
  for (let i = period; i < candles.length; i++) {
    windowSum += candles[i].close - candles[i - period].close
    result.push({ time: candles[i].time, value: windowSum / period })
  }
  return result
}

/**
 * Exponential moving average.
 * Seed = SMA of first `period` bars; k = 2/(period+1).
 * Returns [] when candles.length < period.
 */
export function computeEMA(candles: IndicatorCandle[], period: number): LineData[] {
  if (candles.length < period) return []
  const k = 2 / (period + 1)
  let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period
  const result: LineData[] = [{ time: candles[period - 1].time, value: ema }]
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k)
    result.push({ time: candles[i].time, value: ema })
  }
  return result
}

/**
 * Wilder RSI (period-bar).
 * Returns [] when candles.length <= period.
 * Smoothing: avgGain = (prevAvgGain*(period-1) + gain) / period.
 */
export function computeRSI(candles: IndicatorCandle[], period: number): LineData[] {
  if (candles.length <= period) return []

  const gains: number[] = []
  const losses: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close
    gains.push(diff > 0 ? diff : 0)
    losses.push(diff < 0 ? -diff : 0)
  }

  let avgGain = gains.slice(0, period).reduce((s, v) => s + v, 0) / period
  let avgLoss = losses.slice(0, period).reduce((s, v) => s + v, 0) / period

  const result: LineData[] = []

  const pushRsi = (time: Time, ag: number, al: number) => {
    const rsi = al === 0 ? 100 : 100 - 100 / (1 + ag / al)
    result.push({ time, value: rsi })
  }

  pushRsi(candles[period].time, avgGain, avgLoss)

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period
    pushRsi(candles[i + 1].time, avgGain, avgLoss)
  }

  return result
}
