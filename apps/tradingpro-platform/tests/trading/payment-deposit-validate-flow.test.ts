/**
 * @file payment-deposit-validate-flow.test.ts
 * @module tests-trading
 * @description Unit tests for deposit amount validation and contact_support method mapping (payment_deposit_config).
 * @author StockTrade
 * @created 2026-04-01
 * @updated 2026-04-01 — require() for imports after jest-safe hoisting.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const { validateDepositAmountAgainstConfig } = require("@/lib/server/payment-deposit-config")
const {
  getDefaultPaymentDepositConfigV1,
} = require("@/lib/payment-deposit-config.shared")
/* eslint-enable @typescript-eslint/no-require-imports */

import type { PaymentDepositConfigV1 } from "@/lib/payment-deposit-config.shared"

describe("payment-deposit validateDepositAmountAgainstConfig", () => {
  const baseConfig: PaymentDepositConfigV1 = getDefaultPaymentDepositConfigV1()

  it("returns error for non-positive amount before method mapping", () => {
    expect(validateDepositAmountAgainstConfig(baseConfig, 0, "upi")).toBe("Invalid deposit amount")
    expect(validateDepositAmountAgainstConfig(baseConfig, -100, "upi")).toBe("Invalid deposit amount")
  })

  it("allows contact_support without per-method min/max enforcement", () => {
    const highMin: PaymentDepositConfigV1 = {
      ...baseConfig,
      global: { minAmount: 50_000, maxAmount: 200_000 },
    }
    expect(validateDepositAmountAgainstConfig(highMin, 100, "contact_support")).toBeNull()
  })

  it("maps contact_support string via method alias", () => {
    expect(validateDepositAmountAgainstConfig(baseConfig, 5000, "CONTACT_SUPPORT")).toBeNull()
  })

  it("enforces method bounds for upi when config sets minAmount", () => {
    const cfg: PaymentDepositConfigV1 = {
      ...baseConfig,
      methods: {
        ...baseConfig.methods,
        upi: {
          ...baseConfig.methods.upi,
          enabled: true,
          minAmount: 2000,
          items: baseConfig.methods.upi.items,
        },
      },
    }
    const low = validateDepositAmountAgainstConfig(cfg, 1000, "upi")
    expect(low).toContain("Minimum")
    expect(validateDepositAmountAgainstConfig(cfg, 5000, "upi")).toBeNull()
  })
})
