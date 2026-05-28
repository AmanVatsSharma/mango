/**
 * File: app/api/kyc/route.ts
 * Module: app/api
 * Purpose: Handle authenticated user KYC read/submit operations.
 * Author: StockTrade
 * Last-updated: 2026-02-16
 * Notes:
 * - Persists both bank proof URL and private S3 key for robust document access.
 * - Blocks direct user overwrite when KYC is already approved.
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { getS3Service } from "@/lib/aws-s3"
import {
  getKycObjectStorageUrl,
  isKycBankProofKeyForUser,
  resolveKycDocumentUrl,
} from "@/lib/kyc-document"

// Force this route to be dynamic; it uses auth() which depends on cookies/headers
export const dynamic = "force-dynamic"

async function cleanupKycDocumentKey(bankProofKey: string | null | undefined) {
  if (!bankProofKey) {
    return
  }

  try {
    const s3 = getS3Service()
    const deleted = await s3.deleteFile(bankProofKey)
    console.log(deleted ? "[API-KYC] Old bank proof deleted from S3" : "[API-KYC] Old bank proof delete returned false", {
      bankProofKey,
    })
  } catch (error) {
    console.warn("[API-KYC] Failed to cleanup old bank proof key:", {
      bankProofKey,
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    const userId = session?.user?.id

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized - Your session has expired. Please login again." },
        { status: 401 }
      )
    }

    const body = await request.json()
    const aadhaarNumber = typeof body?.aadhaarNumber === "string" ? body.aadhaarNumber.trim() : ""
    const panNumberRaw = typeof body?.panNumber === "string" ? body.panNumber.trim() : ""
    const panNumber = panNumberRaw.toUpperCase()
    const bankProofUrlInput = typeof body?.bankProofUrl === "string" ? body.bankProofUrl.trim() : ""
    const bankProofKeyInput = typeof body?.bankProofKey === "string" ? body.bankProofKey.trim() : ""

    if (!aadhaarNumber || !panNumber) {
      return NextResponse.json(
        { error: "All fields (Aadhaar and PAN) are required." },
        { status: 400 }
      )
    }

    if (!/^\d{12}$/.test(aadhaarNumber)) {
      return NextResponse.json(
        { error: "Invalid Aadhaar number format. Must be 12 digits." },
        { status: 400 }
      )
    }

    if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber)) {
      return NextResponse.json(
        { error: "Invalid PAN format. Must be in format: ABCDE1234F." },
        { status: 400 }
      )
    }

    if (bankProofKeyInput && !isKycBankProofKeyForUser(bankProofKeyInput, userId)) {
      return NextResponse.json(
        { error: "Invalid bank proof key provided for this user." },
        { status: 400 }
      )
    }

    const existingKYC = await prisma.kYC.findUnique({
      where: { userId },
    })

    if (existingKYC?.status === "APPROVED") {
      return NextResponse.json(
        { error: "Your KYC is already approved. Please contact support for document changes." },
        { status: 409 }
      )
    }

    const finalBankProofKey = bankProofKeyInput || existingKYC?.bankProofKey || null
    const finalBankProofUrl =
      bankProofUrlInput ||
      getKycObjectStorageUrl(finalBankProofKey || "") ||
      existingKYC?.bankProofUrl ||
      ""

    if (!finalBankProofKey && !finalBankProofUrl) {
      return NextResponse.json(
        { error: "Bank proof image is required." },
        { status: 400 }
      )
    }

    const submittedAt = new Date()
    const kycPayload = {
      aadhaarNumber,
      panNumber,
      bankProofKey: finalBankProofKey,
      bankProofUrl: finalBankProofUrl,
      status: "PENDING" as const,
      submittedAt,
      approvedAt: null as Date | null,
    }

    let savedKyc
    if (existingKYC) {
      savedKyc = await prisma.kYC.update({
        where: { userId },
        data: kycPayload,
      })
    } else {
      savedKyc = await prisma.kYC.create({
        data: {
          userId,
          ...kycPayload,
        },
      })
    }

    // If this is a replacement, cleanup older document key after successful DB write.
    if (existingKYC?.bankProofKey && bankProofKeyInput && existingKYC.bankProofKey !== bankProofKeyInput) {
      await cleanupKycDocumentKey(existingKYC.bankProofKey)
    }

    // Create notification for KYC submission (non-blocking)
    try {
      const { NotificationService } = await import("@/lib/services/notifications/NotificationService")
      await NotificationService.notifyKYC(userId, "SUBMITTED")
    } catch (notifError) {
      console.warn("⚠️ [API-KYC] Failed to create notification:", notifError)
    }

    const resolvedBankProofUrl = await resolveKycDocumentUrl({
      bankProofKey: savedKyc.bankProofKey,
      bankProofUrl: savedKyc.bankProofUrl,
    })

    return NextResponse.json({
      success: existingKYC
        ? "KYC updated successfully. Your documents are being reviewed."
        : "KYC submitted successfully. Your documents are being reviewed.",
      kyc: {
        ...savedKyc,
        bankProofUrl: resolvedBankProofUrl || savedKyc.bankProofUrl,
      },
    })
  } catch (error) {
    console.error("[API-KYC] KYC submission error:", error)
    if (error instanceof Error) {
      return NextResponse.json(
        { error: `Failed to process KYC: ${error.message}` },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { error: "Failed to process KYC submission. Please try again later." },
      { status: 500 }
    )
  }
}

export async function GET(_request: NextRequest) {
  try {
    console.log("[API-KYC] GET request received")
    const session = await auth()
    const userId = session?.user?.id
    console.log("[API-KYC] Session check:", { hasSession: !!session, userId })

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const kyc = await prisma.kYC.findUnique({
      where: { userId },
    })

    if (!kyc) {
      return NextResponse.json({ kyc: null })
    }

    const resolvedBankProofUrl = await resolveKycDocumentUrl({
      bankProofKey: kyc.bankProofKey,
      bankProofUrl: kyc.bankProofUrl,
    })

    return NextResponse.json({
      kyc: {
        ...kyc,
        bankProofUrl: resolvedBankProofUrl || kyc.bankProofUrl,
      },
    })
  } catch (error) {
    console.error("[API-KYC] KYC fetch error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}