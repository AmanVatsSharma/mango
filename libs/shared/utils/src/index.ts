/**
 * File:        libs/shared/utils/src/index.ts
 * Module:      Shared utility functions used across both apps
 * Purpose:     Pure utility functions with no side-effects or external dependencies
 *
 * Exports:
 *   - formatCurrency(amount: number, currency?: string) → string
 *   - formatDate(date: Date | number, format?: string) → string
 *   - clamp(value: number, min: number, max: number) → number
 *   - debounce<T extends (...args: any[]) => any>(fn: T, delay: number) → T
 *   - throttle<T extends (...args: any[]) => any>(fn: T, limit: number) → T
 *
 * Depends on: none
 *
 * Side-effects: none
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-16
 */

export function formatCurrency(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: Date | number, format: 'short' | 'long' | 'time' = 'short'): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  if (format === 'time') {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  if (format === 'long') {
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  }
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number,
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  };
}