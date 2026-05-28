/**
 * @file kyc-gating.test.ts
 * @module lib/auth
 * @description Unit tests for shared KYC redirect state derivation and messaging
 * @author StockTrade
 * @created 2026-02-16
 */

import { deriveKycState, getKycRedirectMessage, requiresKycRedirect } from "@/lib/auth/kyc-gating"

describe("kyc-gating helpers", () => {
  it("marks missing KYC as NOT_SUBMITTED and requires redirect", () => {
    expect(deriveKycState(undefined)).toBe("NOT_SUBMITTED")
    expect(requiresKycRedirect("NOT_SUBMITTED")).toBe(true)
    expect(getKycRedirectMessage("NOT_SUBMITTED")).toContain("complete your KYC")
  })

  it("marks blank default KYC rows as INCOMPLETE", () => {
    const state = deriveKycState({
      status: "PENDING",
      aadhaarNumber: "",
      panNumber: "",
      bankProofUrl: "",
      bankProofKey: null,
    })
    expect(state).toBe("INCOMPLETE")
  })

  it("marks completed pending KYC as PENDING", () => {
    const state = deriveKycState({
      status: "PENDING",
      aadhaarNumber: "123456789012",
      panNumber: "ABCDE1234F",
      bankProofKey: "kyc/bank-proof/user-1/file.png",
    })
    expect(state).toBe("PENDING")
    expect(getKycRedirectMessage(state)).toContain("pending approval")
  })

  it("marks completed rejected KYC as REJECTED", () => {
    const state = deriveKycState({
      status: "REJECTED",
      aadhaarNumber: "123456789012",
      panNumber: "ABCDE1234F",
      bankProofUrl: "https://example.com/file.png",
    })
    expect(state).toBe("REJECTED")
    expect(getKycRedirectMessage(state)).toContain("rejected")
  })

  it("marks approved KYC as APPROVED and does not require redirect", () => {
    const state = deriveKycState({
      status: "APPROVED",
      aadhaarNumber: "123456789012",
      panNumber: "ABCDE1234F",
      bankProofUrl: "https://example.com/file.png",
    })
    expect(state).toBe("APPROVED")
    expect(requiresKycRedirect(state)).toBe(false)
  })
})

