/**
 * @file audit-trail.service.ts
 * @module admin-console
 * @description Unified admin audit listing for auth_events and trading_logs with filters, metadata parsing, and summary metrics.
 * @author StockTrade
 * @created 2026-03-20
 */

import { prisma } from "@/lib/prisma"
import {
  AuthEventSeverity,
  AuthEventType,
  LogCategory,
  LogLevel,
  Prisma,
} from "@prisma/client"

/** @public — exported for unit tests */
export const AUTH_EVENT_TYPES: AuthEventType[] = Object.values(AuthEventType)

export type AuditSource = "auth" | "trading"

export type AuditRowStatus = "SUCCESS" | "FAILED" | "PENDING"

/** @public — exported for unit tests */
export function deriveAuthRowStatus(eventType: AuthEventType | string): AuditRowStatus {
  const s = String(eventType)
  if (s.includes("SUCCESS") || s.includes("VERIFIED")) return "SUCCESS"
  if (s.includes("FAILED") || s.includes("REJECTED")) return "FAILED"
  return "PENDING"
}

/** @public — exported for unit tests */
export function authEventTypesForStatusFilter(status: string): AuthEventType[] | undefined {
  if (!status || status === "all") return undefined
  if (status !== "SUCCESS" && status !== "FAILED" && status !== "PENDING") return undefined
  return AUTH_EVENT_TYPES.filter((t) => deriveAuthRowStatus(t) === status)
}

export type ParsedAuditMetadata = {
  ipAddress: string
  userAgent: string
  raw: Record<string, unknown> | null
}

/** @public — exported for unit tests */
export function parseAuthMetadataString(metadata: string | null): ParsedAuditMetadata {
  if (!metadata || metadata.trim() === "") {
    return { ipAddress: "—", userAgent: "—", raw: null }
  }
  try {
    const raw = JSON.parse(metadata) as Record<string, unknown>
    const ip =
      typeof raw.ipAddress === "string" && raw.ipAddress.trim() !== ""
        ? raw.ipAddress
        : "—"
    const ua =
      typeof raw.userAgent === "string" && raw.userAgent.trim() !== ""
        ? raw.userAgent
        : "—"
    return { ipAddress: ip, userAgent: ua, raw }
  } catch {
    return { ipAddress: "—", userAgent: "—", raw: null }
  }
}

function jsonToUnknownRecord(value: Prisma.JsonValue | null | undefined): unknown {
  if (value === null || value === undefined) return null
  return value
}

function extractIpUaFromJson(value: Prisma.JsonValue | null | undefined): {
  ipAddress: string
  userAgent: string
  parsed: Record<string, unknown> | null
} {
  if (value === null || value === undefined || typeof value !== "object") {
    return { ipAddress: "—", userAgent: "—", parsed: null }
  }
  const raw = value as Record<string, unknown>
  const ip =
    typeof raw.ipAddress === "string" && raw.ipAddress.trim() !== ""
      ? raw.ipAddress
      : typeof raw.ip === "string" && raw.ip.trim() !== ""
        ? raw.ip
        : "—"
  const ua =
    typeof raw.userAgent === "string" && raw.userAgent.trim() !== ""
      ? raw.userAgent
      : typeof raw.user_agent === "string" && raw.user_agent.trim() !== ""
        ? raw.user_agent
        : "—"
  return { ipAddress: ip, userAgent: ua, parsed: raw }
}

/** Map log level to {@link AuthEventSeverity} for shared StatusBadge styling */
export function tradingLevelToRiskSeverity(level: LogLevel): AuthEventSeverity {
  switch (level) {
    case LogLevel.ERROR:
      return AuthEventSeverity.HIGH
    case LogLevel.WARN:
      return AuthEventSeverity.MEDIUM
    case LogLevel.DEBUG:
      return AuthEventSeverity.LOW
    case LogLevel.INFO:
    default:
      return AuthEventSeverity.LOW
  }
}

export function deriveTradingRowStatus(level: LogLevel): AuditRowStatus {
  if (level === LogLevel.ERROR) return "FAILED"
  if (level === LogLevel.WARN) return "PENDING"
  return "SUCCESS"
}

