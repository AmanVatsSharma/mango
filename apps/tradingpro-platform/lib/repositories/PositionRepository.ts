/**
 * @file PositionRepository.ts
 * @module position
 * @description Position repository with lot-wise FIFO offset semantics.
 * @author StockTrade
 * @created 2026-02-24
 */

import { prisma } from "@/lib/prisma"
import { normalizeRepositoryFiniteNumber } from "@/lib/repositories/repository-number-utils"
import {
  isIntradayRiskConfigProductType,
  normalizeRiskConfigProductType,
  resolveRiskConfigProductTypeCandidates,
} from "@/lib/services/risk/risk-config-normalizer"
import { OptionType, Prisma } from "@prisma/client"

const POSITION_STOCK_SELECT = {
  instrumentId: true,
  symbol: true,
  exchange: true,
  segment: true,
  lot_size: true,
  ltp: true,
  strikePrice: true,
  optionType: true,
  expiry: true,
  token: true,
  uirId: true,
  canonicalSymbol: true,
} as const

const POSITION_WITH_STOCK_INCLUDE = {
  Stock: { select: POSITION_STOCK_SELECT },
} as const

type PositionIdentitySnapshot = {
  stockId: string
  symbol: string
  productType: string
  isIntraday: boolean
  instrumentId: string | null
  segment: string | null
  exchange: string | null
  strikePrice: number | null
  optionType: OptionType | null
  expiry: Date | null
  token: number | null
  uirId: number | null
  canonicalSymbol: string | null
}

export interface UpsertPositionIdentityContext {
  productType?: string | null
  isIntraday?: boolean | null
  instrumentId?: string | null
  segment?: string | null
  exchange?: string | null
  strikePrice?: number | null
  optionType?: string | OptionType | null
  expiry?: string | Date | null
  token?: number | null
  uirId?: number | null
  canonicalSymbol?: string | null
}

export interface CreatePositionData extends UpsertPositionIdentityContext {
  tradingAccountId: string
  stockId: string
  symbol: string
  quantity: number
  averagePrice: number
}

export interface UpdatePositionData {
  quantity?: number
  averagePrice?: number
  unrealizedPnL?: number
  dayPnL?: number
  closedAt?: Date | null
  stopLoss?: number | null
  target?: number | null
  closureReason?: string | null
  closureNote?: string | null
  closedByUserId?: string | null
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const normalizedValue = value.trim()
  return normalizedValue.length > 0 ? normalizedValue : null
}

function normalizeOptionalToken(value: unknown): number | null {
  const normalizedToken = normalizeRepositoryFiniteNumber(value)
  if (!Number.isFinite(normalizedToken)) {
    return null
  }
  const integerToken = Math.trunc(normalizedToken)
  return integerToken > 0 ? integerToken : null
}

function normalizeOptionalStrikePrice(value: unknown): number | null {
  const normalizedStrike = normalizeRepositoryFiniteNumber(value)
  return Number.isFinite(normalizedStrike) ? normalizedStrike : null
}

function normalizeOptionalExpiry(value: unknown): Date | null {
  if (value instanceof Date) {
    const timestamp = value.getTime()
    return Number.isFinite(timestamp) ? value : null
  }
  if (typeof value !== "string") {
    return null
  }
  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return null
  }
  const parsedTimestamp = Date.parse(trimmedValue)
  if (!Number.isFinite(parsedTimestamp)) {
    return null
  }
  return new Date(parsedTimestamp)
}

function normalizeOptionalOptionType(value: unknown): OptionType | null {
  if (value === OptionType.CE || value === OptionType.PE) {
    return value
  }
  if (typeof value !== "string") {
    return null
  }
  const normalizedValue = value.trim().toUpperCase()
  if (normalizedValue === OptionType.CE) {
    return OptionType.CE
  }
  if (normalizedValue === OptionType.PE) {
    return OptionType.PE
  }
  return null
}

function normalizePositionProductType(value: unknown): string {
  return normalizeRiskConfigProductType(value)
}

