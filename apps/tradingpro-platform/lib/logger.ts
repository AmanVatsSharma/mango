/**
 * @file logger.ts
 * @description Client-side trading log helper. The GraphQL mutations below are
 * no-ops — the import resolves to the no-op shim at `lib/graphql/apollo-client.ts`.
 *
 * NOTE (2026-05-03):
 * - This file is kept only because `use-trading-data.ts` still imports
 *   `createLoggerFromSession`, `LogLevel`, and `LogCategory` from it. Deleting
 *   it would require updating those call sites — defer until the broader
 *   client→REST migration of `use-trading-data.ts`.
 * - For server/API audit logs prefer `lib/services/logging/TradingLogger.ts` (Prisma).
 * - For UI diagnostics prefer `lib/logging/client-logger.ts` (namespaced + gated).
 */

import client from "@/lib/graphql/apollo-client"
import { gql } from "@apollo/client/core"

// GraphQL mutations for logging
const INSERT_LOG = gql`
  mutation InsertLog($object: trading_logsInsertInput!) {
    insertIntotrading_logsCollection(objects: [$object]) {
      records { id }
    }
  }
`

const GET_LOGS_BY_CLIENT = gql`
  query GetLogsByClient($clientId: String!, $limit: Int = 100, $offset: Int = 0) {
    trading_logsCollection(
      filter: { client_id: { eq: $clientId } }
      orderBy: [{ createdAt: DescNullsLast }]
      first: $limit
      offset: $offset
    ) {
      edges {
        node {
          id
          level
          category
          action
          message
          details
          metadata
          error
          createdAt
        }
      }
    }
  }
`

export enum LogLevel {
  INFO = "INFO",
  WARN = "WARN", 
  ERROR = "ERROR",
  DEBUG = "DEBUG"
}

export enum LogCategory {
  ORDER = "ORDER",
  POSITION = "POSITION", 
  TRANSACTION = "TRANSACTION",
  FUNDS = "FUNDS",
  AUTH = "AUTH",
  SYSTEM = "SYSTEM",
  API = "API"
}

interface LogContext {
  clientId: string
  userId?: string
  tradingAccountId?: string
  metadata?: Record<string, any>
}

interface LogEntry {
  level: LogLevel
  category: LogCategory
  action: string
  message: string
  details?: Record<string, any>
  error?: string
  stackTrace?: string
}

class TradingLogger {
  private context: LogContext

  constructor(context: LogContext) {
    this.context = context
  }

  private async writeLog(entry: LogEntry) {
    try {
      await client.mutate({
        mutation: INSERT_LOG,
        variables: {
          object: {
            client_id: this.context.clientId,
            userId: this.context.userId,
            trading_account_id: this.context.tradingAccountId,
            level: entry.level,
            category: entry.category,
            action: entry.action,
            message: entry.message,
            details: entry.details ? JSON.stringify(entry.details) : null,
            metadata: this.context.metadata ? JSON.stringify(this.context.metadata) : null,
            error: entry.error,
            stackTrace: entry.stackTrace
          }
        }
      })
    } catch (error) {
      console.error("Failed to write log:", error)
    }
  }

  // Order logging
  async logOrderPlaced(orderData: any) {
    await this.writeLog({
      level: LogLevel.INFO,
      category: LogCategory.ORDER,
      action: "ORDER_PLACED",
      message: `Order placed: ${orderData.symbol} ${orderData.orderSide} ${orderData.quantity} @ ${orderData.price || 'Market'}`,
      details: {
        orderId: orderData.id,
        symbol: orderData.symbol,
        quantity: orderData.quantity,
        orderType: orderData.orderType,
        orderSide: orderData.orderSide,
        price: orderData.price,
        productType: orderData.productType,
        status: orderData.status
      }
    })
  }

  async logOrderExecuted(orderData: any, executionDetails: any) {
    await this.writeLog({
      level: LogLevel.INFO,
      category: LogCategory.ORDER,
      action: "ORDER_EXECUTED",
      message: `Order executed: ${orderData.symbol} ${orderData.orderSide} ${orderData.quantity} @ ${executionDetails.executionPrice}`,
      details: {
        orderId: orderData.id,
        symbol: orderData.symbol,
        quantity: orderData.quantity,
        executionPrice: executionDetails.executionPrice,
        brokerage: executionDetails.brokerage,
        totalCharges: executionDetails.totalCharges,
        marginRequired: executionDetails.marginRequired
      }
    })
  }

  async logOrderCancelled(orderId: string, reason?: string) {
    await this.writeLog({
      level: LogLevel.WARN,
      category: LogCategory.ORDER,
      action: "ORDER_CANCELLED",
      message: `Order cancelled: ${orderId}${reason ? ` - ${reason}` : ''}`,
      details: { orderId, reason }
    })
  }