export interface AuditTrailRow {
  id: string
  source: AuditSource
  timestamp: Date
  userId: string | null
  userName: string
  clientId: string | null
  action: string
  resource: string
  resourceId: string | null
  message: string
  details: string
  summary: string
  ipAddress: string
  userAgent: string
  /** Risk-style severity for StatusBadge (auth uses DB severity; trading mapped from level) */
  displaySeverity: AuthEventSeverity
  status: AuditRowStatus
  level: LogLevel | null
  category: LogCategory | null
  rawMetadata: unknown
  rawDetails: unknown
  error: string | null
  stackTrace: string | null
}

export interface AuditListFilters {
  page: number
  limit: number
  search?: string
  severity?: string
  status?: string
  action?: string
  dateFrom?: Date
  dateTo?: Date
  /** trading only */
  category?: string
  level?: string
  clientId?: string
  userId?: string
}

export interface AuditListResult {
  logs: AuditTrailRow[]
  total: number
  page: number
  pages: number
}

export interface AuditSummaryResult {
  authEvents24h: number
  authFailed24h: number
  authCritical24h: number
  tradingErrors24h: number
  authEvents7d: number
  tradingErrors7d: number
}

function endOfDay(d: Date): Date {
  const end = new Date(d)
  end.setHours(23, 59, 59, 999)
  return end
}

function isAuthEventType(value: string): value is AuthEventType {
  return AUTH_EVENT_TYPES.includes(value as AuthEventType)
}

export class AuditTrailService {
  static async getSummary(): Promise<AuditSummaryResult> {
    const now = new Date()
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const failedTypes = authEventTypesForStatusFilter("FAILED") ?? []

    const [
      authEvents24h,
      authFailed24h,
      authCritical24h,
      tradingErrors24h,
      authEvents7d,
      tradingErrors7d,
    ] = await Promise.all([
      prisma.authEvent.count({ where: { timestamp: { gte: since24h } } }),
      prisma.authEvent.count({
        where: { timestamp: { gte: since24h }, eventType: { in: failedTypes } },
      }),
      prisma.authEvent.count({
        where: { timestamp: { gte: since24h }, severity: AuthEventSeverity.CRITICAL },
      }),
      prisma.tradingLog.count({
        where: { createdAt: { gte: since24h }, level: LogLevel.ERROR },
      }),
      prisma.authEvent.count({ where: { timestamp: { gte: since7d } } }),
      prisma.tradingLog.count({
        where: { createdAt: { gte: since7d }, level: LogLevel.ERROR },
      }),
    ])

    return {
      authEvents24h,
      authFailed24h,
      authCritical24h,
      tradingErrors24h,
      authEvents7d,
      tradingErrors7d,
    }
  }

