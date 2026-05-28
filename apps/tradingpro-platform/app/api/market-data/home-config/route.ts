/**
 * @file route.ts
 * @module market-data-home-config
 * @description API endpoint for resolved dashboard home config (global defaults + user overrides)
 * @author StockTrade
 * @created 2026-02-17
 */

export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import {
  resetUserHomeDashboardOverride,
  resolveHomeDashboardConfig,
  upsertUserHomeDashboardOverride,
} from "@/lib/server/home-dashboard-config"

export async function GET(request: NextRequest) {
  try {
    const session = await auth().catch(() => null)
    const userId = typeof session?.user?.id === "string" ? session.user.id : undefined
    console.log("🔹 [HOME-CONFIG] Resolving home dashboard config", { hasUser: Boolean(userId) })

    const resolution = await resolveHomeDashboardConfig(userId)
    const response = NextResponse.json({
      success: true,
      config: resolution.config,
      isDefault: resolution.isDefault,
      meta: {
        hasGlobalConfig: resolution.hasGlobalConfig,
        hasUserOverride: resolution.hasUserOverride,
      },
    })
    response.headers.set("Cache-Control", "no-store")
    return response
  } catch (error) {
    console.error("❌ [HOME-CONFIG] Error fetching resolved config:", error)
    const response = NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch home configuration",
      },
      { status: 500 },
    );
    response.headers.set("Cache-Control", "no-store")
    return response
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth()
    const userId = typeof session?.user?.id === "string" ? session.user.id.trim() : ""
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 })
    }

    const rawOverride =
      (body as Record<string, unknown>).override ??
      (body as Record<string, unknown>).config ??
      body

    await upsertUserHomeDashboardOverride(userId, rawOverride)
    const resolution = await resolveHomeDashboardConfig(userId)
    const response = NextResponse.json({
      success: true,
      message: "Home dashboard preferences saved",
      config: resolution.config,
      meta: {
        hasGlobalConfig: resolution.hasGlobalConfig,
        hasUserOverride: resolution.hasUserOverride,
      },
    })
    response.headers.set("Cache-Control", "no-store")
    return response
  } catch (error) {
    console.error("❌ [HOME-CONFIG] Failed to save user override:", error)
    const response = NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to save home preferences",
      },
      { status: 500 },
    )
    response.headers.set("Cache-Control", "no-store")
    return response
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()
    const userId = typeof session?.user?.id === "string" ? session.user.id.trim() : ""
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    await resetUserHomeDashboardOverride(userId)
    const resolution = await resolveHomeDashboardConfig(userId)
    const response = NextResponse.json({
      success: true,
      message: "Home dashboard preferences reset to admin defaults",
      config: resolution.config,
      meta: {
        hasGlobalConfig: resolution.hasGlobalConfig,
        hasUserOverride: resolution.hasUserOverride,
      },
    })
    response.headers.set("Cache-Control", "no-store")
    return response
  } catch (error) {
    console.error("❌ [HOME-CONFIG] Failed to reset user override:", error)
    const response = NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to reset home preferences",
      },
      { status: 500 },
    )
    response.headers.set("Cache-Control", "no-store")
    return response
  }
}
