/**
 * @file order-form-normalization.ts
 * @module lib/hooks
 * @description Strict numeric and stock-shape normalization helpers for order-form UI flows.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-03-28
 * @updated 2026-04-08 — `minMarginPerLot` on normalized risk config payload.
 */

export interface NormalizedOrderFormRiskConfig {
  leverage: number
  marginRate: number | null
  minMarginPerLot: number | null
  brokerageFlat: number | null
  brokerageRate: number | null
  brokerageCap: number | null
}

const DERIVATIVE_SEGMENTS = new Set(["NFO", "FNO", "NSE_FO", "MCX", "MCX_FO"])

export function parseFiniteOrderFormNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === "boolean") {
    return null
  }
  if (typeof value === "string") {
    const normalizedValue = value.trim()
    if (!normalizedValue) {
      return null
    }
    const loweredValue = normalizedValue.toLowerCase()
    if (
      loweredValue === "null" ||
      loweredValue === "undefined" ||
      loweredValue === "nan" ||
      loweredValue === "infinity" ||
      loweredValue === "+infinity" ||
      loweredValue === "-infinity"
    ) {
      return null
    }
    const parsedValue = Number(normalizedValue)
    return Number.isFinite(parsedValue) ? parsedValue : null
  }
  try {
    const parsedValue = Number(value)
    return Number.isFinite(parsedValue) ? parsedValue : null
  } catch {
    return null
  }
}

function normalizeUppercaseText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const normalizedValue = value.trim().toUpperCase()
  return normalizedValue || undefined
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const normalizedValue = value.trim()
  return normalizedValue || null
}

function normalizePositiveInteger(value: unknown): number | undefined {
  const parsedValue = parseFiniteOrderFormNumber(value)
  if (parsedValue === null || !Number.isInteger(parsedValue) || parsedValue <= 0) {
    return undefined
  }
  return parsedValue
}

function normalizeNonNegativeNumber(value: unknown): number | undefined {
  const parsedValue = parseFiniteOrderFormNumber(value)
  if (parsedValue === null || parsedValue < 0) {
    return undefined
  }
  return parsedValue
}

function normalizePositiveNumber(value: unknown): number | undefined {
  const parsedValue = parseFiniteOrderFormNumber(value)
  if (parsedValue === null || parsedValue <= 0) {
    return undefined
  }
  return parsedValue
}

function parseStrictPositiveTokenSegment(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return normalizePositiveInteger(value)
  }
  const normalizedValue = value.trim()
  if (!/^\d+$/.test(normalizedValue)) {
    return undefined
  }
  return normalizePositiveInteger(normalizedValue)
}

export function deriveInstrumentTokenFromOrderFormInstrumentId(
  instrumentId: string | null | undefined,
): number | undefined {
  if (!instrumentId) {
    return undefined
  }
  const normalizedInstrumentId = instrumentId.trim()
  if (!normalizedInstrumentId) {
    return undefined
  }
  const parts = normalizedInstrumentId.split("-")
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const parsedToken = parseStrictPositiveTokenSegment(parts[index])
    if (parsedToken !== undefined) {
      return parsedToken
    }
  }
  return undefined
}

export function normalizeOrderFormRiskConfigPayload(
  value: unknown,
): NormalizedOrderFormRiskConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  const source = value as Record<string, unknown>
  const leverageCandidate = normalizePositiveNumber(source.leverage)
  const marginRateCandidate = normalizeNonNegativeNumber(source.marginRate)
  const minMarginPerLotCandidate = normalizeNonNegativeNumber(source.minMarginPerLot)
  const brokerageFlatCandidate = normalizeNonNegativeNumber(source.brokerageFlat)
  const brokerageRateCandidate = normalizeNonNegativeNumber(source.brokerageRate)
  const brokerageCapCandidate = normalizeNonNegativeNumber(source.brokerageCap)

  return {
    leverage: leverageCandidate ?? 1,
    marginRate: marginRateCandidate ?? null,
    minMarginPerLot: minMarginPerLotCandidate ?? null,
    brokerageFlat: brokerageFlatCandidate ?? null,
    brokerageRate: brokerageRateCandidate ?? null,
    brokerageCap: brokerageCapCandidate ?? null,
  }
}

export function normalizeOrderFormStockData(raw: any | null) {
  if (!raw) {
    return null
  }
  const clone: any = { ...raw }
  const normalizedExchange = normalizeUppercaseText(clone.exchange || clone.segment) || "NSE"
  const normalizedSegment = normalizeUppercaseText(clone.segment || clone.exchange) || normalizedExchange
  const parsedToken =
    parseStrictPositiveTokenSegment(clone.token) ??
    deriveInstrumentTokenFromOrderFormInstrumentId(clone.instrumentId)
  const normalizedInstrumentId = normalizeUppercaseText(clone.instrumentId)
  const instrumentId =
    normalizedInstrumentId || (parsedToken !== undefined ? `${normalizedExchange}-${parsedToken}` : undefined)
  const parsedLotSize = normalizePositiveInteger(clone.lot_size ?? clone.lotSize)
  const lotSize = parsedLotSize ?? (DERIVATIVE_SEGMENTS.has(normalizedSegment) ? 1 : undefined)
  const normalizedOptionType = normalizeUppercaseText(clone.optionType ?? clone.option_type)
  const optionType =
    normalizedOptionType === "CE" || normalizedOptionType === "PE" ? normalizedOptionType : undefined
  const normalizedName = typeof clone.name === "string" ? clone.name.trim() : ""
  const normalizedSymbol = typeof clone.symbol === "string" ? clone.symbol.trim() : ""
  const normalizedExpiry = typeof clone.expiry === "string" ? clone.expiry.trim() : clone.expiry
  const normalizedStockId = normalizeOptionalText(clone.stockId)
  const normalizedRowId = normalizeOptionalText(clone.id)

  return {
    ...clone,
    stockId: normalizedStockId ?? (parsedToken === undefined && !instrumentId ? normalizedRowId : null),
    token: parsedToken,
    exchange: normalizedExchange,
    segment: normalizedSegment,
    instrumentId,
    lot_size: lotSize,
    lotSize,
    ltp: normalizeNonNegativeNumber(clone.ltp),
    close: normalizeNonNegativeNumber(clone.close),
    // Keep strike only for valid option-style payloads; avoid sending 0 sentinel for futures.
    strikePrice: normalizePositiveNumber(clone.strikePrice ?? clone.strike_price),
    optionType,
    expiry: normalizedExpiry || undefined,
    name: normalizedName || normalizedSymbol || "UNKNOWN",
    watchlistItemId: clone.watchlistItemId ?? clone.id ?? null,
  }
}
