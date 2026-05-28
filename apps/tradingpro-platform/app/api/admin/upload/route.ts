/**
 * API Route: Admin File Upload
 * 
 * Handles file uploads to AWS S3 for:
 * - Profile images
 * - Payment QR codes
 * - Documents
 * 
 * @route POST /api/admin/upload
 */

import { NextRequest, NextResponse } from "next/server"
import { getS3Service } from "@/lib/aws-s3"
import { requireAdminPermissions } from "@/lib/rbac/admin-guard"

console.log("📤 [API-ADMIN-UPLOAD] Route loaded")

export async function POST(req: NextRequest) {
  console.log("🌐 [API-ADMIN-UPLOAD] POST request received")
  
  try {
    const authResult = await requireAdminPermissions(req, "admin.upload.manage")
    if (!authResult.ok) return authResult.response
    const session = authResult.session

    console.log("✅ [API-ADMIN-UPLOAD] Admin/SuperAdmin authenticated:", session.user.email)

    // Get form data
    const formData = await req.formData()
    const file = formData.get('file') as File
    const folder = formData.get('folder') as string || 'uploads'
    const isPublic = formData.get('isPublic') === 'true'
    
    console.log("📋 [API-ADMIN-UPLOAD] Upload params:", {
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type,
      folder,
      isPublic
    })

    // Validate file
    if (!file) {
      console.error("❌ [API-ADMIN-UPLOAD] No file provided")
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    // Check file size (max 5MB)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      console.error("❌ [API-ADMIN-UPLOAD] File too large:", file.size)
      return NextResponse.json(
        { error: `File too large. Maximum size is ${maxSize / 1024 / 1024}MB` },
        { status: 400 }
      )
    }

    // Validate file type (images only)
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      console.error("❌ [API-ADMIN-UPLOAD] Invalid file type:", file.type)
      return NextResponse.json(
        { error: "Only image files are allowed (JPEG, PNG, GIF, WEBP)" },
        { status: 400 }
      )
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    console.log("🚀 [API-ADMIN-UPLOAD] Uploading to S3...")

    // Upload to S3
    const s3Service = getS3Service()
    const result = await s3Service.uploadFile(buffer, {
      folder,
      fileName: `${Date.now()}-${file.name}`,
      contentType: file.type,
      isPublic,
      metadata: {
        uploadedBy: session.user.id!,
        uploadedByEmail: session.user.email || 'unknown',
        originalName: file.name
      }
    })

    if (!result.success) {
      console.error("❌ [API-ADMIN-UPLOAD] S3 upload failed:", result.message)
      return NextResponse.json(
        { error: result.message || "Upload failed" },
        { status: 500 }
      )
    }

    console.log("✅ [API-ADMIN-UPLOAD] Upload successful!")
    console.log("🔗 [API-ADMIN-UPLOAD] URL:", result.url)

    return NextResponse.json({
      success: true,
      url: result.url,
      key: result.key,
      bucket: result.bucket,
      message: "File uploaded successfully"
    }, { status: 200 })

  } catch (error: any) {
    console.error("❌ [API-ADMIN-UPLOAD] Error:", error)
    console.error("🔍 [API-ADMIN-UPLOAD] Error details:", {
      message: error.message,
      stack: error.stack
    })
    
    return NextResponse.json(
      { error: error.message || "Upload failed" },
      { status: 500 }
    )
  }
}