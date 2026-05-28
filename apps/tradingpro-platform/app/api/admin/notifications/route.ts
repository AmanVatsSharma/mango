/**
 * @file route.ts
 * @module admin-console
 * @description API route for notification management
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-02-02
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/notifications",
      required: "admin.notifications.manage",
      fallbackMessage: "Failed to fetch notifications",
    },
    async (ctx) => {
      const userId = (ctx.session.user as any).id

    // Fetch notifications - filter by target audience
    const notifications = await prisma.notification.findMany({
      where: {
        AND: [
          {
            OR: [
              { target: 'ALL' },
              { target: 'ADMINS' },
              { 
                AND: [
                  { target: 'SPECIFIC' },
                  { targetUserIds: { has: userId } }
                ]
              }
            ]
          },
          {
            OR: [
              { expiresAt: { gt: new Date() } },
              { expiresAt: null }
            ]
          }
        ]
      },
      include: {
        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 100
    })

    const formattedNotifications = notifications.map(notif => ({
      id: notif.id,
      title: notif.title,
      message: notif.message,
      type: notif.type,
      priority: notif.priority,
      target: notif.target,
      createdAt: notif.createdAt,
      expiresAt: notif.expiresAt,
      read: Array.isArray(notif.readBy) ? notif.readBy.includes(userId) : false
    }))

      ctx.logger.info({ count: formattedNotifications.length }, "GET /api/admin/notifications - success")

    return NextResponse.json({ notifications: formattedNotifications }, { status: 200 })
    }
  )
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/notifications",
      required: "admin.notifications.manage",
      fallbackMessage: "Failed to create notification",
    },
    async (ctx) => {
      const body = await req.json()
      const { title, message, type, priority, target, targetUserIds, expiresAt } = body
      const userId = (ctx.session.user as any).id

    // Create notification in database
    const notification = await prisma.notification.create({
      data: {
        title,
        message,
        type: type || 'INFO',
        priority: priority || 'MEDIUM',
        target: target || 'ALL',
        targetUserIds: targetUserIds || [],
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy: userId
      }
    })

      ctx.logger.info({ notificationId: notification.id }, "POST /api/admin/notifications - success")

    return NextResponse.json({
      success: true,
      message: "Notification created successfully",
      notification: {
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        priority: notification.priority,
        target: notification.target
      }
    }, { status: 201 })
    }
  )
}
