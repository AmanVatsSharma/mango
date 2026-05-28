/**
 * @file order-charges-compute.test.ts
 * @module tests/order
 * @description Unit tests for `computeNonBrokerageCharges` (platform defaults and GST base).
 * @author StockTrade
 * @created 2026-03-27
 * @updated 2026-03-30 — NRML / MIS_OPT product normalization for charge filters
 */

import { computeNonBrokerageCharges } from "@/lib/order-charges/compute"
import { DEFAULT_ORDER_CHARGES_CONFIG_V1 } from "@/lib/order-charges/defaults"
import type { OrderChargesConfigV1 } from "@/lib/order-charges/types"

describe("computeNonBrokerageCharges", () => {
  it("matches legacy totals for NSE CNC with default config", () => {
    const turnover = 100_000
    const brokerage = 20
    const r = computeNonBrokerageCharges(
      {
        segment: "NSE",
        productType: "CNC",
        orderSide: "BUY",
        turnover,
        brokerage,
      },
      DEFAULT_ORDER_CHARGES_CONFIG_V1,
    )
    expect(r.stt).toBeCloseTo(100, 5)
    expect(r.exchangeTransaction).toBeCloseTo(3.25, 5)
    expect(r.stampDuty).toBeCloseTo(3, 5)
    expect(r.gst).toBeCloseTo((brokerage + 3.25) * 0.18, 5)
    expect(r.total).toBeCloseTo(100 + 3.25 + 3 + r.gst, 5)
    expect(Math.floor(brokerage + r.total)).toBe(130)
  })

  it("applies NSE equity STT for NRML product when line filters CNC,NRML (normalized to CNC)", () => {
    const cfg: OrderChargesConfigV1 = {
      ...DEFAULT_ORDER_CHARGES_CONFIG_V1,
      lines: [
        {
          id: "stt-cnc-only",
          code: "stt",
          source: "builtin",
          label: "STT CNC/NRML",
          enabled: true,
          mode: "turnover_rate",
          value: 0.001,
          segment: "NSE",
          product: "CNC,NRML",
          side: null,
        },
        ...DEFAULT_ORDER_CHARGES_CONFIG_V1.lines.filter((l) => l.code !== "stt"),
      ],
    }
    const turnover = 80_000
    const r = computeNonBrokerageCharges(
      {
        segment: "NSE",
        productType: "NRML",
        orderSide: "BUY",
        turnover,
        brokerage: 10,
      },
      cfg,
    )
    expect(r.stt).toBeCloseTo(turnover * 0.001, 5)
  })

  it("applies MIS-only intraday STT for MIS_OPT (normalized to MIS)", () => {
    const cfg: OrderChargesConfigV1 = {
      ...DEFAULT_ORDER_CHARGES_CONFIG_V1,
      lines: [
        {
          id: "stt-mis-only",
          code: "stt",
          source: "builtin",
          label: "STT intraday only",
          enabled: true,
          mode: "turnover_rate",
          value: 0.00025,
          segment: "NFO",
          product: "MIS,INTRADAY",
          side: null,
        },
        ...DEFAULT_ORDER_CHARGES_CONFIG_V1.lines.filter((l) => l.code !== "stt"),
      ],
    }
    const turnover = 200_000
    const r = computeNonBrokerageCharges(
      {
        segment: "NFO",
        productType: "MIS_OPT",
        orderSide: "BUY",
        turnover,
        brokerage: 20,
      },
      cfg,
    )
    expect(r.stt).toBeCloseTo(turnover * 0.00025, 5)
  })

  it("applies F&O STT for NFO segment", () => {
    const turnover = 50_000
    const brokerage = 20
    const r = computeNonBrokerageCharges(
      {
        segment: "NFO",
        productType: "NRML",
        orderSide: "BUY",
        turnover,
        brokerage,
      },
      DEFAULT_ORDER_CHARGES_CONFIG_V1,
    )
    expect(r.stt).toBeCloseTo(turnover * 0.0001, 5)
  })

  it("respects gstBaseCodes when excluding brokerage", () => {
    const cfg: OrderChargesConfigV1 = {
      ...DEFAULT_ORDER_CHARGES_CONFIG_V1,
      gstBaseCodes: ["exchange_transaction"],
    }
    const turnover = 100_000
    const brokerage = 20
    const r = computeNonBrokerageCharges(
      {
        segment: "NSE",
        productType: "CNC",
        orderSide: "BUY",
        turnover,
        brokerage,
      },
      cfg,
    )
    expect(r.gst).toBeCloseTo(3.25 * 0.18, 5)
  })

  it("sums a custom flat charge", () => {
    const cfg: OrderChargesConfigV1 = {
      ...DEFAULT_ORDER_CHARGES_CONFIG_V1,
      lines: [
        ...DEFAULT_ORDER_CHARGES_CONFIG_V1.lines,
        {
          id: "x-1",
          code: "platform_fee",
          source: "custom",
          label: "Platform fee",
          enabled: true,
          mode: "flat_per_order",
          value: 15,
          segment: null,
          product: null,
          side: null,
        },
      ],
    }
    const r = computeNonBrokerageCharges(
      {
        segment: "NSE",
        productType: "CNC",
        orderSide: "BUY",
        turnover: 100_000,
        brokerage: 0,
      },
      cfg,
    )
    expect(r.byCode.platform_fee).toBeCloseTo(15, 5)
    expect(r.total).toBeGreaterThan(100 + 3.25 + 3)
  })
})
