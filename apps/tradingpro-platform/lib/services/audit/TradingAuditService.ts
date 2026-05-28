/**
 * @file TradingAuditService.ts
 * @module audit
 * @description Centralized audit logging for all trading operations.
 * Uses Pino logger for real-time monitoring.
 * Can be extended to write to database when AuditLog model is added.
 *
 * Author: StockTrade
 * Last-updated: 2026-oc-14
 */

import pino from "pino"
import { baseLogger } from "@/lib/observability/logger"

const log = baseLogger.child({ module: "TradingAudit" })

export type AuditEventType =
  | "ORDER_CREATED" | "ORDER_MODIFIED" | "ORDER_CANCELLED" | "ORDER_EXECUTED"
  | "ORDER_REJECTED" | "POSITION_OPENED" | "POSITION_MODIFIED" | "POSITION_CLOSED"
  | "MARGIN_RESERVED" | "MARGIN_RELEASED" | "ADMIN_ACTION" | "SYSTEM_EVENT"

export type AuditSeverity = "INFO" | "WARN" | "ERROR" | "CRITICAL"

export interface AuditContext {
  userId?: string | null
  tradingAccountId?: string | null
  orderId?: string | null
  positionId?: string | null
  symbol?: string | null
  adminUserId?: string | null
  ipAddress?: string | null
}

export interface AuditLogEntry {
  eventType: AuditEventType
  severity: AuditSeverity
  message: string
  context: AuditContext
  metadata?: Record<string, unknown>
  previousValue?: Record<string, unknown>
  newValue?: Record<string, unknown>
}

export class TradingAuditService {
  private audit = baseLogger.child({ module: "TradingAudit" })

  log(entry: AuditLogEntry): void {
    const level = entry.severity === "CRITICAL" || entry.severity === "ERROR" ? "error"
      : entry.severity === "WARN" ? "warn" : "info"

    // Pino signature: info(obj, message) — object first, message string second
    ;(this.audit as pino.Logger)[level]({
      severity: entry.severity,
      eventType: entry.eventType,
      ...entry.context,
      metadata: entry.metadata,
      previousValue: entry.previousValue,
      newValue: entry.newValue,
    }, entry.message)
  }

  logOrderCreated(params: {
    orderId: string
    userId: string
    tradingAccountId: string
    symbol: string
    quantity: number
    orderSide: string
    orderType: string
    price: number | null
  }): void {
    this.log({
      eventType: "ORDER_CREATED",
      severity: "INFO",
      message: `Order created: ${params.orderSide} ${params.quantity} ${params.symbol} @ ${params.price ?? "MKT"}`,
      context: {
        userId: params.userId,
        tradingAccountId: params.tradingAccountId,
        orderId: params.orderId,
        symbol: params.symbol,
      },
      newValue: {
        quantity: params.quantity,
        orderSide: params.orderSide,
        orderType: params.orderType,
        price: params.price,
      },
    })
  }

  logOrderExecuted(params: {
    orderId: string
    userId: string
    tradingAccountId: string
    symbol: string
    quantity: number
    averagePrice: number
    positionId?: string
  }): void {
    this.log({
      eventType: "ORDER_EXECUTED",
      severity: "INFO",
      message: `Order executed: ${params.quantity} ${params.symbol} @ ₹${params.averagePrice}`,
      context: {
        userId: params.userId,
        tradingAccountId: params.tradingAccountId,
        orderId: params.orderId,
        positionId: params.positionId,
        symbol: params.symbol,
      },
      newValue: {
        quantity: params.quantity,
        averagePrice: params.averagePrice,
      },
    })
  }

  logOrderCancelled(params: {
    orderId: string
    userId: string
    tradingAccountId: string
    symbol: string
    reason?: string
  }): void {
    this.log({
      eventType: "ORDER_CANCELLED",
      severity: "INFO",
      message: `Order cancelled: ${params.symbol}${params.reason ? ` (${params.reason})` : ""}`,
      context: {
        userId: params.userId,
        tradingAccountId: params.tradingAccountId,
        orderId: params.orderId,
        symbol: params.symbol,
      },
    })
  }

