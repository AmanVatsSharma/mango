/**
 * File:        apps/frontend/lib/api/endpoints/orders.ts
 * Module:      Orders & Positions API — place, cancel, modify, history
 * Purpose:     All trading/order management HTTP calls to NestJS backend
 *
 * ⚠️  NOTE: Local type definitions (OrderStatus/OrderType/OrderSide) here match
 * the shared canonical types at libs/shared/types/src/index.ts and are safe to use.
 * However, lib/hooks/types/realtime-trading.types.ts has its own duplicate definitions
 * with DIFFERENT values (e.g. 'EXECUTED' vs 'FILLED') — do NOT mix the two.
 *
 * Depends on:
 *   - lib/api/client.ts — Axios instance
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-17
 */

import apiClient from '../client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'STOP_LIMIT';
export type OrderStatus = 'PENDING' | 'SUBMITTED' | 'PARTIAL_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED';

export interface Order {
  id: string;
  symbol: string;
  exchange: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  triggerPrice?: number;
  status: OrderStatus;
  filledQuantity: number;
  averagePrice?: number;
  orderId?: string; // broker-provided
  createdAt: string;
  updatedAt: string;
  accountId: string;
}

export interface Position {
  id: string;
  symbol: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  dayPnl: number;
  dayPnlPercent: number;
  isLong: boolean;
  accountId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlaceOrderData {
  symbol: string;
  exchange: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  triggerPrice?: number;
  accountId?: string;
}

export interface OrderHistoryParams {
  symbol?: string;
  status?: OrderStatus;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface PositionHistoryParams {
  symbol?: string;
  isOpen?: boolean;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

// ─── API Functions ────────────────────────────────────────────────────────────

export const ordersApi = {
  // GET /oms/orders
  getOrders: async (params?: OrderHistoryParams): Promise<{ data: Order[]; total: number }> => {
    const response = await apiClient.get<{ data: Order[]; total: number }>('/oms/orders', { params });
    return response.data;
  },

  // GET /oms/orders/:id
  getOrder: async (id: string): Promise<Order> => {
    const response = await apiClient.get<Order>(`/oms/orders/${id}`);
    return response.data;
  },

  // POST /oms/orders — place new order
  placeOrder: async (data: PlaceOrderData): Promise<Order> => {
    const response = await apiClient.post<Order>('/oms/orders', data);
    return response.data;
  },

  // PATCH /oms/orders/:id — modify order
  modifyOrder: async (id: string, data: Partial<PlaceOrderData>): Promise<Order> => {
    const response = await apiClient.patch<Order>(`/oms/orders/${id}`, data);
    return response.data;
  },

  // DELETE /oms/orders/:id — cancel order
  cancelOrder: async (id: string, reason?: string): Promise<Order> => {
    const response = await apiClient.delete<Order>(`/oms/orders/${id}`, { data: { reason } });
    return response.data;
  },

  // GET /oms/positions
  getPositions: async (params?: PositionHistoryParams): Promise<{ data: Position[]; total: number }> => {
    const response = await apiClient.get<{ data: Position[]; total: number }>('/oms/positions', { params });
    return response.data;
  },

  // GET /oms/positions/:id
  getPosition: async (id: string): Promise<Position> => {
    const response = await apiClient.get<Position>(`/oms/positions/${id}`);
    return response.data;
  },

  // GET /oms/account/summary
  getAccountSummary: async (accountId?: string): Promise<{
    totalPnl: number;
    dayPnl: number;
    availableMargin: number;
    usedMargin: number;
    totalMargin: number;
    unrealizedPnl: number;
    realizedPnl: number;
  }> => {
    const params = accountId ? { accountId } : {};
    const response = await apiClient.get('/oms/account/summary', { params });
    return response.data;
  },
};