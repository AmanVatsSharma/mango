/**
 * @file route.ts
 * @module admin-console
 * @description POST /api/admin/segments/[id]/policies — assign policy to segment
 *              DELETE /api/admin/segments/[id]/policies — unassign policy from segment
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { SegmentRepository } from "@/lib/repositories/SegmentRepository"

export const dynamic = "force-dynamic"

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handleAdminApi(
    req,
    { route: "/api/admin/segments/[id]/policies", required: "admin.policies.manage", fallbackMessage: "Failed to assign policy" },
    async () => {
      const { policyId, priority = 0 } = await req.json()
      if (!policyId) return NextResponse.json({ error: "policyId is required" }, { status: 400 })
      await SegmentRepository.assignPolicy(params.id, policyId, priority)
      return NextResponse.json({ success: true }, { status: 201 })
    }
  )
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return handleAdminApi(
    req,
    { route: "/api/admin/segments/[id]/policies", required: "admin.policies.manage", fallbackMessage: "Failed to unassign policy" },
    async () => {
      const { searchParams } = new URL(req.url)
      const policyId = searchParams.get("policyId")
      if (!policyId) return NextResponse.json({ error: "policyId is required" }, { status: 400 })
      await SegmentRepository.unassignPolicy(params.id, policyId)
      return NextResponse.json({ success: true })
    }
  )
}