  logPositionOpened(params: {
    positionId: string
    userId: string
    tradingAccountId: string
    symbol: string
    quantity: number
    averagePrice: number
    orderId: string
  }): void {
    this.log({
      eventType: "POSITION_OPENED",
      severity: "INFO",
      message: `Position opened: ${params.quantity > 0 ? "LONG" : "SHORT"} ${Math.abs(params.quantity)} ${params.symbol} @ ₹${params.averagePrice}`,
      context: {
        userId: params.userId,
        tradingAccountId: params.tradingAccountId,
        positionId: params.positionId,
        orderId: params.orderId,
        symbol: params.symbol,
      },
      newValue: {
        quantity: params.quantity,
        averagePrice: params.averagePrice,
      },
    })
  }

  logPositionClosed(params: {
    positionId: string
    userId: string
    tradingAccountId: string
    symbol: string
    quantity: number
    entryPrice: number
    exitPrice: number
    realizedPnL: number
    closureReason: string
    closedBy?: string
  }): void {
    const severity: AuditSeverity = Math.abs(params.realizedPnL) > 10000 ? "WARN" : "INFO"
    this.log({
      eventType: "POSITION_CLOSED",
      severity,
      message: `Position closed: ${params.symbol} P&L ₹${params.realizedPnL.toFixed(2)} (${params.closureReason})`,
      context: {
        userId: params.userId,
        tradingAccountId: params.tradingAccountId,
        positionId: params.positionId,
        symbol: params.symbol,
        adminUserId: params.closedBy,
      },
      previousValue: { quantity: params.quantity, averagePrice: params.entryPrice },
      newValue: { exitPrice: params.exitPrice, realizedPnL: params.realizedPnL, closureReason: params.closureReason },
    })
  }

  logPositionModified(params: {
    positionId: string
    userId: string
    tradingAccountId: string
    symbol: string
    previousValues: { stopLoss?: number | null; target?: number | null }
    newValues: { stopLoss?: number | null; target?: number | null }
    modifiedBy?: string
  }): void {
    this.log({
      eventType: "POSITION_MODIFIED",
      severity: "INFO",
      message: `Position modified: ${params.symbol} SL: ${params.previousValues.stopLoss ?? "—"} → ${params.newValues.stopLoss ?? "—"}, TP: ${params.previousValues.target ?? "—"} → ${params.newValues.target ?? "—"}`,
      context: {
        userId: params.userId,
        tradingAccountId: params.tradingAccountId,
        positionId: params.positionId,
        symbol: params.symbol,
        adminUserId: params.modifiedBy,
      },
      previousValue: params.previousValues,
      newValue: params.newValues,
    })
  }

  logAdminAction(params: {
    action: string
    targetType: "order" | "position"
    targetId: string
    adminUserId: string
    details: Record<string, unknown>
    userId?: string
    tradingAccountId?: string
    symbol?: string
  }): void {
    this.log({
      eventType: "ADMIN_ACTION",
      severity: "INFO",
      message: `Admin ${params.action} on ${params.targetType} ${params.targetId}`,
      context: {
        userId: params.userId,
        tradingAccountId: params.tradingAccountId,
        adminUserId: params.adminUserId,
        symbol: params.symbol,
        orderId: params.targetType === "order" ? params.targetId : undefined,
        positionId: params.targetType === "position" ? params.targetId : undefined,
      },
      newValue: params.details,
    })
  }

  logMarginEvent(params: {
    userId: string
    tradingAccountId: string
    eventType: "RESERVED" | "RELEASED" | "ADJUSTED" | "CALL"
    amount: number
    symbol?: string
    orderId?: string
    positionId?: string
  }): void {
    const severity: AuditSeverity = params.eventType === "CALL" ? "WARN" : "INFO"
    this.log({
      eventType: params.eventType === "RESERVED" ? "MARGIN_RESERVED"
        : params.eventType === "RELEASED" ? "MARGIN_RELEASED"
        : params.eventType === "ADJUSTED" ? "MARGIN_RESERVED"
        : "MARGIN_RELEASED",
      severity,
      message: `Margin ${params.eventType.toLowerCase()}: ₹${params.amount.toLocaleString()}${params.symbol ? ` (${params.symbol})` : ""}`,
      context: {
        userId: params.userId,
        tradingAccountId: params.tradingAccountId,
        orderId: params.orderId,
        positionId: params.positionId,
        symbol: params.symbol,
      },
      newValue: { amount: params.amount },
    })
  }
}

let auditService: TradingAuditService | null = null

export function getTradingAuditService(): TradingAuditService {
  if (!auditService) {
    auditService = new TradingAuditService()
  }
  return auditService
}