function resolveIdentitySnapshot(input: {
  stockId: string
  symbol: string
  context?: UpsertPositionIdentityContext
}): PositionIdentitySnapshot {
  const normalizedStockId = normalizeOptionalText(input.stockId)
  if (!normalizedStockId) {
    throw new Error("stockId is required for position identity")
  }
  const normalizedSymbol = normalizeOptionalText(input.symbol)?.toUpperCase()
  if (!normalizedSymbol) {
    throw new Error("symbol is required for position identity")
  }
  const normalizedProductType = normalizePositionProductType(input.context?.productType ?? "MIS")
  const normalizedIsIntraday =
    typeof input.context?.isIntraday === "boolean"
      ? input.context.isIntraday
      : isIntradayRiskConfigProductType(normalizedProductType)

  return {
    stockId: normalizedStockId,
    symbol: normalizedSymbol,
    productType: normalizedProductType,
    isIntraday: normalizedIsIntraday,
    instrumentId: normalizeOptionalText(input.context?.instrumentId)?.toUpperCase() ?? null,
    segment: normalizeOptionalText(input.context?.segment)?.toUpperCase() ?? null,
    exchange: normalizeOptionalText(input.context?.exchange)?.toUpperCase() ?? null,
    strikePrice: normalizeOptionalStrikePrice(input.context?.strikePrice),
    optionType: normalizeOptionalOptionType(input.context?.optionType),
    expiry: normalizeOptionalExpiry(input.context?.expiry),
    token: normalizeOptionalToken(input.context?.token),
    uirId: normalizeOptionalToken(input.context?.uirId),
    canonicalSymbol: normalizeOptionalText(input.context?.canonicalSymbol),
  }
}

function isTransactionClient(value: unknown): value is Prisma.TransactionClient {
  return Boolean(value) && typeof value === "object" && typeof (value as { $queryRaw?: unknown }).$queryRaw === "function"
}

function resolveRepositoryClient(
  contextOrTx?: UpsertPositionIdentityContext | Prisma.TransactionClient,
  txArg?: Prisma.TransactionClient,
): Prisma.TransactionClient | typeof prisma {
  if (txArg) {
    return txArg
  }
  if (isTransactionClient(contextOrTx)) {
    return contextOrTx
  }
  return prisma
}

function resolveIdentityContext(
  contextOrTx?: UpsertPositionIdentityContext | Prisma.TransactionClient,
): UpsertPositionIdentityContext | undefined {
  if (isTransactionClient(contextOrTx)) {
    return undefined
  }
  return contextOrTx
}

export type UpsertPositionOffsetConsumption = {
  positionId: string
  closedRecordPositionId?: string | null
  consumedAbsQuantity: number
  lotQuantityBefore: number
  lotQuantityAfter: number
  averagePrice: number
  realizedPnL: number
  wasClosed: boolean
  segment: string | null
  exchange: string | null
  lotSize: number | null
}

export type UpsertPositionWithBreakdownResult = {
  primaryPosition: any
  identity: PositionIdentitySnapshot
  offsets: UpsertPositionOffsetConsumption[]
}

export class PositionRepository {
  async create(data: CreatePositionData, tx?: Prisma.TransactionClient) {
    const client = tx || prisma
    const identity = resolveIdentitySnapshot({
      stockId: data.stockId,
      symbol: data.symbol,
      context: data,
    })

    return client.position.create({
      data: {
        tradingAccountId: data.tradingAccountId,
        stockId: identity.stockId,
        symbol: identity.symbol,
        productType: identity.productType,
        isIntraday: identity.isIntraday,
        instrumentId: identity.instrumentId,
        segment: identity.segment,
        exchange: identity.exchange,
        strikePrice: identity.strikePrice ?? undefined,
        optionType: identity.optionType ?? undefined,
        expiry: identity.expiry ?? undefined,
        token: identity.token ?? undefined,
        uirId: identity.uirId ?? undefined,
        canonicalSymbol: identity.canonicalSymbol ?? undefined,
        quantity: Math.trunc(data.quantity),
        averagePrice: normalizeRepositoryFiniteNumber(data.averagePrice),
        unrealizedPnL: 0,
        dayPnL: 0,
        createdAt: new Date(),
      },
      include: POSITION_WITH_STOCK_INCLUDE,
    })
  }

