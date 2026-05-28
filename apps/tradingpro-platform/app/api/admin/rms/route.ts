/**
 * @file route.ts
 * @module admin-console
 * @description API route for Relationship Manager (RM) management
 * @author StockTrade
 * @created 2025-01-27
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Role } from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"

/**
 * Helper function to determine which roles a user can manage based on their role
 * Hierarchy: SUPER_ADMIN > ADMIN > MODERATOR > USER
 */
function getManageableRoles(userRole: Role): Role[] {
  switch (userRole) {
    case 'SUPER_ADMIN':
      return ['ADMIN', 'MODERATOR', 'USER'] // Can manage all roles below
    case 'ADMIN':
      return ['MODERATOR', 'USER'] // Can manage moderators and users
    case 'MODERATOR':
      return ['USER'] // Can only manage users
    default:
      return [] // USER role cannot manage anyone
  }
}

/**
 * GET /api/admin/rms
 * List all Relationship Managers (and teams) with hierarchical access
 * - SUPER_ADMIN sees: ADMIN, MODERATOR, USER (all roles below)
 * - ADMIN sees: MODERATOR, USER (roles below)
 * - MODERATOR sees: USER (roles below)
 *
 * Query: `includeUsers` — omit or `true` = include end-user rows in the list; `false` = ADMIN/MODERATOR nodes only.
 */
export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/rms",
      required: "admin.users.rm",
      fallbackMessage: "Failed to fetch RMs",
    },
    async (ctx) => {
      const session = ctx.session
      const role = ctx.role as Role
      const includeUsers =
        new URL(req.url).searchParams.get("includeUsers") !== "false"

      const manageableRoles = getManageableRoles(role)
      ctx.logger.debug(
        { role, manageableRoles, includeUsers },
        "GET /api/admin/rms - scope",
      )

    // If MODERATOR, only return their own data and their managed users
    if (role === 'MODERATOR') {
      const rm = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: {
          _count: {
            select: {
              managedUsers: true
            }
          },
          managedUsers: {
            where: {
              role: 'USER' // Moderators can only manage users
            },
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              clientId: true,
              isActive: true,
              role: true,
              createdAt: true
            },
            take: 10 // Limit for preview
          },
          managedBy: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          }
        }
      })

      if (!rm) {
        throw new AppError({ code: "NOT_FOUND", message: "RM not found", statusCode: 404 })
      }

      return NextResponse.json({
        rms: [{
          id: rm.id,
          name: rm.name,
          email: rm.email,
          phone: rm.phone,
          clientId: rm.clientId,
          isActive: rm.isActive,
          role: rm.role,
          rmPublicContact: rm.rmPublicContact,
          assignedUsersCount: rm._count.managedUsers,
          managedBy: rm.managedBy ? {
            id: rm.managedBy.id,
            name: rm.managedBy.name,
            email: rm.managedBy.email,
            role: rm.managedBy.role
          } : null,
          createdAt: rm.createdAt
        }],
        total: 1
      })
    }

    // For ADMIN/SUPER_ADMIN: RM-capable rows (ADMIN/MODERATOR); optionally include managed USER rows in the list
    const rmOnlyBranch = {
      role: {
        in: ['ADMIN', 'MODERATOR'] as const,
      },
      ...(role === 'ADMIN'
        ? {
            OR: [
              { id: session.user.id },
              { managedById: session.user.id },
            ],
          }
        : {}),
    }

    const whereClause: { OR: object[] } = {
      OR: includeUsers
        ? [
            rmOnlyBranch,
            {
              role: {
                in: manageableRoles,
              },
              ...(role === 'SUPER_ADMIN'
                ? {}
                : {
                    managedById: session.user.id,
                  }),
            },
            ...(role === 'ADMIN'
              ? [
                  {
                    role: 'USER' as const,
                    managedBy: {
                      managedById: session.user.id,
                      role: 'MODERATOR' as const,
                    },
                  },
                ]
              : []),
          ]
        : [rmOnlyBranch],
    }

    const rms = await prisma.user.findMany({
      where: whereClause,
      include: {
        _count: {
          select: {
            managedUsers: true
          }
        },
        managedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: [
        { role: 'asc' }, // Order by role hierarchy
        { createdAt: 'desc' }
      ]
    })

      ctx.logger.info({ count: rms.length, role }, "GET /api/admin/rms - success")

    return NextResponse.json({
      rms: rms.map(rm => ({
        id: rm.id,
        name: rm.name,
        email: rm.email,
        phone: rm.phone,
        clientId: rm.clientId,
        isActive: rm.isActive,
        role: rm.role,
        rmPublicContact: rm.rmPublicContact,
        assignedUsersCount: rm._count.managedUsers,
        managedBy: rm.managedBy ? {
          id: rm.managedBy.id,
          name: rm.managedBy.name,
          email: rm.managedBy.email,
          role: rm.managedBy.role
        } : null,
        createdAt: rm.createdAt
      })),
      total: rms.length
    })
    }
  )
}

/**
 * POST /api/admin/rms
 * Create a new Relationship Manager
 */
export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/rms",
      required: "admin.users.rm",
      fallbackMessage: "Failed to create RM",
    },
    async (ctx) => {
      const session = ctx.session
      const role = ctx.role

      const body = await req.json()
      const { name, email, phone, password } = body

      if (!name || !email || !phone || !password) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Missing required fields: name, email, phone, password",
          statusCode: 400,
        })
      }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { phone }
        ]
      }
    })

    if (existingUser) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "User with this email or phone already exists",
          statusCode: 400,
        })
    }

    // Determine which role to assign based on current user's role
    // SUPER_ADMIN can create ADMIN or MODERATOR
    // ADMIN can create MODERATOR
    const bodyRole = body.role as Role | undefined
    let targetRole: Role = 'MODERATOR' // Default
    
    if (bodyRole) {
      const manageableRoles = getManageableRoles(role)
      if (manageableRoles.includes(bodyRole)) {
        targetRole = bodyRole
      } else {
          throw new AppError({
            code: "FORBIDDEN",
            message: `You cannot create users with role ${bodyRole}. You can only create: ${manageableRoles.join(', ')}`,
            statusCode: 403,
          })
      }
    } else {
      // Default: ADMIN creates MODERATOR, SUPER_ADMIN creates MODERATOR
      targetRole = role === 'SUPER_ADMIN' ? 'MODERATOR' : 'MODERATOR'
    }

    // Create user with appropriate role
    const bcrypt = require('bcryptjs')
    const hashedPassword = await bcrypt.hash(password, 10)

    const rm = await prisma.user.create({
      data: {
        name,
        email,
        phone,
        password: hashedPassword,
        role: targetRole,
        isActive: true,
        emailVerified: new Date(),
        phoneVerified: new Date(),
        managedById: session.user.id // Assign to current user
      }
    })

      ctx.logger.info({ rmId: rm.id, targetRole }, "POST /api/admin/rms - success")

    return NextResponse.json({
      success: true,
      rm: {
        id: rm.id,
        name: rm.name,
        email: rm.email,
        phone: rm.phone,
        clientId: rm.clientId,
        isActive: rm.isActive,
        createdAt: rm.createdAt
      }
    }, { status: 201 })
    }
  )
}
