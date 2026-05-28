/**
 * Utility functions for handling Prisma Decimal fields
 */

import { Decimal } from '@prisma/client/runtime/library'

/**
 * Safely converts a Prisma Decimal or any value to a number
 * @param value - The value to convert (Decimal, string, number, or null/undefined)
 * @returns The numeric value or 0 if conversion fails
 */
export function toNumber(value: any): number {
  if (value === null || value === undefined) return 0
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0
  }
  if (typeof value === "boolean") {
    return 0
  }
  if (typeof value === "string") {
    const normalizedValue = value.trim()
    if (!normalizedValue) {
      return 0
    }
    const loweredValue = normalizedValue.toLowerCase()
    if (
      loweredValue === "null" ||
      loweredValue === "undefined" ||
      loweredValue === "nan" ||
      loweredValue === "infinity" ||
      loweredValue === "+infinity" ||
      loweredValue === "-infinity"
    ) {
      return 0
    }
    const parsedStringValue = Number(normalizedValue)
    return Number.isFinite(parsedStringValue) ? parsedStringValue : 0
  }
  
  // Handle Prisma Decimal
  if (value instanceof Decimal || (value && typeof value.toNumber === 'function')) {
    try {
      const decimalValue = value.toNumber()
      return Number.isFinite(decimalValue) ? decimalValue : 0
    } catch {
      return 0
    }
  }

  try {
    const parsedValue = Number(value)
    return Number.isFinite(parsedValue) ? parsedValue : 0
  } catch {
    return 0
  }
}

/**
 * Converts a number to a Prisma Decimal
 * @param value - The number to convert
 * @returns A Decimal instance
 */
export function toDecimal(value: number | string): Decimal {
  return new Decimal(value)
}

/**
 * Safely converts a Decimal to a string for display
 * @param value - The Decimal value
 * @param precision - Number of decimal places (default: 2)
 * @returns Formatted string
 */
export function decimalToString(value: any, precision: number = 2): string {
  const num = toNumber(value)
  return num.toFixed(precision)
}
