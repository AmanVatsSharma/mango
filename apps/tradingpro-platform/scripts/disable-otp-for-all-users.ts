/**
 * File:        scripts/disable-otp-for-all-users.ts
 * Module:      Database Maintenance
 * Purpose:     Disable OTP requirement for all users in the database.
 *              Run once to bulk-update requireOtpOnLogin = false for all users.
 *
 * Usage:
 *   npx tsx scripts/disable-otp-for-all-users.ts
 *   # or
 *   npx ts-node scripts/disable-otp-for-all-users.ts
 *
 * Author:      Aman Sharma
 * Last-updated: 2026-05-12
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function disableOtpForAllUsers() {
  console.log("🔍 Checking users with OTP required...")

  try {
    // Count users with OTP required
    const usersWithOtp = await prisma.user.count({
      where: { requireOtpOnLogin: true },
    })

    if (usersWithOtp === 0) {
      console.log("✅ No users have OTP required. Nothing to do.")
      return
    }

    console.log(`📊 Found ${usersWithOtp} user(s) with OTP required`)

    // Bulk update all users to disable OTP
    const result = await prisma.user.updateMany({
      where: { requireOtpOnLogin: true },
      data: { requireOtpOnLogin: false },
    })

    console.log(`✅ Successfully disabled OTP for ${result.count} user(s)`)
  } catch (error) {
    console.error("❌ Error updating users:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

disableOtpForAllUsers()
  .then(() => {
    console.log("\n✅ Done.")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error)
    process.exit(1)
  })
