/**
 * File:        apps/broker-admin/src/app/(admin)/promotions/page.tsx
 * Module:      broker-admin · CRM · Promotions
 * Purpose:     Campaign management, promotional offer creation, and conversion tracking
 *
 * Exports:
 *   - default (PromotionsPage) — three tabs: Campaigns | Banners | Leaderboard
 *
 * Depends on:
 *   - none (all data is local constants)
 *
 * Side-effects:
 *   - Local state only; toggles and status changes do not persist
 *
 * Key invariants:
 *   - Campaign budget is total allocated; spent tracks actual payouts
 *   - Conversion = participants who completed the qualifying action (deposit, trade, etc.)
 *   - Leaderboard contest resets on period end; prize pool auto-distributes to top N ranks
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState } from 'react';
import { Megaphone, Image, Trophy, Plus, Eye } from 'lucide-react';
import { usePromotions } from '@/lib/api/hooks/use-promotions';

type CampaignStatus = 'Active' | 'Scheduled' | 'Ended' | 'Draft';

type Campaign = {
  id: string;
  name: string;
  type: 'Deposit Bonus' | 'No-Deposit Bonus' | 'Cashback' | 'Rebate' | 'Referral' | 'Trading Contest';
  targetAudience: 'All Clients' | 'New Clients' | 'VIP' | 'Dormant' | 'IB Clients';
  status: CampaignStatus;
  startDate: string;
  endDate: string;
  budget: number;
  spent: number;
  participants: number;
  conversions: number;
  rewardType: string;
  rewardValue: string;
};

type Banner = {
  id: string;
  name: string;
  placement: 'Dashboard' | 'Login' | 'Deposit' | 'Email Header' | 'Mobile Push';
  status: 'Live' | 'Paused' | 'Scheduled';
  clicks: number;
  impressions: number;
  linkedCampaign: string;
  startDate: string;
  endDate: string;
};

type LeaderEntry = {
  rank: number;
  clientName: string;
  clientId: string;
  metric: number;
  prize: number;
  change: number;
};

const INIT_CAMPAIGNS: Campaign[] = [
  {
    id: 'C001', name: 'January Welcome Bonus', type: 'Deposit Bonus', targetAudience: 'New Clients',
    status: 'Active', startDate: '2024-01-01', endDate: '2024-01-31', budget: 50_000, spent: 18_420,
    participants: 142, conversions: 98, rewardType: '30% match bonus', rewardValue: 'Up to $500',
  },
  {
    id: 'C002', name: 'VIP Cashback February', type: 'Cashback', targetAudience: 'VIP',
    status: 'Scheduled', startDate: '2024-02-01', endDate: '2024-02-29', budget: 30_000, spent: 0,
    participants: 0, conversions: 0, rewardType: '5% spread cashback', rewardValue: 'Up to $1,000',
  },
  {
    id: 'C003', name: 'Q4 Trading Blitz', type: 'Trading Contest', targetAudience: 'All Clients',
    status: 'Ended', startDate: '2023-10-01', endDate: '2023-12-31', budget: 20_000, spent: 20_000,
    participants: 284, conversions: 284, rewardType: 'Prize pool distribution', rewardValue: '$20,000 prize pool',
  },
  {
    id: 'C004', name: 'Referral Sprint', type: 'Referral', targetAudience: 'All Clients',
    status: 'Active', startDate: '2024-01-10', endDate: '2024-03-10', budget: 15_000, spent: 4_200,
    participants: 67, conversions: 28, rewardType: '$50 per referral deposit', rewardValue: 'Unlimited',
  },
  {
    id: 'C005', name: 'No-Deposit Starter', type: 'No-Deposit Bonus', targetAudience: 'New Clients',
    status: 'Draft', startDate: '2024-02-15', endDate: '2024-03-15', budget: 5_000, spent: 0,
    participants: 0, conversions: 0, rewardType: '$25 free credit', rewardValue: '$25',
  },
  {
    id: 'C006', name: 'IB Volume Rebate', type: 'Rebate', targetAudience: 'IB Clients',
    status: 'Active', startDate: '2024-01-01', endDate: '2024-12-31', budget: 80_000, spent: 12_840,
    participants: 18, conversions: 18, rewardType: '$0.50/lot rebate', rewardValue: 'Per lot traded',
  },
];

const INIT_BANNERS: Banner[] = [
  { id: 'B001', name: 'Welcome Bonus Hero',   placement: 'Login',       status: 'Live',      clicks: 1_842, impressions: 24_100, linkedCampaign: 'January Welcome Bonus', startDate: '2024-01-01', endDate: '2024-01-31' },
  { id: 'B002', name: 'VIP Cashback Strip',   placement: 'Dashboard',   status: 'Scheduled', clicks: 0,     impressions: 0,      linkedCampaign: 'VIP Cashback February',  startDate: '2024-02-01', endDate: '2024-02-29' },
  { id: 'B003', name: 'Referral Sprint Card', placement: 'Dashboard',   status: 'Live',      clicks: 640,   impressions: 8_420,  linkedCampaign: 'Referral Sprint',        startDate: '2024-01-10', endDate: '2024-03-10' },
  { id: 'B004', name: 'Deposit CTA Banner',   placement: 'Deposit',     status: 'Live',      clicks: 2_140, impressions: 18_600, linkedCampaign: 'January Welcome Bonus', startDate: '2024-01-01', endDate: '2024-01-31' },
  { id: 'B005', name: 'IB Rebate Push',       placement: 'Mobile Push', status: 'Paused',    clicks: 182,   impressions: 3_100,  linkedCampaign: 'IB Volume Rebate',      startDate: '2024-01-05', endDate: '2024-01-15' },
];

const LEADERBOARD: LeaderEntry[] = [
  { rank: 1, clientName: 'Wei Zhang',          clientId: 'C1005', metric: 184.2, prize: 5_000, change:  0 },
  { rank: 2, clientName: 'Alexander Mitchell', clientId: 'C1001', metric: 142.8, prize: 3_000, change:  1 },
  { rank: 3, clientName: 'Carlos Mendez',      clientId: 'C1022', metric: 118.4, prize: 2_000, change: -1 },
  { rank: 4, clientName: 'Fatima Al-Rashidi',  clientId: 'C1002', metric: 98.1,  prize: 1_000, change:  1 },
  { rank: 5, clientName: 'Anna Kowalski',      clientId: 'C1010', metric: 87.6,  prize: 1_000, change:  0 },
  { rank: 6, clientName: 'Priya Sharma',       clientId: 'C1007', metric: 74.2,  prize: 500,   change:  2 },
  { rank: 7, clientName: 'James Okafor',       clientId: 'C1003', metric: 62.8,  prize: 500,   change: -2 },
  { rank: 8, clientName: 'David Thompson',     clientId: 'C1011', metric: 51.4,  prize: 0,     change:  0 },
];

const STATUS_BADGE: Record<CampaignStatus, string> = {
  Active:    'status-active',
  Scheduled: 'status-pending',
  Ended:     'badge badge-muted',
  Draft:     'badge badge-muted',
};

const BANNER_STATUS: Record<Banner['status'], string> = {
  Live:      'status-active',
  Paused:    'status-pending',
  Scheduled: 'badge badge-muted',
};

const TYPE_BADGE: Record<Campaign['type'], string> = {
  'Deposit Bonus':     'badge-bull',
  'No-Deposit Bonus':  'badge-accent',
  'Cashback':          'badge-warn',
  'Rebate':            'badge-purple',
  'Referral':          'badge-gold',
  'Trading Contest':   'badge-bear',
};

function ctr(clicks: number, impressions: number) {
  return impressions > 0 ? ((clicks / impressions) * 100).toFixed(1) : '—';
}

function convRate(c: Campaign) {
  return c.participants > 0 ? Math.round((c.conversions / c.participants) * 100) : 0;
}

function budgetPct(c: Campaign) {
  return c.budget > 0 ? Math.round((c.spent / c.budget) * 100) : 0;
}

function fmtK(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export default function PromotionsPage() {
  const { promotions: apiPromotions, isLoading: apiLoading, updatePromotion } = usePromotions();
  const [tab, setTab] = useState<'campaigns' | 'banners' | 'leaderboard'>('campaigns');
  // Merge: prefer API data when available, fall back to local constants
  const [campaigns, setCampaigns] = useState<Campaign[]>(
    apiLoading || apiPromotions.length === 0 ? INIT_CAMPAIGNS : (apiPromotions as unknown as Campaign[])
  );
  const [banners, setBanners] = useState<Banner[]>(INIT_BANNERS);
  const [selected, setSelected] = useState<Campaign | null>(null);

  // Sync API data into local state when it arrives
  if (!apiLoading && apiPromotions.length > 0 && campaigns === INIT_CAMPAIGNS) {
    setCampaigns(apiPromotions as unknown as Campaign[]);
  }

  const activeCampaigns = campaigns.filter(c => c.status === 'Active');
  const totalBudget = campaigns.reduce((s, c) => s + c.budget, 0);
  const totalSpent = campaigns.reduce((s, c) => s + c.spent, 0);

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Promotions</p>
          <p className="module-subtitle">
            {activeCampaigns.length} active campaigns · {fmtK(totalSpent)} spent of {fmtK(totalBudget)} budget
          </p>
        </div>
        <button className="btn-primary btn btn-sm"><Plus size={13} /> New Campaign</button>
      </div>

      <div className="p-6 space-y-4">
        {/* KPI strip */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Active Campaigns', value: activeCampaigns.length,                                                   color: 'text-bull',   icon: <Megaphone size={13} className="text-bull" /> },
            { label: 'Total Participants',value: campaigns.reduce((s, c) => s + c.participants, 0).toLocaleString(),       color: 'text-accent', icon: null },
            { label: 'Total Budget',      value: fmtK(totalBudget),                                                        color: 'text-fg1',    icon: null },
            { label: 'Spent',             value: fmtK(totalSpent),                                                         color: 'text-warn',   icon: null },
            { label: 'Live Banners',      value: banners.filter(b => b.status === 'Live').length,                          color: 'text-accent', icon: <Image size={13} className="text-accent" /> },
          ].map(k => (
            <div key={k.label} className="kpi-card">
              <div className="flex items-center justify-between">
                <p className="kpi-label">{k.label}</p>
                {k.icon}
              </div>
              <p className={`kpi-value ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="chart-tabs">
          <button className={`chart-tab ${tab === 'campaigns' ? 'active' : ''}`} onClick={() => setTab('campaigns')}>
            Campaigns <span className="ml-1 font-mono text-[9px] text-fg3">{campaigns.length}</span>
          </button>
          <button className={`chart-tab ${tab === 'banners' ? 'active' : ''}`} onClick={() => setTab('banners')}>
            Banners <span className="ml-1 font-mono text-[9px] text-fg3">{banners.length}</span>
          </button>
          <button className={`chart-tab ${tab === 'leaderboard' ? 'active' : ''}`} onClick={() => setTab('leaderboard')}>
            <Trophy size={11} className="inline mr-1" />Leaderboard
          </button>
        </div>

        {/* ── Campaigns Tab ── */}
        {tab === 'campaigns' && (
          <div className={`grid gap-4 ${selected ? 'grid-cols-[1fr_340px]' : 'grid-cols-1'}`}>
            <div className="space-y-2">
              {campaigns.map(c => {
                const bp = budgetPct(c);
                const cr = convRate(c);
                return (
                  <div
                    key={c.id}
                    className={`card p-4 cursor-pointer transition-colors hover:border-[var(--border-hi)] ${selected?.id === c.id ? 'border-accent/40 bg-accent/5' : ''} ${c.status === 'Ended' || c.status === 'Draft' ? 'opacity-70' : ''}`}
                    onClick={() => setSelected(selected?.id === c.id ? null : c)}
                  >
                    <div className="flex items-start gap-3">
                      <Megaphone size={14} className={c.status === 'Active' ? 'text-bull mt-0.5 shrink-0' : 'text-fg3 mt-0.5 shrink-0'} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[12px] font-semibold text-fg1">{c.name}</p>
                          <span className={`badge ${TYPE_BADGE[c.type]}`}>{c.type}</span>
                          <span className={c.status === 'Active' ? 'status-active' : c.status === 'Scheduled' ? 'status-pending' : 'badge badge-muted'}>
                            {c.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-[10px] text-fg3 mb-2">
                          <span>Target: <span className="text-fg2">{c.targetAudience}</span></span>
                          <span>{c.startDate} → {c.endDate}</span>
                          <span>Reward: <span className="text-fg2">{c.rewardValue}</span></span>
                        </div>
                        {/* Budget bar */}
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-1 rounded-full bg-[var(--bg-elevated)]">
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${Math.min(bp, 100)}%`, backgroundColor: bp > 90 ? 'var(--bear)' : bp > 70 ? 'var(--warn)' : 'var(--bull)' }} />
                          </div>
                          <span className="text-[9px] text-fg3 whitespace-nowrap">{fmtK(c.spent)} / {fmtK(c.budget)} ({bp}%)</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="mono-cell text-[11px] text-fg2">{c.participants} participants</p>
                        <p className={`mono-cell text-[11px] font-semibold ${cr >= 60 ? 'text-bull' : cr >= 40 ? 'text-accent' : 'text-warn'}`}>
                          {cr}% conv.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Campaign detail */}
            {selected && (
              <div className="card p-0 overflow-hidden flex flex-col">
                <div className="border-b border-[var(--border)] px-4 py-3">
                  <p className="text-[12px] font-semibold text-fg1">{selected.name}</p>
                  <p className="text-[10px] text-fg3 mt-0.5">{selected.rewardType}</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 text-[11px]">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Status',      value: selected.status },
                      { label: 'Type',        value: selected.type },
                      { label: 'Audience',    value: selected.targetAudience },
                      { label: 'Reward',      value: selected.rewardValue },
                      { label: 'Start',       value: selected.startDate },
                      { label: 'End',         value: selected.endDate },
                    ].map(f => (
                      <div key={f.label} className="rounded border border-[var(--border)] px-2 py-1.5">
                        <p className="text-[9px] text-fg3 uppercase tracking-wider">{f.label}</p>
                        <p className="text-[11px] font-medium text-fg1 mt-0.5">{f.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-fg3">PERFORMANCE</p>
                    {[
                      { label: 'Budget',       value: fmtK(selected.budget), color: 'text-fg1' },
                      { label: 'Spent',        value: fmtK(selected.spent),  color: budgetPct(selected) > 80 ? 'text-warn' : 'text-fg1' },
                      { label: 'Participants', value: selected.participants,  color: 'text-accent' },
                      { label: 'Conversions',  value: selected.conversions,  color: 'text-bull' },
                      { label: 'Conv. Rate',   value: `${convRate(selected)}%`, color: convRate(selected) >= 60 ? 'text-bull' : 'text-warn' },
                    ].map(f => (
                      <div key={f.label} className="flex justify-between">
                        <span className="text-fg3">{f.label}</span>
                        <span className={`mono-cell font-semibold ${f.color}`}>{f.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[var(--bg-elevated)]">
                    <div className="h-full rounded-full bg-bull"
                      style={{ width: `${Math.min(budgetPct(selected), 100)}%` }} />
                  </div>
                </div>
                <div className="flex gap-2 border-t border-[var(--border)] p-3">
                  <button className="btn-ghost btn btn-sm flex-1">Edit</button>
                  {selected.status === 'Active' && (
                    <button className="btn-danger btn btn-sm"
                      onClick={() => {
                        updatePromotion(selected.id, { status: 'Ended' });
                        setCampaigns(cs => cs.map(c => c.id === selected.id ? { ...c, status: 'Ended' } : c));
                        setSelected(null);
                      }}>
                      End Now
                    </button>
                  )}
                  {selected.status === 'Draft' && (
                    <button className="btn-primary btn btn-sm"
                      onClick={() => {
                        updatePromotion(selected.id, { status: 'Active' });
                        setCampaigns(cs => cs.map(c => c.id === selected.id ? { ...c, status: 'Active' } : c));
                      }}>
                      Launch
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Banners Tab ── */}
        {tab === 'banners' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-fg3">
                {banners.filter(b => b.status === 'Live').length} live ·{' '}
                {banners.reduce((s, b) => s + b.impressions, 0).toLocaleString()} total impressions
              </p>
              <button className="btn-primary btn btn-sm"><Plus size={13} /> Upload Banner</button>
            </div>
            <div className="card overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Banner</th>
                    <th>Placement</th>
                    <th>Linked Campaign</th>
                    <th>Status</th>
                    <th>Impressions</th>
                    <th>Clicks</th>
                    <th>CTR</th>
                    <th>Period</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {banners.map(b => (
                    <tr key={b.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-14 rounded border border-[var(--border)] bg-[var(--bg-elevated)] flex items-center justify-center">
                            <Image size={12} className="text-fg3" />
                          </div>
                          <p className="text-[11px] font-medium text-fg1">{b.name}</p>
                        </div>
                      </td>
                      <td><span className="badge badge-muted">{b.placement}</span></td>
                      <td className="text-[10px] text-fg3 max-w-[120px] truncate">{b.linkedCampaign}</td>
                      <td><span className={BANNER_STATUS[b.status]}>{b.status}</span></td>
                      <td className="mono-cell text-[11px] text-fg2">{b.impressions.toLocaleString()}</td>
                      <td className="mono-cell text-[11px] text-fg1 font-semibold">{b.clicks.toLocaleString()}</td>
                      <td className={`mono-cell font-bold text-[12px] ${parseFloat(ctr(b.clicks, b.impressions)) >= 7 ? 'text-bull' : parseFloat(ctr(b.clicks, b.impressions)) >= 4 ? 'text-accent' : 'text-fg2'}`}>
                        {ctr(b.clicks, b.impressions)}%
                      </td>
                      <td className="mono-cell text-[10px] text-fg3">{b.startDate} → {b.endDate}</td>
                      <td>
                        <div className="flex gap-1">
                          <button className="btn-ghost btn btn-xs"><Eye size={10} /></button>
                          <button className="btn-ghost btn btn-xs"
                            onClick={() => setBanners(bs => bs.map(x => x.id === b.id ? { ...x, status: x.status === 'Live' ? 'Paused' : 'Live' } : x))}>
                            {b.status === 'Live' ? 'Pause' : 'Go Live'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Leaderboard Tab ── */}
        {tab === 'leaderboard' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-semibold text-fg1">Q4 2023 Trading Blitz</p>
                <p className="text-[10px] text-fg3">Contest ended Dec 31, 2023 · $20,000 prize pool distributed</p>
              </div>
              <span className="badge badge-muted">Ended</span>
            </div>

            {/* Prize pool breakdown */}
            <div className="grid grid-cols-3 gap-3">
              <div className="card p-4 flex items-center gap-3">
                <span className="text-2xl">🥇</span>
                <div>
                  <p className="kpi-label">1st Place</p>
                  <p className="kpi-value text-gold">$5,000</p>
                  <p className="text-[10px] text-fg3">Wei Zhang</p>
                </div>
              </div>
              <div className="card p-4 flex items-center gap-3">
                <span className="text-2xl">🥈</span>
                <div>
                  <p className="kpi-label">2nd Place</p>
                  <p className="kpi-value text-fg2">$3,000</p>
                  <p className="text-[10px] text-fg3">Alexander Mitchell</p>
                </div>
              </div>
              <div className="card p-4 flex items-center gap-3">
                <span className="text-2xl">🥉</span>
                <div>
                  <p className="kpi-label">3rd Place</p>
                  <p className="kpi-value text-warn">$2,000</p>
                  <p className="text-[10px] text-fg3">Carlos Mendez</p>
                </div>
              </div>
            </div>

            <div className="card overflow-x-auto">
              <div className="card-header">
                <p className="card-title">Final Rankings — Profit % Return</p>
                <p className="text-[11px] text-fg3">284 participants · ranked by % return on allocated contest balance</p>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Trader</th>
                    <th>Return %</th>
                    <th>Prize</th>
                    <th>Movement</th>
                  </tr>
                </thead>
                <tbody>
                  {LEADERBOARD.map(e => (
                    <tr key={e.rank}>
                      <td>
                        <div className="flex items-center gap-2">
                          {e.rank <= 3 && <span className="text-sm">{e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : '🥉'}</span>}
                          <span className={`mono-cell text-[12px] font-bold ${e.rank === 1 ? 'text-gold' : e.rank <= 3 ? 'text-accent' : 'text-fg2'}`}>
                            #{e.rank}
                          </span>
                        </div>
                      </td>
                      <td>
                        <p className="text-[12px] font-medium text-fg1">{e.clientName}</p>
                        <p className="mono-cell text-[10px] text-fg3">{e.clientId}</p>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 rounded-full bg-[var(--bg-elevated)]">
                            <div className="h-full rounded-full bg-bull"
                              style={{ width: `${Math.min((e.metric / 200) * 100, 100)}%` }} />
                          </div>
                          <span className="mono-cell font-bold text-[13px] text-bull">+{e.metric}%</span>
                        </div>
                      </td>
                      <td className={`mono-cell font-bold text-[12px] ${e.prize > 0 ? 'text-gold' : 'text-fg3'}`}>
                        {e.prize > 0 ? `$${e.prize.toLocaleString()}` : '—'}
                      </td>
                      <td>
                        {e.change > 0 && <span className="text-[10px] text-bull">▲ {e.change}</span>}
                        {e.change < 0 && <span className="text-[10px] text-bear">▼ {Math.abs(e.change)}</span>}
                        {e.change === 0 && <span className="text-[10px] text-fg3">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
