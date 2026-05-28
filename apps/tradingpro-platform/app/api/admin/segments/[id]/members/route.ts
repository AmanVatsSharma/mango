/**
 * @file route.ts
 * @module admin-console
 * @description POST /api/admin/segments/[id]/members — add user to segment
 *              DELETE /api/admin/segments/[id]/members — remove user from segment
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { SegmentRepository } from "@/lib/repositories/SegmentRepository"
import { invalidateUserSegments } from "@/lib/market-control/user-segment-lookup"

export const dynamic = "force-dynamic"

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handleAdminApi(
    req,
    { route: "/api/admin/segments/[id]/members", required: "admin.segments.manage", fallbackMessage: "Failed to add member" },
    async (ctx) => {
      const { userId } = await req.json()
      if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 })
      await SegmentRepository.addMember(params.id, userId, ctx.session.user.id)
      await invalidateUserSegments(userId).catch(() => {})
      return NextResponse.json({ success: true }, { status: 201 })
    }
  )
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return handleAdminApi(
    req,
    { route: "/api/admin/segments/[id]/members", required: "admin.segments.manage", fallbackMessage: "Failed to remove member" },
    async () => {
      const { searchParams } = new URL(req.url)
      const userId = searchParams.get("userId")
      if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 })
      await SegmentRepository.removeMember(params.id, userId)
      await invalidateUserSegments(userId).catch(() => {})
      return NextResponse.json({ success: true })
    }
  )
}
