// actions/admin-user.actions.ts
"use server"
import { adminAddUserSchema } from "@/schemas"
import { prisma } from "@/lib/prisma"
import { auth } from "@/auth"
import bcrypt from "bcryptjs"
import * as z from "zod"
import { ensurePlaceholderKyc } from "@/lib/database-transactions"
import { grantSignupConsentsTx } from "@/lib/comms/consent"
import {
  canonicalEmailForPersistence,
  canonicalPhoneForPersistence,
} from "@/lib/identity/user-contact-canonical"
import type { Role } from "@prisma/client"

function generateClientId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  const randomLetters = Array.from({ length: 2 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join("")
  const randomNumbers = Math.floor(1000 + Math.random() * 9000)
  return randomLetters + randomNumbers
}

const ADMIN_ROLES: Role[] = ["ADMIN", "MODERATOR", "SUPER_ADMIN"]

/**
 * Admin-only user creation — no self-registration flow, no email verification,
 * no OTP. Admin can optionally supply email and/or phone, or leave both blank
 * (simple-style account). KYC is not required at creation time; a placeholder row
 * is created so the user appears in the KYC queue.
 *
 * Access: ADMIN | MODERATOR | SUPER_ADMIN only.
 */
export const adminAddUser = async (values: z.infer<typeof adminAddUserSchema>) => {
  const validatedFields = adminAddUserSchema.safeParse(values)

  if (!validatedFields.success) {
    const errors = validatedFields.error.issues.map((e: any) => e.message).join(", ")
    return { error: `Invalid fields: ${errors}` }
  }

  // Authorization: verify caller is an admin
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "You must be logged in to perform this action." }
  }
  const role = (session.user as any).role as string | undefined
  if (!role || !ADMIN_ROLES.includes(role as Role)) {
    return { error: "Access denied. Admin privileges required." }
  }

  const { name, email, phone, password, role: userRole } = validatedFields.data
  const emailPersist = email && email.length > 0 ? canonicalEmailForPersistence(email) : null
  const phonePersist = phone && phone.length > 0 ? canonicalPhoneForPersistence(phone) : null

  try {
    // Check duplicate email
    if (emailPersist) {
      const existingEmail = await prisma.user.findUnique({ where: { email: emailPersist } })
      if (existingEmail) {
        return { error: "A user with this email already exists." }
      }
    }

    // Check duplicate phone
    if (phonePersist && phonePersist.length >= 10) {
      const existingPhone = await prisma.user.findUnique({ where: { phone: phonePersist } })
      if (existingPhone) {
        return { error: "A user with this mobile number already exists." }
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const clientId = generateClientId()

    const newUser = await prisma.$transaction(async (tx) => {
      const nu = await tx.user.create({
        data: {
          name,
          email: emailPersist ?? undefined,
          phone: phonePersist ?? undefined,
          password: hashedPassword,
          clientId,
          role: userRole as Role,
          // Admin-created accounts are pre-verified; no email/phone verification needed
          emailVerified: emailPersist ? new Date() : null,
          phoneVerified: phonePersist ? new Date() : null,
          isActive: true,
        },
      })
      await tx.tradingAccount.create({
        data: {
          userId: nu.id,
          balance: 0,
          availableMargin: 0,
          usedMargin: 0,
          clientId,
        },
      })
      await tx.watchlist.create({
        data: {
          userId: nu.id,
          name: "My Watchlist",
          isDefault: true,
          sortOrder: 0,
        },
      })
      await ensurePlaceholderKyc(tx, nu.id)
      await grantSignupConsentsTx(tx, nu.id)
      return nu
    })

    return {
      success: "User created successfully.",
      clientId: newUser.clientId,
      userId: newUser.id,
    }
  } catch (error) {
    console.error("Admin user creation error:", error)
    if (error instanceof Error) {
      if (error.message.includes("Unique constraint")) {
        return { error: "An account with this information already exists." }
      }
      return { error: `Failed to create user: ${error.message}` }
    }
    return { error: "Failed to create user. Please try again later." }
  }
}