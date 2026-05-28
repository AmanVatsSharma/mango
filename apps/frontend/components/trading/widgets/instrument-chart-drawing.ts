/**
 * File:        components/trading/widgets/instrument-chart-drawing.ts
 * Module:      Trading · Chart Drawing
 * Purpose:     Manages user-drawn chart annotations (trend lines, horizontal levels) on a
 *              canvas overlay positioned above the lightweight-charts div.
 *
 * Exports:
 *   - DrawingTool                 — "none" | "trendline" | "horizontal"
 *   - PriceTimePoint              — { price, time } in chart coordinate space
 *   - TrendLineDrawing            — committed trend line data
 *   - HorizontalDrawing           — committed horizontal level data
 *   - Drawing                     — union type
 *   - DrawingEngine               — class: attach, startDraw, continueDraw, endDraw, render, hitTest, deleteAt, clearAll
 *
 * Depends on:
 *   - lightweight-charts — IChartApi, ISeriesApi for coordinate conversion
 *
 * Side-effects:
 *   - Writes to HTMLCanvasElement 2D context provided via attach()
 *
 * Key invariants:
 *   - coordinateToTime / coordinateToPrice return null for out-of-range coords — skip silently
 *   - hit-test tolerance is ±6px
 *   - render() is safe to call at any time (clears canvas then redraws)
 *   - attach() must be called before any draw/render calls
 *
 * Read order:
 *   1. DrawingTool / Drawing types
 *   2. DrawingEngine.attach()
 *   3. startDraw / continueDraw / endDraw state machine
 *   4. render() — pixel coordinate conversion + canvas draw calls
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-10
 */

import type { IChartApi, ISeriesApi, Time } from "lightweight-charts"

export type DrawingTool = "none" | "trendline" | "horizontal"

export type PriceTimePoint = { price: number; time: number }

export type TrendLineDrawing = {
  kind: "trendline"
  start: PriceTimePoint
  end: PriceTimePoint
  color: string
}

export type HorizontalDrawing = {
  kind: "horizontal"
  price: number
  color: string
}

export type Drawing = TrendLineDrawing | HorizontalDrawing

const TREND_COLOR = "#fbbf24"
const HORIZ_COLOR = "#3b82f6"
const HIT_TOLERANCE = 6

