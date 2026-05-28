/**
 * File:        apps/broker-admin/src/app/(admin)/trading-sessions/page.tsx
 * Module:      broker-admin · Trading · Trading Sessions
 * Purpose:     Global trading schedule editor — per-day hours, breaks, DST toggle, market closures
 *
 * Exports:
 *   - default (TradingSessionsPage) — tabbed session editor: Global / By Group / Market Closures
 *
 * Depends on:
 *   - none (all data is local state seeded from constants)
 *
 * Side-effects:
 *   - Local state only; "Save All Changes" is display-only in demo
 *
 * Key invariants:
 *   - All times stored and displayed in UTC
 *   - Closed days rendered at 50% opacity; inputs still editable for pre-configuration
 *   - Holiday isPast check uses fixed reference date 2024-01-15 for demo consistency
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState } from 'react';
import { Plus, X, Save } from 'lucide-react';

type DaySchedule = {
  day: string;
  isWeekend: boolean;
  closed: boolean;
  open: string;
  close: string;
  breaks: { from: string; to: string }[];
};

type Holiday = {
  id: string;
  date: string;
  name: string;
  affected: string;
  type: string;
};

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const INST_GROUPS = ['Forex', 'Indices', 'Commodities', 'Crypto'] as const;
type InstGroup = typeof INST_GROUPS[number];

const GROUP_COLORS: Record<InstGroup, string> = {
  Forex: 'var(--accent)', Indices: 'var(--warn)', Commodities: '#EC4899', Crypto: 'var(--purple)',
};

const DEFAULT_GROUP_SESSIONS: Record<InstGroup, Record<string, string>> = {
  Forex:       { mon: '00:00-23:59', tue: '00:00-23:59', wed: '00:00-23:59', thu: '00:00-23:59', fri: '00:00-22:00', sat: 'Closed', sun: '21:00-23:59' },
  Indices:     { mon: '08:00-22:00', tue: '08:00-22:00', wed: '08:00-22:00', thu: '08:00-22:00', fri: '08:00-21:30', sat: 'Closed', sun: 'Closed' },
  Commodities: { mon: '01:00-23:59', tue: '01:00-23:59', wed: '01:00-23:59', thu: '01:00-23:59', fri: '01:00-22:00', sat: 'Closed', sun: '23:00-23:59' },
  Crypto:      { mon: '00:00-23:59', tue: '00:00-23:59', wed: '00:00-23:59', thu: '00:00-23:59', fri: '00:00-23:59', sat: '00:00-23:59', sun: '00:00-23:59' },
};

const DEFAULT_SCHEDULE: DaySchedule[] = DAY_SHORT.map((day, i) => ({
  day, isWeekend: i >= 5, closed: i >= 5,
  open: '00:00', close: '23:59', breaks: i === 4 ? [{ from: '21:00', to: '22:00' }] : [],
}));

const INIT_HOLIDAYS: Holiday[] = [
  { id: 'h1', date: '2024-01-01', name: "New Year's Day", affected: 'ALL',         type: 'Full Closure' },
  { id: 'h2', date: '2024-03-29', name: 'Good Friday',    affected: 'Forex,Indices', type: 'Early Close 18:00' },
  { id: 'h3', date: '2024-04-01', name: 'Easter Monday',  affected: 'Indices',     type: 'Full Closure' },
  { id: 'h4', date: '2024-12-25', name: 'Christmas Day',  affected: 'ALL',         type: 'Full Closure' },
  { id: 'h5', date: '2024-12-26', name: 'Boxing Day',     affected: 'Indices',     type: 'Full Closure' },
];

const REF_DATE = '2024-01-15';

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-bull/30' : 'bg-[var(--border-md)]'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

export default function TradingSessionsPage() {
  const [schedule, setSchedule] = useState<DaySchedule[]>(DEFAULT_SCHEDULE);
  const [holidays, setHolidays] = useState<Holiday[]>(INIT_HOLIDAYS);
  const [dst, setDst] = useState(true);
  const [dstDate, setDstDate] = useState('2024-03-31');
  const [tab, setTab] = useState<'global' | 'groups' | 'holidays'>('global');
  const [showAddHoliday, setShowAddHoliday] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ date: '', name: '', affected: 'ALL', type: 'Full Closure' });
  const [saved, setSaved] = useState(false);

  const updateDay = (i: number, field: keyof DaySchedule, value: unknown) =>
    setSchedule(s => s.map((d, j) => j === i ? { ...d, [field]: value } : d));

  const addBreak = (i: number) =>
    setSchedule(s => s.map((d, j) => j === i ? { ...d, breaks: [...d.breaks, { from: '12:00', to: '13:00' }] } : d));

  const removeBreak = (dayIdx: number, breakIdx: number) =>
    setSchedule(s => s.map((d, j) => j === dayIdx
      ? { ...d, breaks: d.breaks.filter((_, bi) => bi !== breakIdx) } : d));

  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const upcomingHolidays = holidays.filter(h => h.date >= REF_DATE).length;

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Trading Sessions</p>
          <p className="module-subtitle">Global trading schedule · All times UTC</p>
        </div>
        <button className={`btn btn-sm ${saved ? 'btn-primary' : 'btn-primary'}`} onClick={handleSave}>
          <Save size={13} /> {saved ? 'Saved!' : 'Save All Changes'}
        </button>
      </div>

      <div className="p-6 space-y-4">
        {/* DST banner */}
        <div className="flex items-center gap-3 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3">
          <Toggle on={dst} onChange={setDst} />
          <span className="text-[12px] text-fg1">Auto-adjust for Daylight Saving Time (DST)</span>
          {dst && (
            <>
              <div className="h-4 w-px bg-[var(--border-md)]" />
              <span className="text-[11px] text-fg2">Next transition:</span>
              <input className="input w-36" type="date" value={dstDate}
                onChange={e => setDstDate(e.target.value)} />
            </>
          )}
        </div>

        {/* Tabs */}
        <div className="chart-tabs">
          <button className={`chart-tab ${tab === 'global' ? 'active' : ''}`} onClick={() => setTab('global')}>
            Global Schedule
          </button>
          <button className={`chart-tab ${tab === 'groups' ? 'active' : ''}`} onClick={() => setTab('groups')}>
            By Instrument Group
          </button>
          <button className={`chart-tab ${tab === 'holidays' ? 'active' : ''}`} onClick={() => setTab('holidays')}>
            Market Closures
            {upcomingHolidays > 0 && (
              <span className="ml-1 font-mono text-[9px] text-fg3">{upcomingHolidays} upcoming</span>
            )}
          </button>
        </div>

        {/* Global schedule */}
        {tab === 'global' && (
          <div className="card overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Day</th>
                  <th>Open (UTC)</th>
                  <th>Close (UTC)</th>
                  <th>Breaks</th>
                  <th style={{ width: 80 }}>Closed</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((day, i) => (
                  <tr key={day.day} style={{ opacity: day.closed ? 0.5 : 1 }}>
                    <td>
                      <span className={`text-[12px] ${day.isWeekend ? 'font-normal text-fg2' : 'font-medium text-fg1'}`}>
                        {day.day}
                      </span>
                    </td>
                    <td>
                      <input className="input w-24 text-[12px]" type="time" value={day.open}
                        onChange={e => updateDay(i, 'open', e.target.value)} />
                    </td>
                    <td>
                      <input className="input w-24 text-[12px]" type="time" value={day.close}
                        onChange={e => updateDay(i, 'close', e.target.value)} />
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {day.breaks.map((brk, bi) => (
                          <div key={bi} className="flex items-center gap-1 rounded bg-[var(--bg-elevated)] px-2 py-0.5">
                            <span className="mono-cell text-[10px] text-fg2">{brk.from}–{brk.to}</span>
                            <button onClick={() => removeBreak(i, bi)} className="text-fg3 hover:text-fg1 transition-colors">
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                        <button className="btn-ghost btn btn-xs" onClick={() => addBreak(i)}>+ Break</button>
                      </div>
                    </td>
                    <td>
                      <Toggle on={day.closed} onChange={v => updateDay(i, 'closed', v)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-2 border-t border-[var(--border)] px-4 py-2">
              <button className="btn-ghost btn btn-xs"
                onClick={() => setSchedule(s => s.map(d => ({ ...d, open: '00:00', close: '23:59', breaks: [] })))}>
                Apply 24/7 to all
              </button>
              <button className="btn-ghost btn btn-xs"
                onClick={() => setSchedule(s => s.map((d, i) => ({ ...d, closed: i >= 5 })))}>
                Standard M–F
              </button>
            </div>
          </div>
        )}

        {/* By instrument group */}
        {tab === 'groups' && (
          <div className="grid grid-cols-2 gap-4">
            {INST_GROUPS.map(group => {
              const color = GROUP_COLORS[group];
              return (
                <div key={group} className="card overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
                    <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
                    <p className="text-[13px] font-semibold text-fg1">{group}</p>
                  </div>
                  <div className="p-3">
                    <div className="grid grid-cols-7 gap-0.5">
                      {DAY_SHORT.map(d => {
                        const val = DEFAULT_GROUP_SESSIONS[group][d.toLowerCase()];
                        const closed = val === 'Closed';
                        return (
                          <div key={d} className="flex flex-col gap-1">
                            <p className="text-center text-[9px] font-semibold uppercase tracking-wide text-fg3">{d}</p>
                            <div
                              className="rounded py-1 text-center"
                              style={{
                                background: closed ? 'var(--bg-elevated)' : `${color}18`,
                                border: `1px solid ${closed ? 'transparent' : color + '40'}`,
                              }}
                            >
                              <p className="text-[9px] font-semibold" style={{ color: closed ? 'var(--fg3)' : color }}>
                                {closed ? '—' : val.replace(':', '').split('-')[0].replace('00', '')}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Market closures */}
        {tab === 'holidays' && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button className="btn-primary btn btn-sm" onClick={() => setShowAddHoliday(true)}>
                <Plus size={13} /> Add Closure
              </button>
            </div>
            <div className="card overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Holiday</th>
                    <th>Affected</th>
                    <th>Type</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {[...holidays].sort((a, b) => a.date.localeCompare(b.date)).map(h => {
                    const isPast = h.date < REF_DATE;
                    return (
                      <tr key={h.id} style={{ opacity: isPast ? 0.45 : 1 }}>
                        <td className={`mono-cell text-[11px] ${isPast ? 'text-fg3' : 'text-fg1'}`}>{h.date}</td>
                        <td className="text-[12px] font-medium text-fg1">{h.name}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {h.affected === 'ALL'
                              ? <span className="badge badge-bear">All instruments</span>
                              : h.affected.split(',').map(a => (
                                  <span key={a} className="badge badge-muted">{a.trim()}</span>
                                ))}
                          </div>
                        </td>
                        <td><span className="badge badge-muted">{h.type}</span></td>
                        <td>
                          <button className="btn-danger btn btn-xs"
                            onClick={() => setHolidays(hs => hs.filter(x => x.id !== h.id))}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add Holiday Modal */}
      {showAddHoliday && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowAddHoliday(false)}>
          <div className="w-[420px] rounded-lg border border-[var(--border)] bg-[var(--bg-panel)]"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <p className="module-title">Add Market Closure</p>
              <button className="btn-ghost btn btn-xs p-1.5" onClick={() => setShowAddHoliday(false)}>
                <X size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 px-5 py-4">
              <div>
                <label className="kpi-label mb-1 block">Date</label>
                <input className="input" type="date" value={newHoliday.date}
                  onChange={e => setNewHoliday(h => ({ ...h, date: e.target.value }))} />
              </div>
              <div>
                <label className="kpi-label mb-1 block">Holiday Name</label>
                <input className="input" placeholder="e.g. Eid Al-Fitr" value={newHoliday.name}
                  onChange={e => setNewHoliday(h => ({ ...h, name: e.target.value }))} />
              </div>
              <div>
                <label className="kpi-label mb-1 block">Affected</label>
                <select className="input" value={newHoliday.affected}
                  onChange={e => setNewHoliday(h => ({ ...h, affected: e.target.value }))}>
                  <option value="ALL">All instruments</option>
                  {INST_GROUPS.map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="kpi-label mb-1 block">Closure Type</label>
                <select className="input" value={newHoliday.type}
                  onChange={e => setNewHoliday(h => ({ ...h, type: e.target.value }))}>
                  {['Full Closure', 'Early Close 18:00', 'Early Close 20:00', 'Late Open 10:00'].map(t =>
                    <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
              <button className="btn-ghost btn btn-sm" onClick={() => setShowAddHoliday(false)}>Cancel</button>
              <button
                className="btn-primary btn btn-sm"
                disabled={!newHoliday.date || !newHoliday.name}
                onClick={() => {
                  setHolidays(hs => [...hs, { ...newHoliday, id: 'h' + Date.now() }]);
                  setShowAddHoliday(false);
                  setNewHoliday({ date: '', name: '', affected: 'ALL', type: 'Full Closure' });
                }}>
                Add Closure
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
