/**
 * File:        apps/broker-admin/src/app/(admin)/orders/page.tsx
 * Module:      broker-admin · Trading · Order Management
 * Purpose:     Order book view with status filtering, side badge color, and cancel action
 *
 * Exports:
 *   - default (OrdersPage) — sortable, filterable order table
 *
 * Depends on:
 *   - @/lib/api/hooks/use-orders — useOrdersApi() for real API data
 *   - @/lib/types — Order, OrderStatus
 *
 * Side-effects:
 *   - Local state copy; cancel action marks order as Cancelled locally
 *
 * Key invariants:
 *   - Buy = bull green, Sell = bear red — always
 *   - Open P&L only shown on Open orders (requires currentPrice and openPrice)
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useEffect, useState, useMemo } from 'react';
import { useOrdersApi } from '@/lib/api/hooks/use-orders';
import type { Order, OrderStatus } from '@/lib/types';

const STATUS_BADGE: Record<OrderStatus, string> = {
  Open:      'status-active',
  Pending:   'status-pending',
  Filled:    'badge badge-accent',
  Cancelled: 'badge badge-muted',
  Rejected:  'status-suspended',
  Expired:   'badge badge-muted',
};

const STATUS_TABS: { label: string; filter: (o: Order) => boolean }[] = [
  { label: 'Open',      filter: o => o.status === 'Open' },
  { label: 'Pending',   filter: o => o.status === 'Pending' },
  { label: 'Filled',    filter: o => o.status === 'Filled' },
  { label: 'Cancelled', filter: o => o.status === 'Cancelled' || o.status === 'Expired' || o.status === 'Rejected' },
  { label: 'All',       filter: () => true },
];

export default function OrdersPage() {
  const { orders: apiOrders, cancelOrder } = useOrdersApi();
  const [orders, setOrders] = useState<Order[]>([...apiOrders]);
  const [tab, setTab] = useState('Open');
  const [search, setSearch] = useState('');

  // Sync API orders into local state on every API refresh (optimistic updates handled in hook)
  useEffect(() => { setOrders(apiOrders); }, [apiOrders]);

  const currentFilter = STATUS_TABS.find(t => t.label === tab)!.filter;
  const displayed = useMemo(() =>
    orders.filter(o =>
      currentFilter(o) &&
      (!search || o.clientName.toLowerCase().includes(search.toLowerCase()) || o.symbol.toLowerCase().includes(search.toLowerCase()))
    ), [orders, tab, search, currentFilter]
  );

  const pnl = (o: Order): number | null => {
    if (o.status !== 'Open' || !o.currentPrice) return null;
    const diff = o.side === 'Buy' ? o.currentPrice - o.openPrice : o.openPrice - o.currentPrice;
    return diff * o.lots * 100_000 - o.commission - o.swap;
  };

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Order Management</p>
          <p className="module-subtitle">
            {orders.filter(o => o.status === 'Open').length} open ·{' '}
            {orders.filter(o => o.status === 'Pending').length} pending
          </p>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="chart-tabs">
            {STATUS_TABS.map(t => {
              const cnt = orders.filter(t.filter).length;
              return (
                <button key={t.label} className={`chart-tab ${tab === t.label ? 'active' : ''}`} onClick={() => setTab(t.label)}>
                  {t.label}
                  <span className="ml-1 font-mono text-[9px] text-fg3">{cnt}</span>
                </button>
              );
            })}
          </div>
          <input className="input ml-auto w-52" placeholder="Search client or symbol..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="card overflow-x-auto">
          <table className="data-table" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Client</th>
                <th>Symbol</th>
                <th>Type</th>
                <th>Side</th>
                <th>Lots</th>
                <th>Open Price</th>
                <th>Current / Close</th>
                <th>SL</th>
                <th>TP</th>
                <th>Float P&amp;L</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-[12px] text-fg3">
                    No {tab.toLowerCase()} orders
                  </td>
                </tr>
              ) : displayed.map(o => {
                const floatPnl = pnl(o);
                return (
                  <tr key={o.id}>
                    <td className="mono-cell text-[11px] text-fg3">{o.id}</td>
                    <td>
                      <p className="text-[12px] font-medium text-fg1">{o.clientName}</p>
                      <p className="mono-cell text-[10px] text-fg3">{o.clientId}</p>
                    </td>
                    <td className="mono-cell font-bold text-[13px]">{o.symbol}</td>
                    <td className="text-[11px] text-fg2">{o.type}</td>
                    <td>
                      <span className={`badge ${o.side === 'Buy' ? 'badge-bull' : 'badge-bear'}`}>{o.side}</span>
                    </td>
                    <td className="mono-cell text-[12px] text-fg1">{o.lots}</td>
                    <td className="mono-cell text-[12px] text-fg2">{o.openPrice.toFixed(5)}</td>
                    <td className="mono-cell text-[12px] text-fg1">
                      {o.status === 'Open' && o.currentPrice ? o.currentPrice.toFixed(5) : o.closePrice ? o.closePrice.toFixed(5) : '—'}
                    </td>
                    <td className="mono-cell text-[11px] text-bear">{o.sl ? o.sl.toFixed(5) : '—'}</td>
                    <td className="mono-cell text-[11px] text-bull">{o.tp ? o.tp.toFixed(5) : '—'}</td>
                    <td>
                      {floatPnl !== null ? (
                        <span className={`mono-cell font-bold text-[12px] ${floatPnl >= 0 ? 'text-bull' : 'text-bear'}`}>
                          {floatPnl >= 0 ? '+' : ''}${floatPnl.toFixed(2)}
                        </span>
                      ) : <span className="text-[11px] text-fg3">—</span>}
                    </td>
                    <td><span className={STATUS_BADGE[o.status] ?? 'badge badge-muted'}>{o.status}</span></td>
                    <td>
                      {(o.status === 'Open' || o.status === 'Pending') && (
                        <button className="btn-danger btn btn-xs" onClick={() => cancelOrder(o.id)}>Cancel</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
