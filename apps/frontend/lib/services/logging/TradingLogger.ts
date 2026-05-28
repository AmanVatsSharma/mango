/**
 * Trading Logger Service
 * 
 * Comprehensive logging system for all trading operations:
 * - Order placement, execution, cancellation
 * - Position management
 * - Fund operations
 * - Error tracking
 * - Performance metrics
 * - Audit trail
 */

import { prisma } from "@/lib/prisma"
import { LogLevel, LogCategory } from "@prisma/client"

console.log("📝 [TRADING-LOGGER] Module loaded")

export interface LogContext {
  clientId?: string
  userId?: string
  tradingAccountId?: string
  orderId?: string
  positionId?: string
  symbol?: string
  sessionId?: string
  ipAddress?: string
  userAgent?: string
}

export interface LogDetails {
  [key: string]: any
}

export interface LogMetadata {
  requestId?: string
  timestamp?: Date
  duration?: number
  stackTrace?: string
  [key: string]: any
}

export class TradingLogger {
  private context: LogContext
  private startTime: number

  constructor(context: LogContext = {}) {
    this.context = context
    this.startTime = Date.now()
    
    console.log("🏗️ [TRADING-LOGGER] Logger instance created:", {
      clientId: context.clientId,
      userId: context.userId,
      tradingAccountId: context.tradingAccountId
    })
  }

  /**
   * Log an informational message
   */
  async info(
    action: string,
    message: string,
    details?: LogDetails,
    metadata?: LogMetadata
  ): Promise<void> {
    console.log(`ℹ️ [TRADING-LOGGER] INFO - ${action}: ${message}`, details)
    await this.log(LogLevel.INFO, LogCategory.SYSTEM, action, message, details, metadata)
  }

  /**
   * Log a warning message
   */
  async warn(
    action: string,
    message: string,
    details?: LogDetails,
    metadata?: LogMetadata
  ): Promise<void> {
    console.warn(`⚠️ [TRADING-LOGGER] WARN - ${action}: ${message}`, details)
    await this.log(LogLevel.WARN, LogCategory.SYSTEM, action, message, details, metadata)
  }

  /**
   * Log an error
   */
  async error(
    action: string,
    message: string,
    error?: Error,
    details?: LogDetails,
    metadata?: LogMetadata
  ): Promise<void> {
    console.error(`❌ [TRADING-LOGGER] ERROR - ${action}: ${message}`, {
      error: error?.message,
      stack: error?.stack,
      ...details
    })
    
    await this.log(
      LogLevel.ERROR,
      LogCategory.SYSTEM,
      action,
      message,
      details,
      {
        ...metadata,
        stackTrace: error?.stack
      },
      error?.message
    )
  }

  /**
   * Log order-related events
   */
  async logOrder(
    action: string,
    message: string,
    details?: LogDetails,
    metadata?: LogMetadata
  ): Promise<void> {
    console.log(`📦 [TRADING-LOGGER] ORDER - ${action}: ${message}`, details)
    await this.log(LogLevel.INFO, LogCategory.ORDER, action, message, details, metadata)
  }

  /**
   * Log position-related events
   */
  async logPosition(
    action: string,
    message: string,
    details?: LogDetails,
    metadata?: LogMetadata
  ): Promise<void> {
    console.log(`📊 [TRADING-LOGGER] POSITION - ${action}: ${message}`, details)
    await this.log(LogLevel.INFO, LogCategory.POSITION, action, message, details, metadata)
  }

  /**
   * Log fund-related events
   */
  async logFunds(
    action: string,
    message: string,
    details?: LogDetails,
    metadata?: LogMetadata
  ): Promise<void> {
    console.log(`💰 [TRADING-LOGGER] FUNDS - ${action}: ${message}`, details)
    await this.log(LogLevel.INFO, LogCategory.FUNDS, action, message, details, metadata)
  }

