/**
 * @file instrumentMapper.ts
 * @description Instrument token mapping and resolution utilities
 * 
 * PURPOSE:
 * - Map between different instrument ID formats
 * - Resolve instrument tokens from various sources
 * - Exchange code mapping
 * - Convert instrument IDs to tokens for WebSocket subscription
 * 
 * FEATURES:
 * - Convert instrument IDs to tokens
 * - Handle different exchange formats
 * - Parse instrument identifiers
 * - Support NSE, BSE, MCX exchanges
 * 
 * DEPENDENCIES:
 * - None (pure utility functions)
 * 
 * EXPORTS:
 * - parseInstrumentId: Parse instrument ID to token
 * - toInstrumentToken: Convert to instrument token
 * - fromInstrumentToken: Convert from instrument token
 * - getExchangeFromInstrumentId: Extract exchange from instrument ID
 * - INDEX_INSTRUMENTS: Predefined index tokens
 * 
 * USAGE:
 * import { parseInstrumentId, INDEX_INSTRUMENTS } from '@/lib/market-data/utils/instrumentMapper'
 * 
 * @author Trading Platform Team
 * @date 2025-10-28
 */

/**
 * Predefined index instrument tokens
 */
export const INDEX_INSTRUMENTS = {
  NIFTY: 26571,
  BANKNIFTY: 26575,
  RELIANCE: 2881,
  TCS: 2953217,
  HDFC_BANK: 341249,
} as const;

function parseStrictPositiveIntegerToken(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalizedValue = value.trim();
  if (!/^\d+$/.test(normalizedValue)) {
    return null;
  }
  const parsedToken = Number(normalizedValue);
  if (!Number.isFinite(parsedToken) || parsedToken <= 0) {
    return null;
  }
  return Math.trunc(parsedToken);
}

/**
 * Parse instrument ID to extract token and exchange
 * Supports formats like:
 * - "NSE_EQ-26000" (exchange-token format)
 * - "26000" (token only)
 * - "NSE:RELIANCE" (exchange:symbol format)
 * 
 * @param instrumentId - Instrument identifier
 * @returns Parsed token or null if cannot parse
 */
export function parseInstrumentId(instrumentId: string): number | null {
  if (!instrumentId) return null;
  
  // Try to extract token from "NSE_EQ-26000" format
  const parts = instrumentId.split('-');
  if (parts.length === 2) {
    return parseStrictPositiveIntegerToken(parts[1]);
  }
  
  // Try direct token parsing
  return parseStrictPositiveIntegerToken(instrumentId);
}

/**
 * Convert instrument ID to token for WebSocket subscription
 * @param instrumentId - Instrument identifier
 * @returns Token number or null
 */
export function toInstrumentToken(instrumentId: string): number | null {
  return parseInstrumentId(instrumentId);
}

/**
 * Convert token to instrument ID format
 * @param exchange - Exchange code (NSE_EQ, NSE_FO, etc.)
 * @param token - Instrument token
 * @returns Instrument ID string
 */
export function fromInstrumentToken(exchange: string, token: number): string {
  return `${exchange}-${token}`;
}

/**
 * Extract exchange code from instrument ID
 * @param instrumentId - Instrument identifier
 * @returns Exchange code or 'NSE_EQ' as default
 */
export function getExchangeFromInstrumentId(instrumentId: string): string {
  if (!instrumentId) return 'NSE_EQ';
  
  // Extract exchange from "NSE_EQ-26000" format
  const parts = instrumentId.split('-');
  if (parts.length === 2) {
    return parts[0];
  }
  
  // Default to NSE_EQ
  return 'NSE_EQ';
}

/**
 * Convert token to standard instrument ID format
 * @param token - Instrument token
 * @param exchange - Exchange code (default: NSE_EQ)
 * @returns Standard instrument ID
 */
export function normalizeInstrumentId(token: number, exchange: string = 'NSE_EQ'): string {
  return `${exchange}-${token}`;
}

/**
 * Extract unique tokens from instrument IDs array
 * @param instrumentIds - Array of instrument identifiers
 * @returns Array of unique tokens
 */
export function extractTokens(instrumentIds: string[]): number[] {
  const tokens = instrumentIds
    .map(id => parseInstrumentId(id))
    .filter((token): token is number => token !== null);
  
  // Remove duplicates
  return Array.from(new Set(tokens));
}

/**
 * Map token to instrument ID
 * @param token - Instrument token
 * @param exchange - Exchange code
 * @returns Instrument ID string
 */
export function mapTokenToInstrumentId(token: number, exchange: string = 'NSE_EQ'): string {
  return `${exchange}-${token}`;
}

/**
 * Get instrument key from exchange and token
 * @param exchange - Exchange code
 * @param token - Instrument token
 * @returns Instrument key string
 */
export function getInstrumentKey(exchange: string, token: number): string {
  return `${exchange}:${token}`;
}

/**
 * Parse instrument key back to exchange and token
 * @param key - Instrument key (e.g., "NSE_EQ:26000")
 * @returns Object with exchange and token
 */
export function parseInstrumentKey(key: string): { exchange: string; token: number } | null {
  const parts = key.split(':');
  if (parts.length !== 2) return null;
  
  const token = parseStrictPositiveIntegerToken(parts[1]);
  if (token === null) return null;
  
  return {
    exchange: parts[0],
    token,
  };
}

/**
 * Check if instrument is an index
 * @param token - Instrument token
 * @returns True if index, false otherwise
 */
export function isIndex(token: number): boolean {
  const indexTokens = Object.values(INDEX_INSTRUMENTS);
  return indexTokens.includes(token);
}

