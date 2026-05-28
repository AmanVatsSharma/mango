/**
 * File: lib/formatting/inr-format.ts
 * Module: formatting
 * Purpose: Format money/number values using Indian grouping and consistent sign/currency spacing.
 * Author: Aman Sharma / NovologicAI
 * Last-updated: 2026-02-23
 * Notes:
 * - Use `formatSignedInr` for P&L/MTM values (e.g. `+ ₹ 1,23,456.78`).
 * - Use `formatInr` for absolute currency values (e.g. `₹ 1,23,456.78`).
 */

const DEFAULT_DECIMALS = 2

function normalizeFiniteNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function buildFormatter(decimals: number): Intl.NumberFormat {
  const safeDecimals = Number.isFinite(decimals) ? Math.max(0, Math.min(6, Math.trunc(decimals))) : DEFAULT_DECIMALS
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: safeDecimals,
    maximumFractionDigits: safeDecimals,
  })
}

const formatterCache = new Map<number, Intl.NumberFormat>()

function getFormatter(decimals: number): Intl.NumberFormat {
  const safeDecimals = Number.isFinite(decimals) ? Math.max(0, Math.min(6, Math.trunc(decimals))) : DEFAULT_DECIMALS
  const cached = formatterCache.get(safeDecimals)
  if (cached) return cached
  const created = buildFormatter(safeDecimals)
  formatterCache.set(safeDecimals, created)
  return created
}

export function formatIndianNumber(value: unknown, decimals: number = 0): string {
  const n = normalizeFiniteNumber(value)
  return getFormatter(decimals).format(n)
}

export function formatInr(value: unknown, decimals: number = DEFAULT_DECIMALS): string {
  const n = normalizeFiniteNumber(value)
  return `₹ ${getFormatter(decimals).format(n)}`
}

export function formatSignedInr(
  value: unknown,
  decimals: number = DEFAULT_DECIMALS,
  options?: { alwaysShowPlus?: boolean },
): string {
  const n = normalizeFiniteNumber(value)
  const abs = Math.abs(n)
  const signPrefix =
    n > 0
      ? options?.alwaysShowPlus
        ? "+ "
        : ""
      : n < 0
        ? "- "
        : ""
  return `${signPrefix}₹ ${getFormatter(decimals).format(abs)}`
}