  /**
   * Log transaction events
   */
  async logTransaction(
    action: string,
    message: string,
    details?: LogDetails,
    metadata?: LogMetadata
  ): Promise<void> {
    console.log(`💳 [TRADING-LOGGER] TRANSACTION - ${action}: ${message}`, details)
    await this.log(LogLevel.INFO, LogCategory.TRANSACTION, action, message, details, metadata)
  }

  /**
   * Log system events
   */
  async logSystemEvent(
    action: string,
    message: string,
    details?: LogDetails,
    metadata?: LogMetadata
  ): Promise<void> {
    console.log(`⚙️ [TRADING-LOGGER] SYSTEM - ${action}: ${message}`, details)
    await this.log(LogLevel.INFO, LogCategory.SYSTEM, action, message, details, metadata)
  }

  /**
   * Log debug information
   */
  async debug(
    action: string,
    message: string,
    details?: LogDetails,
    metadata?: LogMetadata
  ): Promise<void> {
    console.log(`🔍 [TRADING-LOGGER] DEBUG - ${action}: ${message}`, details)
    await this.log(LogLevel.DEBUG, LogCategory.SYSTEM, action, message, details, metadata)
  }

  /**
   * Log performance metrics
   */
  async logPerformance(action: string, duration: number, details?: LogDetails): Promise<void> {
    console.log(`⏱️ [TRADING-LOGGER] PERFORMANCE - ${action}: ${duration}ms`, details)
    await this.log(
      LogLevel.INFO,
      LogCategory.SYSTEM,
      `PERFORMANCE_${action}`,
      `Completed in ${duration}ms`,
      details,
      { duration }
    )
  }

  /**
   * Core logging method - writes to database
   */
  private async log(
    level: LogLevel,
    category: LogCategory,
    action: string,
    message: string,
    details?: LogDetails,
    metadata?: LogMetadata,
    errorMessage?: string
  ): Promise<void> {
    try {
      // Ensure we have at least a clientId
      const clientId = this.context.clientId || this.context.userId || 'SYSTEM'

      console.log(`📝 [TRADING-LOGGER] Writing to database:`, {
        level,
        category,
        action,
        clientId
      })

      await prisma.tradingLog.create({
        data: {
          clientId,
          userId: this.context.userId,
          tradingAccountId: this.context.tradingAccountId,
          level,
          category,
          action,
          message,
          details: details ? details : undefined,
          metadata: metadata ? metadata : undefined,
          error: errorMessage,
          stackTrace: metadata?.stackTrace,
          createdAt: new Date()
        }
      })

      console.log(`✅ [TRADING-LOGGER] Log entry created successfully`)
    } catch (error: any) {
      // Fail silently to not disrupt the main operation
      console.error("❌ [TRADING-LOGGER] Failed to write log:", {
        error: error?.message,
        action,
        message
      })
    }
  }

  /**
   * Get elapsed time since logger creation
   */
  getElapsedTime(): number {
    return Date.now() - this.startTime
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: Partial<LogContext>): TradingLogger {
    console.log("👶 [TRADING-LOGGER] Creating child logger with additional context:", additionalContext)
    return new TradingLogger({
      ...this.context,
      ...additionalContext
    })
  }

  /**
   * Update context for this logger
   */
  updateContext(updates: Partial<LogContext>): void {
    console.log("🔄 [TRADING-LOGGER] Updating context:", updates)
    this.context = {
      ...this.context,
      ...updates
    }
  }
}

/**
 * Create a logger instance with context
 */
export function createTradingLogger(context: LogContext = {}): TradingLogger {
  console.log("🏭 [TRADING-LOGGER] Creating new trading logger instance")
  return new TradingLogger(context)
}

/**
 * Create a logger from session data
 */
export function createLoggerFromSession(session: any, tradingAccountId?: string): TradingLogger {
  console.log("🔐 [TRADING-LOGGER] Creating logger from session")
  return new TradingLogger({
    userId: session?.user?.id,
    clientId: session?.user?.clientId || session?.user?.id,
    tradingAccountId
  })
}

console.log("✅ [TRADING-LOGGER] Module initialized")