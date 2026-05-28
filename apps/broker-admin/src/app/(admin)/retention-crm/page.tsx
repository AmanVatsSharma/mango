/**
 * File:        apps/broker-admin/src/app/(admin)/retention-crm/page.tsx
 * Module:      broker-admin · CRM · Retention & Sales CRM
 * Purpose:     Lead pipeline, client segmentation, cohort LTV/CAC, and retention offer engine
 *
 * Exports:
 *   - default (RetentionCRMPage) — four tabs: Pipeline | Clients | Cohorts | Offers
 *
 * Depends on:
 *   - none (all data is local constants)
 *
 * Side-effects:
 *   - Local state only; stage moves, offer sends do not persist
 *
 * Key invariants:
 *   - Lead stages: New → Contacted → Demo → Deposited → Active
 *   - LTV = total deposits over lifetime; CAC = cost per acquired client
 *   - Cohort = month of first deposit; retention % = still active traders in that cohort
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState } from 'react';
import { Users, TrendingUp, Phone, Gift, ChevronRight, Mail, MessageSquare } from 'lucide-react';

type LeadStage = 'New' | 'Contacted' | 'Demo' | 'Deposited' | 'Active';

type Lead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  flag: string;
  source: 'Organic' | 'Referral' | 'IB' | 'Paid' | 'Social';
  stage: LeadStage;
  assignedTo: string;
  createdAt: string;
  lastContact: string;
  estimatedValue: number;
  notes: string;
};

type SegmentedClient = {
  id: string;
  name: string;
  clientId: string;
  segment: 'Champion' | 'Loyal' | 'At Risk' | 'Dormant' | 'New';
  ltv: number;
  lastDeposit: string;
  lastLogin: string;
  depositCount: number;
  totalVolume: number;
  riskScore: number;
};

type CohortRow = {
  cohort: string;
  acquired: number;
  retentionM1: number;
  retentionM3: number;
  retentionM6: number;
  avgLTV: number;
  cac: number;
};

type RetentionOffer = {
  id: string;
  name: string;
  type: 'Deposit Bonus' | 'Free Trade' | 'Cashback' | 'Loyalty Points' | 'Personal Call';
  targetSegment: SegmentedClient['segment'];
  discount: string;
  expiryDays: number;
  sentCount: number;
  acceptedCount: number;
  active: boolean;
};

const STAGES: LeadStage[] = ['New', 'Contacted', 'Demo', 'Deposited', 'Active'];

const LEADS: Lead[] = [
  { id: 'L001', name: 'Marcus Weber',      email: 'marcus@mail.de',   phone: '+49 170 555 0101', country: 'Germany',      flag: '🇩🇪', source: 'Paid',    stage: 'New',       assignedTo: 'Sarah K.', createdAt: '2024-01-15', lastContact: '—',           estimatedValue: 5_000,  notes: '' },
  { id: 'L002', name: 'Aiko Tanaka',       email: 'aiko@webmail.jp',  phone: '+81 90 5555 0202', country: 'Japan',        flag: '🇯🇵', source: 'Organic', stage: 'Contacted', assignedTo: 'Ravi M.',  createdAt: '2024-01-13', lastContact: '2024-01-14',  estimatedValue: 12_000, notes: 'Interested in FX' },
  { id: 'L003', name: 'Léa Moreau',        email: 'lea@outlook.fr',   phone: '+33 6 55 01 03 03',country: 'France',       flag: '🇫🇷', source: 'IB',      stage: 'Demo',      assignedTo: 'Sarah K.', createdAt: '2024-01-10', lastContact: '2024-01-14',  estimatedValue: 8_000,  notes: 'Booked demo Jan 16' },
  { id: 'L004', name: 'Carlos Mendez',     email: 'carlos@mail.mx',   phone: '+52 55 5555 0404', country: 'Mexico',       flag: '🇲🇽', source: 'Referral',stage: 'Deposited', assignedTo: 'Ravi M.',  createdAt: '2024-01-08', lastContact: '2024-01-13',  estimatedValue: 25_000, notes: 'First deposit $2,500' },
  { id: 'L005', name: 'Priya Nair',        email: 'priya@mail.in',    phone: '+91 98765 05050',  country: 'India',        flag: '🇮🇳', source: 'Social',  stage: 'New',       assignedTo: 'Ravi M.',  createdAt: '2024-01-15', lastContact: '—',           estimatedValue: 3_000,  notes: '' },
  { id: 'L006', name: 'Tom Bradley',       email: 'tom@mail.com',     phone: '+1 555 606 0606',  country: 'USA',          flag: '🇺🇸', source: 'Organic', stage: 'Active',    assignedTo: 'Sarah K.', createdAt: '2023-12-01', lastContact: '2024-01-10',  estimatedValue: 50_000, notes: 'VIP candidate' },
  { id: 'L007', name: 'Zara Al-Amin',      email: 'zara@mail.ae',     phone: '+971 50 707 0707', country: 'UAE',          flag: '🇦🇪', source: 'IB',      stage: 'Contacted', assignedTo: 'Sarah K.', createdAt: '2024-01-12', lastContact: '2024-01-13',  estimatedValue: 20_000, notes: 'Follow up Mon' },
  { id: 'L008', name: 'Ivan Petrov',       email: 'ivan@mail.ru',     phone: '+7 916 808 0808',  country: 'Russia',       flag: '🇷🇺', source: 'Paid',    stage: 'Demo',      assignedTo: 'Ravi M.',  createdAt: '2024-01-11', lastContact: '2024-01-14',  estimatedValue: 7_000,  notes: 'Needs PAMM info' },
];

const CLIENTS: SegmentedClient[] = [
  { id: 'C1001', name: 'Alexander Mitchell', clientId: 'C1001', segment: 'Champion', ltv: 142_000, lastDeposit: '2024-01-10', lastLogin: '2024-01-15', depositCount: 18, totalVolume: 4_200_000, riskScore: 12 },
  { id: 'C1002', name: 'Fatima Al-Rashidi',  clientId: 'C1002', segment: 'Loyal',    ltv: 84_000,  lastDeposit: '2024-01-05', lastLogin: '2024-01-14', depositCount: 12, totalVolume: 1_800_000, riskScore: 18 },
  { id: 'C1003', name: 'James Okafor',       clientId: 'C1003', segment: 'At Risk',  ltv: 31_000,  lastDeposit: '2023-11-20', lastLogin: '2024-01-01', depositCount: 5,  totalVolume: 420_000,   riskScore: 62 },
  { id: 'C1005', name: 'Wei Zhang',          clientId: 'C1005', segment: 'Champion', ltv: 210_000, lastDeposit: '2024-01-12', lastLogin: '2024-01-15', depositCount: 24, totalVolume: 6_800_000, riskScore: 8 },
  { id: 'C1007', name: 'Priya Sharma',       clientId: 'C1007', segment: 'Loyal',    ltv: 56_000,  lastDeposit: '2024-01-08', lastLogin: '2024-01-13', depositCount: 9,  totalVolume: 980_000,   riskScore: 24 },
  { id: 'C1010', name: 'Anna Kowalski',      clientId: 'C1010', segment: 'New',      ltv: 8_400,   lastDeposit: '2024-01-03', lastLogin: '2024-01-12', depositCount: 2,  totalVolume: 140_000,   riskScore: 35 },
  { id: 'C1011', name: 'David Thompson',     clientId: 'C1011', segment: 'At Risk',  ltv: 44_000,  lastDeposit: '2023-10-15', lastLogin: '2023-12-20', depositCount: 7,  totalVolume: 620_000,   riskScore: 71 },
  { id: 'C1015', name: 'Samuel Okonkwo',     clientId: 'C1015', segment: 'Dormant',  ltv: 19_000,  lastDeposit: '2023-08-01', lastLogin: '2023-09-15', depositCount: 3,  totalVolume: 210_000,   riskScore: 88 },
  { id: 'C1019', name: 'Grace Osei',         clientId: 'C1019', segment: 'New',      ltv: 4_200,   lastDeposit: '2024-01-01', lastLogin: '2024-01-14', depositCount: 1,  totalVolume: 48_000,    riskScore: 41 },
];

const COHORTS: CohortRow[] = [
  { cohort: 'Sep 2023', acquired: 28, retentionM1: 78, retentionM3: 64, retentionM6: 51, avgLTV: 6_840, cac: 420 },
  { cohort: 'Oct 2023', acquired: 35, retentionM1: 82, retentionM3: 71, retentionM6: 58, avgLTV: 8_200, cac: 380 },
  { cohort: 'Nov 2023', acquired: 42, retentionM1: 76, retentionM3: 62, retentionM6: 48, avgLTV: 5_600, cac: 410 },
  { cohort: 'Dec 2023', acquired: 31, retentionM1: 84, retentionM3: 70, retentionM6: 0,  avgLTV: 9_100, cac: 350 },
  { cohort: 'Jan 2024', acquired: 47, retentionM1: 88, retentionM3: 0,  retentionM6: 0,  avgLTV: 4_200, cac: 395 },
];

const INIT_OFFERS: RetentionOffer[] = [
  { id: 'O001', name: '20% Comeback Bonus',   type: 'Deposit Bonus',  targetSegment: 'At Risk',  discount: '+20% on next deposit up to $5K', expiryDays: 14, sentCount: 42, acceptedCount: 18, active: true  },
  { id: 'O002', name: 'Dormant Reactivation', type: 'Free Trade',     targetSegment: 'Dormant',  discount: '10 free micro-lot trades',       expiryDays: 30, sentCount: 31, acceptedCount: 7,  active: true  },
  { id: 'O003', name: 'Loyalty Cashback',     type: 'Cashback',       targetSegment: 'Loyal',    discount: '5% cashback on spreads (1 wk)',  expiryDays: 7,  sentCount: 84, acceptedCount: 61, active: true  },
  { id: 'O004', name: 'Champion VIP Call',    type: 'Personal Call',  targetSegment: 'Champion', discount: 'Dedicated account manager call', expiryDays: 0,  sentCount: 12, acceptedCount: 10, active: false },
  { id: 'O005', name: 'New Client Onboarding',type: 'Loyalty Points', targetSegment: 'New',      discount: '500 bonus points on first trade', expiryDays: 60,sentCount: 55, acceptedCount: 38, active: true  },
];

const SEG_BADGE: Record<SegmentedClient['segment'], string> = {
  Champion: 'badge-gold',
  Loyal:    'badge-bull',
  'At Risk':'badge-warn',
  Dormant:  'badge-bear',
  New:      'badge-accent',
};

const SOURCE_BADGE: Record<Lead['source'], string> = {
  Organic: 'badge-bull',
  Referral:'badge-accent',
  IB:      'badge-purple',
  Paid:    'badge-warn',
  Social:  'badge-muted',
};

const STAGE_COLOR: Record<LeadStage, string> = {
  New:       'bg-[var(--bg-elevated)] text-fg3',
  Contacted: 'bg-accent/15 text-accent',
  Demo:      'bg-[var(--warn)]/15 text-warn',
  Deposited: 'bg-bull/15 text-bull',
  Active:    'bg-bull/25 text-bull',
};

function retentionColor(pct: number) {
  if (pct === 0) return 'text-fg3';
  if (pct >= 75) return 'text-bull';
  if (pct >= 55) return 'text-accent';
  if (pct >= 40) return 'text-warn';
  return 'text-bear';
}

function fmtK(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n}`;
}

export default function RetentionCRMPage() {
  const [tab, setTab] = useState<'pipeline' | 'clients' | 'cohorts' | 'offers'>('pipeline');
  const [leads, setLeads] = useState<Lead[]>(LEADS);
  const [offers, setOffers] = useState<RetentionOffer[]>(INIT_OFFERS);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [stageFilter, setStageFilter] = useState<LeadStage | 'All'>('All');

  const moveStage = (id: string, dir: 1 | -1) => {
    setLeads(ls => ls.map(l => {
      if (l.id !== id) return l;
      const idx = STAGES.indexOf(l.stage);
      const next = STAGES[idx + dir];
      return next ? { ...l, stage: next } : l;
    }));
  };

  const totalPipelineValue = leads.reduce((s, l) => s + l.estimatedValue, 0);
  const atRiskCount = CLIENTS.filter(c => c.segment === 'At Risk' || c.segment === 'Dormant').length;

  const filteredLeads = stageFilter === 'All' ? leads : leads.filter(l => l.stage === stageFilter);

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Retention & Sales CRM</p>
          <p className="module-subtitle">
            {leads.length} leads · {fmtK(totalPipelineValue)} pipeline · {atRiskCount} at-risk clients
          </p>
        </div>
        <button className="btn-primary btn btn-sm"><Users size={13} /> Add Lead</button>
      </div>

      <div className="p-6 space-y-4">
        {/* KPI strip */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Active Leads',    value: leads.filter(l => l.stage !== 'Active').length, color: 'text-accent', icon: <Users size={13} className="text-accent" /> },
            { label: 'Converted',       value: leads.filter(l => l.stage === 'Active').length,  color: 'text-bull',   icon: <TrendingUp size={13} className="text-bull" /> },
            { label: 'Pipeline Value',  value: fmtK(totalPipelineValue),                        color: 'text-fg1',    icon: null },
            { label: 'At Risk',         value: atRiskCount,                                      color: 'text-warn',   icon: <Phone size={13} className="text-warn" /> },
            { label: 'Active Offers',   value: offers.filter(o => o.active).length,             color: 'text-purple', icon: <Gift size={13} className="text-purple" /> },
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
          {(['pipeline', 'clients', 'cohorts', 'offers'] as const).map(t => (
            <button key={t} className={`chart-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'pipeline' ? 'Lead Pipeline' : t === 'clients' ? 'Client Segments' : t === 'cohorts' ? 'Cohort Analysis' : 'Retention Offers'}
            </button>
          ))}
        </div>

        {/* ── Pipeline Tab ── */}
        {tab === 'pipeline' && (
          <div className={`grid gap-4 ${selectedLead ? 'grid-cols-[1fr_320px]' : 'grid-cols-1'}`}>
            <div className="space-y-3">
              {/* Stage filter pills */}
              <div className="flex gap-2">
                {(['All', ...STAGES] as const).map(s => (
                  <button key={s}
                    className={`btn btn-xs ${stageFilter === s ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setStageFilter(s)}>
                    {s}
                    <span className="ml-1 font-mono text-[9px] opacity-70">
                      {s === 'All' ? leads.length : leads.filter(l => l.stage === s).length}
                    </span>
                  </button>
                ))}
              </div>

              <div className="card overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Lead</th>
                      <th>Source</th>
                      <th>Stage</th>
                      <th>Assigned</th>
                      <th>Est. Value</th>
                      <th>Last Contact</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map(l => (
                      <tr key={l.id} className="cursor-pointer" onClick={() => setSelectedLead(selectedLead?.id === l.id ? null : l)}>
                        <td>
                          <div className="flex items-center gap-2">
                            <span>{l.flag}</span>
                            <div>
                              <p className="text-[12px] font-medium text-fg1">{l.name}</p>
                              <p className="mono-cell text-[10px] text-fg3">{l.email}</p>
                            </div>
                          </div>
                        </td>
                        <td><span className={`badge ${SOURCE_BADGE[l.source]}`}>{l.source}</span></td>
                        <td>
                          <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${STAGE_COLOR[l.stage]}`}>
                            {l.stage}
                          </span>
                        </td>
                        <td className="text-[11px] text-fg2">{l.assignedTo}</td>
                        <td className="mono-cell font-bold text-[12px] text-fg1">{fmtK(l.estimatedValue)}</td>
                        <td className="mono-cell text-[10px] text-fg3">{l.lastContact}</td>
                        <td>
                          <div className="flex gap-1">
                            <button className="btn-ghost btn btn-xs"
                              onClick={e => { e.stopPropagation(); moveStage(l.id, -1); }}
                              disabled={l.stage === STAGES[0]}>←</button>
                            <button className="btn-ghost btn btn-xs"
                              onClick={e => { e.stopPropagation(); moveStage(l.id, 1); }}
                              disabled={l.stage === STAGES[STAGES.length - 1]}>→</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Lead detail panel */}
            {selectedLead && (
              <div className="card p-4 space-y-4 text-[11px]">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-fg1">{selectedLead.flag} {selectedLead.name}</p>
                    <p className="text-[10px] text-fg3 mt-0.5">{selectedLead.email}</p>
                    <p className="text-[10px] text-fg3">{selectedLead.phone}</p>
                  </div>
                  <span className={`badge ${SOURCE_BADGE[selectedLead.source]}`}>{selectedLead.source}</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Stage',      value: selectedLead.stage },
                    { label: 'Assigned',   value: selectedLead.assignedTo },
                    { label: 'Est. Value', value: fmtK(selectedLead.estimatedValue) },
                    { label: 'Created',    value: selectedLead.createdAt },
                  ].map(f => (
                    <div key={f.label} className="rounded border border-[var(--border)] px-2 py-1.5">
                      <p className="text-[9px] text-fg3 uppercase tracking-wider">{f.label}</p>
                      <p className="text-[11px] font-medium text-fg1 mt-0.5">{f.value}</p>
                    </div>
                  ))}
                </div>

                {selectedLead.notes && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-fg3 mb-1">NOTES</p>
                    <p className="text-[10px] text-fg2 bg-[var(--bg-elevated)] rounded px-2 py-1.5">{selectedLead.notes}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-fg3">ACTIONS</p>
                  <button className="btn-ghost btn btn-sm w-full justify-start gap-2">
                    <Mail size={12} /> Send Email
                  </button>
                  <button className="btn-ghost btn btn-sm w-full justify-start gap-2">
                    <Phone size={12} /> Log Call
                  </button>
                  <button className="btn-ghost btn btn-sm w-full justify-start gap-2">
                    <MessageSquare size={12} /> Add Note
                  </button>
                  <button className="btn-primary btn btn-sm w-full gap-2"
                    onClick={() => moveStage(selectedLead.id, 1)}>
                    Advance Stage <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Client Segments Tab ── */}
        {tab === 'clients' && (
          <div className="card overflow-x-auto">
            <div className="card-header">
              <p className="card-title">Client Segmentation (RFM Model)</p>
              <p className="text-[11px] text-fg3">Recency + Frequency + Monetary scoring — 30-day window</p>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Segment</th>
                  <th>LTV</th>
                  <th>Deposits</th>
                  <th>Volume MTD</th>
                  <th>Last Deposit</th>
                  <th>Last Login</th>
                  <th>Risk Score</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {CLIENTS.sort((a, b) => b.ltv - a.ltv).map(c => (
                  <tr key={c.id}>
                    <td>
                      <p className="text-[12px] font-medium text-fg1">{c.name}</p>
                      <p className="mono-cell text-[10px] text-fg3">{c.clientId}</p>
                    </td>
                    <td><span className={`badge ${SEG_BADGE[c.segment]}`}>{c.segment}</span></td>
                    <td className="mono-cell font-bold text-[12px] text-bull">{fmtK(c.ltv)}</td>
                    <td className="mono-cell text-[11px] text-fg2">{c.depositCount}</td>
                    <td className="mono-cell text-[11px] text-fg2">
                      {c.totalVolume >= 1_000_000 ? `$${(c.totalVolume/1_000_000).toFixed(1)}M` : `$${(c.totalVolume/1_000).toFixed(0)}K`}
                    </td>
                    <td className="mono-cell text-[10px] text-fg3">{c.lastDeposit}</td>
                    <td className="mono-cell text-[10px] text-fg3">{c.lastLogin}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-12 rounded-full bg-[var(--bg-elevated)]">
                          <div className="h-full rounded-full"
                            style={{ width: `${c.riskScore}%`, backgroundColor: c.riskScore > 70 ? 'var(--bear)' : c.riskScore > 40 ? 'var(--warn)' : 'var(--bull)' }} />
                        </div>
                        <span className="mono-cell text-[10px] text-fg2">{c.riskScore}</span>
                      </div>
                    </td>
                    <td>
                      <button className="btn-ghost btn btn-xs">Offer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Cohort Analysis Tab ── */}
        {tab === 'cohorts' && (
          <div className="space-y-4">
            <div className="card overflow-x-auto">
              <div className="card-header">
                <p className="card-title">Cohort Retention Matrix</p>
                <p className="text-[11px] text-fg3">% of acquired clients still trading at M+1, M+3, M+6</p>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Cohort</th>
                    <th>Acquired</th>
                    <th>Retention M+1</th>
                    <th>Retention M+3</th>
                    <th>Retention M+6</th>
                    <th>Avg LTV</th>
                    <th>CAC</th>
                    <th>LTV:CAC</th>
                  </tr>
                </thead>
                <tbody>
                  {COHORTS.map(row => (
                    <tr key={row.cohort}>
                      <td className="text-[11px] font-medium text-fg1">{row.cohort}</td>
                      <td className="mono-cell text-[11px] text-fg2">{row.acquired}</td>
                      {[row.retentionM1, row.retentionM3, row.retentionM6].map((pct, i) => (
                        <td key={i}>
                          {pct === 0 ? (
                            <span className="text-[10px] text-fg3">—</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-14 rounded-full bg-[var(--bg-elevated)]">
                                <div className="h-full rounded-full"
                                  style={{ width: `${pct}%`, backgroundColor: pct >= 75 ? 'var(--bull)' : pct >= 55 ? 'var(--accent)' : pct >= 40 ? 'var(--warn)' : 'var(--bear)' }} />
                              </div>
                              <span className={`mono-cell text-[11px] font-semibold ${retentionColor(pct)}`}>{pct}%</span>
                            </div>
                          )}
                        </td>
                      ))}
                      <td className="mono-cell font-bold text-[12px] text-bull">{fmtK(row.avgLTV)}</td>
                      <td className="mono-cell text-[11px] text-fg2">${row.cac}</td>
                      <td className={`mono-cell font-bold text-[12px] ${(row.avgLTV / row.cac) >= 10 ? 'text-bull' : 'text-warn'}`}>
                        {(row.avgLTV / row.cac).toFixed(1)}×
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Insight cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="card p-4">
                <p className="text-[9px] font-bold uppercase tracking-wider text-fg3 mb-2">BEST COHORT</p>
                <p className="text-[13px] font-bold text-bull">Dec 2023</p>
                <p className="text-[10px] text-fg3 mt-1">84% M+1 retention · $9.1K avg LTV</p>
              </div>
              <div className="card p-4">
                <p className="text-[9px] font-bold uppercase tracking-wider text-fg3 mb-2">AVG LTV:CAC</p>
                <p className="text-[13px] font-bold text-accent">
                  {(COHORTS.reduce((s, r) => s + r.avgLTV / r.cac, 0) / COHORTS.length).toFixed(1)}×
                </p>
                <p className="text-[10px] text-fg3 mt-1">Target: ≥ 10× for healthy unit economics</p>
              </div>
              <div className="card p-4">
                <p className="text-[9px] font-bold uppercase tracking-wider text-fg3 mb-2">CHURN RISK</p>
                <p className="text-[13px] font-bold text-warn">M+3 gap</p>
                <p className="text-[10px] text-fg3 mt-1">~16 pt drop between M+1 → M+3 avg</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Retention Offers Tab ── */}
        {tab === 'offers' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-fg3">{offers.filter(o => o.active).length} active offers · {offers.reduce((s, o) => s + o.sentCount, 0)} sent</p>
              <button className="btn-primary btn btn-sm"><Gift size={13} /> New Offer</button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {offers.map(o => {
                const acceptRate = o.sentCount > 0 ? Math.round((o.acceptedCount / o.sentCount) * 100) : 0;
                return (
                  <div key={o.id} className={`card p-4 ${!o.active ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-[12px] font-semibold text-fg1">{o.name}</p>
                        <p className="text-[10px] text-fg3 mt-0.5">{o.discount}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`badge ${SEG_BADGE[o.targetSegment]}`}>{o.targetSegment}</span>
                        <button
                          onClick={() => setOffers(os => os.map(x => x.id === o.id ? { ...x, active: !x.active } : x))}
                          className={`relative h-4 w-8 shrink-0 rounded-full transition-colors ${o.active ? 'bg-bull/30' : 'bg-[var(--border-md)]'}`}>
                          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${o.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 mb-3">
                      {[
                        { label: 'Type',     value: o.type,               cls: 'text-fg2' },
                        { label: 'Expires',  value: o.expiryDays ? `${o.expiryDays}d` : 'Open', cls: 'text-fg2' },
                        { label: 'Sent',     value: o.sentCount,          cls: 'text-fg1 font-bold' },
                        { label: 'Accepted', value: o.acceptedCount,      cls: 'text-bull font-bold' },
                      ].map(f => (
                        <div key={f.label}>
                          <p className="kpi-label">{f.label}</p>
                          <p className={`mono-cell text-[11px] ${f.cls}`}>{f.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-elevated)]">
                        <div className="h-full rounded-full bg-bull transition-all" style={{ width: `${acceptRate}%` }} />
                      </div>
                      <span className={`mono-cell text-[10px] font-semibold ${acceptRate >= 50 ? 'text-bull' : acceptRate >= 30 ? 'text-accent' : 'text-warn'}`}>
                        {acceptRate}% accept
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
