/**
 * @file defaults.ts
 * @module order-charges
 * @description Default `OrderChargesConfigV1` matching legacy MarginCalculator hardcoded rates.
 * @author StockTrade
 * @created 2026-03-27
 */

import type { OrderChargesConfigV1 } from "@/lib/order-charges/types"
import { ORDER_CHARGES_CONFIG_VERSION } from "@/lib/order-charges/types"

/** Platform-default order charges document (non-brokerage). */
export const DEFAULT_ORDER_CHARGES_CONFIG_V1: OrderChargesConfigV1 = {
  version: ORDER_CHARGES_CONFIG_VERSION,
  gstRate: 0.18,
  gstBaseCodes: ["brokerage", "exchange_transaction"],
  lines: [
    {
      id: "builtin-stt-nse-delivery",
      code: "stt",
      source: "builtin",
      label: "STT (equity delivery)",
      enabled: true,
      mode: "turnover_rate",
      value: 0.001,
      segment: "NSE,NSE_EQ",
      product: "CNC,DELIVERY",
      side: null,
    },
    {
      id: "builtin-stt-nse-intraday",
      code: "stt",
      source: "builtin",
      label: "STT (equity intraday)",
      enabled: true,
      mode: "turnover_rate",
      value: 0.00025,
      segment: "NSE,NSE_EQ",
      product: "MIS,INTRADAY",
      side: null,
    },
    {
      id: "builtin-stt-fo",
      code: "stt",
      source: "builtin",
      label: "STT (F&O)",
      enabled: true,
      mode: "turnover_rate",
      value: 0.0001,
      segment: "NFO,NSE_FO,FNO",
      product: null,
      side: null,
    },
    {
      id: "builtin-exchange-txn",
      code: "exchange_transaction",
      source: "builtin",
      label: "Exchange transaction charges",
      enabled: true,
      mode: "turnover_rate",
      value: 0.0000325,
      segment: null,
      product: null,
      side: null,
    },
    {
      id: "builtin-stamp",
      code: "stamp_duty",
      source: "builtin",
      label: "Stamp duty",
      enabled: true,
      mode: "turnover_rate",
      value: 0.00003,
      segment: null,
      product: null,
      side: null,
    },
  ],
}
