/**
 * @file payment-deposit-public.ts
 * @module lib
 * @description Shared types and pure helpers for deposit payment configuration (client + server safe, no Zod).
 * @author StockTrade
 * @created 2026-03-25
 */

export const PAYMENT_DEPOSIT_CONFIG_V1_KEY = "payment_deposit_config_v1" as const

export const DEFAULT_DEPOSIT_MIN_INR = 100
export const DEFAULT_DEPOSIT_MAX_INR = 200_000

export type PublicPaymentDepositMethodId =
  | "upi"
  | "bank"
  | "cash"
  | "crypto"
  | "wire_intl"
  | "cheque"
  | "external_pay"
  | "contact_support"

export const DEFAULT_PUBLIC_METHOD_ORDER: PublicPaymentDepositMethodId[] = [
  "upi",
  "bank",
  "cash",
  "crypto",
  "wire_intl",
  "cheque",
  "external_pay",
  "contact_support",
]

export interface MethodClientMetaPublic {
  clientTitle?: string
  clientDescription?: string
  minAmount?: number
  maxAmount?: number
  recommended?: boolean
  badgeText?: string
  requireProof?: boolean
}

export type PublicUpiPayload = MethodClientMetaPublic & {
  items: Array<{ id: string; label?: string; upiId: string; qrCodeUrl?: string }>
}

export type PublicBankDomesticPayload = MethodClientMetaPublic & {
  accounts: Array<{
    id: string
    bankName: string
    accountHolder: string
    accountNumber: string
    ifsc: string
    branch?: string
    instructions?: string
  }>
}

export type PublicBankIntlPayload = MethodClientMetaPublic & {
  accounts: Array<{
    id: string
    beneficiary: string
    bankName: string
    ibanOrAccount: string
    swift: string
    currency?: string
    intermediaryBank?: string
    instructions?: string
  }>
}

export type PublicCashPayload = MethodClientMetaPublic & {
  instructions?: string
}

export type PublicCryptoPayload = MethodClientMetaPublic & {
  wallets: Array<{
    id: string
    asset: string
    network: string
    address: string
    memoOrTag?: string
    qrCodeUrl?: string
    instructions?: string
  }>
}

export type PublicChequePayload = MethodClientMetaPublic & {
  instructions?: string
}

export type PublicExternalPayPayload = MethodClientMetaPublic & {
  buttonLabel: string
  url: string
  disclaimer?: string
}

export type PublicContactSupportPayload = MethodClientMetaPublic & {
  title?: string
  body?: string
  phone?: string
  email?: string
  whatsapp?: string
}

export interface PublicPaymentDepositSettingsV1 {
  version: 1
  globalMinAmount?: number
  globalMaxAmount?: number
  order: PublicPaymentDepositMethodId[]
  methods: {
    upi?: PublicUpiPayload
    bank?: PublicBankDomesticPayload
    cash?: PublicCashPayload
    crypto?: PublicCryptoPayload
    wire_intl?: PublicBankIntlPayload
    cheque?: PublicChequePayload
    external_pay?: PublicExternalPayPayload
    contact_support?: PublicContactSupportPayload
  }
}

/**
 * Resolve effective min/max INR for a method using global bounds then method overrides.
 */
export function getAmountBoundsForMethod(
  settings: PublicPaymentDepositSettingsV1 | null,
  methodId: PublicPaymentDepositMethodId
): { min: number; max: number } {
  const globalMin = settings?.globalMinAmount ?? DEFAULT_DEPOSIT_MIN_INR
  const globalMax = settings?.globalMaxAmount ?? DEFAULT_DEPOSIT_MAX_INR
  const block = settings?.methods[methodId] as MethodClientMetaPublic | undefined
  let min = block?.minAmount ?? globalMin
  let max = block?.maxAmount ?? globalMax
  if (max < min) {
    const t = min
    min = max
    max = t
  }
  min = Math.max(1, min)
  max = Math.max(min, max)
  return { min, max }
}
