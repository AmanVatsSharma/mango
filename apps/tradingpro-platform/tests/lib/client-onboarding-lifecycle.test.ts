/**
 * @file client-onboarding-lifecycle.test.ts
 * @module tests
 * @description Unit tests for deriveClientOnboardingStage (admin CRM pipeline).
 * @author StockTrade
 * @created 2026-04-06
 */

import { deriveClientOnboardingStage } from "@/lib/admin/client-onboarding-lifecycle"

describe("deriveClientOnboardingStage", () => {
  it("returns approved for APPROVED KYC", () => {
    const s = deriveClientOnboardingStage({
      kycStatus: "APPROVED",
      kycDocumentsSubmitted: true,
      emailVerified: new Date().toISOString(),
      phoneVerified: new Date().toISOString(),
    })
    expect(s.key).toBe("kyc_approved")
  })

  it("returns draft for PENDING with empty documents", () => {
    const s = deriveClientOnboardingStage({
      kycStatus: "PENDING",
      kycDocumentsSubmitted: false,
      emailVerified: new Date().toISOString(),
      phoneVerified: new Date().toISOString(),
    })
    expect(s.key).toBe("kyc_draft")
  })

  it("returns pending review for PENDING with documents", () => {
    const s = deriveClientOnboardingStage({
      kycStatus: "PENDING",
      kycDocumentsSubmitted: true,
      emailVerified: new Date().toISOString(),
      phoneVerified: new Date().toISOString(),
    })
    expect(s.key).toBe("kyc_pending_review")
  })

  it("returns contact pending when NOT_SUBMITTED and unverified", () => {
    const s = deriveClientOnboardingStage({
      kycStatus: "NOT_SUBMITTED",
      kycDocumentsSubmitted: false,
      emailVerified: null,
      phoneVerified: null,
    })
    expect(s.key).toBe("contacts_pending")
  })
})
