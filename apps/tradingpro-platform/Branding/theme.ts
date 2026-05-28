/**
 * @file Branding/theme.ts
 * @module Branding
 * @description Centralized brand theme tokens for app colors, gradients, and watchlist palette.
 * @author StockTrade
 * @created 2026-02-20
 */

export interface BrandTheme {
  palette: {
    primaryHex: string
    accentHex: string
    secondaryHex: string
    successHex: string
    warningHex: string
    dangerHex: string
  }
  gradients: {
    primaryFrom: string
    primaryTo: string
    heroFrom: string
    heroTo: string
  }
  chatWidget: {
    primary: string
    hover: string
  }
  watchlist: {
    defaultColor: string
    presetColors: string[]
  }
  oklch: {
    light: {
      primary: string
      secondary: string
      accent: string
      ring: string
      chart1: string
      chart2: string
      chart3: string
      chart4: string
      chart5: string
    }
    dark: {
      primary: string
      secondary: string
      accent: string
      ring: string
      chart1: string
      chart2: string
      chart3: string
      chart4: string
      chart5: string
    }
  }
}

export const BRAND_THEME: BrandTheme = {
  palette: {
    primaryHex: "#06B6D4",
    accentHex: "#22D3EE",
    secondaryHex: "#8B5CF6",
    successHex: "#10B981",
    warningHex: "#F59E0B",
    dangerHex: "#EF4444",
  },
  gradients: {
    primaryFrom: "#06B6D4",
    primaryTo: "#8B5CF6",
    heroFrom: "#0891B2",
    heroTo: "#7C3AED",
  },
  chatWidget: {
    primary: "#25D366",
    hover: "#1FBE58",
  },
  watchlist: {
    defaultColor: "#3B82F6",
    presetColors: ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6B7280"],
  },
  oklch: {
    light: {
      primary: "0.55 0.15 195",
      secondary: "0.6 0.15 264",
      accent: "0.6 0.15 264",
      ring: "0.55 0.15 195 / 0.5",
      chart1: "0.55 0.2 264",
      chart2: "0.6 0.2 35",
      chart3: "0.6 0.15 142",
      chart4: "0.6 0.2 350",
      chart5: "0.5 0.2 220",
    },
    dark: {
      primary: "0.65 0.15 195",
      secondary: "0.2 0 0",
      accent: "0.2 0 0",
      ring: "0.65 0.15 195 / 0.5",
      chart1: "0.6 0.2 264",
      chart2: "0.7 0.17 35",
      chart3: "0.65 0.15 142",
      chart4: "0.7 0.2 350",
      chart5: "0.6 0.2 220",
    },
  },
}
