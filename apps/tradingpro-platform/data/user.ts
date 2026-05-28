/**
 * @file user.ts
 * @module data
 * @description Prisma-backed user lookups by email, phone, client id, or generic identifier (login helpers).
 * @author StockTrade
 * @created 2025-01-01
 * @updated 2026-04-03
 *
 * Notes:
 * - Email/phone queries align with `canonicalEmailForPersistence` / `canonicalPhoneForPersistence` for new rows; legacy rows may need a one-time DB normalize.
 */

import { prisma } from "@/lib/prisma"
import {
  canonicalEmailForPersistence,
  canonicalPhoneForPersistence,
} from "@/lib/identity/user-contact-canonical"

function phoneLookupCandidates(phone: string): string[] {
  const canonical = canonicalPhoneForPersistence(phone)
  const trimmed = phone.trim()
  const digits = phone.replace(/\D/g, "")
  const out: string[] = []
  if (canonical.length >= 10) {
    out.push(canonical)
  }
  if (trimmed.length >= 10 && !out.includes(trimmed)) {
    out.push(trimmed)
  }
  if (digits.length >= 10 && !out.includes(digits)) {
    out.push(digits)
  }
  if (digits.length >= 12 && digits.startsWith("91")) {
    const tail = digits.slice(-10)
    if (!out.includes(tail)) {
      out.push(tail)
    }
  }
  return out
}

export const getUserByEmail = async (email: string) => {
  try {
    const c = canonicalEmailForPersistence(email)
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: c }, { email: { equals: email.trim(), mode: "insensitive" as const } }],
      },
    })
    return user
  } catch {
    return null
  }
}

export const getUserById = async (id: string) => {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id,
      },
    })

    return user
  } catch (error) {
    return error || null
  }
}

export const getUserByPhone = async (phone: string) => {
  try {
    const candidates = phoneLookupCandidates(phone)
    if (candidates.length === 0) {
      return null
    }
    if (candidates.length === 1) {
      return prisma.user.findUnique({
        where: { phone: candidates[0] },
      })
    }
    return prisma.user.findFirst({
      where: { OR: candidates.map((p) => ({ phone: p })) },
    })
  } catch {
    return null
  }
}

export const getUserByClientId = async (clientId: string) => {
  try {
    const user = await prisma.user.findUnique({
      where: {
        clientId,
      },
    })

    return user
  } catch (error) {
    return null
  }
}

export const getUserByIdentifier = async (identifier: string) => {
  try {
    let user = await getUserByEmail(identifier)

    if (!user) {
      user = await getUserByPhone(identifier)
    }

    if (!user) {
      user = await getUserByClientId(identifier)
    }

    return user
  } catch (error) {
    return null
  }
}
