/**
 * @file payment-deposit-config.ts
 * @module lib/server
 * @description Zod validation, migration from legacy UPI settings, and public DTO for payment deposit config.
 * @author StockTrade
 * @created 2026-03-25
 */

import type { PrismaClient } from "@prisma/client"
import { z } from "zod"
import {
  getDefaultPaymentDepositConfigV1,
  mergeLegacyPaymentKeysIntoConfig,
  type PaymentDepositConfigV1,
} from "@/lib/payment-deposit-config.shared"
import {
  DEFAULT_DEPOSIT_MAX_INR,
  DEFAULT_DEPOSIT_MIN_INR,
  DEFAULT_PUBLIC_METHOD_ORDER,
  PAYMENT_DEPOSIT_CONFIG_V1_KEY,
  type PublicPaymentDepositMethodId,
  type PublicPaymentDepositSettingsV1,
} from "@/lib/payment-deposit-public"

export type { PaymentDepositConfigV1 }

const methodMetaSchema = z.object({
  clientTitle: z.string().optional(),
  clientDescription: z.string().optional(),
  minAmount: z.number().nonnegative().optional(),
  maxAmount: z.number().nonnegative().optional(),
  recommended: z.boolean().optional(),
  badgeText: z.string().optional(),
  requireProof: z.boolean().optional(),
})

const upiItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  upiId: z.string().min(1),
  qrCodeUrl: z.string().optional(),
})

const bankDomesticAccountSchema = z.object({
  id: z.string().min(1),
  bankName: z.string().min(1),
  accountHolder: z.string().min(1),
  accountNumber: z.string().min(1),
  ifsc: z.string().min(1),
  branch: z.string().optional(),
  instructions: z.string().optional(),
})

const bankIntlAccountSchema = z.object({
  id: z.string().min(1),
  beneficiary: z.string().min(1),
  bankName: z.string().min(1),
  ibanOrAccount: z.string().min(1),
  swift: z.string().min(1),
  currency: z.string().optional(),
  intermediaryBank: z.string().optional(),
  instructions: z.string().optional(),
})

const cryptoWalletSchema = z.object({
  id: z.string().min(1),
  asset: z.string().min(1),
  network: z.string().min(1),
  address: z.string().min(1),
  memoOrTag: z.string().optional(),
  qrCodeUrl: z.string().optional(),
  instructions: z.string().optional(),
})

const upiMethodSchema = methodMetaSchema.extend({
  enabled: z.boolean(),
  items: z.array(upiItemSchema),
})

const bankDomesticMethodSchema = methodMetaSchema.extend({
  enabled: z.boolean(),
  accounts: z.array(bankDomesticAccountSchema),
})

const bankIntlMethodSchema = methodMetaSchema.extend({
  enabled: z.boolean(),
  accounts: z.array(bankIntlAccountSchema),
})

const cashMethodSchema = methodMetaSchema.extend({
  enabled: z.boolean(),
  instructions: z.string().optional(),
})

const cryptoMethodSchema = methodMetaSchema.extend({
  enabled: z.boolean(),
  wallets: z.array(cryptoWalletSchema),
})

const chequeMethodSchema = methodMetaSchema.extend({
  enabled: z.boolean(),
  instructions: z.string().optional(),
})

const externalGatewayMethodSchema = methodMetaSchema.extend({
  enabled: z.boolean(),
  buttonLabel: z.string().min(1),
  url: z.string().min(1),
  disclaimer: z.string().optional(),
})

const contactSupportMethodSchema = methodMetaSchema.extend({
  enabled: z.boolean(),
  title: z.string().optional(),
  body: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  whatsapp: z.string().optional(),
})

