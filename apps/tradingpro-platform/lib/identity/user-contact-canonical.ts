/**
 * @file user-contact-canonical.ts
 * @module identity
 * @description Canonical email/phone strings for persistence and lookup (signup, login, admin create).
 * @author StockTrade
 * @created 2026-04-03
 * @updated 2026-04-03
 *
 * Notes:
 * - Aligns with admin duplicate detection (`normalizeAdminUserEmailKey` / phone tail logic).
 * - Login and registration must both use these helpers so stored values match lookups.
 */

/**
 * Lowercase trimmed email for DB storage and `findUnique({ email })`.
 */
export function canonicalEmailForPersistence(email: string): string {
  return email.trim().toLowerCase()
}

const PHONE_TAIL_LEN = 10

/**
 * Indian-centric mobile normalization: digits only; strip leading `91` when present so
 * `+91 9876543210` and `9876543210` store as the same 10-digit national number.
 */
export function canonicalPhoneForPersistence(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 0) {
    return ""
  }
  if (digits.length >= 12 && digits.startsWith("91")) {
    return digits.slice(-PHONE_TAIL_LEN)
  }
  if (digits.length > PHONE_TAIL_LEN) {
    return digits.slice(-PHONE_TAIL_LEN)
  }
  return digits
}
