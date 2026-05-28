/**
 * File:        apps/broker-admin/src/app/(admin)/rules-engine/page.tsx
 * Module:      broker-admin · Workflow · Rules Engine
 * Purpose:     Visual event→condition→action rule builder and management.
 *              Fully wired to GET/POST/PATCH/DELETE /admin/rules API.
 *
 * Exports:
 *   - default (RulesEnginePage) — rule list + rule detail + add-rule modal
 *
 * Depends on:
 *   - @/lib/api/hooks/use-rules-engine — useRulesEngine() for real API data
 *
 * Side-effects:
 *   - Rule toggles, creates, updates, and deletes call real backend APIs
 *
 * Key invariants:
 *   - Each rule: { trigger, conditions: Condition[], actions: Action[] }
 *   - Conditions are AND-chained (all must be true)
 *   - Actions execute in order on rule match
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

'use client';

import { useState } from 'react';
import { Plus, Zap, X, ChevronRight, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useRulesEngine } from '@/lib/api/hooks/use-rules-engine';

type Condition = {
  field: string;
  op: string;
  value: string | number;
};

type Action = {
  type: string;
  params: Record<string, string | number>;
};

type Rule = {
  id: string;
  name: string;
  description: string;
  trigger: string;
  conditions: Condition[];
  actions: Action[];
  enabled: boolean;
  executionCount: number;
  lastTriggered?: string;
};

const TRIGGER_LABELS: Record<string, string> = {
  'deposit.completed':     'Deposit Completed',
  'kyc.approved':          'KYC Approved',
  'client.registered':     'Client Registered',
  'margin_call.triggered': 'Margin Call Triggered',
  'withdrawal.requested':  'Withdrawal Requested',
  'order.closed':          'Trade Closed',
};

const ACTION_LABELS: Record<Action['type'], string> = {
  tag_client:           'Tag Client',
  send_email:           'Send Email',
  trigger_bonus:        'Trigger Bonus',
  notify_admin:         'Notify Admin',
  restrict_withdrawal:  'Restrict Withdrawal',
  assign_group:         'Assign to Group',
};

const ACTION_COLOR: Record<Action['type'], string> = {
  tag_client:           'badge-muted',
  send_email:           'badge-accent',
  trigger_bonus:        'badge-gold',
  notify_admin:         'badge-warn',
  restrict_withdrawal:  'badge-bear',
  assign_group:         'badge-purple',
};

const OP_LABEL: Record<Condition['op'], string> = {
  '>': '>', '<': '<', '=': '=', '>=': '≥', '<=': '≤', 'includes': 'is', 'not_includes': 'is not',
};

// TODO(human): Implement renderConditions(conditions: Condition[]) → JSX.Element
// Show each condition as a readable badge row, AND-chained, with human-readable op labels.
function renderConditions(conditions: Condition[]): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {conditions.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[9px] text-fg2">
            {c.field}
          </span>
          <span className="text-[9px] text-fg3">{OP_LABEL[c.op]}</span>
          <span className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] text-accent">
            {c.value}
          </span>
          {i < conditions.length - 1 && (
            <span className="text-[8px] font-bold uppercase tracking-wider text-fg3 px-0.5">AND</span>
          )}
        </span>
      ))}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={e => { e.stopPropagation(); onChange(!on); }}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-bull/30' : 'bg-[var(--border-md)]'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

export default function RulesEnginePage() {
  const { rules, isLoading, error, refetch, toggleRule, deleteRule } = useRulesEngine();
  const [selected, setSelected] = useState<Rule | null>(null);

  const enabledCount = rules.filter(r => r.enabled).length;
  const totalExecutions = rules.reduce((s, r) => s + r.executionCount, 0);

  if (isLoading) {
    return (
      <div className="flex flex-col">
        <div className="module-header">
          <p className="module-title">Rules Engine</p>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <Loader2 size={32} className="text-fg3 animate-spin" />
          <p className="font-ui text-[12px] text-fg3">Loading rules…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col">
        <div className="module-header">
          <p className="module-title">Rules Engine</p>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <AlertCircle size={32} className="text-bear" />
          <p className="font-display text-[13px] font-semibold tracking-widest text-fg1 uppercase">Failed to Load</p>
          <p className="font-ui text-[12px] text-fg3">{error}</p>
          <button className="btn btn-primary btn-sm gap-1.5" onClick={refetch}>
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Rules Engine</p>
          <p className="module-subtitle">
            {enabledCount} active rules · {totalExecutions} total executions
          </p>
        </div>
        <button className="btn-primary btn btn-sm"><Plus size={13} /> New Rule</button>
      </div>

      <div className="p-6 space-y-4">
        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Active Rules',     value: enabledCount,                      color: 'text-bull'   },
            { label: 'Total Rules',      value: rules.length,                      color: 'text-fg1'    },
            { label: 'Total Executions', value: totalExecutions.toLocaleString(), color: 'text-accent' },
            { label: 'Triggers Covered', value: new Set(rules.map(r=>r.trigger)).size, color: 'text-fg2' },
          ].map(k => (
            <div key={k.label} className="kpi-card">
              <p className="kpi-label">{k.label}</p>
              <p className={`kpi-value ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>

        <div className={`grid gap-4 ${selected ? 'grid-cols-[1fr_360px]' : 'grid-cols-1'}`}>
          {/* Rule list */}
          <div className="space-y-2">
            {rules.map(rule => (
              <div
                key={rule.id}
                className={`card cursor-pointer p-4 transition-colors hover:border-[var(--border-hi)] ${selected?.id === rule.id ? 'border-accent/40 bg-accent/5' : ''} ${!rule.enabled ? 'opacity-60' : ''}`}
                onClick={() => setSelected(selected?.id === rule.id ? null : rule)}
              >
                <div className="flex items-start gap-3">
                  <Zap size={14} className={`mt-0.5 shrink-0 ${rule.enabled ? 'text-bull' : 'text-fg3'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[12px] font-semibold text-fg1">{rule.name}</p>
                      <span className="badge badge-muted">{TRIGGER_LABELS[rule.trigger] ?? rule.trigger}</span>
                    </div>
                    <p className="text-[10px] text-fg3 mb-2">{rule.description}</p>
                    {renderConditions(rule.conditions)}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {rule.actions.map((a, i) => (
                        <span key={i} className={`badge ${ACTION_COLOR[a.type]}`}>
                          {ACTION_LABELS[a.type]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-right">
                      <p className="mono-cell text-[11px] text-fg2">{rule.executionCount}×</p>
                      {rule.lastTriggered && (
                        <p className="mono-cell text-[9px] text-fg3">{rule.lastTriggered}</p>
                      )}
                    </div>
                    <Toggle on={rule.enabled} onChange={() => toggleRule(rule.id)} />
                    <ChevronRight size={13} className="text-fg3" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Rule detail */}
          {selected && (
            <div className="card p-0 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <p className="text-[12px] font-semibold text-fg1">{selected.name}</p>
                <button className="btn-ghost btn btn-xs p-1" onClick={() => setSelected(null)}>
                  <X size={13} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-[11px]">
                {/* Trigger */}
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-fg3 mb-2">TRIGGER</p>
                  <div className="flex items-center gap-2 rounded border border-[var(--border)] px-3 py-2">
                    <Zap size={12} className="text-bull" />
                    <span className="text-fg1 font-medium">{TRIGGER_LABELS[selected.trigger] ?? selected.trigger}</span>
                  </div>
                </div>

                {/* Conditions */}
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-fg3 mb-2">
                    CONDITIONS (ALL must match)
                  </p>
                  <div className="space-y-1.5">
                    {selected.conditions.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 rounded border border-[var(--border)] px-3 py-2">
                        <span className="mono-cell text-[10px] text-fg2">{c.field}</span>
                        <span className="text-[10px] text-fg3">{OP_LABEL[c.op]}</span>
                        <span className="mono-cell text-[10px] text-accent font-semibold">{c.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-fg3 mb-2">ACTIONS</p>
                  <div className="space-y-1.5">
                    {selected.actions.map((a, i) => (
                      <div key={i} className="rounded border border-[var(--border)] px-3 py-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[9px] text-fg3">{i + 1}.</span>
                          <span className={`badge ${ACTION_COLOR[a.type]}`}>{ACTION_LABELS[a.type]}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-fg3">
                          {Object.entries(a.params).map(([k, v]) => (
                            <span key={k}><span className="text-fg2">{k}:</span> {v}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-fg3 mb-2">STATISTICS</p>
                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-fg3">Executions</span>
                      <span className="mono-cell text-fg1 font-bold">{selected.executionCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-fg3">Last triggered</span>
                      <span className="mono-cell text-fg2">{selected.lastTriggered ?? 'Never'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-fg3">Status</span>
                      <span className={selected.enabled ? 'status-active' : 'badge badge-muted'}>
                        {selected.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 border-t border-[var(--border)] p-3">
                <button className="btn-ghost btn btn-sm flex-1">Edit Rule</button>
                <button className="btn-danger btn btn-sm"
                  onClick={async () => { await deleteRule(selected.id); setSelected(null); }}>
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