  async update(positionId: string, data: UpdatePositionData, tx?: Prisma.TransactionClient) {
    const client = tx || prisma
    return client.position.update({
      where: { id: positionId },
      data: { ...data },
      include: POSITION_WITH_STOCK_INCLUDE,
    })
  }

  async findById(positionId: string, tx?: Prisma.TransactionClient) {
    const client = tx || prisma
    return client.position.findUnique({
      where: { id: positionId },
      include: {
        tradingAccount: {
          select: {
            id: true,
            userId: true,
            balance: true,
            availableMargin: true,
          },
        },
        Stock: { select: POSITION_STOCK_SELECT },
        orders: {
          select: {
            id: true,
            productType: true,
            orderSide: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" as const },
          take: 10,
        },
      },
    })
  }

  async findBySymbol(tradingAccountId: string, symbol: string, tx?: Prisma.TransactionClient) {
    const client = tx || prisma
    return client.position.findFirst({
      where: {
        tradingAccountId,
        symbol: symbol.trim().toUpperCase(),
      },
      include: POSITION_WITH_STOCK_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    })
  }

  async findActive(tradingAccountId: string, tx?: Prisma.TransactionClient) {
    const client = tx || prisma
    return client.position.findMany({
      where: {
        tradingAccountId,
        quantity: { not: 0 },
      },
      include: POSITION_WITH_STOCK_INCLUDE,
      orderBy: { createdAt: "desc" },
    })
  }

  async findAll(tradingAccountId: string, limit = 100, offset = 0, tx?: Prisma.TransactionClient) {
    const client = tx || prisma
    return client.position.findMany({
      where: { tradingAccountId },
      include: POSITION_WITH_STOCK_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    })
  }

  async upsert(
    tradingAccountId: string,
    stockId: string,
    symbol: string,
    quantityDelta: number,
    price: number,
    contextOrTx?: UpsertPositionIdentityContext | Prisma.TransactionClient,
    txArg?: Prisma.TransactionClient,
  ) {
    const result = await this.upsertWithBreakdown(
      tradingAccountId,
      stockId,
      symbol,
      quantityDelta,
      price,
      contextOrTx,
      txArg,
    )
    return result.primaryPosition
  }

  async upsertWithBreakdown(
    tradingAccountId: string,
    stockId: string,
    symbol: string,
    quantityDelta: number,
    price: number,
    contextOrTx?: UpsertPositionIdentityContext | Prisma.TransactionClient,
    txArg?: Prisma.TransactionClient,
  ): Promise<UpsertPositionWithBreakdownResult> {
    const client = resolveRepositoryClient(contextOrTx, txArg)
    const identity = resolveIdentitySnapshot({
      stockId,
      symbol,
      context: resolveIdentityContext(contextOrTx),
    })
    const normalizedQuantityDelta = Math.trunc(quantityDelta)
    if (!Number.isFinite(normalizedQuantityDelta) || normalizedQuantityDelta === 0) {
      throw new Error("quantityDelta must be a non-zero integer")
    }

    const normalizedPrice = normalizeRepositoryFiniteNumber(price)
    if (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0) {
      throw new Error("Execution price must be a positive finite number")
    }

    const incomingSide = normalizedQuantityDelta > 0 ? 1 : -1
    let remainingAbsQuantity = Math.abs(normalizedQuantityDelta)
    let primaryPosition: any | null = null
    const productTypeCandidates = resolveRiskConfigProductTypeCandidates(identity.productType)
    const offsets: UpsertPositionOffsetConsumption[] = []

    const oppositeLots = await client.position.findMany({
      where: {
        tradingAccountId,
        stockId: identity.stockId,
        productType: { in: productTypeCandidates },
        quantity: incomingSide > 0 ? { lt: 0 } : { gt: 0 },
      },
      include: POSITION_WITH_STOCK_INCLUDE,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })

    for (const lot of oppositeLots) {
      if (remainingAbsQuantity <= 0) {
        break
      }
      const lotQuantityBefore = Math.trunc(lot.quantity)
      const lotOpenAbsQuantity = Math.abs(lotQuantityBefore)
      if (lotOpenAbsQuantity <= 0) {
        continue
      }

      const consumedAbsQuantity = Math.min(remainingAbsQuantity, lotOpenAbsQuantity)
      const nextQuantity = Math.trunc(lot.quantity + incomingSide * consumedAbsQuantity)
      const shouldCloseLot = nextQuantity === 0
      const preservedRatio = lotOpenAbsQuantity > 0 ? Math.abs(nextQuantity) / lotOpenAbsQuantity : 0
      const currentUnrealized = normalizeRepositoryFiniteNumber(lot.unrealizedPnL)
      const currentDayPnL = normalizeRepositoryFiniteNumber(lot.dayPnL)
      const lotAveragePriceCandidate = normalizeRepositoryFiniteNumber(lot.averagePrice)
      const lotAveragePrice = Number.isFinite(lotAveragePriceCandidate)
        ? lotAveragePriceCandidate
        : normalizedPrice
      const closeSignedQuantity = lotQuantityBefore > 0 ? consumedAbsQuantity : -consumedAbsQuantity
      const realizedPnL = (normalizedPrice - lotAveragePrice) * closeSignedQuantity
      const segment =
        normalizeOptionalText(lot.segment)?.toUpperCase() ??
        normalizeOptionalText((lot as any)?.Stock?.segment)?.toUpperCase() ??
        null
      const exchange =
        normalizeOptionalText(lot.exchange)?.toUpperCase() ??
        normalizeOptionalText((lot as any)?.Stock?.exchange)?.toUpperCase() ??
        null
      const lotSizeCandidate = normalizeRepositoryFiniteNumber((lot as any)?.Stock?.lot_size)
      const lotSize = Number.isFinite(lotSizeCandidate) ? Math.max(1, Math.trunc(lotSizeCandidate)) : null

      const realizedPnLFinite = Number.isFinite(realizedPnL) ? realizedPnL : 0
      let closedRecordPositionId: string | null = null
      if (!shouldCloseLot) {
        const closedRecord = await client.position.create({
          data: {
            tradingAccountId,
            stockId: lot.stockId,
            symbol: lot.symbol,
            productType: lot.productType,
            isIntraday: lot.isIntraday,
            instrumentId: lot.instrumentId,
            segment: lot.segment,
            exchange: lot.exchange,
            strikePrice: lot.strikePrice ?? undefined,
            optionType: lot.optionType ?? undefined,
            expiry: lot.expiry ?? undefined,
            token: lot.token ?? undefined,
            uirId: lot.uirId ?? undefined,
            canonicalSymbol: lot.canonicalSymbol ?? undefined,
            quantity: 0,
            averagePrice: lotAveragePrice,
            unrealizedPnL: realizedPnLFinite,
            dayPnL: realizedPnLFinite,
            createdAt: new Date(),
            closedAt: new Date(),
            stopLoss: null,
            target: null,
          },
          select: { id: true },
        })
        closedRecordPositionId = closedRecord.id
      }

      primaryPosition = await client.position.update({
        where: { id: lot.id },
        data: shouldCloseLot
          ? {
              quantity: 0,
              unrealizedPnL: realizedPnLFinite,
              dayPnL: realizedPnLFinite,
              closedAt: new Date(),
              stopLoss: null,
              target: null,
            }
          : {
              quantity: nextQuantity,
              unrealizedPnL: currentUnrealized * preservedRatio,
              dayPnL: currentDayPnL * preservedRatio,
              closedAt: null,
            },
        include: POSITION_WITH_STOCK_INCLUDE,
      })

      offsets.push({
        positionId: lot.id,
        closedRecordPositionId,
        consumedAbsQuantity,
        lotQuantityBefore,
        lotQuantityAfter: nextQuantity,
        averagePrice: lotAveragePrice,
        realizedPnL: realizedPnLFinite,
        wasClosed: shouldCloseLot,
        segment,
        exchange,
        lotSize,
      })

      remainingAbsQuantity -= consumedAbsQuantity
    }

    if (remainingAbsQuantity > 0) {
      primaryPosition = await client.position.create({
        data: {
          tradingAccountId,
          stockId: identity.stockId,
          symbol: identity.symbol,
          productType: identity.productType,
          isIntraday: identity.isIntraday,
          instrumentId: identity.instrumentId,
          segment: identity.segment,
          exchange: identity.exchange,
          strikePrice: identity.strikePrice ?? undefined,
          optionType: identity.optionType ?? undefined,
          expiry: identity.expiry ?? undefined,
          token: identity.token ?? undefined,
          uirId: identity.uirId ?? undefined,
          canonicalSymbol: identity.canonicalSymbol ?? undefined,
          quantity: incomingSide * remainingAbsQuantity,
          averagePrice: normalizedPrice,
          unrealizedPnL: 0,
          dayPnL: 0,
          createdAt: new Date(),
          closedAt: null,
        },
        include: POSITION_WITH_STOCK_INCLUDE,
      })
    }

    if (!primaryPosition) {
      throw new Error("Failed to upsert position lot state")
    }
    return { primaryPosition, identity, offsets }
  }

  async close(
    positionId: string,
    realizedPnL: number,
    tx?: Prisma.TransactionClient,
    closureContext?: {
      reason: string
      closedByUserId?: string | null
      note?: string | null
    },
  ) {
    const data: UpdatePositionData = {
      quantity: 0,
      unrealizedPnL: realizedPnL,
      dayPnL: realizedPnL,
      closedAt: new Date(),
      stopLoss: null,
      target: null,
    }
    if (closureContext) {
      data.closureReason = closureContext.reason
      data.closedByUserId = closureContext.closedByUserId ?? null
      if (closureContext.note !== undefined) {
        data.closureNote = closureContext.note
      }
    }
    return this.update(positionId, data, tx)
  }

  async delete(positionId: string, tx?: Prisma.TransactionClient) {
    if (process.env.ALLOW_POSITION_DELETE === "true") {
      const client = tx || prisma
      await client.position.delete({ where: { id: positionId } })
      return
    }
    throw new Error("Deletion of positions is disabled by policy")
  }

  async getStatistics(tradingAccountId: string, tx?: Prisma.TransactionClient) {
    const client = tx || prisma
    const positions = await client.position.findMany({
      where: { tradingAccountId },
    })
    const active = positions.filter((position) => position.quantity !== 0)
    const closed = positions.filter((position) => position.quantity === 0)

    const totalUnrealizedPnL = active.reduce(
      (sum, position) => sum + normalizeRepositoryFiniteNumber(position.unrealizedPnL),
      0,
    )
    const totalRealizedPnL = closed.reduce(
      (sum, position) => sum + normalizeRepositoryFiniteNumber(position.unrealizedPnL),
      0,
    )

    const profitable = positions.filter(
      (position) => normalizeRepositoryFiniteNumber(position.unrealizedPnL) > 0,
    ).length
    const losing = positions.filter(
      (position) => normalizeRepositoryFiniteNumber(position.unrealizedPnL) < 0,
    ).length

    return {
      total: positions.length,
      active: active.length,
      closed: closed.length,
      totalUnrealizedPnL,
      totalRealizedPnL,
      profitable,
      losing,
      winRate: positions.length > 0 ? (profitable / positions.length) * 100 : 0,
    }
  }
}

export function createPositionRepository(): PositionRepository {
  return new PositionRepository()
}