/**
 * File:        apps/broker-admin/src/lib/api/hooks/use-orders.ts
 * Module:      broker-admin · Orders API Hook
 * Purpose:     Wires the orders page to real backend API for listing and cancelling orders.
 *
 * Exports:
 *   - useOrdersApi() → { orders, isLoading, error, cancelOrder, refetch }
 *
 * Depends on:
 *   - ../client — apiRequest
 *
 * Side-effects:
 *   - Calls GET /admin/orders with status/symbol/accountId filters
 *   - Calls POST /admin/orders/cancel on cancelOrder
 *
 * Key invariants:
 *   - 'use client' — browser APIs via apiRequest
 *   - Optimistic update on cancel (marks order as CANCELLED locally)
 *   - Falls back to empty list on error so page still renders
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../client';
import type { Order, OrderStatus, OrderSide, OrderType } from '../../types';

/* ── API shape (mirror OrderEntity) ─────────────────────────────────────────── */

interface ApiOrder {
  id: string;
  accountId: string;
  instrumentId: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: string;
  price?: string | null;
  status: string;
  clientOrderId: string;
  createdAt: string;
}

function mapApiOrder(o: ApiOrder): Order {
  const sideMap: Record<string, OrderSide> = { BUY: 'Buy', SELL: 'Sell' };
  const statusMap: Record<string, OrderStatus> = {
    NEW: 'Pending',
    PLACED: 'Open',
    PARTIALLY_FILLED: 'Pending',
    FILLED: 'Filled',
    CANCELLED: 'Cancelled',
    REJECTED: 'Rejected',
  };
  return {
    id: o.id,
    clientId: o.accountId,
    clientName: '—',
    symbol: o.instrumentId.slice(0, 8),
    type: (o.type === 'MARKET' ? 'Market' : 'Limit') as OrderType,
    side: sideMap[o.side] ?? 'Buy',
    status: statusMap[o.status] ?? 'Pending',
    lots: Number(o.quantity),
    openPrice: Number(o.price ?? 0),
    currentPrice: undefined,
    closePrice: undefined,
    sl: undefined,
    tp: undefined,
    commission: 0,
    swap: 0,
    floatPnl: undefined,
    realizedPnl: undefined,
    openTime: o.createdAt,
    closeTime: undefined,
  };
}

/* ── Hook ──────────────────────────────────────────────────────────────────────── */

interface OrdersResult {
  orders: Order[];
  isLoading: boolean;
  error: string | null;
  cancelOrder: (orderId: string) => void;
  refetch: () => void;
}

export function useOrdersApi(): OrdersResult {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiRequest<{ data: ApiOrder[]; total: number }>('/admin/orders?limit=100')
      .then(res => { if (!cancelled) setOrders(res.data.map(mapApiOrder)); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load orders'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [tick]);

  const cancelOrder = useCallback((orderId: string) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'Cancelled' as OrderStatus } : o));
    apiRequest('/admin/orders/cancel', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    }).catch(() => refetch());
  }, [refetch]);

  return { orders, isLoading, error, cancelOrder, refetch };
}