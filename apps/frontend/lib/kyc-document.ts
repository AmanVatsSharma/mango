/**
 * File: lib/kyc-document.ts
 * Module: lib
 * Purpose: Utilities for KYC document key validation and URL resolution.
 * Author: StockTrade
 * Last-updated: 2026-02-16
 * Notes:
 * - Keeps KYC document access scoped to user-specific S3 key prefixes.
 * - Resolves private KYC document keys to presigned URLs with graceful fallback.
 */

import { getS3Service } from "@/lib/aws-s3"

export const KYC_BANK_PROOF_ROOT_PREFIX = "kyc/bank-proof"
export const KYC_ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/jpg", "image/webp"] as const
export const MAX_KYC_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
export const DEFAULT_KYC_DOCUMENT_URL_TTL_SECONDS = 60 * 60

const FILE_NAME_SANITIZER_REGEX = /[^a-zA-Z0-9._-]/g

export function buildKycBankProofPrefix(userId: string): string {
  return `${KYC_BANK_PROOF_ROOT_PREFIX}/${userId}`
}

export function isKycDocumentMimeTypeAllowed(mimeType: string): boolean {
  if (!mimeType) {
    return false
  }

  return KYC_ALLOWED_IMAGE_MIME_TYPES.includes(mimeType.toLowerCase() as (typeof KYC_ALLOWED_IMAGE_MIME_TYPES)[number])
}

export function isKycDocumentSizeAllowed(fileSizeBytes: number): boolean {
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
    return false
  }

  return fileSizeBytes <= MAX_KYC_IMAGE_SIZE_BYTES
}

export function sanitizeKycFileName(originalFileName: string): string {
  const safeFileName = (originalFileName || "kyc-document").trim().replace(FILE_NAME_SANITIZER_REGEX, "_")
  const normalizedFileName = safeFileName.length > 0 ? safeFileName : "kyc-document"
  return normalizedFileName.slice(0, 120)
}

export function isKycBankProofKeyForUser(bankProofKey: string, userId: string): boolean {
  if (!bankProofKey || !userId) {
    return false
  }

  const expectedPrefix = `${buildKycBankProofPrefix(userId)}/`
  return bankProofKey.startsWith(expectedPrefix)
}

export function getKycObjectStorageUrl(bankProofKey: string): string | null {
  if (!bankProofKey) {
    return null
  }

  try {
    const s3 = getS3Service()
    return `https://${s3.getBucket()}.s3.${s3.getRegion()}.amazonaws.com/${bankProofKey}`
  } catch (error) {
    console.error("[KYC-DOCUMENT] Failed to build object URL from key:", {
      bankProofKey,
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return null
  }
}

export async function resolveKycDocumentUrl(params: {
  bankProofKey?: string | null
  bankProofUrl?: string | null
  expiresInSeconds?: number
}): Promise<string | null> {
  const { bankProofKey, bankProofUrl, expiresInSeconds = DEFAULT_KYC_DOCUMENT_URL_TTL_SECONDS } = params

  if (bankProofKey) {
    try {
      const s3 = getS3Service()
      return await s3.getPresignedUrl(bankProofKey, expiresInSeconds)
    } catch (error) {
      console.error("[KYC-DOCUMENT] Failed to generate presigned URL for bank proof:", {
        bankProofKey,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }

  const trimmedFallbackUrl = bankProofUrl?.trim()
  return trimmedFallbackUrl ? trimmedFallbackUrl : null
}

