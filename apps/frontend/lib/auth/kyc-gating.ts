/**
 * File: lib/auth/kyc-gating.ts
 * Module: lib/auth
 * Purpose: Shared KYC gating helpers for auth and route guards.
 * Author: StockTrade
 * Last-updated: 2026-02-16
 * Notes:
 * - Treats blank default KYC records as incomplete submissions.
 * - Keeps KYC redirect messaging deterministic across desktop/mobile auth flows.
 */

type KycLikeRecord = {
  status?: string | null
  aadhaarNumber?: string | null
  panNumber?: string | null
  bankProofUrl?: string | null
  bankProofKey?: string | null
} | null | undefined

export type DerivedKycState = "NOT_SUBMITTED" | "INCOMPLETE" | "PENDING" | "REJECTED" | "APPROVED"

function hasNonEmptyValue(value: string | null | undefined): boolean {
  return Boolean(value && value.trim())
}

export function hasCompletedKycSubmission(kyc: KycLikeRecord): boolean {
  if (!kyc) {
    return false
  }

  return (
    hasNonEmptyValue(kyc.aadhaarNumber) &&
    hasNonEmptyValue(kyc.panNumber) &&
    (hasNonEmptyValue(kyc.bankProofKey) || hasNonEmptyValue(kyc.bankProofUrl))
  )
}

export function deriveKycState(kyc: KycLikeRecord): DerivedKycState {
  if (!kyc) {
    return "NOT_SUBMITTED"
  }

  if (kyc.status === "APPROVED") {
    return "APPROVED"
  }

  if (!hasCompletedKycSubmission(kyc)) {
    return "INCOMPLETE"
  }

  if (kyc.status === "REJECTED") {
    return "REJECTED"
  }

  if (kyc.status === "PENDING") {
    return "PENDING"
  }

  return "INCOMPLETE"
}

export function requiresKycRedirect(kycState: DerivedKycState): boolean {
  return kycState !== "APPROVED"
}

export function getKycRedirectMessage(kycState: DerivedKycState): string {
  if (kycState === "PENDING") {
    return "Your KYC verification is pending approval."
  }

  if (kycState === "REJECTED") {
    return "Your KYC was rejected. Please resubmit with correct information."
  }

  return "Please complete your KYC verification to start trading."
}

