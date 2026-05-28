/**
 * File:        app/api/notifications/route.ts
 * Module:      Notifications · API
 * Purpose:     User-scoped notifications fetch + read/unread mark. Polled by the
 *              client every few seconds, so the hot-path budget is tight — no
 *              JSON.stringify in logs, no per-request structured logs unless
 *              NOTIFICATIONS_DEBUG=1.
 *
 * Exports:
 *   - GET(req)   — list notifications visible to the session user
 *   - PATCH(req) — set readBy on a list of notificationIds for the session user
 *
 * Depends on:
 *   - @/auth — NextAuth v5 session (JWT strategy)
 *   - @/lib/prisma — Notification model
 *   - @/lib/services/notifications/notification-targeting — visibility predicates
 *   - @/lib/server/api-number-utils — pagination clamping
 *
 * Side-effects:
 *   - GET: 2× Prisma reads (findMany + count) and one extra count for unread
 *   - PATCH: per-id findUnique + update; access checks per row
 *
 * Key invariants:
 *   - Session userId is the source of truth — query string ?userId is rejected
 *     unless it matches the session.
 *   - Admin targets only included when caller has admin role AND opt-in flag.
 *   - Errors return 200 with empty notifications so the UI does not break;
 *     server-side error log is still emitted via console.error.
 *   - DO NOT bring back the JSON.stringify(where, null, 2) or the per-row map
 *     logs — those alone added measurable latency on a polled endpoint.
 *
 * Performance note:
 *   - The Notification model currently has only single-column indexes
 *     (target, createdAt, expiresAt). The query orders by createdAt DESC and
 *     filters by target + expiresAt — a compound (target, createdAt DESC)
 *     index would help. Adding it requires a reviewed Prisma migration.
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-03
 */

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import {
  buildTargetConditions,
  canIncludeAdminTargets,
  isNotificationVisibleToUser
} from "@/lib/services/notifications/notification-targeting"
import { normalizeApiBoundedInteger } from "@/lib/server/api-number-utils"

const NOTIFICATIONS_DEBUG = process.env.NOTIFICATIONS_DEBUG === "1"
function dlog(...args: unknown[]): void {
  if (NOTIFICATIONS_DEBUG) console.log(...args)
}