  // Position logging
  async logPositionCreated(positionData: any) {
    await this.writeLog({
      level: LogLevel.INFO,
      category: LogCategory.POSITION,
      action: "POSITION_CREATED",
      message: `Position created: ${positionData.symbol} ${positionData.quantity} @ ${positionData.averagePrice}`,
      details: {
        positionId: positionData.id,
        symbol: positionData.symbol,
        quantity: positionData.quantity,
        averagePrice: positionData.averagePrice,
        segment: positionData.segment
      }
    })
  }

  async logPositionUpdated(positionId: string, updates: any) {
    await this.writeLog({
      level: LogLevel.INFO,
      category: LogCategory.POSITION,
      action: "POSITION_UPDATED",
      message: `Position updated: ${positionId}`,
      details: { positionId, updates }
    })
  }

  async logPositionClosed(positionData: any, realizedPnL: number) {
    await this.writeLog({
      level: LogLevel.INFO,
      category: LogCategory.POSITION,
      action: "POSITION_CLOSED",
      message: `Position closed: ${positionData.symbol} - Realized P&L: ₹${realizedPnL.toFixed(2)}`,
      details: {
        positionId: positionData.id,
        symbol: positionData.symbol,
        realizedPnL,
        exitPrice: positionData.exitPrice
      }
    })
  }

  // Transaction logging
  async logFundsDeducted(amount: number, reason: string, details?: any) {
    await this.writeLog({
      level: LogLevel.INFO,
      category: LogCategory.FUNDS,
      action: "FUNDS_DEDUCTED",
      message: `Funds deducted: ₹${amount.toFixed(2)} - ${reason}`,
      details: { amount, reason, ...details }
    })
  }

  async logFundsAdded(amount: number, reason: string, details?: any) {
    await this.writeLog({
      level: LogLevel.INFO,
      category: LogCategory.FUNDS,
      action: "FUNDS_ADDED",
      message: `Funds added: ₹${amount.toFixed(2)} - ${reason}`,
      details: { amount, reason, ...details }
    })
  }

  async logTransactionCreated(transactionData: any) {
    await this.writeLog({
      level: LogLevel.INFO,
      category: LogCategory.TRANSACTION,
      action: "TRANSACTION_CREATED",
      message: `Transaction created: ${transactionData.type} ₹${transactionData.amount}`,
      details: transactionData
    })
  }

  // Error logging
  async logError(error: Error, context: string, details?: any) {
    await this.writeLog({
      level: LogLevel.ERROR,
      category: LogCategory.SYSTEM,
      action: "ERROR_OCCURRED",
      message: `Error in ${context}: ${error.message}`,
      details: { context, ...details },
      error: error.message,
      stackTrace: error.stack
    })
  }

  // System logging
  async logSystemEvent(action: string, message: string, details?: any) {
    await this.writeLog({
      level: LogLevel.INFO,
      category: LogCategory.SYSTEM,
      action,
      message,
      details
    })
  }

  // API logging
  async logApiCall(endpoint: string, method: string, status: number, duration?: number) {
    await this.writeLog({
      level: LogLevel.DEBUG,
      category: LogCategory.API,
      action: "API_CALL",
      message: `${method} ${endpoint} - ${status}${duration ? ` (${duration}ms)` : ''}`,
      details: { endpoint, method, status, duration }
    })
  }

  // Auth logging
  async logAuthEvent(action: string, message: string, details?: any) {
    await this.writeLog({
      level: LogLevel.INFO,
      category: LogCategory.AUTH,
      action,
      message,
      details
    })
  }
}

// Factory function to create logger with context
export function createLogger(context: LogContext): TradingLogger {
  return new TradingLogger(context)
}

// Utility function to get logs by client ID
export async function getLogsByClient(clientId: string, limit = 100, offset = 0) {
  try {
    const { data } = await client.query({
      query: GET_LOGS_BY_CLIENT,
      variables: { clientId, limit, offset },
      fetchPolicy: "network-only"
    })
    return data?.trading_logsCollection?.edges?.map((e: any) => ({
      ...e.node,
      details: e.node.details ? JSON.parse(e.node.details) : null,
      metadata: e.node.metadata ? JSON.parse(e.node.metadata) : null
    })) || []
  } catch (error) {
    console.error("Failed to fetch logs:", error)
    return []
  }
}

// Helper to extract client ID from session
export function getClientIdFromSession(session: any): string {
  return session?.user?.clientId || session?.user?.id || 'unknown'
}

// Helper to create logger from session
export function createLoggerFromSession(session: any, tradingAccountId?: string): TradingLogger {
  return createLogger({
    clientId: getClientIdFromSession(session),
    userId: session?.user?.id,
    tradingAccountId,
    metadata: {
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'server',
      timestamp: new Date().toISOString()
    }
  })
}