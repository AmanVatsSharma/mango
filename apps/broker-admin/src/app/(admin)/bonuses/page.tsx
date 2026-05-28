/**
 * File:        apps/broker-admin/src/app/(admin)/bonuses/page.tsx
 * Module:      broker-admin · Finance · Bonus Management
 * Purpose:     Bonus campaign administration and active client bonus monitoring
 *
 * Exports:
 *   - default (BonusesPage) — two sub-tabs: Campaigns and Active Bonuses
 *
 * Depends on:
 *   - @/lib/mock-data-context — useBrokerData() for bonuses (campaign definitions)
 *
 * Side-effects:
 *   - Local state for active bonus records; campaign toggles update local copy
 *
 * Key invariants:
 *   - Wagering progress bar: progress / wagering * 100
 *   - Expiry countdown uses fixed reference date 2024-01-15 for demo consistency
 *   - amountType 'Percentage' rendered as X%; 'Fixed' as $X
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState, useMemo } from 'react';
import { Plus, Gift } from 'lucide-react';
import { useBrokerData } from '@/lib/mock-data-context';
import { useBonuses } from '@/lib/api/hooks/use-bonuses';
import type { Bonus } from '@/lib/types';

const TYPE_BADGE: Record<string, string> = {
  Welcome:    'badge badge-bull',
  Deposit:    'badge badge-accent',
  'No Deposit': 'badge badge-gold',
  Loyalty:    'badge badge-purple',
  Referral:   'badge badge-muted',
  Cashback:   'badge badge-muted',
  Contest:    'badge badge-warn',
};

const STATUS_BADGE: Record<Bonus['status'], string> = {
  Active:    'status-active',
  Inactive:  'badge badge-muted',
  Expired:   'status-suspended',
  Scheduled: 'status-pending',
};

const REF_DATE = new Date('2024-01-15');

function daysLeft(dateStr?: string): number {
  if (!dateStr) return 999;
  return Math.ceil((new Date(dateStr).getTime() - REF_DATE.getTime()) / 86_400_000);
}

function ExpiryBadge({ endDate }: { endDate?: string }) {
  if (!endDate) return <span className="text-[10px] text-fg3">No expiry</span>;
  const d = daysLeft(endDate);
  if (d <= 0)  return <span className="status-suspended text-[10px]">Expired</span>;
  if (d <= 7)  return <span className="status-suspended text-[10px]">{d}d left</span>;
  if (d <= 14) return <span className="status-pending text-[10px]">{d}d left</span>;
  return <span className="mono-cell text-[10px] text-fg3">{d}d left</span>;
}

// Active client bonuses (derived from context bonuses + clients)
const ACTIVE_BONUSES = [
  { id: 'AB001', clientName: 'Fatima Al-Rashidi', clientId: 'C1002', type: 'Deposit Match', amount: 500, wagering: 10_000, progress: 6_240, endDate: '2024-02-28' },
  { id: 'AB002', clientName: 'James Okafor',      clientId: 'C1003', type: 'No Deposit',    amount: 200, wagering: 8_000,  progress: 3_150, endDate: '2024-01-31' },
  { id: 'AB003', clientName: 'Lucas Oliveira',    clientId: 'C1006', type: 'Loyalty',       amount: 150, wagering: 5_000,  progress: 4_800, endDate: '2024-03-15' },
  { id: 'AB004', clientName: 'Anna Kowalski',     clientId: 'C1010', type: 'Welcome',       amount: 50,  wagering: 2_000,  progress: 420,   endDate: '2024-02-13' },
  { id: 'AB005', clientName: 'Grace Osei',        clientId: 'C1019', type: 'Referral',      amount: 100, wagering: 3_000,  progress: 2_940, endDate: '2024-01-30' },
];

function WageringBar({ progress, wagering }: { progress: number; wagering: number }) {
  const pct = Math.min(100, (progress / wagering) * 100);
  const color = pct >= 100 ? 'bg-bull' : pct >= 60 ? 'bg-accent' : 'bg-[var(--fg3)]';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-[var(--bg-elevated)]">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`mono-cell text-[10px] ${pct >= 100 ? 'text-bull' : pct >= 60 ? 'text-accent' : 'text-fg3'}`}>
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

function CampaignsList({ bonuses, onToggle }: { bonuses: Bonus[]; onToggle: (id: string) => void }) {
  return (
    <div className="card overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>On</th>
            <th>Campaign</th>
            <th>Type</th>
            <th>Value</th>
            <th>Min Deposit</th>
            <th>Max Bonus</th>
            <th>Turnover</th>
            <th>Claimed</th>
            <th>Awarded</th>
            <th>Groups</th>
            <th>Dates</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {bonuses.map(b => (
            <tr key={b.id}>
              <td>
                <button
                  onClick={() => onToggle(b.id)}
                  className={`relative h-5 w-9 rounded-full transition-colors ${b.status === 'Active' ? 'bg-bull/30' : 'bg-[var(--border-md)]'}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${b.status === 'Active' ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </td>
              <td>
                <div className="flex items-center gap-2">
                  <Gift size={12} className="shrink-0 text-fg3" />
                  <p className="text-[12px] font-medium text-fg1">{b.name}</p>
                </div>
              </td>
              <td><span className={TYPE_BADGE[b.type] ?? 'badge badge-muted'}>{b.type}</span></td>
              <td className="mono-cell font-bold text-[12px] text-bull">
                {b.amountType === 'Percentage' ? `${b.amount}%` : `$${b.amount}`}
              </td>
              <td className="mono-cell text-[11px] text-fg2">{b.minDeposit ? `$${b.minDeposit}` : '—'}</td>
              <td className="mono-cell text-[11px] text-fg2">{b.maxBonus ? `$${b.maxBonus}` : '—'}</td>
              <td className="mono-cell text-[11px] text-fg2">{b.turnoverMultiple}×</td>
              <td className="mono-cell text-[11px] text-fg1">{b.claimedCount}</td>
              <td className="delta-positive mono-cell">${b.totalAwarded.toLocaleString()}</td>
              <td>
                <div className="flex flex-wrap gap-1">
                  {b.eligibleGroups.map(g => <span key={g} className="badge badge-muted">{g}</span>)}
                </div>
              </td>
              <td>
                <p className="mono-cell text-[10px] text-fg3">{b.startDate}</p>
                {b.endDate && <ExpiryBadge endDate={b.endDate} />}
              </td>
              <td><span className={STATUS_BADGE[b.status]}>{b.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActiveBonusesList() {
  return (
    <div className="card overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Type</th>
            <th>Bonus Amount</th>
            <th>Wagering Progress</th>
            <th>Wagering Req.</th>
            <th>Expiry</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {ACTIVE_BONUSES.map(b => (
            <tr key={b.id}>
              <td>
                <p className="text-[12px] font-medium text-fg1">{b.clientName}</p>
                <p className="mono-cell text-[10px] text-fg3">{b.clientId}</p>
              </td>
              <td><span className={TYPE_BADGE[b.type] ?? 'badge badge-muted'}>{b.type}</span></td>
              <td className="delta-positive mono-cell">${b.amount}</td>
              <td><WageringBar progress={b.progress} wagering={b.wagering} /></td>
              <td className="mono-cell text-[11px] text-fg2">${b.progress.toLocaleString()} / ${b.wagering.toLocaleString()}</td>
              <td><ExpiryBadge endDate={b.endDate} /></td>
              <td>
                <button className="btn-danger btn btn-xs">Revoke</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BonusesPage() {
  const { bonuses: apiBonuses, isLoading: apiLoading, updateBonus, deactivateBonus } = useBonuses();
  const { bonuses: contextBonuses } = useBrokerData();
  // Prefer API data when loaded; fall back to context mock data
  const initial = apiLoading || apiBonuses.length === 0 ? contextBonuses : apiBonuses;
  const [bonuses, setBonuses] = useState<Bonus[]>(initial);
  const [subTab, setSubTab] = useState<'campaigns' | 'active'>('campaigns');

  // Sync API data into local state when it arrives
  if (!apiLoading && apiBonuses.length > 0 && bonuses !== apiBonuses) {
    setBonuses(apiBonuses);
  }

  const toggle = (id: string) => {
    const current = bonuses.find(b => b.id === id);
    if (!current) return;
    if (current.status === 'Active') {
      deactivateBonus(id);
      setBonuses(prev => prev.map(b => b.id === id ? { ...b, status: 'Inactive' } : b));
    } else {
      updateBonus(id, { name: current.name, type: current.type, amount: current.amount, amountType: current.amountType, minDeposit: current.minDeposit, maxBonus: current.maxBonus, turnoverMultiple: current.turnoverMultiple, startDate: current.startDate, endDate: current.endDate, eligibleGroups: current.eligibleGroups });
      setBonuses(prev => prev.map(b => b.id === id ? { ...b, status: 'Active' } : b));
    }
  };

  const activeCampaigns  = useMemo(() => bonuses.filter(b => b.status === 'Active'), [bonuses]);
  const totalAwarded = useMemo(() => bonuses.reduce((s, b) => s + b.totalAwarded, 0), [bonuses]);

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Bonus Management</p>
          <p className="module-subtitle">
            {activeCampaigns.length} active campaigns · ${totalAwarded.toLocaleString()} total awarded
          </p>
        </div>
        <div className="flex gap-2">
          <button className={subTab === 'campaigns' ? 'btn-primary btn btn-sm' : 'btn-ghost btn btn-sm'} onClick={() => setSubTab('campaigns')}>
            Campaigns ({bonuses.length})
          </button>
          <button className={subTab === 'active' ? 'btn-primary btn btn-sm' : 'btn-ghost btn btn-sm'} onClick={() => setSubTab('active')}>
            Active Bonuses ({ACTIVE_BONUSES.length})
          </button>
          <button className="btn-primary btn btn-sm"><Plus size={13} /> New Campaign</button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Active Campaigns', value: activeCampaigns.length,                   color: 'text-bull'   },
            { label: 'Total Claimed',    value: bonuses.reduce((s,b) => s+b.claimedCount, 0), color: 'text-fg1' },
            { label: 'Total Awarded',    value: `$${totalAwarded.toLocaleString()}`,       color: 'text-warn'   },
            { label: 'Active Bonuses',   value: ACTIVE_BONUSES.length,                    color: 'text-accent' },
          ].map(k => (
            <div key={k.label} className="kpi-card">
              <p className="kpi-label">{k.label}</p>
              <p className={`kpi-value ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>

        {subTab === 'campaigns'
          ? <CampaignsList bonuses={bonuses} onToggle={toggle} />
          : <ActiveBonusesList />}
      </div>
    </div>
  );
}
