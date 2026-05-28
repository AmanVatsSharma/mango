/**
 * @file route.ts
 * @module admin-console
 * @description API route for user list with advanced filtering
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-03
 *
 * Notes:
 * - User list includes isTradingDashboardOnline from SSE / Redis presence (all roles, including MODERATOR).
 */

import { NextResponse } from "next/server"
import { createAdminUserService } from "@/lib/services/admin/AdminUserService"
import { createTradingLogger } from "@/lib/services/logging/TradingLogger"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { Role, KycStatus } from "@prisma/client"
import {
  normalizeAdminUsersContactDuplicateParam,
  normalizeAdminUsersDateFilter,
  normalizeAdminUsersLimitParam,
  normalizeAdminUsersOptionalInitialBalance,
  normalizeAdminUsersPageParam,
} from "@/lib/server/admin-users-number-utils"
import { withTradingDashboardPresence } from "@/lib/server/admin-trading-presence"
import { checkRateLimit, getRateLimitKey, RateLimitPresets } from "@/lib/services/security/RateLimiter"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/users",
      required: "admin.users.read",
      fallbackMessage: "Failed to fetch users",
    },
    async (ctx) => {
      const { searchParams } = new URL(req.url)
      const page = normalizeAdminUsersPageParam(searchParams.get("page"))
      const limit = normalizeAdminUsersLimitParam(searchParams.get("limit"))
      const search = searchParams.get("search") || undefined
      const rawStatus = searchParams.get("status")
      const status = (
        rawStatus === "inactive" ? "deactivated" : rawStatus
      ) as "active" | "deactivated" | "suspended" | "all" | null
      const kycStatus = searchParams.get("kycStatus") as KycStatus | "all" | null
      const userRole = searchParams.get("role") as Role | "all" | null
      const dateFromRaw = searchParams.get("dateFrom")
      const dateToRaw = searchParams.get("dateTo")
      const dateFrom = normalizeAdminUsersDateFilter(dateFromRaw)
      const dateTo = normalizeAdminUsersDateFilter(dateToRaw)
      const rmId = searchParams.get("rmId") || undefined // Filter by Relationship Manager
      const contactDuplicate = normalizeAdminUsersContactDuplicateParam(
        searchParams.get("contactDuplicate"),
      )

      if (dateFromRaw !== null && dateFromRaw.trim() !== "" && !dateFrom) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Invalid dateFrom filter",
          statusCode: 400,
        })
      }
      if (dateToRaw !== null && dateToRaw.trim() !== "" && !dateTo) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Invalid dateTo filter",
          statusCode: 400,
        })
      }

      if (contactDuplicate) {
        const rlKey = getRateLimitKey("admin_users_contact_dup", ctx.session.user.id)
        const rl = checkRateLimit(rlKey, RateLimitPresets.STANDARD)
        if (!rl.allowed) {
          throw new AppError({
            code: "RATE_LIMIT",
            message: RateLimitPresets.STANDARD.message ?? "Too many requests",
            statusCode: 429,
            details: { retryAfter: rl.retryAfter },
          })
        }
      }

      ctx.logger.debug(
        {
          page,
          limit,
          hasSearch: Boolean(search && search.length > 0),
          status,
          kycStatus,
          userRole,
          dateFrom: Boolean(dateFrom),
          dateTo: Boolean(dateTo),
          rmId: Boolean(rmId),
          contactDuplicate,
        },
        "GET /api/admin/users - params"
      )

      // If MODERATOR role, only show their assigned users
      if (ctx.role === "MODERATOR") {
        const rmIdForFilter = ctx.session.user.id
        ctx.logger.debug({ rmId: rmIdForFilter, contactDuplicate }, "GET /api/admin/users - MODERATOR scope")

        const tradingLogger = createTradingLogger({
          clientId: "ADMIN",
          userId: ctx.session.user.id,
        })

        const adminService = createAdminUserService(tradingLogger)
        const result = await adminService.getUsersByRM(rmIdForFilter, page, limit, search, {
          contactDuplicate,
        })
        const enriched = await withTradingDashboardPresence(result)
        return NextResponse.json(enriched, { status: 200 })
      }

      const tradingLogger = createTradingLogger({
        clientId: "ADMIN",
        userId: ctx.session.user.id,
      })

      const adminService = createAdminUserService(tradingLogger)

      // Use advanced filters if any filter is provided, otherwise use simple getAllUsers
      let result
      if (rmId) {
        // Filter by RM
        result = await adminService.getUsersByRM(rmId, page, limit, search, { contactDuplicate })
      } else if (status || kycStatus || userRole || dateFrom || dateTo || contactDuplicate) {
        result = await adminService.getUsersWithFilters({
          page,
          limit,
          search,
          status: status || "all",
          kycStatus: kycStatus || "all",
          role: userRole || "all",
          dateFrom,
          dateTo,
          contactDuplicate,
        })
      } else {
        result = await adminService.getAllUsers(page, limit, search, { contactDuplicate })
      }

      const enriched = await withTradingDashboardPresence(result)

      ctx.logger.info(
        { count: enriched.users?.length, total: enriched.total, pages: enriched.pages },
        "GET /api/admin/users - success"
      )
      return NextResponse.json(enriched, { status: 200 })
    }
  )
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/users",
      required: "admin.users.manage",
      fallbackMessage: "Failed to create user",
    },
    async (ctx) => {
      const body = await req.json()
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          statusCode: 400,
        })
      }

      ctx.logger.debug(
        {
          name: body.name,
          email: body.email,
          phone: body.phone ? "***" : undefined,
          hasInitialBalance: !!body.initialBalance,
        },
        "POST /api/admin/users - create request"
      )

      const { name, email, phone, password, initialBalance } = body
      const normalizedName = typeof name === "string" ? name.trim() : ""
      const normalizedEmail = typeof email === "string" ? email.trim() : ""
      const normalizedPhone = typeof phone === "string" ? phone.trim() : ""
      const normalizedPassword = typeof password === "string" ? password : ""
      const normalizedInitialBalance = normalizeAdminUsersOptionalInitialBalance(initialBalance)

      // Validate required fields
      if (!normalizedName || !normalizedEmail || !normalizedPhone || !normalizedPassword) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Missing required fields: name, email, phone, and password are required",
          statusCode: 400,
        })
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(normalizedEmail)) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Invalid email format",
          statusCode: 400,
        })
      }

      // Validate phone format (basic check)
      if (normalizedPhone.length < 10) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Invalid phone number",
          statusCode: 400,
        })
      }

      // Validate password strength
      if (normalizedPassword.length < 8) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Password must be at least 8 characters long",
          statusCode: 400,
        })
      }

      if (normalizedInitialBalance === null) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "initialBalance must be a non-negative number",
          statusCode: 400,
        })
      }

      const tradingLogger = createTradingLogger({
        clientId: "ADMIN",
        userId: ctx.session.user.id,
      })

      const adminService = createAdminUserService(tradingLogger)
      const result = await adminService.createUser({
        name: normalizedName,
        email: normalizedEmail,
        phone: normalizedPhone,
        password: normalizedPassword,
        initialBalance: normalizedInitialBalance,
      })

      ctx.logger.info({ userId: result.id, clientId: result.clientId }, "POST /api/admin/users - success")

      return NextResponse.json(
        {
          success: true,
          message:
            "User created. Use the password you entered or generated in this session — it is not returned in the API response.",
          user: {
            id: result.id,
            name: result.name,
            email: result.email,
            phone: result.phone,
            clientId: result.clientId,
            initialBalance: result.tradingAccount.balance,
          },
        },
        { status: 201 }
      )
    }
  )
}

export async function PATCH(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/users",
      required: "admin.users.manage",
      fallbackMessage: "Failed to update user",
    },
    async (ctx) => {
      const body = await req.json()
      ctx.logger.debug(body, "PATCH /api/admin/users - request")

      const { userId, isActive } = body

      if (!userId || isActive === undefined) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Missing required fields",
          statusCode: 400,
        })
      }

      const tradingLogger = createTradingLogger({
        clientId: "ADMIN",
        userId: ctx.session.user.id,
      })

      const adminService = createAdminUserService(tradingLogger)
      const user = await adminService.updateUserStatus(userId, isActive)

      ctx.logger.info({ userId: user.id, isActive: user.isActive }, "PATCH /api/admin/users - success")
      return NextResponse.json({ success: true, user }, { status: 200 })
    }
  )
}