  static async listAuth(filters: AuditListFilters): Promise<AuditListResult> {
    const { page, limit, search, severity, status, action, dateFrom, dateTo } = filters
    const skip = (page - 1) * limit

    const where: Prisma.AuthEventWhereInput = {}

    if (severity && severity !== "all") {
      where.severity = severity as AuthEventSeverity
    }

    if (action && action !== "all") {
      if (!isAuthEventType(action)) {
        return { logs: [], total: 0, page, pages: 1 }
      }
      where.eventType = action
      if (status && status !== "all") {
        const bucket = authEventTypesForStatusFilter(status)
        if (!bucket?.includes(action as AuthEventType)) {
          return { logs: [], total: 0, page, pages: 1 }
        }
      }
    } else if (status && status !== "all") {
      const types = authEventTypesForStatusFilter(status)
      if (types?.length) {
        where.eventType = { in: types }
      }
    }

    if (dateFrom || dateTo) {
      where.timestamp = {}
      if (dateFrom) where.timestamp.gte = dateFrom
      if (dateTo) where.timestamp.lte = endOfDay(dateTo)
    }

    if (search && search.trim() !== "") {
      const q = search.trim()
      where.OR = [
        { message: { contains: q, mode: "insensitive" } },
        { metadata: { contains: q, mode: "insensitive" } },
        { user: { email: { contains: q, mode: "insensitive" } } },
        { user: { name: { contains: q, mode: "insensitive" } } },
        { user: { clientId: { contains: q, mode: "insensitive" } } },
      ]
    }

    const [events, total] = await Promise.all([
      prisma.authEvent.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              clientId: true,
            },
          },
        },
      }),
      prisma.authEvent.count({ where }),
    ])

    const logs: AuditTrailRow[] = events.map((event) => {
      const parsed = parseAuthMetadataString(event.metadata)
      const userName =
        event.user?.name || event.user?.email || (event.userId ? "Unknown" : "System")
      const summary = event.message || String(event.eventType)
      return {
        id: event.id,
        source: "auth",
        timestamp: event.timestamp,
        userId: event.userId ?? null,
        userName,
        clientId: event.user?.clientId ?? null,
        action: event.eventType,
        resource: "Authentication",
        resourceId: event.userId ?? null,
        message: event.message,
        details: event.metadata || summary,
        summary,
        ipAddress: parsed.ipAddress,
        userAgent: parsed.userAgent,
        displaySeverity: event.severity,
        status: deriveAuthRowStatus(event.eventType),
        level: null,
        category: null,
        rawMetadata: parsed.raw ?? (event.metadata ? event.metadata : null),
        rawDetails: null,
        error: null,
        stackTrace: null,
      }
    })

    return {
      logs,
      total,
      page,
      pages: total === 0 ? 1 : Math.ceil(total / limit),
    }
  }

  static async listTrading(filters: AuditListFilters): Promise<AuditListResult> {
    const {
      page,
      limit,
      search,
      status,
      severity,
      dateFrom,
      dateTo,
      category,
      level,
      clientId,
      userId,
    } = filters
    const skip = (page - 1) * limit

    const where: Prisma.TradingLogWhereInput = {}

    if (category && category !== "all") {
      where.category = category as LogCategory
    }

    if (level && level !== "all") {
      where.level = level as LogLevel
    } else if (severity && severity !== "all") {
      const s = severity as AuthEventSeverity
      if (s === AuthEventSeverity.CRITICAL || s === AuthEventSeverity.HIGH) {
        where.level = LogLevel.ERROR
      } else if (s === AuthEventSeverity.MEDIUM) {
        where.level = LogLevel.WARN
      } else {
        where.level = { in: [LogLevel.INFO, LogLevel.DEBUG] }
      }
    } else if (status && status !== "all") {
      if (status === "FAILED") where.level = LogLevel.ERROR
      else if (status === "PENDING") where.level = LogLevel.WARN
      else if (status === "SUCCESS") where.level = { in: [LogLevel.INFO, LogLevel.DEBUG] }
    }

    if (clientId && clientId.trim() !== "") {
      where.clientId = { contains: clientId.trim(), mode: "insensitive" }
    }

    if (userId && userId.trim() !== "") {
      where.userId = userId.trim()
    }

    if (dateFrom || dateTo) {
      where.createdAt = {}
      if (dateFrom) where.createdAt.gte = dateFrom
      if (dateTo) where.createdAt.lte = endOfDay(dateTo)
    }

    if (search && search.trim() !== "") {
      const q = search.trim()
      where.OR = [
        { action: { contains: q, mode: "insensitive" } },
        { message: { contains: q, mode: "insensitive" } },
        { clientId: { contains: q, mode: "insensitive" } },
        { error: { contains: q, mode: "insensitive" } },
      ]
    }

    const [rows, total] = await Promise.all([
      prisma.tradingLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.tradingLog.count({ where }),
    ])

    const logs: AuditTrailRow[] = rows.map((row) => {
      const meta = extractIpUaFromJson(row.metadata)
      const displaySeverity = tradingLevelToRiskSeverity(row.level)
      const summary = row.message || row.action
      return {
        id: row.id,
        source: "trading",
        timestamp: row.createdAt,
        userId: row.userId ?? null,
        userName: row.clientId,
        clientId: row.clientId,
        action: row.action,
        resource: row.category,
        resourceId: row.tradingAccountId ?? row.userId,
        message: row.message,
        details:
          row.error ||
          (row.metadata ? JSON.stringify(row.metadata) : "") ||
          summary,
        summary,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        displaySeverity,
        status: deriveTradingRowStatus(row.level),
        level: row.level,
        category: row.category,
        rawMetadata: jsonToUnknownRecord(row.metadata),
        rawDetails: jsonToUnknownRecord(row.details),
        error: row.error ?? null,
        stackTrace: row.stackTrace ?? null,
      }
    })

    return {
      logs,
      total,
      page,
      pages: total === 0 ? 1 : Math.ceil(total / limit),
    }
  }
}
