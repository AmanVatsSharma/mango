/**
 * @file priceFormatters.ts
 * @description Price formatting and calculation utilities
 * 
 * PURPOSE:
 * - Format prices for display in UI
 * - Calculate price changes and percentages
 * - Detect trends (up/down/neutral)
 * - Format currency values
 * 
 * FEATURES:
 * - Currency formatting with Indian Rupee (₹)
 * - Change percentage calculation
 * - Trend detection based on price movement
 * - Precision handling for different markets
 * 
 * DEPENDENCIES:
 * - None (pure utility functions)
 * 
 * EXPORTS:
 * - formatPrice: Format price with currency symbol
 * - calculateChange: Calculate price change
 * - calculateChangePercent: Calculate percentage change
 * - detectTrend: Detect trend (up/down/neutral)
 * - formatCurrency: Format with currency symbol
 * 
 * USAGE:
 * import { formatPrice, detectTrend } from '@/lib/market-data/utils/priceFormatters'
 * 
 * @author Trading Platform Team
 * @date 2025-10-28
 */

/**
 * Format price with currency symbol and appropriate decimals
 * @param price - Price value to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted price string with ₹ symbol
 */
export function formatPrice(price: number, decimals: number = 2): string {
  if (isNaN(price) || price === null || price === undefined) {
    return '₹0.00';
  }
  
  return `₹${price.toFixed(decimals)}`;
}

/**
 * Format currency value
 * @param amount - Amount to format
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number): string {
  return formatPrice(amount);
}

/**
 * Calculate price change
 * @param currentPrice - Current price
 * @param previousPrice - Previous price
 * @returns Price change value
 */
export function calculateChange(currentPrice: number, previousPrice: number): number {
  if (isNaN(currentPrice) || isNaN(previousPrice) || previousPrice === 0) {
    return 0;
  }
  
  return currentPrice - previousPrice;
}

/**
 * Calculate percentage change
 * @param currentPrice - Current price
 * @param previousPrice - Previous price
 * @returns Percentage change value
 */
export function calculateChangePercent(currentPrice: number, previousPrice: number): number {
  if (isNaN(currentPrice) || isNaN(previousPrice) || previousPrice === 0) {
    return 0;
  }
  
  return ((currentPrice - previousPrice) / previousPrice) * 100;
}

/**
 * Detect trend based on price movement
 * @param currentPrice - Current price
 * @param previousPrice - Previous price
 * @param threshold - Minimum price difference to consider (default: 0.01)
 * @returns Trend: 'up', 'down', or 'neutral'
 */
export function detectTrend(
  currentPrice: number, 
  previousPrice: number, 
  threshold: number = 0.01
): 'up' | 'down' | 'neutral' {
  if (isNaN(currentPrice) || isNaN(previousPrice)) {
    return 'neutral';
  }
  
  const diff = currentPrice - previousPrice;
  
  if (Math.abs(diff) < threshold) {
    return 'neutral';
  }
  
  return diff > 0 ? 'up' : 'down';
}

/**
 * Format percentage value
 * @param value - Percentage value
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted percentage string with ± sign
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  if (isNaN(value) || value === null || value === undefined) {
    return '0.00%';
  }
  
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Format number with thousand separators
 * @param value - Number to format
 * @returns Formatted number string
 */
export function formatNumber(value: number): string {
  if (isNaN(value) || value === null || value === undefined) {
    return '0';
  }
  
  return value.toLocaleString('en-IN');
}

/**
 * Get color class based on price change
 * @param change - Price change value
 * @returns Color class for styling
 */
export function getPriceChangeColor(change: number): string {
  if (change > 0) return 'text-green-600';
  if (change < 0) return 'text-red-600';
  return 'text-gray-600';
}

/**
 * Truncate price to appropriate precision for display
 * @param price - Price to truncate
 * @param precision - Decimal places (default: 2)
 * @returns Truncated price
 */
export function truncatePrice(price: number, precision: number = 2): number {
  if (isNaN(price) || price === null || price === undefined) {
    return 0;
  }
  
  const multiplier = Math.pow(10, precision);
  return Math.floor(price * multiplier) / multiplier;
}

