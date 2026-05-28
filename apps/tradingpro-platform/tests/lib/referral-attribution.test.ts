/**
 * @file referral-attribution.test.ts
 * @module tests/lib
 * @description Unit tests for signup referral resolution (no DB — mocked tx).
 * @author StockTrade
 * @created 2026-04-01
 */

import { applyReferralAttributionOnSignup } from "@/lib/services/referral/referral-attribution"

function createMockTx(overrides: Record<string, unknown> = {}) {
  const state = {
    attribution: null as unknown,
    userUpdate: null as unknown,
    linkIncrement: null as string | null,
  }
  const referralAttribution = {
    findUnique: jest.fn(async () => state.attribution),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      state.attribution = data
      return data
    }),
  }
  const referralLink = {
    findFirst: jest.fn(async () => overrides.link ?? null),
    update: jest.fn(async ({ where }: { where: { id: string } }) => {
      state.linkIncrement = where.id
      return {}
    }),
  }
  const user = {
    findFirst: jest.fn(async () => overrides.referrerUser ?? null),
    update: jest.fn(async ({ data }: { data: unknown }) => {
      state.userUpdate = data
      return {}
    }),
  }
  return {
    referralAttribution,
    referralLink,
    user,
    state,
    tx: { referralAttribution, referralLink, user } as any,
  }
}

describe("applyReferralAttributionOnSignup", () => {
  it("no-ops when ref empty", async () => {
    const { tx, referralAttribution } = createMockTx()
    await applyReferralAttributionOnSignup(tx, "referee-1", "", "URL_SIGNUP")
    expect(referralAttribution.findUnique).not.toHaveBeenCalled()
  })

  it("creates attribution for ReferralLink", async () => {
    const link = {
      id: "link-1",
      createdById: "referrer-1",
      maxUses: null as number | null,
      usedCount: 0,
      isActive: true,
      expiresAt: null as Date | null,
    }
    const { tx, referralAttribution, state } = createMockTx({ link })
    await applyReferralAttributionOnSignup(tx, "referee-1", "CODE99", "URL_SIGNUP")
    expect(referralAttribution.create).toHaveBeenCalled()
    expect((state.userUpdate as any)?.referredByUserId).toBe("referrer-1")
  })

  it("rejects self-referral", async () => {
    const link = { id: "l", createdById: "same", maxUses: null, usedCount: 0, isActive: true, expiresAt: null }
    const { tx, referralAttribution } = createMockTx({ link })
    await applyReferralAttributionOnSignup(tx, "same", "CODE99", "URL_SIGNUP")
    expect(referralAttribution.create).not.toHaveBeenCalled()
  })
})
