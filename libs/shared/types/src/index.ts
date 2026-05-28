/**
 * File:        libs/shared/types/src/index.ts
 * Module:      Shared TypeScript types between frontend and backend
 * Purpose:     Central location for API contracts, domain models, and shared interfaces
 *
 * Exports:
 *   - ApiResponse<T>           — standard API response wrapper
 *   - PaginatedResponse<T>     — paginated API response with metadata
 *   - ApiError                 — API error shape
 *   - UserRole                 — user role enum
 *
 * Depends on:
 *   - none (pure TypeScript)
 *
 * Side-effects: none
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-16
 */

/**
 * Standard API response wrapper used across both frontend and backend
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: string;
}

/**
 * Paginated API response with pagination metadata
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * API error shape returned from both REST and GraphQL endpoints
 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * User roles in the trading platform RBAC system
 */
export type UserRole = 'USER' | 'ADMIN' | 'MODERATOR' | 'SUPER_ADMIN';

/**
 * Order side — buy or sell
 */
export type OrderSide = 'BUY' | 'SELL';

/**
 * Order type — market, limit, stop-loss, etc.
 */
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'STOP_LIMIT';

/**
 * Order status in the lifecycle
 */
export type OrderStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'PARTIAL_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'REJECTED';

/**
 * Market data tick shape from the real-time stream
 */
export interface MarketTick {
  symbol: string;
  price: number;
  volume: number;
  bid: number;
  ask: number;
  timestamp: number;
}