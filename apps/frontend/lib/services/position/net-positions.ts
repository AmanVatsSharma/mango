/**
 * @file net-positions.ts
 * @module position
 * @description Kite-style net position aggregation over lot-wise position rows.
 * @author StockTrade
 * @created 2026-02-25
 */

type Maybe<T> = T | null | undefined

export type NetPositionIdentity = {
  stockId: string | null
  instrumentId: string | null
  segment: string | null
  exchange: string | null
  strikePrice: number | null
  optionType: string | null
  expiry: string | null
  token: number | null
}

export type NetPositionLotRef = {
  lotIds: string[]
  primaryLotId: string | null
}

export type NetPositionPayload = {
  id: string
  netKey: string
  symbol: string
  productType: string
  isIntraday: boolean
  identity: NetPositionIdentity
  quantity: number
  lotSize: number | null
  instrumentId: string | null
  segment: string | null
  strikePrice: number | null
  optionType: string | null
  expiry: string | null
  token: number | null
  averagePrice: number
  unrealizedPnL: number
  realizedPnL: number
  bookedPnL: number
  dayPnL: number
  pnlUpdatedAtMs: number | null
  stopLoss: number | null
  target: number | null
  createdAt: string
  closedAt: string | null
  status: "OPEN" | "CLOSED"
  isClosed: boolean
  currentPrice: number
  currentValue: number
  investedValue: number
  stock: any | null
} & NetPositionLotRef