export const paymentDepositConfigV1Schema = z
  .object({
    version: z.literal(1),
    global: z
      .object({
        defaultCurrency: z.literal("INR").optional(),
        minAmount: z.number().nonnegative().optional(),
        maxAmount: z.number().nonnegative().optional(),
      })
      .optional(),
    methods: z.object({
      upi: upiMethodSchema,
      bankDomestic: bankDomesticMethodSchema,
      bankIntlWire: bankIntlMethodSchema,
      cash: cashMethodSchema,
      crypto: cryptoMethodSchema,
      cheque: chequeMethodSchema,
      externalGateway: externalGatewayMethodSchema,
      contactSupport: contactSupportMethodSchema,
    }),
    order: z.array(z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    const { methods } = data
    if (methods.upi.enabled && methods.upi.items.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "UPI enabled requires at least one UPI entry",
        path: ["methods", "upi", "items"],
      })
    }
    if (methods.bankDomestic.enabled && methods.bankDomestic.accounts.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Domestic bank enabled requires at least one account",
        path: ["methods", "bankDomestic", "accounts"],
      })
    }
    if (methods.bankIntlWire.enabled && methods.bankIntlWire.accounts.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "International wire enabled requires at least one account",
        path: ["methods", "bankIntlWire", "accounts"],
      })
    }
    if (methods.crypto.enabled && methods.crypto.wallets.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Crypto enabled requires at least one wallet",
        path: ["methods", "crypto", "wallets"],
      })
    }
    if (methods.externalGateway.enabled) {
      try {
        const u = new URL(methods.externalGateway.url)
        if (u.protocol !== "https:" && u.protocol !== "http:") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "External pay URL must be http(s)",
            path: ["methods", "externalGateway", "url"],
          })
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid external pay URL",
          path: ["methods", "externalGateway", "url"],
        })
      }
    }
  })

export function parsePaymentDepositConfigJson(raw: string): PaymentDepositConfigV1 | null {
  try {
    const data: unknown = JSON.parse(raw)
    const parsed = paymentDepositConfigV1Schema.safeParse(data)
    if (!parsed.success) return null
    return parsed.data
  } catch {
    return null
  }
}

export function assertValidPaymentDepositConfigValue(value: string | PaymentDepositConfigV1): PaymentDepositConfigV1 {
  const obj = typeof value === "string" ? (JSON.parse(value) as unknown) : value
  return paymentDepositConfigV1Schema.parse(obj)
}

function stripMethodMeta<T extends Record<string, unknown>>(m: T): T {
  const { enabled: _e, ...rest } = m
  return rest as T
}

export function paymentConfigToPublicV1(config: PaymentDepositConfigV1): PublicPaymentDepositSettingsV1 {
  const globalMin = config.global?.minAmount
  const globalMax = config.global?.maxAmount

  const out: PublicPaymentDepositSettingsV1 = {
    version: 1,
    globalMinAmount: globalMin,
    globalMaxAmount: globalMax,
    order: [],
    methods: {},
  }

  if (config.methods.upi.enabled) {
    out.methods.upi = {
      ...stripMethodMeta(config.methods.upi),
      items: config.methods.upi.items.map((i) => ({ ...i })),
    }
  }
  if (config.methods.bankDomestic.enabled) {
    out.methods.bank = {
      ...stripMethodMeta(config.methods.bankDomestic),
      accounts: config.methods.bankDomestic.accounts.map((a) => ({ ...a })),
    }
  }
  if (config.methods.cash.enabled) {
    out.methods.cash = {
      ...stripMethodMeta(config.methods.cash),
      instructions: config.methods.cash.instructions,
    }
  }
  if (config.methods.crypto.enabled) {
    out.methods.crypto = {
      ...stripMethodMeta(config.methods.crypto),
      wallets: config.methods.crypto.wallets.map((w) => ({ ...w })),
    }
  }
  if (config.methods.bankIntlWire.enabled) {
    out.methods.wire_intl = {
      ...stripMethodMeta(config.methods.bankIntlWire),
      accounts: config.methods.bankIntlWire.accounts.map((a) => ({ ...a })),
    }
  }
  if (config.methods.cheque.enabled) {
    out.methods.cheque = {
      ...stripMethodMeta(config.methods.cheque),
      instructions: config.methods.cheque.instructions,
    }
  }
  if (config.methods.externalGateway.enabled) {
    out.methods.external_pay = {
      ...stripMethodMeta(config.methods.externalGateway),
      buttonLabel: config.methods.externalGateway.buttonLabel,
      url: config.methods.externalGateway.url,
      disclaimer: config.methods.externalGateway.disclaimer,
    }
  }
  if (config.methods.contactSupport.enabled) {
    out.methods.contact_support = {
      ...stripMethodMeta(config.methods.contactSupport),
      title: config.methods.contactSupport.title,
      body: config.methods.contactSupport.body,
      phone: config.methods.contactSupport.phone,
      email: config.methods.contactSupport.email,
      whatsapp: config.methods.contactSupport.whatsapp,
    }
  }

  type MethodKey = keyof PublicPaymentDepositSettingsV1["methods"]
  const enabledKeys = Object.keys(out.methods).filter((k) => {
    const v = out.methods[k as MethodKey]
    return v !== undefined
  }) as PublicPaymentDepositMethodId[]

  const preferred = (config.order?.length ? config.order : [...DEFAULT_PUBLIC_METHOD_ORDER]) as string[]
  const known: string[] = [
    "upi",
    "bank",
    "cash",
    "crypto",
    "wire_intl",
    "cheque",
    "external_pay",
    "contact_support",
  ]
  const isMethodId = (s: string): s is PublicPaymentDepositMethodId => known.includes(s)

  const preferredOk = preferred.filter(isMethodId).filter((id) => enabledKeys.includes(id))
  const tail = enabledKeys.filter((id) => !preferredOk.includes(id))
  out.order = [...preferredOk, ...tail]

  return out
}

