/**
 * @file route.ts
 * @module admin-console
 * @description GET /api/admin/segments — list all user segments
 *              POST /api/admin/segments — create a new segment
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { SegmentRepository } from "@/lib/repositories/SegmentRepository"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    { route: "/api/admin/segments", required: "admin.segments.read", fallbackMessage: "Failed to fetch segments" },
    async (ctx) => {
      const segments = await SegmentRepository.findMany()
      return NextResponse.json({ segments })
    }
  )
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    { route: "/api/admin/segments", required: "admin.segments.manage", fallbackMessage: "Failed to create segment" },
    async (ctx) => {
      const body = await req.json()
      const { name, description, color } = body
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json({ error: "name is required" }, { status: 400 })
      }
      const segment = await SegmentRepository.create({
        name: name.trim(),
        description: description?.trim() || null,
        color: color || "#6366F1",
        createdBy: { connect: { id: ctx.session.user.id } },
      })
      return NextResponse.json({ segment }, { status: 201 })
    }
  )
}
