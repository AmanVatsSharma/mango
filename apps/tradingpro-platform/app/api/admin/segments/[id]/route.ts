/**
 * @file route.ts
 * @module admin-console
 * @description GET/PATCH/DELETE /api/admin/segments/[id]
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { SegmentRepository } from "@/lib/repositories/SegmentRepository"

export const dynamic = "force-dynamic"

export async function GET(req: Request, { params }: { params: { id: string } }) {
  return handleAdminApi(
    req,
    { route: "/api/admin/segments/[id]", required: "admin.segments.read", fallbackMessage: "Failed to fetch segment" },
    async () => {
      const segment = await SegmentRepository.findById(params.id)
      if (!segment) return NextResponse.json({ error: "Segment not found" }, { status: 404 })
      return NextResponse.json({ segment })
    }
  )
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handleAdminApi(
    req,
    { route: "/api/admin/segments/[id]", required: "admin.segments.manage", fallbackMessage: "Failed to update segment" },
    async () => {
      const body = await req.json()
      const { name, description, color, isActive } = body
      const segment = await SegmentRepository.update(params.id, {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(color !== undefined && { color }),
        ...(isActive !== undefined && { isActive }),
      })
      return NextResponse.json({ segment })
    }
  )
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return handleAdminApi(
    req,
    { route: "/api/admin/segments/[id]", required: "admin.segments.manage", fallbackMessage: "Failed to delete segment" },
    async () => {
      await SegmentRepository.delete(params.id)
      return NextResponse.json({ success: true })
    }
  )
}
