/**
 * @file seed-super-admin.test.ts
 * @module scripts
 * @description Unit tests for super-admin seed helper decision branches
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-03-28
 */

import { KycStatus } from "@prisma/client"
import {
  buildSuperAdminKycCreateData,
  buildSuperAdminKycUpdateData,
  resolveKycFieldOrPlaceholder,
  resolveTargetUserId,
} from "@/scripts/seed-super-admin"

function buildUser(id: string, email?: string, clientId?: string) {
  return {
    id,
    email: email ?? null,
    clientId: clientId ?? null,
  } as any
}

describe("seed-super-admin helpers", () => {
  it("resolves target user id from available identities", () => {
    expect(resolveTargetUserId(null, null)).toBeNull()
    expect(resolveTargetUserId(null, null, null)).toBeNull()
    expect(resolveTargetUserId(buildUser("u1"), null)).toBe("u1")
    expect(resolveTargetUserId(null, buildUser("u2"))).toBe("u2")
    expect(resolveTargetUserId(null, null, buildUser("u4"))).toBe("u4")
    expect(resolveTargetUserId(buildUser("u3"), buildUser("u3"))).toBe("u3")
    expect(resolveTargetUserId(buildUser("u3"), buildUser("u3"), buildUser("u3"))).toBe("u3")
    expect(
      resolveTargetUserId(
        buildUser("u5", "e@example.com", null),
        null,
        buildUser("u5", null, "Tradebazar"),
      ),
    ).toBe("u5")
  })

  it("throws when any two identity lookups map to different users", () => {
    expect(() => resolveTargetUserId(buildUser("u1"), buildUser("u2"))).toThrow(
      "Conflicting records found for super-admin identifiers.",
    )
    expect(() => resolveTargetUserId(buildUser("u1"), null, buildUser("u2"))).toThrow(
      "Conflicting records found for super-admin identifiers.",
    )
  })

  it("normalizes KYC fields with placeholders for empty values", () => {
    expect(resolveKycFieldOrPlaceholder(undefined, "fallback")).toBe("fallback")
    expect(resolveKycFieldOrPlaceholder("   ", "fallback")).toBe("fallback")
    expect(resolveKycFieldOrPlaceholder(" value ", "fallback")).toBe("value")
  })

  it("builds approved KYC payload for create branch", () => {
    const approvedAt = new Date("2026-02-16T00:00:00.000Z")
    const payload = buildSuperAdminKycCreateData("seed-user", approvedAt)

    expect(payload.userId).toBe("seed-user")
    expect(payload.status).toBe(KycStatus.APPROVED)
    expect(payload.approvedAt).toBe(approvedAt)
    expect(payload.bankProofKey).toBeNull()
    expect(payload.aadhaarNumber).toBeTruthy()
    expect(payload.panNumber).toBeTruthy()
    expect(payload.bankProofUrl).toBeTruthy()
  })

  it("builds approved KYC payload for update branch with placeholder fallback", () => {
    const approvedAt = new Date("2026-02-16T10:30:00.000Z")

    const payload = buildSuperAdminKycUpdateData(
      {
        aadhaarNumber: "  ",
        panNumber: "",
        bankProofUrl: "  ",
        bankProofKey: null,
      },
      approvedAt,
    )

    expect(payload.status).toBe(KycStatus.APPROVED)
    expect(payload.approvedAt).toBe(approvedAt)
    expect(payload.bankProofKey).toBeNull()
    expect(payload.aadhaarNumber).toBeTruthy()
    expect(payload.panNumber).toBeTruthy()
    expect(payload.bankProofUrl).toBeTruthy()
  })
})
