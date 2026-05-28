/**
 * @file route.ts
 * @module notifications
 * @description Test endpoint for notification system debugging
 * @author StockTrade
 * @created 2025-01-27
 */

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import {
  buildTargetConditions,
  canIncludeAdminTargets,
  isNotificationVisibleToUser
} from "@/lib/services/notifications/notification-targeting"

/**
 * GET /api/notifications/test
 * Test endpoint to verify notification system is working
 * 
 * @description This endpoint helps debug notification issues by:
 * - Verifying session and userId
 * - Checking notification database
 * - Testing query logic
 * - Returning diagnostic information
 */
export async function GET(req: Request) {
  console.log("🧪 [API-NOTIFICATIONS-TEST] Test request received")

  try {
    // Test 1: Session validation
    const session = await auth()
    const sessionUserId = (session?.user as any)?.id
    const { searchParams } = new URL(req.url)
    const includeAdminTargets = searchParams.get('includeAdminTargets') === 'true'
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      session: {
        exists: !!session,
        hasUser: !!session?.user,
        userId: sessionUserId,
        userEmail: (session?.user as any)?.email,
        userName: (session?.user as any)?.name,
        userRole: (session?.user as any)?.role,
        sessionKeys: session?.user ? Object.keys(session.user) : []
      },
      database: {
        connected: false,
        notificationCount: 0,
        testQuery: null as any
      },
      queryLogic: {
        targetAll: 0,
        targetUsers: 0,
        targetSpecific: 0,
        expired: 0,
        active: 0
      },
      errors: [] as string[]
    }

    if (!session || !session.user) {
      diagnostics.errors.push("No session or user found")
      return NextResponse.json({
        success: false,
        diagnostics,
        message: "Session validation failed"
      }, { status: 401 })
    }

    if (!sessionUserId) {
      diagnostics.errors.push("userId not found in session")
      return NextResponse.json({
        success: false,
        diagnostics,
        message: "userId validation failed"
      }, { status: 401 })
    }

    // Test 2: Database connection
    try {
      const totalNotifications = await prisma.notification.count()
      diagnostics.database.connected = true
      diagnostics.database.notificationCount = totalNotifications

      // Test 3: Query logic
      const [targetAll, targetUsers, targetSpecific, expired, active] = await Promise.all([
        prisma.notification.count({ where: { target: 'ALL' } }),
        prisma.notification.count({ where: { target: 'USERS' } }),
        prisma.notification.count({ where: { target: 'SPECIFIC' } }),
        prisma.notification.count({ 
          where: { 
            expiresAt: { lt: new Date() }
          }
        }),
        prisma.notification.count({
          where: {
            OR: [
              { expiresAt: { gt: new Date() } },
              { expiresAt: null }
            ]
          }
        })
      ])

      diagnostics.queryLogic = {
        targetAll,
        targetUsers,
        targetSpecific,
        expired,
        active
      }

      // Test 3.5: Role-based filtering verification
      const userRole = (session.user as any)?.role || 'USER'
      const allowAdminTargets = canIncludeAdminTargets(userRole, includeAdminTargets)

      if (includeAdminTargets && !allowAdminTargets) {
        diagnostics.errors.push("Admin targets requested by non-admin user")
        return NextResponse.json({
          success: false,
          diagnostics,
          message: "Admin targets require admin role"
        }, { status: 403 })
      }
      
      // Count notifications user should see
      const userShouldSee = await prisma.notification.count({
        where: {
          AND: [
            {
              OR: [
                { target: 'ALL' },
                { target: 'USERS' },
                ...(allowAdminTargets ? [{ target: 'ADMINS' }] : []),
                { 
                  AND: [
                    { target: 'SPECIFIC' },
                    { targetUserIds: { has: sessionUserId } }
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
        }
      })

      diagnostics.queryLogic.userShouldSee = userShouldSee
      diagnostics.queryLogic.userRole = userRole
      diagnostics.queryLogic.allowAdminTargets = allowAdminTargets
      diagnostics.queryLogic.includeAdminTargets = includeAdminTargets

      // Test 4: User-specific query (same as actual API with role-based filtering)
      const targetConditions = buildTargetConditions(sessionUserId, allowAdminTargets)

      const userQuery = {
        AND: [
          {
            OR: targetConditions
          },
          {
            OR: [
              { expiresAt: { gt: new Date() } },
              { expiresAt: null }
            ]
          }
        ]
      }

      const userNotifications = await prisma.notification.findMany({
        where: userQuery,
        take: 5,
        orderBy: { createdAt: 'desc' }
      })

      // Verify each notification is meant for this user
      const verifiedNotifications = userNotifications.map(n => {
        const isForUser = isNotificationVisibleToUser({
          target: n.target,
          targetUserIds: Array.isArray(n.targetUserIds) ? n.targetUserIds : [],
          userId: sessionUserId,
          allowAdminTargets
        })
        
        return {
          id: n.id,
          title: n.title,
          target: n.target,
          targetUserIds: n.targetUserIds,
          readBy: n.readBy,
          isRead: n.readBy.includes(sessionUserId),
          isForUser,
          expiresAt: n.expiresAt,
          createdAt: n.createdAt,
          verification: isForUser ? 'PASS' : 'FAIL - Should not see this notification'
        }
      })

      const invalidNotifications = verifiedNotifications.filter(n => !n.isForUser)
      if (invalidNotifications.length > 0) {
        diagnostics.errors.push(`Found ${invalidNotifications.length} notifications user should not see`)
      }

      diagnostics.database.testQuery = {
        query: userQuery,
        resultCount: userNotifications.length,
        verifiedCount: verifiedNotifications.filter(n => n.isForUser).length,
        invalidCount: invalidNotifications.length,
        userRole,
        allowAdminTargets,
        includeAdminTargets,
        sampleNotifications: verifiedNotifications
      }

      return NextResponse.json({
        success: true,
        diagnostics,
        message: "All tests passed",
        recommendations: [
          diagnostics.queryLogic.active === 0 ? "No active notifications found. Create one from admin console." : null,
          diagnostics.queryLogic.targetUsers === 0 && diagnostics.queryLogic.targetAll === 0 ? "No notifications with target 'ALL' or 'USERS'. Create one targeting 'ALL' or 'USERS'." : null,
          diagnostics.database.notificationCount === 0 ? "No notifications in database. Create notifications from admin console." : null
        ].filter(Boolean)
      }, { status: 200 })

    } catch (dbError: any) {
      diagnostics.errors.push(`Database error: ${dbError.message}`)
      diagnostics.database.connected = false
      
      return NextResponse.json({
        success: false,
        diagnostics,
        message: "Database test failed",
        error: dbError.message
      }, { status: 500 })
    }

  } catch (error: any) {
    console.error("❌ [API-NOTIFICATIONS-TEST] Error:", error)
    return NextResponse.json({
      success: false,
      error: error.message || "Test failed",
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
