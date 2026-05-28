/**
 * @file kyc-document.test.ts
 * @module lib
 * @description Unit tests for KYC document key and upload validations
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  MAX_KYC_IMAGE_SIZE_BYTES,
  buildKycBankProofPrefix,
  isKycBankProofKeyForUser,
  isKycDocumentMimeTypeAllowed,
  isKycDocumentSizeAllowed,
  sanitizeKycFileName,
} from "@/lib/kyc-document"

describe("kyc-document utilities", () => {
  it("builds user-scoped KYC bank proof prefix", () => {
    expect(buildKycBankProofPrefix("user-123")).toBe("kyc/bank-proof/user-123")
  })

  it("validates key ownership by prefix", () => {
    const validKey = "kyc/bank-proof/user-123/1739793490_file.png"
    const invalidKey = "kyc/bank-proof/user-999/1739793490_file.png"

    expect(isKycBankProofKeyForUser(validKey, "user-123")).toBe(true)
    expect(isKycBankProofKeyForUser(invalidKey, "user-123")).toBe(false)
  })

  it("sanitizes unsafe file names", () => {
    const sanitized = sanitizeKycFileName("my bank-proof (final).png")
    expect(sanitized).toBe("my_bank-proof__final_.png")
  })

  it("allows only KYC-safe image mime types", () => {
    expect(isKycDocumentMimeTypeAllowed("image/jpeg")).toBe(true)
    expect(isKycDocumentMimeTypeAllowed("image/png")).toBe(true)
    expect(isKycDocumentMimeTypeAllowed("application/pdf")).toBe(false)
  })

  it("enforces KYC document max size", () => {
    expect(isKycDocumentSizeAllowed(MAX_KYC_IMAGE_SIZE_BYTES)).toBe(true)
    expect(isKycDocumentSizeAllowed(MAX_KYC_IMAGE_SIZE_BYTES + 1)).toBe(false)
  })
})

