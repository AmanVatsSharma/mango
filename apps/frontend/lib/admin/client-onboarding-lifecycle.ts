/**
 * @file client-onboarding-lifecycle.ts
 * @module admin
 * @description Derives broker client onboarding stage labels from verification + KYC snapshot (admin CRM pipeline).
 * @author StockTrade
 * @created 2026-04-06
 */

export type ClientOnboardingStage = {
  /** Short label for tables and badges */
  label: string
  /** Hint for filter/export semantics */
  key:
    | "kyc_approved"
    | "kyc_rejected"
    | "kyc_pending_review"
    | "kyc_draft"
    | "contacts_pending"
    | "pre_kyc"
}

export type ClientOnboardingInput = {
  kycStatus: string
  /** True when PAN, Aadhaar, and bank proof are all non-empty on the KYC row */
  kycDocumentsSubmitted: boolean
  emailVerified: string | Date | null | undefined
  phoneVerified: string | Date | null | undefined
}

function isVerified(value: string | Date | null | undefined): boolean {
  if (value == null) return false
  if (value instanceof Date) return !Number.isNaN(value.getTime())
  if (typeof value === "string") return value.trim().length > 0
  return false
}

/**
 * Derives a single pipeline stage for admin CRM views.
 */
export function deriveClientOnboardingStage(input: ClientOnboardingInput): ClientOnboardingStage {
  const { kycStatus, kycDocumentsSubmitted } = input
  const emailOk = isVerified(input.emailVerified)
  const phoneOk = isVerified(input.phoneVerified)
  const contactsOk = emailOk && phoneOk

  if (kycStatus === "APPROVED") {
    return { label: "KYC approved", key: "kyc_approved" }
  }
  if (kycStatus === "REJECTED") {
    return { label: "KYC rejected", key: "kyc_rejected" }
  }
  if (kycStatus === "PENDING") {
    if (kycDocumentsSubmitted) {
      return { label: "Pending review", key: "kyc_pending_review" }
    }
    return { label: "KYC draft", key: "kyc_draft" }
  }
  if (kycStatus === "NOT_SUBMITTED" || !kycStatus) {
    if (!contactsOk) {
      return { label: "Contact pending", key: "contacts_pending" }
    }
    return { label: "Pre-KYC", key: "pre_kyc" }
  }
  return { label: "Pre-KYC", key: "pre_kyc" }
}
