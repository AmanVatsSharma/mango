/**
 * @file instrument-chart-theme.ts
 * @module components/trading/widgets
 * @description Theme palettes for `lightweight-charts` layout/grid/crosshair to match app light/dark (next-themes).
 * @author StockTrade
 * @created 2026-03-28
 * @updated 2026-03-28
 *
 * Notes:
 * - Line series color matches bullish accent used on candle bodies for a cohesive terminal look.
 */

import {
  CrosshairMode,
  type ChartOptions,
  type DeepPartial,
  type LineSeriesPartialOptions,
} from "lightweight-charts"

export function getInstrumentChartLayoutOptions(isDark: boolean): DeepPartial<ChartOptions> {
  if (isDark) {
    // Obsidian-style: deep-dark grid, vivid crosshair, IBM Plex Mono axis labels
    return {
      layout: {
        background: { color: "transparent" },
        textColor: "#8B95A3",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1C2028", style: 1 },
        horzLines: { color: "#1C2028", style: 1 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { width: 1, color: "#2E3847", style: 0 },
        horzLine: {
          width: 1,
          color: "#2E3847",
          style: 0,
          labelBackgroundColor: "#141820",
        },
      },
      timeScale: { borderColor: "#1C2028" },
      rightPriceScale: { borderColor: "#1C2028" },
    }
  }
  return {
    layout: {
      background: { color: "transparent" },
      textColor: "#52525b",
    },
    grid: {
      vertLines: { color: "rgba(82, 82, 91, 0.18)" },
      horzLines: { color: "rgba(82, 82, 91, 0.12)" },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { width: 1, color: "rgba(63, 63, 70, 0.2)" },
      horzLine: {
        width: 1,
        color: "rgba(63, 63, 70, 0.2)",
        labelBackgroundColor: "#e4e4e7",
      },
    },
    timeScale: { borderColor: "rgba(212, 212, 216, 0.9)" },
    rightPriceScale: { borderColor: "rgba(212, 212, 216, 0.9)" },
  }
}

/** Histogram bar colors — Obsidian vivid palette for dark, standard for light. */
export function getInstrumentChartVolumeColors(isDark: boolean): { up: string; down: string } {
  if (isDark) {
    return {
      up: "rgba(16, 217, 150, 0.35)",
      down: "rgba(255, 59, 92, 0.35)",
    }
  }
  return {
    up: "rgba(34, 197, 94, 0.35)",
    down: "rgba(239, 68, 68, 0.35)",
  }
}

/** Close-only line series styling — Obsidian #10D996 for dark terminal. */
export function getInstrumentChartLineOptions(isDark: boolean): LineSeriesPartialOptions {
  if (isDark) {
    return {
      color: "#10D996",
      lineWidth: 2,
      crosshairMarkerVisible: true,
    }
  }
  return {
    color: "#059669",
    lineWidth: 2,
    crosshairMarkerVisible: true,
  }
}

/** Colour for each MA period — index 0 = first period in config, cycling if needed. */
export const MA_COLORS = ["#f59e0b", "#a78bfa", "#fb923c", "#38bdf8"] as const

/** Colour for each EMA period. */
export const EMA_COLORS = ["#34d399", "#f472b6", "#facc15", "#60a5fa"] as const

/** RSI line colour and zone fills. */
export const RSI_COLORS = {
  line: "#3b82f6",
  obZone: "rgba(239,68,68,0.05)",
  osZone: "rgba(34,197,94,0.05)",
  obLine: "rgba(239,68,68,0.45)",
  osLine: "rgba(34,197,94,0.45)",
  midLine: "#1e293b",
} as const

/** Fixed pixel height of the RSI sub-chart pane. */
export const RSI_PANE_HEIGHT = 88