/**
 * GET /api/notifications
 * Fetch user notifications with filters. Returns 200 with empty list on errors
 * so the UI keeps polling without surfacing toast errors.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const queryUserId = searchParams.get('userId')

    let session
    try {
      session = await auth()
    } catch (authError: any) {
      console.error("[API-NOTIFICATIONS] auth error:", authError?.message)
      return NextResponse.json({
        error: "Authentication failed",
        notifications: [],
        unreadCount: 0
      }, { status: 401 })
    }

    if (!session?.user) {
      return NextResponse.json({
        error: "Unauthorized",
        notifications: [],
        unreadCount: 0
      }, { status: 401 })
    }

    const sessionUserId = (session.user as any)?.id
    const userRole = (session.user as any)?.role || 'USER'
    const includeAdminTargets = searchParams.get('includeAdminTargets') === 'true'
    const allowAdminTargets = canIncludeAdminTargets(userRole, includeAdminTargets)

    if (!sessionUserId || typeof sessionUserId !== 'string' || sessionUserId.trim() === '') {
      console.error("[API-NOTIFICATIONS] missing sessionUserId")
      return NextResponse.json({
        error: "User ID not found in session",
        notifications: [],
        unreadCount: 0
      }, { status: 401 })
    }

    if (queryUserId && queryUserId !== sessionUserId) {
      console.error("[API-NOTIFICATIONS] queryUserId mismatch")
      return NextResponse.json({
        error: "Forbidden: Cannot access other user's notifications",
        notifications: [],
        unreadCount: 0
      }, { status: 403 })
    }

    if (includeAdminTargets && !allowAdminTargets) {
      return NextResponse.json({
        error: "Forbidden: Admin targets require admin role",
        notifications: [],
        unreadCount: 0
      }, { status: 403 })
    }

    const userId = sessionUserId.trim()
    const type = searchParams.get('type')
    const priority = searchParams.get('priority')
    const read = searchParams.get('read')
    const limit = normalizeApiBoundedInteger(searchParams.get('limit'), 50, 1, 500)
    const offset = normalizeApiBoundedInteger(searchParams.get('offset'), 0, 0, 100_000)

    const targetConditions = buildTargetConditions(userId, allowAdminTargets)

    const where: any = {
      AND: [
        { OR: targetConditions },
        {
          OR: [
            { expiresAt: { gt: new Date() } },
            { expiresAt: null }
          ]
        }
      ]
    }

    if (type) where.AND.push({ type })
    if (priority) where.AND.push({ priority })
    if (read !== null) {
      if (read === 'true') {
        where.AND.push({ readBy: { has: userId } })
        // unread filter omitted intentionally — use separate unreadCount query below
      }
      // read === 'false': omit readBy filter — findMany gets all, readBy check is done in JS
    }

    dlog("[API-NOTIFICATIONS] query", { userId, userRole, limit, offset })

    let notifications: any[] = []
    let totalCount = 0

    try {
      const [notificationsResult, totalCountResult] = await Promise.all([
        prisma.notification.findMany({
          where,
          include: {
            createdByUser: {
              select: { id: true, name: true, email: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset
        }),
        prisma.notification.count({ where })
      ])

      notifications = notificationsResult || []
      totalCount = totalCountResult || 0
    } catch (dbError: any) {
      console.error("[API-NOTIFICATIONS] db error:", dbError?.message, dbError?.code)
      return NextResponse.json({
        notifications: [],
        pagination: { total: 0, limit, offset, hasMore: false },
        unreadCount: 0,
        error: "Failed to fetch notifications from database"
      }, { status: 200 })
    }

    const formattedNotifications = notifications
      .map(notif => {
        const isForUser = isNotificationVisibleToUser({
          target: notif.target,
          targetUserIds: Array.isArray(notif.targetUserIds) ? notif.targetUserIds : [],
          userId,
          allowAdminTargets
        })
        if (!isForUser) return null

        return {
          id: notif.id,
          title: notif.title,
          message: notif.message,
          type: notif.type,
          priority: notif.priority,
          target: notif.target,
          createdAt: notif.createdAt.toISOString(),
          expiresAt: notif.expiresAt?.toISOString() || null,
          read: Array.isArray(notif.readBy) ? notif.readBy.includes(userId) : false,
          createdBy: notif.createdByUser ? {
            id: notif.createdByUser.id,
            name: notif.createdByUser.name,
            email: notif.createdByUser.email
          } : null
        }
      })
      .filter((n): n is NonNullable<typeof n> => n !== null)

    let unreadCount = 0
    try {
      // Prisma Array filters: NOT has → hasNot operator (PostgreSQL String[])
      const unreadWhere = {
        AND: [
          { OR: targetConditions },
          {
            OR: [
              { expiresAt: { gt: new Date() } },
              { expiresAt: null }
            ]
          },
          { readBy: { hasNot: userId } }
        ]
      }
      unreadCount = await prisma.notification.count({ where: unreadWhere })
    } catch (countError: any) {
      console.error("[API-NOTIFICATIONS] unread count error:", countError?.message)
      // Fallback: derive from already-fetched notifications
      unreadCount = notifications.filter((n: any) =>
        !Array.isArray(n.readBy) || !n.readBy.includes(userId)
      ).length
    }

    dlog("[API-NOTIFICATIONS] result", {
      returned: formattedNotifications.length,
      unreadCount,
      total: totalCount
    })

    return NextResponse.json({
      notifications: formattedNotifications,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount
      },
      unreadCount
    }, { status: 200 })

  } catch (error: any) {
    console.error("[API-NOTIFICATIONS] GET error:", error?.message, error?.code)
    return NextResponse.json({
      notifications: [],
      pagination: { total: 0, limit: 50, offset: 0, hasMore: false },
      unreadCount: 0,
      error: error?.message || "Failed to fetch notifications"
    }, { status: 200 })
  }
}

/**
 * PATCH /api/notifications
 * Mark notifications as read/unread for the session user.
 */
export async function PATCH(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = (session.user as any).id
    const body = await req.json()
    const { notificationIds, read } = body

    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      return NextResponse.json(
        { error: "notificationIds array is required" },
        { status: 400 }
      )
    }

    if (typeof read !== 'boolean') {
      return NextResponse.json(
        { error: "read boolean is required" },
        { status: 400 }
      )
    }

    dlog("[API-NOTIFICATIONS] PATCH", { count: notificationIds.length, read })

    const updates = await Promise.all(
      notificationIds.map(async (notificationId: string) => {
        const notification = await prisma.notification.findUnique({
          where: { id: notificationId }
        })
        if (!notification) return null

        const hasAccess =
          notification.target === 'ALL' ||
          notification.target === 'USERS' ||
          (notification.target === 'SPECIFIC' && notification.targetUserIds.includes(userId))

        if (!hasAccess) return null

        let updatedReadBy = [...notification.readBy]
        if (read) {
          if (!updatedReadBy.includes(userId)) updatedReadBy.push(userId)
        } else {
          updatedReadBy = updatedReadBy.filter(id => id !== userId)
        }

        return await prisma.notification.update({
          where: { id: notificationId },
          data: { readBy: updatedReadBy }
        })
      })
    )

    const successfulUpdates = updates.filter(Boolean).length

    return NextResponse.json({
      success: true,
      updated: successfulUpdates,
      message: `Marked ${successfulUpdates} notification(s) as ${read ? 'read' : 'unread'}`
    }, { status: 200 })

  } catch (error: any) {
    console.error("[API-NOTIFICATIONS] PATCH error:", error?.message)
    return NextResponse.json(
      { error: error.message || "Failed to update notifications" },
      { status: 500 }
    )
  }
}
