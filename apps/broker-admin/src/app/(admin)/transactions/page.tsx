/**
 * File:        apps/broker-admin/src/app/(admin)/transactions/page.tsx
 * Module:      broker-admin · Finance · Transactions
 * Purpose:     Deposit/withdrawal approval queue with review drawer and bulk approve
 *
 * Exports:
 *   - default (TransactionsPage) — server/client page component
 *
 * Depends on:
 *   - @/lib/api/hooks/use-transactions — useTransactionsApi() for real API data
 *
 * Side-effects:
 *   - approveTx / rejectTx fire real API calls to admin deposit/withdrawal endpoints
 *
 * Key invariants:
 *   - Only Pending/Processing transactions show Review action
 *   - Bulk approve only targets Pending rows; checkbox disabled on others
 *   - No window.confirm — uses inline modal for bulk confirmation
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState, useMemo } from 'react';
import { CheckCircle, XCircle, ChevronRight, X, AlertTriangle } from 'lucide-react';
import { useTransactionsApi } from '@/lib/api/hooks/use-transactions';
import type { Transaction, TransactionStatus } from '@/lib/types';

const TYPE_BADGE: Record<string, string> = {
  Deposit:    'badge badge-bull',
  Withdrawal: 'badge badge-bear',
  Bonus:      'badge badge-gold',
  Commission: 'badge badge-purple',
  Transfer:   'badge badge-accent',
  Adjustment: 'badge badge-muted',
};

const STATUS_BADGE: Record<TransactionStatus, string> = {
  Pending:    'status-pending',
  Processing: 'badge badge-accent',
  Completed:  'status-active',
  Rejected:   'status-suspended',
  Cancelled:  'badge badge-muted',
  'On Hold':  'badge badge-warn',
};

const STATUS_TABS: { label: string; filter: (t: Transaction) => boolean }[] = [
  { label: 'Pending',    filter: t => t.status === 'Pending' },
  { label: 'Processing', filter: t => t.status === 'Processing' },
  { label: 'Completed',  filter: t => t.status === 'Completed' },
  { label: 'Rejected',   filter: t => t.status === 'Rejected' },
  { label: 'All',        filter: () => true },
];

const PAYMENT_METHODS_CONFIG = [
  { id: 'wire',   name: 'Wire Transfer', min: 500,   max: 500_000, fee: '$25',  time: '1–3 days' },
  { id: 'visa',   name: 'Visa / MC',     min: 20,    max: 10_000,  fee: 'Free', time: 'Instant'  },
  { id: 'sepa',   name: 'SEPA',          min: 50,    max: 50_000,  fee: '€15',  time: '1–2 days' },
  { id: 'usdt',   name: 'USDT (TRC20)',  min: 100,   max: 100_000, fee: 'Free', time: '~10 min'  },
  { id: 'btc',    name: 'Bitcoin',       min: 100,   max: 50_000,  fee: 'Free', time: '~30 min', disabled: true },
  { id: 'skrill', name: 'Skrill',        min: 10,    max: 5_000,   fee: '2.5%', time: 'Instant'  },
  { id: 'nett',   name: 'Neteller',      min: 10,    max: 5_000,   fee: '2.5%', time: 'Instant'  },
  { id: 'paypal', name: 'PayPal',        min: 10,    max: 2_500,   fee: '3.4%', time: 'Instant', disabled: true },
];

function ReviewDrawer({
  txn,
  onClose,
  onApprove,
  onReject,
}: {
  txn: Transaction;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [mode, setMode] = useState<'review' | 'reject'>('review');
  const [rejectReason, setRejectReason] = useState('');

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <div className="flex w-[420px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-panel)]">
        <div className="flex items-start justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <p className="module-title">{mode === 'reject' ? 'Reject Transaction' : 'Review Transaction'}</p>
            <p className="mt-0.5 font-mono text-[11px] text-fg3">{txn.id} · {txn.method}</p>
          </div>
          <button onClick={onClose} className="btn-ghost btn btn-xs rounded-md p-1.5"><X size={14} /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-r-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3.5">
            <p className="kpi-label mb-2">Client</p>
            <p className="text-[13px] font-semibold text-fg1">{txn.clientName}</p>
            <p className="font-mono text-[11px] text-fg3">{txn.clientId}</p>
          </div>

          <div className="rounded-r-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3.5">
            <p className="kpi-label mb-3">Transaction Details</p>
            {([
              ['Type',      txn.type],
              ['Amount',    `$${txn.amount.toLocaleString()} ${txn.currency}`],
              ['Method',    txn.method],
              ['Reference', txn.reference],
              ['Submitted', txn.createdAt],
            ] as [string, string][]).map(([l, v]) => (
              <div key={l} className="flex justify-between border-b border-[var(--border)] py-1.5 last:border-0">
                <span className="text-[11px] text-fg3">{l}</span>
                <span className="font-mono text-[11px] text-fg1">{v}</span>
              </div>
            ))}
          </div>

          {txn.flagged && (
            <div className="flex items-start gap-2 rounded-r-lg border border-bear/30 bg-bear/10 p-3">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-bear" />
              <p className="text-[11px] text-bear">{txn.notes ?? 'Transaction flagged for manual review'}</p>
            </div>
          )}

          {mode === 'reject' && (
            <div>
              <p className="kpi-label mb-2">Rejection Reason</p>
              <select className="input" value={rejectReason} onChange={e => setRejectReason(e.target.value)}>
                <option value="">Select reason...</option>
                {['KYC not verified', 'Suspicious activity', 'Method not verified', 'Exceeds limit', 'Account suspended', 'Insufficient balance', 'Other'].map(r => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-[var(--border)] px-5 py-3">
          {mode === 'review' ? (
            <>
              <button className="btn-primary btn flex-1" onClick={() => onApprove(txn.id)}>
                <CheckCircle size={13} /> Approve
              </button>
              <button className="btn-danger btn flex-1" onClick={() => setMode('reject')}>
                <XCircle size={13} /> Reject
              </button>
            </>
          ) : (
            <>
              <button className="btn-ghost btn" onClick={() => setMode('review')}>Back</button>
              <button
                className="btn-danger btn flex-1"
                disabled={!rejectReason}
                onClick={() => onReject(txn.id)}
              >
                Confirm Reject
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PaymentMethodsGrid() {
  const [methods, setMethods] = useState(PAYMENT_METHODS_CONFIG.map(m => ({ ...m, enabled: !m.disabled })));
  const toggle = (id: string) => setMethods(prev => prev.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m));

  return (
    <div className="grid grid-cols-4 gap-3">
      {methods.map(m => (
        <div key={m.id} className={`card p-4 transition-opacity ${m.enabled ? 'opacity-100' : 'opacity-50'}`}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[12px] font-semibold text-fg1">{m.name}</p>
            <button
              onClick={() => toggle(m.id)}
              className={`relative h-5 w-9 rounded-full transition-colors ${m.enabled ? 'bg-bull/30' : 'bg-[var(--border-md)]'}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${m.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {[['Min', `$${m.min.toLocaleString()}`], ['Max', `$${m.max.toLocaleString()}`], ['Fee', m.fee], ['Time', m.time]].map(([l, v]) => (
            <div key={l} className="flex justify-between py-0.5">
              <span className="text-[10px] text-fg3">{l}</span>
              <span className="font-mono text-[10px] text-fg2">{v as string}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function TransactionsPage() {
  const { transactions, approveTx, rejectTx } = useTransactionsApi();
  const [tab, setTab]             = useState('Pending');
  const [subTab, setSubTab]       = useState<'queue' | 'methods'>('queue');
  const [reviewing, setReviewing] = useState<Transaction | null>(null);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);

  const currentFilter = STATUS_TABS.find(t => t.label === tab)!.filter;
  const displayed = useMemo(() => transactions.filter(currentFilter), [transactions, tab, currentFilter]);
  const allSelected = displayed.length > 0 && displayed.every(t => selected.has(t.id));

  const handleApprove = (id: string) => {
    const txn = transactions.find(t => t.id === id);
    if (!txn) return;
    const kind = txn.type === 'Deposit' ? 'deposit' : 'withdrawal';
    approveTx(id, kind);
    setReviewing(null);
  };
  const handleReject  = (id: string) => {
    const txn = transactions.find(t => t.id === id);
    if (!txn) return;
    const kind = txn.type === 'Deposit' ? 'deposit' : 'withdrawal';
    rejectTx(id, kind);
    setReviewing(null);
  };

  const handleBulkApprove = () => {
    displayed.filter(t => selected.has(t.id) && t.status === 'Pending').forEach(txn => {
      const kind = txn.type === 'Deposit' ? 'deposit' : 'withdrawal';
      approveTx(txn.id, kind);
    });
    setSelected(new Set());
    setBulkConfirm(false);
  };

  const toggleRow = (id: string) => setSelected(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Transactions</p>
          <p className="module-subtitle">
            {transactions.filter(t => t.status === 'Pending').length} pending ·{' '}
            {transactions.filter(t => t.flagged).length} flagged
          </p>
        </div>
        <div className="flex gap-2">
          <button className={subTab === 'queue'   ? 'btn-primary btn btn-sm' : 'btn-ghost btn btn-sm'} onClick={() => setSubTab('queue')}>Queue</button>
          <button className={subTab === 'methods' ? 'btn-primary btn btn-sm' : 'btn-ghost btn btn-sm'} onClick={() => setSubTab('methods')}>Payment Methods</button>
        </div>
      </div>

      <div className="p-6">
        {subTab === 'methods' ? (
          <>
            <p className="kpi-label mb-4">Enabled Payment Channels</p>
            <PaymentMethodsGrid />
          </>
        ) : (
          <>
            <div className="chart-tabs mb-4">
              {STATUS_TABS.map(t => {
                const cnt = transactions.filter(t.filter).length;
                return (
                  <button key={t.label} className={`chart-tab ${tab === t.label ? 'active' : ''}`}
                    onClick={() => { setTab(t.label); setSelected(new Set()); }}>
                    {t.label}
                    {cnt > 0 && <span className="ml-1.5 rounded-full bg-[var(--bg-hover)] px-1.5 font-mono text-[9px]">{cnt}</span>}
                  </button>
                );
              })}
            </div>

            {selected.size > 0 && (
              <div className="mb-3 flex items-center gap-3 rounded-r-lg border border-accent/30 bg-accent/10 px-4 py-2.5">
                <span className="text-[12px] font-semibold text-accent">{selected.size} selected</span>
                <button className="btn-primary btn btn-sm" onClick={() => setBulkConfirm(true)}>
                  <CheckCircle size={12} /> Approve {selected.size}
                </button>
                <button className="btn-ghost btn btn-xs" onClick={() => setSelected(new Set())}>Clear</button>
              </div>
            )}

            <div className="card overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-9">
                      <input type="checkbox" checked={allSelected} className="accent-accent"
                        onChange={() => allSelected
                          ? setSelected(new Set())
                          : setSelected(new Set(displayed.filter(t => t.status === 'Pending').map(t => t.id)))}
                      />
                    </th>
                    <th>Client</th>
                    <th>Type</th>
                    <th>Method</th>
                    <th>Amount</th>
                    <th>Reference</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-[12px] text-fg3">
                        No {tab.toLowerCase()} transactions
                      </td>
                    </tr>
                  ) : displayed.map(txn => (
                    <tr key={txn.id} className="cursor-pointer" onClick={() => setReviewing(txn)}>
                      <td onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(txn.id)} className="accent-accent"
                          disabled={txn.status !== 'Pending'}
                          onChange={() => toggleRow(txn.id)} />
                      </td>
                      <td>
                        <p className="text-[12px] font-medium text-fg1">{txn.clientName}</p>
                        <p className="mono-cell text-[10px] text-fg3">{txn.clientId}</p>
                      </td>
                      <td><span className={TYPE_BADGE[txn.type] ?? 'badge badge-muted'}>{txn.type}</span></td>
                      <td className="text-[11px] text-fg2">{txn.method}</td>
                      <td>
                        <span className={`mono-cell font-bold ${txn.type === 'Withdrawal' ? 'text-bear' : txn.type === 'Deposit' ? 'text-bull' : 'text-fg1'}`}>
                          {txn.type === 'Withdrawal' ? '-' : '+'}${txn.amount.toLocaleString()}
                        </span>
                        {txn.flagged && <AlertTriangle size={11} className="ml-1 inline text-warn" />}
                      </td>
                      <td className="mono-cell text-[11px] text-fg3">{txn.reference}</td>
                      <td className="mono-cell text-[10px] text-fg3">{txn.createdAt}</td>
                      <td><span className={STATUS_BADGE[txn.status] ?? 'badge badge-muted'}>{txn.status}</span></td>
                      <td onClick={e => e.stopPropagation()}>
                        {(txn.status === 'Pending' || txn.status === 'Processing') ? (
                          <button className="btn-ghost btn btn-xs" onClick={() => setReviewing(txn)}>
                            Review <ChevronRight size={10} />
                          </button>
                        ) : <span className="text-[10px] text-fg3">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {reviewing && (
        <ReviewDrawer txn={reviewing} onClose={() => setReviewing(null)} onApprove={handleApprove} onReject={handleReject} />
      )}

      {bulkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="card w-80 p-6">
            <p className="module-title mb-2">Confirm Bulk Approve</p>
            <p className="mb-5 text-[12px] text-fg2">
              Approve {selected.size} transaction{selected.size !== 1 ? 's' : ''} totaling{' '}
              <span className="font-mono font-bold text-bull">
                ${displayed.filter(t => selected.has(t.id)).reduce((s, t) => s + t.amount, 0).toLocaleString()}
              </span>?
            </p>
            <div className="flex gap-2">
              <button className="btn-ghost btn flex-1" onClick={() => setBulkConfirm(false)}>Cancel</button>
              <button className="btn-primary btn flex-1" onClick={handleBulkApprove}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
