/**
 * @file admin-user-contact-keys.ts
 * @module server
 * @description Normalized email/phone keys for admin duplicate-contact detection (case-insensitive email, last-10-digit phone).
 * @author StockTrade
 * @created 2026-04-03
 *
 * Notes:
 * - Keys must stay aligned with SQL in admin-related-users.ts for consistent matching.
 */

/** Minimum digit length to treat a phone as comparable (Indian mobile-style). */
export const ADMIN_CONTACT_PHONE_MIN_DIGITS = 10

/**
 * Lowercased trimmed email, or null if empty / whitespace-only.
 */
export function normalizeAdminUserEmailKey(email: string | null | undefined): string | null {
  if (email === null || email === undefined) {
    return null
  }
  const t = email.trim().toLowerCase()
  return t.length > 0 ? t : null
}

/**
 * Last {@link ADMIN_CONTACT_PHONE_MIN_DIGITS} digits when the digit-only string is long enough; otherwise null.
 */
export function normalizeAdminUserPhoneKey(phone: string | null | undefined): string | null {
  if (phone === null || phone === undefined) {
    return null
  }
  const digits = phone.replace(/\D/g, "")
  if (digits.length < ADMIN_CONTACT_PHONE_MIN_DIGITS) {
    return null
  }
  return digits.slice(-ADMIN_CONTACT_PHONE_MIN_DIGITS)
}