function pointToSegmentDist(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

export class DrawingEngine {
  private drawings: Drawing[] = []
  private inProgress: { tool: DrawingTool; start: PriceTimePoint } | null = null
  private canvas: HTMLCanvasElement | null = null
  private chart: IChartApi | null = null
  private series: ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null = null

  attach(
    canvas: HTMLCanvasElement,
    chart: IChartApi,
    series: ISeriesApi<"Candlestick"> | ISeriesApi<"Line">,
  ): void {
    this.canvas = canvas
    this.chart = chart
    this.series = series as ISeriesApi<"Candlestick"> | ISeriesApi<"Line">
  }

  detach(): void {
    this.canvas = null
    this.chart = null
    this.series = null
  }

  private pixelToPoint(px: number, py: number): PriceTimePoint | null {
    if (!this.chart || !this.series) return null
    const time = this.chart.timeScale().coordinateToTime(px)
    const price = (this.series as any).coordinateToPrice(py) as number | null
    if (time == null || price == null) return null
    return { price, time: time as number }
  }

  startDraw(tool: DrawingTool, px: number, py: number): void {
    if (tool === "none") return
    const pt = this.pixelToPoint(px, py)
    if (!pt) return
    this.inProgress = { tool, start: pt }
  }

  continueDraw(px: number, py: number): void {
    if (!this.inProgress) return
    this.render(px, py)
  }

  endDraw(px: number, py: number): void {
    if (!this.inProgress) return
    const { tool, start } = this.inProgress
    this.inProgress = null

    if (tool === "trendline") {
      const end = this.pixelToPoint(px, py)
      if (!end) { this.render(); return }
      this.drawings.push({ kind: "trendline", start, end, color: TREND_COLOR })
    } else if (tool === "horizontal") {
      this.drawings.push({ kind: "horizontal", price: start.price, color: HORIZ_COLOR })
    }
    this.render()
  }

  /** Re-render all committed drawings plus optional in-progress preview ending at (tempX, tempY). */
  render(tempX?: number, tempY?: number): void {
    const canvas = this.canvas
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const d of this.drawings) {
      if (d.kind === "trendline") {
        const x1 = this.chart!.timeScale().timeToCoordinate(d.start.time as Time)
        const y1 = (this.series as any).priceToCoordinate(d.start.price) as number | null
        const x2 = this.chart!.timeScale().timeToCoordinate(d.end.time as Time)
        const y2 = (this.series as any).priceToCoordinate(d.end.price) as number | null
        if (x1 == null || y1 == null || x2 == null || y2 == null) continue
        this.drawLine(ctx, x1, y1, x2, y2, d.color, false)
        this.drawEndpoint(ctx, x1, y1, d.color)
        this.drawEndpoint(ctx, x2, y2, d.color)
      } else {
        const y = (this.series as any).priceToCoordinate(d.price) as number | null
        if (y == null) continue
        this.drawHorizontal(ctx, y, d.price, d.color)
      }
    }

    if (this.inProgress && tempX != null && tempY != null) {
      const { tool, start } = this.inProgress
      const x1 = this.chart!.timeScale().timeToCoordinate(start.time as Time)
      const y1 = (this.series as any).priceToCoordinate(start.price) as number | null
      if (x1 != null && y1 != null) {
        if (tool === "trendline") {
          this.drawLine(ctx, x1, y1, tempX, tempY, TREND_COLOR, true)
        } else if (tool === "horizontal") {
          this.drawHorizontal(ctx, y1, start.price, HORIZ_COLOR)
        }
      }
    }
  }

  private drawLine(
    ctx: CanvasRenderingContext2D,
    x1: number, y1: number, x2: number, y2: number,
    color: string, dashed: boolean,
  ): void {
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.setLineDash(dashed ? [5, 3] : [])
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.restore()
  }

  private drawHorizontal(
    ctx: CanvasRenderingContext2D,
    y: number,
    price: number,
    color: string,
  ): void {
    const w = this.canvas!.width
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.setLineDash([3, 4])
    ctx.globalAlpha = 0.75
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(Math.max(0, w - 68), y)
    ctx.stroke()
    ctx.fillStyle = color
    ctx.globalAlpha = 0.9
    ctx.font = "9px 'IBM Plex Mono', monospace"
    ctx.fillText(price.toFixed(2), 6, y - 3)
    ctx.restore()
  }

  private drawEndpoint(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    color: string,
  ): void {
    ctx.save()
    ctx.fillStyle = color
    ctx.globalAlpha = 0.9
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  /** Returns index of drawing hit at pixel (px, py), or -1 if none. */
  hitTest(px: number, py: number): number {
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const d = this.drawings[i]
      if (d.kind === "trendline") {
        const x1 = this.chart!.timeScale().timeToCoordinate(d.start.time as Time)
        const y1 = (this.series as any).priceToCoordinate(d.start.price) as number | null
        const x2 = this.chart!.timeScale().timeToCoordinate(d.end.time as Time)
        const y2 = (this.series as any).priceToCoordinate(d.end.price) as number | null
        if (x1 == null || y1 == null || x2 == null || y2 == null) continue
        if (pointToSegmentDist(px, py, x1, y1, x2, y2) <= HIT_TOLERANCE) return i
      } else {
        const y = (this.series as any).priceToCoordinate(d.price) as number | null
        if (y == null) continue
        if (Math.abs(py - y) <= HIT_TOLERANCE) return i
      }
    }
    return -1
  }

  deleteAt(index: number): void {
    this.drawings.splice(index, 1)
    this.render()
  }

  clearAll(): void {
    this.drawings = []
    this.inProgress = null
    this.render()
  }

  getDrawings(): readonly Drawing[] {
    return this.drawings
  }
}
