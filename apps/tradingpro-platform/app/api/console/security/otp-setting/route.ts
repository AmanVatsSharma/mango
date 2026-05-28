/**
 * API route for updating user's OTP requirement preference
 * 
 * @file app/api/console/security/otp-setting/route.ts
 * @module console-security
 * @description Allows users to toggle whether OTP is required on login
 * @author StockTrade
 * @created 2025-01-15
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  console.log("🔐 [OTP-SETTING-API] POST request received")

  try {
    // Step 1: Authenticate
    const session = await auth()
    console.log("🔐 [OTP-SETTING-API] Session check:", {
      hasSession: !!session,
      userId: session?.user?.id,
    })

    if (!session?.user?.id) {
      console.warn("⚠️ [OTP-SETTING-API] Unauthorized access attempt")
      return NextResponse.json(
        {
          error: "Unauthorized",
          message: "Please sign in to update security settings",
        },
        { status: 401 }
      )
    }

    const userId = session.user.id

    // Step 2: Parse request body
    let body
    try {
      body = await request.json()
    } catch (parseError) {
      console.error("❌ [OTP-SETTING-API] Failed to parse request body:", parseError)
      return NextResponse.json(
        {
          error: "Invalid request",
          message: "Request body must be valid JSON",
        },
        { status: 400 }
      )
    }

    const { requireOtpOnLogin } = body

    // Step 3: Validate input
    if (typeof requireOtpOnLogin !== "boolean") {
      console.warn("⚠️ [OTP-SETTING-API] Invalid requireOtpOnLogin value:", requireOtpOnLogin)
      return NextResponse.json(
        {
          error: "Invalid input",
          message: "requireOtpOnLogin must be a boolean value",
        },
        { status: 400 }
      )
    }

    // Step 4: Update user preference
    console.log("💾 [OTP-SETTING-API] Updating OTP preference for user:", userId, "to:", requireOtpOnLogin)

    try {
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { requireOtpOnLogin },
        select: {
          id: true,
          requireOtpOnLogin: true,
        },
      })

      console.log("✅ [OTP-SETTING-API] OTP preference updated successfully:", updatedUser)

      return NextResponse.json({
        success: true,
        message: requireOtpOnLogin
          ? "OTP requirement enabled. You will be asked for OTP on every login."
          : "OTP requirement disabled. You can log in without OTP verification.",
        requireOtpOnLogin: updatedUser.requireOtpOnLogin,
      })
    } catch (dbError) {
      console.error("❌ [OTP-SETTING-API] Database error:", dbError)
      return NextResponse.json(
        {
          error: "Database error",
          message: "Failed to update OTP setting. Please try again.",
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error("❌ [OTP-SETTING-API] Error in OTP setting update:", error)
    console.error("🔍 [OTP-SETTING-API] Error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })

    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "An unexpected error occurred",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