function normalizeUpperText(value: unknown): string {
  if (typeof value !== "string") return ""
  return value.trim().toUpperCase()
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeOptionalInteger(value: unknown): number | null {
  const parsed = normalizeOptionalNumber(value)
  if (parsed === null) return null
  const int = Math.trunc(parsed)
  return Number.isFinite(int) ? int : null
}

function resolvePositionProductType(value: unknown, isIntraday: unknown): string {
  const raw = normalizeUpperText(value)
  if (!raw) {
    return typeof isIntraday === "boolean" && isIntraday ? "MIS" : "CNC"
  }
  if (raw === "INTRADAY") return "MIS"
  if (raw === "DELIVERY") return "CNC"
  return raw
}

function resolveIdentity(input: any): NetPositionIdentity {
  const identity = (input?.identity ?? {}) as Record<string, unknown>
  const stock = (input?.stock ?? input?.Stock ?? null) as any

  const instrumentId =
    normalizeOptionalText(identity?.instrumentId) ??
    normalizeOptionalText(input?.instrumentId) ??
    normalizeOptionalText(stock?.instrumentId) ??
    null

  const segment =
    normalizeOptionalText(identity?.segment) ??
    normalizeOptionalText(input?.segment) ??
    normalizeOptionalText(stock?.segment) ??
    null

  const exchange =
    normalizeOptionalText(identity?.exchange) ??
    normalizeOptionalText(input?.exchange) ??
    normalizeOptionalText(stock?.exchange) ??
    null

  const stockId = normalizeOptionalText(identity?.stockId) ?? normalizeOptionalText(input?.stockId) ?? null
  const strikePrice = normalizeOptionalNumber(identity?.strikePrice ?? input?.strikePrice ?? stock?.strikePrice)
  const optionType =
    normalizeOptionalText(identity?.optionType) ??
    normalizeOptionalText(input?.optionType) ??
    normalizeOptionalText(stock?.optionType) ??
    null
  const expiry =
    normalizeOptionalText(identity?.expiry) ??
    normalizeOptionalText(input?.expiry) ??
    normalizeOptionalText(stock?.expiry) ??
    null
  const token = normalizeOptionalInteger(identity?.token ?? input?.token ?? stock?.token)

  return {
    stockId,
    instrumentId: instrumentId ? instrumentId.toUpperCase() : null,
    segment: segment ? segment.toUpperCase() : null,
    exchange: exchange ? exchange.toUpperCase() : null,
    strikePrice,
    optionType: optionType ? optionType.toUpperCase() : null,
    expiry,
    token,
  }
}

export function buildNetPositionKey(position: any): { key: string; symbol: string; productType: string; identity: NetPositionIdentity } {
  const symbol = normalizeUpperText(position?.symbol) || "UNKNOWN"
  const productType = resolvePositionProductType(position?.productType, position?.isIntraday)
  const identity = resolveIdentity(position)

  const identityCore =
    identity.stockId ||
    identity.instrumentId ||
    `${symbol}|${identity.segment || "NA"}|${identity.optionType || "NA"}|${identity.strikePrice ?? "NA"}|${identity.expiry || "NA"}|${identity.token ?? "NA"}`

  return {
    key: `${identityCore}|${productType}`,
    symbol,
    productType,
    identity,
  }
}

function resolveCommonValueOrNull(values: Array<Maybe<number>>): number | null {
  let seen = false
  let first: number | null = null
  for (const v of values) {
    const normalized = v === undefined ? null : v
    if (!seen) {
      first = normalized as number | null
      seen = true
      continue
    }
    if (normalized !== first) {
      return null
    }
  }
  return seen ? first : null
}

export function aggregateNetPositions(input: {
  openLots: any[]
  closedLotsToday: any[]
  dateKeyIst: string
}): NetPositionPayload[] {
  const openGroups = new Map<
    string,
    {
      netKey: string
      symbol: string
      productType: string
      isIntraday: boolean
      identity: NetPositionIdentity
      lotSize: number | null
      lotIds: string[]
      primaryLotId: string | null
      avgNumerator: number
      avgDenom: number
      netQuantity: number
      unrealizedPnL: number
      dayPnL: number
      pnlUpdatedAtMs: number | null
      currentPrice: number
      currentPriceUpdatedAtMs: number | null
      stopLossValues: Array<number | null>
      targetValues: Array<number | null>
      createdAt: string
      stock: any | null
    }
  >()

  for (const lot of input.openLots || []) {
    const { key, symbol, productType, identity } = buildNetPositionKey(lot)
    const quantity = Math.trunc(normalizeOptionalNumber(lot?.quantity) ?? 0)
    if (!Number.isFinite(quantity) || quantity === 0) {
      continue
    }

    const avgPrice = normalizeOptionalNumber(lot?.averagePrice) ?? 0
    const absQty = Math.abs(quantity)
    const unrealizedPnL = normalizeOptionalNumber(lot?.unrealizedPnL) ?? 0
    const dayPnL = normalizeOptionalNumber(lot?.dayPnL) ?? unrealizedPnL
    const pnlUpdatedAtMs = normalizeOptionalInteger(lot?.pnlUpdatedAtMs)
    const currentPrice = normalizeOptionalNumber(lot?.currentPrice) ?? normalizeOptionalNumber(lot?.stock?.ltp) ?? avgPrice
    const currentPriceUpdatedAtMs = pnlUpdatedAtMs
    const lotId = typeof lot?.id === "string" ? lot.id : ""
    const lotSize = normalizeOptionalInteger(lot?.lotSize ?? lot?.stock?.lotSize ?? lot?.stock?.lot_size)
    const stopLoss = normalizeOptionalNumber(lot?.stopLoss)
    const target = normalizeOptionalNumber(lot?.target)
    const createdAt = typeof lot?.createdAt === "string" ? lot.createdAt : new Date().toISOString()
    const isIntraday = typeof lot?.isIntraday === "boolean" ? lot.isIntraday : productType === "MIS"
    const stock = lot?.stock ?? lot?.Stock ?? null

    const existing = openGroups.get(key)
    if (!existing) {
      openGroups.set(key, {
        netKey: key,
        symbol,
        productType,
        isIntraday,
        identity,
        lotSize,
        lotIds: lotId ? [lotId] : [],
        primaryLotId: lotId || null,
        avgNumerator: absQty * avgPrice,
        avgDenom: absQty,
        netQuantity: quantity,
        unrealizedPnL,
        dayPnL,
        pnlUpdatedAtMs: pnlUpdatedAtMs ?? null,
        currentPrice,
        currentPriceUpdatedAtMs: currentPriceUpdatedAtMs ?? null,
        stopLossValues: [stopLoss],
        targetValues: [target],
        createdAt,
        stock,
      })
      continue
    }

    existing.lotIds.push(...(lotId ? [lotId] : []))
    existing.primaryLotId = existing.primaryLotId || (lotId || null)
    existing.avgNumerator += absQty * avgPrice
    existing.avgDenom += absQty
    existing.netQuantity += quantity
    existing.unrealizedPnL += unrealizedPnL
    existing.dayPnL += dayPnL
    existing.stopLossValues.push(stopLoss)
    existing.targetValues.push(target)

    if (pnlUpdatedAtMs !== null) {
      existing.pnlUpdatedAtMs = Math.max(existing.pnlUpdatedAtMs ?? 0, pnlUpdatedAtMs)
    }
    if (currentPriceUpdatedAtMs !== null) {
      const prev = existing.currentPriceUpdatedAtMs ?? 0
      if (currentPriceUpdatedAtMs >= prev) {
        existing.currentPrice = currentPrice
        existing.currentPriceUpdatedAtMs = currentPriceUpdatedAtMs
      }
    }
    if (existing.createdAt > createdAt) {
      existing.createdAt = createdAt
    }
    if (!existing.stock && stock) {
      existing.stock = stock
    }
  }

  const openNetPositions: NetPositionPayload[] = Array.from(openGroups.values())
    .filter((g) => Number.isFinite(g.netQuantity) && g.netQuantity !== 0)
    .map((g) => {
      const averagePrice = g.avgDenom > 0 ? g.avgNumerator / g.avgDenom : 0
      const stopLoss = resolveCommonValueOrNull(g.stopLossValues)
      const target = resolveCommonValueOrNull(g.targetValues)
      const currentPrice = Number.isFinite(g.currentPrice) && g.currentPrice > 0 ? g.currentPrice : averagePrice

      const id = `net:${g.netKey}`
      const quantity = Math.trunc(g.netQuantity)
      return {
        id,
        netKey: g.netKey,
        symbol: g.symbol,
        productType: g.productType,
        isIntraday: g.isIntraday,
        identity: g.identity,
        quantity,
        lotSize: g.lotSize,
        instrumentId: g.identity.instrumentId,
        segment: g.identity.segment,
        strikePrice: g.identity.strikePrice,
        optionType: g.identity.optionType,
        expiry: g.identity.expiry,
        token: g.identity.token,
        averagePrice,
        unrealizedPnL: g.unrealizedPnL,
        realizedPnL: 0,
        bookedPnL: 0,
        dayPnL: g.dayPnL,
        pnlUpdatedAtMs: g.pnlUpdatedAtMs,
        stopLoss,
        target,
        createdAt: g.createdAt,
        closedAt: null,
        status: "OPEN",
        isClosed: false,
        currentPrice,
        currentValue: currentPrice * quantity,
        investedValue: averagePrice * quantity,
        stock: g.stock,
        lotIds: g.lotIds,
        primaryLotId: g.primaryLotId,
      }
    })

  type ClosedGroup = {
    netKey: string
    symbol: string
    productType: string
    isIntraday: boolean
    identity: NetPositionIdentity
    lotSize: number | null
    lotIds: string[]
    primaryLotId: string | null
    bookedPnL: number
    dayPnL: number
    createdAt: string
    closedAt: string
    stock: any | null
  }

  const closedGroups = new Map<string, ClosedGroup>()

  for (const lot of input.closedLotsToday || []) {
    const { key, symbol, productType, identity } = buildNetPositionKey(lot)
    const bookedCandidate =
      normalizeOptionalNumber(lot?.bookedPnL) ??
      normalizeOptionalNumber(lot?.realizedPnL) ??
      normalizeOptionalNumber(lot?.unrealizedPnL) ??
      0
    const dayPnLCandidate =
      normalizeOptionalNumber(lot?.dayPnL) ??
      normalizeOptionalNumber(lot?.unrealizedPnL) ??
      bookedCandidate
    const lotId = typeof lot?.id === "string" ? lot.id : ""
    const lotSize = normalizeOptionalInteger(lot?.lotSize ?? lot?.stock?.lotSize ?? lot?.stock?.lot_size)
    const createdAt = typeof lot?.createdAt === "string" ? lot.createdAt : new Date().toISOString()
    const closedAt = typeof lot?.closedAt === "string" ? lot.closedAt : createdAt
    const isIntraday = typeof lot?.isIntraday === "boolean" ? lot.isIntraday : productType === "MIS"
    const stock = lot?.stock ?? lot?.Stock ?? null

    const existing = closedGroups.get(key)
    if (!existing) {
      closedGroups.set(key, {
        netKey: key,
        symbol,
        productType,
        isIntraday,
        identity,
        lotSize,
        lotIds: lotId ? [lotId] : [],
        primaryLotId: lotId || null,
        bookedPnL: bookedCandidate,
        dayPnL: dayPnLCandidate,
        createdAt,
        closedAt,
        stock,
      })
      continue
    }

    existing.bookedPnL += bookedCandidate
    existing.dayPnL += dayPnLCandidate
    existing.lotIds.push(...(lotId ? [lotId] : []))
    existing.primaryLotId = existing.primaryLotId || (lotId || null)
    if (existing.closedAt < closedAt) {
      existing.closedAt = closedAt
    }
    if (existing.createdAt > createdAt) {
      existing.createdAt = createdAt
    }
    if (!existing.stock && stock) {
      existing.stock = stock
    }
  }

  const closedNetPositions: NetPositionPayload[] = Array.from(closedGroups.values()).map((g) => {
    const id = `net-closed:${input.dateKeyIst}:${g.netKey}`
    const averagePrice = normalizeOptionalNumber((g.stock as any)?.ltp) ?? 0
    return {
      id,
      netKey: g.netKey,
      symbol: g.symbol,
      productType: g.productType,
      isIntraday: g.isIntraday,
      identity: g.identity,
      quantity: 0,
      lotSize: g.lotSize,
      instrumentId: g.identity.instrumentId,
      segment: g.identity.segment,
      strikePrice: g.identity.strikePrice,
      optionType: g.identity.optionType,
      expiry: g.identity.expiry,
      token: g.identity.token,
      averagePrice,
      unrealizedPnL: g.bookedPnL,
      realizedPnL: g.bookedPnL,
      bookedPnL: g.bookedPnL,
      dayPnL: g.dayPnL,
      pnlUpdatedAtMs: null,
      stopLoss: null,
      target: null,
      createdAt: g.createdAt,
      closedAt: g.closedAt,
      status: "CLOSED",
      isClosed: true,
      currentPrice: averagePrice,
      currentValue: 0,
      investedValue: 0,
      stock: g.stock,
      lotIds: g.lotIds,
      primaryLotId: g.primaryLotId,
    }
  })

  openNetPositions.sort((a, b) => Math.abs((b.unrealizedPnL ?? 0) as number) - Math.abs((a.unrealizedPnL ?? 0) as number))
  closedNetPositions.sort((a, b) => (b.closedAt || "").localeCompare(a.closedAt || ""))

  return [...openNetPositions, ...closedNetPositions]
}

