/**
 * @file payment-deposit-config.shared.ts
 * @module lib
 * @description Admin deposit configuration shape, defaults, and legacy UPI merge (safe for client components).
 * @author StockTrade
 * @created 2026-03-25
 */

import {
  DEFAULT_DEPOSIT_MAX_INR,
  DEFAULT_DEPOSIT_MIN_INR,
  DEFAULT_PUBLIC_METHOD_ORDER,
  PAYMENT_DEPOSIT_CONFIG_V1_KEY,
} from "@/lib/payment-deposit-public"

export interface PaymentDepositMethodMeta {
  clientTitle?: string
  clientDescription?: string
  minAmount?: number
  maxAmount?: number
  recommended?: boolean
  badgeText?: string
  requireProof?: boolean
}

export interface UpiDepositItem {
  id: string
  label?: string
  upiId: string
  qrCodeUrl?: string
}

export interface BankDomesticAccount {
  id: string
  bankName: string
  accountHolder: string
  accountNumber: string
  ifsc: string
  branch?: string
  instructions?: string
}

export interface BankIntlAccount {
  id: string
  beneficiary: string
  bankName: string
  ibanOrAccount: string
  swift: string
  currency?: string
  intermediaryBank?: string
  instructions?: string
}

export interface CryptoWalletConfig {
  id: string
  asset: string
  network: string
  address: string
  memoOrTag?: string
  qrCodeUrl?: string
  instructions?: string
}

export interface PaymentDepositConfigV1 {
  version: 1
  global?: {
    defaultCurrency?: "INR"
    minAmount?: number
    maxAmount?: number
  }
  methods: {
    upi: PaymentDepositMethodMeta & { enabled: boolean; items: UpiDepositItem[] }
    bankDomestic: PaymentDepositMethodMeta & { enabled: boolean; accounts: BankDomesticAccount[] }
    bankIntlWire: PaymentDepositMethodMeta & { enabled: boolean; accounts: BankIntlAccount[] }
    cash: PaymentDepositMethodMeta & { enabled: boolean; instructions?: string }
    crypto: PaymentDepositMethodMeta & { enabled: boolean; wallets: CryptoWalletConfig[] }
    cheque: PaymentDepositMethodMeta & { enabled: boolean; instructions?: string }
    externalGateway: PaymentDepositMethodMeta & {
      enabled: boolean
      buttonLabel: string
      url: string
      disclaimer?: string
    }
    contactSupport: PaymentDepositMethodMeta & {
      enabled: boolean
      title?: string
      body?: string
      phone?: string
      email?: string
      whatsapp?: string
    }
  }
  order?: string[]
}

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function getDefaultPaymentDepositConfigV1(): PaymentDepositConfigV1 {
  return {
    version: 1,
    global: {
      defaultCurrency: "INR",
      minAmount: DEFAULT_DEPOSIT_MIN_INR,
      maxAmount: DEFAULT_DEPOSIT_MAX_INR,
    },
    methods: {
      upi: { enabled: false, items: [] },
      bankDomestic: { enabled: false, accounts: [] },
      bankIntlWire: { enabled: false, accounts: [] },
      cash: { enabled: false, instructions: "" },
      crypto: { enabled: false, wallets: [] },
      cheque: { enabled: false, instructions: "" },
      externalGateway: {
        enabled: false,
        buttonLabel: "Pay online",
        url: "https://example.com",
        disclaimer: "",
      },
      contactSupport: { enabled: false, title: "", body: "" },
    },
    order: [...DEFAULT_PUBLIC_METHOD_ORDER],
  }
}

/**
 * Build an editable config draft on the client from /api/admin/settings rows (no Zod).
 * Prefer validated saves via POST; this matches server resolution for display.
 */
export function resolvePaymentDepositConfigDraft(byKey: Map<string, string>): PaymentDepositConfigV1 {
  const rawV1 = byKey.get(PAYMENT_DEPOSIT_CONFIG_V1_KEY)?.trim()
  if (rawV1) {
    try {
      const data = JSON.parse(rawV1) as unknown
      if (
        data &&
        typeof data === "object" &&
        (data as PaymentDepositConfigV1).version === 1 &&
        (data as PaymentDepositConfigV1).methods
      ) {
        return data as PaymentDepositConfigV1
      }
    } catch {
      /* use legacy merge */
    }
  }
  let base = getDefaultPaymentDepositConfigV1()
  return mergeLegacyPaymentKeysIntoConfig(base, {
    qrCode: byKey.get("payment_qr_code"),
    upiId: byKey.get("payment_upi_id"),
  })
}

export function mergeLegacyPaymentKeysIntoConfig(
  config: PaymentDepositConfigV1,
  legacy: { qrCode?: string | null; upiId?: string | null }
): PaymentDepositConfigV1 {
  const upiId = (legacy.upiId || "").trim()
  const qr = (legacy.qrCode || "").trim()
  if (!upiId && !qr) return config
  const items = [...config.methods.upi.items]
  if (items.length === 0) {
    items.push({
      id: newId("upi"),
      label: "Primary",
      upiId: upiId || "configure@upi",
      qrCodeUrl: qr || undefined,
    })
  }
  return {
    ...config,
    methods: {
      ...config.methods,
      upi: {
        ...config.methods.upi,
        enabled: true,
        items,
      },
    },
  }
}
