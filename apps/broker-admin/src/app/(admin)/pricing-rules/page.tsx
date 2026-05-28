/**
 * File:        apps/broker-admin/src/app/(admin)/pricing-rules/page.tsx
 * Module:      broker-admin · Trading · Pricing Rules
 * Purpose:     Three-layer pricing rule management: group overrides, time-based markups, event triggers
 *
 * Exports:
 *   - default (PricingRulesPage) — tabbed pricing rule editor with add/delete/toggle
 *
 * Depends on:
 *   - @/lib/mock-data-context — useBrokerData() for instruments (symbol list)
 *
 * Side-effects:
 *   - Local state only; rule mutations do not persist beyond session
 *
 * Key invariants:
 *   - Rule precedence: Event > Time > Group > Instrument default
 *   - markupDelta in pips (positive = wider spread, negative = tighter)
 *   - time rules use UTC; event rules use minutesBefore/minutesAfter window
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState } from 'react';
import { Plus, AlertTriangle, X } from 'lucide-react';
import { useBrokerData } from '@/lib/mock-data-context';

type GroupRule = {
  id: string;
  group: 'Standard' | 'Professional' | 'VIP';
  symbol: string;
  markup: number;
  commOverride: number | null;
  leverageCap: number;
};

type TimeRule = {
  id: string;
  symbol: string;
  markupDelta: number;
  fromTime: string;
  toTime: string;
  days: string[];
  enabled: boolean;
  reason: string;
};

type EventRule = {
  id: string;
  event: string;
  impact: 'HIGH' | 'MEDIUM';
  symbols: string[];
  delta: number;
  minutesBefore: number;
  minutesAfter: number;
  enabled: boolean;
};

const GROUPS: GroupRule['group'][] = ['Standard', 'Professional', 'VIP'];
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ECONOMIC_EVENTS = [
  'Non-Farm Payrolls', 'FOMC Rate Decision', 'ECB Rate Decision',
  'CPI Release', 'GDP Release', 'Bank of England Decision',
  'Fed Chair Speech', 'Unemployment Rate',
];

const INIT_GROUP_RULES: GroupRule[] = [
  { id: 'gr1', group: 'Standard',     symbol: 'EUR/USD', markup: 0.5, commOverride: null, leverageCap: 30 },
  { id: 'gr2', group: 'Standard',     symbol: 'GBP/USD', markup: 0.5, commOverride: null, leverageCap: 30 },
  { id: 'gr3', group: 'Professional', symbol: 'EUR/USD', markup: 0.2, commOverride: null, leverageCap: 200 },
  { id: 'gr4', group: 'VIP',          symbol: 'ALL',     markup: 0,   commOverride: null, leverageCap: 500 },
  { id: 'gr5', group: 'Standard',     symbol: 'BTC/USD', markup: 5,   commOverride: null, leverageCap: 2 },
];

const INIT_TIME_RULES: TimeRule[] = [
  { id: 'tr1', symbol: 'EUR/USD', markupDelta: 2,   fromTime: '21:00', toTime: '22:00', days: ['Mon','Tue','Wed','Thu','Fri'], enabled: true,  reason: 'Low liquidity close' },
  { id: 'tr2', symbol: 'ALL',     markupDelta: 3,   fromTime: '00:00', toTime: '01:00', days: ['Sat','Sun'],                   enabled: true,  reason: 'Weekend hours' },
  { id: 'tr3', symbol: 'XAUUSD', markupDelta: 1.5, fromTime: '13:25', toTime: '13:35', days: ['Mon','Tue','Wed','Thu','Fri'], enabled: false, reason: 'COMEX open' },
];

const INIT_EVENT_RULES: EventRule[] = [
  { id: 'ev1', event: 'Non-Farm Payrolls',  impact: 'HIGH',   symbols: ['EUR/USD','GBP/USD','USD/JPY'], delta: 5, minutesBefore: 5,  minutesAfter: 15, enabled: true },
  { id: 'ev2', event: 'FOMC Rate Decision', impact: 'HIGH',   symbols: ['ALL'],                         delta: 8, minutesBefore: 10, minutesAfter: 30, enabled: true },
  { id: 'ev3', event: 'CPI Release',        impact: 'MEDIUM', symbols: ['EUR/USD','GBP/USD'],           delta: 3, minutesBefore: 5,  minutesAfter: 10, enabled: true },
];

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-bull/30' : 'bg-[var(--border-md)]'}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

function AddGroupRuleModal({ instruments, onClose, onSave }: {
  instruments: { symbol: string }[];
  onClose: () => void;
  onSave: (r: Omit<GroupRule, 'id'>) => void;
}) {
  const [form, setForm] = useState<Omit<GroupRule, 'id'>>({
    group: 'Standard', symbol: 'EUR/USD', markup: 0, commOverride: null, leverageCap: 30,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-[440px] rounded-lg border border-[var(--border)] bg-[var(--bg-panel)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <p className="module-title">Add Group Pricing Rule</p>
          <button onClick={onClose} className="btn-ghost btn btn-xs p-1.5"><X size={14} /></button>
        </div>
        <div className="grid grid-cols-2 gap-4 px-5 py-4">
          <div>
            <label className="kpi-label mb-1 block">Client Group</label>
            <select className="input" value={form.group} onChange={e => set('group', e.target.value as GroupRule['group'])}>
              {GROUPS.map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="kpi-label mb-1 block">Symbol</label>
            <select className="input" value={form.symbol} onChange={e => set('symbol', e.target.value)}>
              <option value="ALL">ALL instruments</option>
              {instruments.map(i => <option key={i.symbol}>{i.symbol}</option>)}
            </select>
          </div>
          <div>
            <label className="kpi-label mb-1 block">Spread Markup (pips)</label>
            <input className="input" type="number" step="0.1" value={form.markup}
              onChange={e => set('markup', +e.target.value)} />
          </div>
          <div>
            <label className="kpi-label mb-1 block">Commission Override ($/lot)</label>
            <input className="input" type="number" placeholder="Leave blank for default"
              value={form.commOverride ?? ''} onChange={e => set('commOverride', e.target.value ? +e.target.value : null)} />
          </div>
          <div>
            <label className="kpi-label mb-1 block">Max Leverage Cap</label>
            <select className="input" value={form.leverageCap} onChange={e => set('leverageCap', +e.target.value)}>
              {[2, 5, 10, 20, 30, 50, 100, 200, 500].map(l => <option key={l} value={l}>1:{l}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button className="btn-ghost btn btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn-primary btn btn-sm" onClick={() => { onSave(form); onClose(); }}>Add Rule</button>
        </div>
      </div>
    </div>
  );
}

export default function PricingRulesPage() {
  const { instruments } = useBrokerData();
  const [groupRules, setGroupRules] = useState<GroupRule[]>(INIT_GROUP_RULES);
  const [timeRules,  setTimeRules]  = useState<TimeRule[]>(INIT_TIME_RULES);
  const [eventRules, setEventRules] = useState<EventRule[]>(INIT_EVENT_RULES);
  const [tab, setTab] = useState<'group' | 'time' | 'event'>('group');
  const [showAddGroup, setShowAddGroup] = useState(false);

  const GROUP_BADGE: Record<GroupRule['group'], string> = {
    Standard: 'badge badge-muted', Professional: 'badge badge-accent', VIP: 'badge badge-gold',
  };

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Pricing Rules</p>
          <p className="module-subtitle">Group overrides · Time-based markups · Event-triggered spreads</p>
        </div>
        {tab === 'group' && (
          <button className="btn-primary btn btn-sm" onClick={() => setShowAddGroup(true)}>
            <Plus size={13} /> Add Rule
          </button>
        )}
      </div>

      <div className="p-6 space-y-4">
        {/* Precedence warning */}
        <div className="flex items-start gap-3 rounded-lg border border-[var(--warn)]/30 bg-[var(--warn)]/5 px-4 py-3">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
          <p className="text-[11px] text-warn">
            Rules are applied in order:{' '}
            <strong className="text-fg1">Event rules</strong> override{' '}
            <strong className="text-fg1">Time rules</strong> override{' '}
            <strong className="text-fg1">Group rules</strong> override{' '}
            <strong className="text-fg1">Instrument defaults</strong>.
          </p>
        </div>

        {/* Tabs */}
        <div className="chart-tabs">
          {([
            { key: 'group', label: 'Group Overrides',   count: groupRules.length },
            { key: 'time',  label: 'Time-Based Rules',  count: timeRules.length  },
            { key: 'event', label: 'Event Triggers',    count: eventRules.length },
          ] as const).map(t => (
            <button key={t.key} className={`chart-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
              <span className="ml-1 font-mono text-[9px] text-fg3">{t.count}</span>
            </button>
          ))}
        </div>

        {/* Group overrides table */}
        {tab === 'group' && (
          <div className="card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Symbol</th>
                  <th>Spread Markup</th>
                  <th>Commission Override</th>
                  <th>Leverage Cap</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {groupRules.map(rule => (
                  <tr key={rule.id}>
                    <td><span className={GROUP_BADGE[rule.group]}>{rule.group}</span></td>
                    <td>
                      {rule.symbol === 'ALL'
                        ? <span className="text-[11px] text-fg3">ALL instruments</span>
                        : <span className="mono-cell font-bold text-[13px]">{rule.symbol}</span>}
                    </td>
                    <td>
                      <span className={`mono-cell text-[12px] font-semibold ${rule.markup > 0 ? 'text-warn' : rule.markup < 0 ? 'text-bull' : 'text-fg3'}`}>
                        {rule.markup > 0 ? '+' : ''}{rule.markup} pips
                      </span>
                    </td>
                    <td className="text-[11px] text-fg2">
                      {rule.commOverride != null ? `$${rule.commOverride}/lot` : '— default'}
                    </td>
                    <td className="mono-cell text-[11px] text-accent">1:{rule.leverageCap}</td>
                    <td>
                      <div className="flex gap-1">
                        <button className="btn-ghost btn btn-xs">Edit</button>
                        <button className="btn-danger btn btn-xs"
                          onClick={() => setGroupRules(rs => rs.filter(r => r.id !== rule.id))}>
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Time-based rules */}
        {tab === 'time' && (
          <div className="space-y-2">
            {timeRules.map(rule => (
              <div key={rule.id} className="card p-0">
                <div className="flex items-start gap-4 px-4 py-3">
                  <Toggle on={rule.enabled}
                    onChange={v => setTimeRules(rs => rs.map(r => r.id === rule.id ? { ...r, enabled: v } : r))} />
                  <div className="flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`mono-cell font-bold text-[13px] ${rule.enabled ? 'text-fg1' : 'text-fg3'}`}>
                        {rule.symbol === 'ALL' ? 'All Instruments' : rule.symbol}
                      </span>
                      <span className={`text-[12px] ${rule.enabled ? 'text-warn' : 'text-fg3'}`}>
                        +{rule.markupDelta} pips
                      </span>
                      <div className="h-3 w-px bg-[var(--border)]" />
                      <span className="mono-cell text-[11px] text-fg2">
                        {rule.fromTime} – {rule.toTime} UTC
                      </span>
                      <div className="h-3 w-px bg-[var(--border)]" />
                      <span className="text-[11px] text-fg3">{rule.reason}</span>
                    </div>
                    <div className="flex gap-1">
                      {DAYS_SHORT.map(day => {
                        const active = rule.days.includes(day) && rule.enabled;
                        return (
                          <div key={day} className={`rounded px-2 py-0.5 text-[10px] font-semibold border ${
                            rule.days.includes(day)
                              ? active ? 'border-accent/30 bg-accent/10 text-accent' : 'border-[var(--border)] bg-[var(--bg-elevated)] text-fg3'
                              : 'border-transparent bg-[var(--bg-elevated)] text-fg3/40'
                          }`}>
                            {day}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button className="btn-ghost btn btn-xs">Edit</button>
                    <button className="btn-danger btn btn-xs"
                      onClick={() => setTimeRules(rs => rs.filter(r => r.id !== rule.id))}>
                      Del
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Event trigger rules */}
        {tab === 'event' && (
          <div className="space-y-2">
            {eventRules.map(rule => (
              <div key={rule.id} className="card p-0">
                <div className="flex items-start gap-4 px-4 py-3">
                  <Toggle on={rule.enabled}
                    onChange={v => setEventRules(rs => rs.map(r => r.id === rule.id ? { ...r, enabled: v } : r))} />
                  <div className="flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`badge ${rule.impact === 'HIGH' ? 'badge-bear' : 'badge-warn'}`}>{rule.impact}</span>
                      <span className={`text-[13px] font-semibold ${rule.enabled ? 'text-fg1' : 'text-fg3'}`}>
                        {rule.event}
                      </span>
                      <span className={`text-[12px] ${rule.enabled ? 'text-warn' : 'text-fg3'}`}>
                        +{rule.delta} pips
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-fg2">
                      <span>Widens <strong className="text-fg1">{rule.minutesBefore} min</strong> before event</span>
                      <span>Reverts <strong className="text-fg1">{rule.minutesAfter} min</strong> after</span>
                      <div className="flex gap-1">
                        {rule.symbols.map(s => (
                          <span key={s} className="badge badge-muted">{s === 'ALL' ? 'All instruments' : s}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button className="btn-ghost btn btn-xs">Edit</button>
                    <button className="btn-danger btn btn-xs"
                      onClick={() => setEventRules(rs => rs.filter(r => r.id !== rule.id))}>
                      Del
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddGroup && (
        <AddGroupRuleModal
          instruments={instruments}
          onClose={() => setShowAddGroup(false)}
          onSave={rule => setGroupRules(rs => [...rs, { id: 'gr' + Date.now(), ...rule }])}
        />
      )}
    </div>
  );
}