export type SettingsKeyMap = Map<string, string>

/**
 * Resolve full v1 config from system_settings map (latest value per key).
 */
export function resolvePaymentDepositConfigFromSettingsMap(byKey: SettingsKeyMap): PaymentDepositConfigV1 {
  const rawV1 = byKey.get(PAYMENT_DEPOSIT_CONFIG_V1_KEY)
  if (rawV1 && rawV1.trim()) {
    const parsed = parsePaymentDepositConfigJson(rawV1)
    if (parsed) return parsed
  }

  let base = getDefaultPaymentDepositConfigV1()
  base = mergeLegacyPaymentKeysIntoConfig(base, {
    qrCode: byKey.get("payment_qr_code"),
    upiId: byKey.get("payment_upi_id"),
  })
  const merged = paymentDepositConfigV1Schema.safeParse(base)
  if (merged.success) return merged.data

  return getDefaultPaymentDepositConfigV1()
}

function methodIdToPublicDepositMethod(method: string): PublicPaymentDepositMethodId | null {
  const m = method.toLowerCase().trim()
  const map: Record<string, PublicPaymentDepositMethodId> = {
    upi: "upi",
    bank: "bank",
    bank_domestic: "bank",
    bank_transfer: "bank",
    neft: "bank",
    rtgs: "bank",
    imps: "bank",
    cash: "cash",
    crypto: "crypto",
    usdt: "crypto",
    wire_intl: "wire_intl",
    wire: "wire_intl",
    cheque: "cheque",
    external_pay: "external_pay",
    contact_support: "contact_support",
  }
  return map[m] ?? null
}

/**
 * Validate deposit amount against global + per-method bounds; returns error message or null.
 */
export function validateDepositAmountAgainstConfig(
  config: PaymentDepositConfigV1,
  amount: number,
  method: string
): string | null {
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Invalid deposit amount"
  }
  const pubId = methodIdToPublicDepositMethod(method)
  if (pubId === "contact_support") {
    return null
  }
  const publicView = paymentConfigToPublicV1(config)
  const gMin = publicView.globalMinAmount ?? DEFAULT_DEPOSIT_MIN_INR
  const gMax = publicView.globalMaxAmount ?? DEFAULT_DEPOSIT_MAX_INR
  if (!pubId) {
    if (amount < gMin) {
      return `Minimum deposit amount is ₹${gMin.toLocaleString("en-IN")}`
    }
    if (amount > gMax) {
      return `Maximum deposit amount is ₹${gMax.toLocaleString("en-IN")}`
    }
    return null
  }
  const block = publicView.methods[pubId]
  const min = block?.minAmount ?? gMin
  const max = block?.maxAmount ?? gMax
  if (amount < min) {
    return `Minimum deposit for this method is ₹${min.toLocaleString("en-IN")}`
  }
  if (amount > max) {
    return `Maximum deposit for this method is ₹${max.toLocaleString("en-IN")}`
  }
  return null
}

export async function loadPaymentDepositConfigV1(prisma: PrismaClient): Promise<PaymentDepositConfigV1> {
  const rows = await prisma.systemSettings.findMany({
    where: {
      ownerId: null,
      isActive: true,
      key: { in: [PAYMENT_DEPOSIT_CONFIG_V1_KEY, "payment_qr_code", "payment_upi_id"] },
    },
    orderBy: { updatedAt: "desc" },
  })
  const byKey: SettingsKeyMap = new Map()
  for (const r of rows) {
    if (!byKey.has(r.key)) {
      byKey.set(r.key, r.value)
    }
  }
  return resolvePaymentDepositConfigFromSettingsMap(byKey)
}
