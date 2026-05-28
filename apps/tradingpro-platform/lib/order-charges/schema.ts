/**
 * @file schema.ts
 * @module order-charges
 * @description Zod schema for `order_charges_config_v1` SystemSettings JSON.
 * @author StockTrade
 * @created 2026-03-27
 */

import { z } from "zod"
import { ORDER_CHARGES_CONFIG_VERSION } from "@/lib/order-charges/types"

const orderSideFilterSchema = z.enum(["BUY", "SELL"])

const orderChargeLineV1Schema = z
  .object({
    id: z.string().min(1).max(128),
    code: z.string().min(1).max(64),
    source: z.enum(["builtin", "custom"]),
    label: z.string().min(1).max(200).optional(),
    enabled: z.boolean(),
    mode: z.enum(["turnover_rate", "flat_per_order"]),
    value: z.number().finite(),
    segment: z.string().max(200).nullable(),
    product: z.string().max(200).nullable(),
    side: orderSideFilterSchema.nullable(),
  })
  .strict()

export const orderChargesConfigV1Schema = z
  .object({
    version: z.literal(ORDER_CHARGES_CONFIG_VERSION),
    gstRate: z.number().min(0).max(1),
    gstBaseCodes: z.array(z.string().min(1).max(64)).max(64),
    lines: z.array(orderChargeLineV1Schema).min(1).max(200),
  })
  .strict()

export type OrderChargesConfigV1Parsed = z.infer<typeof orderChargesConfigV1Schema>
