/**
 * File: app/api/kyc/upload/route.ts
 * Module: app/api
 * Purpose: Upload KYC bank proof image to private S3 storage.
 * Author: StockTrade
 * Last-updated: 2026-02-16
 * Notes:
 * - Uploads only image files for KYC bank proof.
 * - Uses user-scoped private S3 keys under kyc/bank-proof/<userId>/.
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getS3Service } from "@/lib/aws-s3"
import {
  MAX_KYC_IMAGE_SIZE_BYTES,
  buildKycBankProofPrefix,
  isKycDocumentMimeTypeAllowed,
  isKycDocumentSizeAllowed,
  sanitizeKycFileName,
} from "@/lib/kyc-document"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    const userId = session?.user?.id

    if (!userId) {
      console.warn("[API-KYC-UPLOAD] Unauthorized upload attempt")
      return NextResponse.json(
        { success: false, error: "Unauthorized - Please login again." },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const fileValue = formData.get("file")

    if (!(fileValue instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No file uploaded." },
        { status: 400 }
      )
    }

    if (!isKycDocumentMimeTypeAllowed(fileValue.type)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid file type. Only JPEG, JPG, PNG, and WEBP images are allowed for KYC.",
        },
        { status: 400 }
      )
    }

    if (!isKycDocumentSizeAllowed(fileValue.size)) {
      return NextResponse.json(
        {
          success: false,
          error: `File size too large. Maximum allowed size is ${Math.round(MAX_KYC_IMAGE_SIZE_BYTES / (1024 * 1024))}MB.`,
        },
        { status: 400 }
      )
    }

    const s3Folder = buildKycBankProofPrefix(userId)
    const sanitizedFileName = sanitizeKycFileName(fileValue.name)
    const generatedFileName = `${Date.now()}_${sanitizedFileName}`

    const bytes = await fileValue.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const s3Service = getS3Service()
    const uploadResult = await s3Service.uploadFile(buffer, {
      folder: s3Folder,
      fileName: generatedFileName,
      contentType: fileValue.type,
      isPublic: false,
      metadata: {
        uploadedBy: userId,
        module: "kyc-bank-proof",
      },
    })

    if (!uploadResult.success || !uploadResult.key) {
      console.error("[API-KYC-UPLOAD] S3 upload failed:", uploadResult.message)
      return NextResponse.json(
        { success: false, error: uploadResult.message || "Failed to upload KYC document." },
        { status: 500 }
      )
    }

    console.log("[API-KYC-UPLOAD] KYC bank proof uploaded successfully:", {
      userId,
      key: uploadResult.key,
      fileName: generatedFileName,
      mimeType: fileValue.type,
      fileSize: fileValue.size,
    })

    return NextResponse.json({
      success: true,
      key: uploadResult.key,
      url: uploadResult.url,
      contentType: fileValue.type,
      size: fileValue.size,
    })
  } catch (error) {
    console.error("[API-KYC-UPLOAD] Unexpected upload error:", error)
    const errorMessage = error instanceof Error ? error.message : "Failed to upload KYC document. Please try again."
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    )
  }
}

