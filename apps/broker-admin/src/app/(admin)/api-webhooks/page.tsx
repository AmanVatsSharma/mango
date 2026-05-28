/**
 * File:        apps/broker-admin/src/app/(admin)/api-webhooks/page.tsx
 * Module:      broker-admin · Platform · API & Webhooks
 * Purpose:     API key management and webhook endpoint configuration
 *
 * Exports:
 *   - default (ApiWebhooksPage) — two sub-tabs: API Keys and Webhooks
 *
 * Depends on:
 *   - none (all data is local state seeded from constants)
 *
 * Side-effects:
 *   - Local state only; key/webhook mutations do not persist
 *   - "Generate Key" shows 1.2s delay then reveals masked key
 *
 * Key invariants:
 *   - API keys are masked by default; "Reveal" shows full key once
 *   - Webhook secret is SHA-256 HMAC; not stored client-side in real impl
 *   - lastUsed and requestCount are display-only mock values
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState } from 'react';
import { Plus, Eye, EyeOff, Copy, Trash2, RefreshCw, X, Zap, Key } from 'lucide-react';

type ApiKey = {
  id: string;
  name: string;
  key: string;
  permissions: string[];
  createdAt: string;
  lastUsed: string;
  requestCount: number;
  active: boolean;
};

type Webhook = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  secret: string;
  lastTriggered?: string;
  failCount: number;
};

const ALL_PERMISSIONS = ['read:clients', 'read:orders', 'read:transactions', 'write:orders', 'write:clients', 'read:reports', 'write:transactions', 'admin'];
const ALL_EVENTS = ['client.created', 'client.kyc_approved', 'client.kyc_rejected', 'deposit.completed', 'deposit.rejected', 'withdrawal.completed', 'withdrawal.rejected', 'order.opened', 'order.closed', 'margin_call.triggered', 'account.suspended'];

const INIT_KEYS: ApiKey[] = [
  { id: 'k1', name: 'CRM Integration', key: 'bk_live_4f8c2e...3a91', permissions: ['read:clients','read:transactions'], createdAt: '2024-01-01', lastUsed: '2 hours ago', requestCount: 14832, active: true },
  { id: 'k2', name: 'Risk System',     key: 'bk_live_7d3b1a...9f42', permissions: ['read:clients','read:orders'],       createdAt: '2024-01-10', lastUsed: '5 min ago',   requestCount: 98210, active: true },
  { id: 'k3', name: 'Dev Sandbox',     key: 'bk_test_1c4d9e...2b87', permissions: ['read:clients','read:orders','read:transactions'], createdAt: '2023-12-01', lastUsed: '3 days ago', requestCount: 1240, active: false },
];

const INIT_WEBHOOKS: Webhook[] = [
  { id: 'wh1', url: 'https://crm.example.com/hooks/broker', events: ['client.created','client.kyc_approved','deposit.completed'], active: true,  secret: 'whsec_a1b2c3...', lastTriggered: '5 min ago', failCount: 0 },
  { id: 'wh2', url: 'https://risk.example.com/alerts',      events: ['margin_call.triggered','account.suspended'],                  active: true,  secret: 'whsec_d4e5f6...', lastTriggered: '1 hour ago', failCount: 2 },
  { id: 'wh3', url: 'https://notify.example.com/deposits',  events: ['deposit.completed','withdrawal.completed'],                   active: false, secret: 'whsec_g7h8i9...', failCount: 0 },
];

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-bull/30' : 'bg-[var(--border-md)]'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

function AddKeyModal({ onClose, onSave }: {
  onClose: () => void;
  onSave: (k: Omit<ApiKey, 'id' | 'key' | 'createdAt' | 'lastUsed' | 'requestCount'>) => void;
}) {
  const [name, setName] = useState('');
  const [perms, setPerms] = useState<Set<string>>(new Set(['read:clients']));
  const toggle = (p: string) => { const n = new Set(perms); if (n.has(p)) n.delete(p); else n.add(p); setPerms(n); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-[460px] rounded-lg border border-[var(--border)] bg-[var(--bg-panel)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <p className="module-title">Create API Key</p>
          <button className="btn-ghost btn btn-xs p-1.5" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="kpi-label mb-1 block">Key Name</label>
            <input className="input" placeholder="e.g. CRM Integration" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="kpi-label mb-3 block">Permissions</label>
            <div className="flex flex-wrap gap-2">
              {ALL_PERMISSIONS.map(p => (
                <button key={p}
                  className={`rounded border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                    perms.has(p) ? 'border-accent/40 bg-accent/10 text-accent' : 'border-[var(--border)] text-fg3'
                  }`}
                  onClick={() => toggle(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button className="btn-ghost btn btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn-primary btn btn-sm" disabled={!name}
            onClick={() => { onSave({ name, permissions: Array.from(perms), active: true }); onClose(); }}>
            Generate Key
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ApiWebhooksPage() {
  const [tab, setTab] = useState<'keys' | 'webhooks'>('keys');
  const [keys, setKeys] = useState<ApiKey[]>(INIT_KEYS);
  const [webhooks, setWebhooks] = useState<Webhook[]>(INIT_WEBHOOKS);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [showAddKey, setShowAddKey] = useState(false);
  const [generating, setGenerating] = useState(false);

  const toggleReveal = (id: string) => {
    const n = new Set(revealed);
    if (n.has(id)) n.delete(id); else n.add(id);
    setRevealed(n);
  };

  const copyKey = (id: string, key: string) => {
    navigator.clipboard.writeText(key).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  const addKey = (partial: Omit<ApiKey, 'id' | 'key' | 'createdAt' | 'lastUsed' | 'requestCount'>) => {
    setGenerating(true);
    setTimeout(() => {
      setKeys(ks => [...ks, {
        ...partial, id: 'k' + Date.now(),
        key: `bk_live_${Math.random().toString(36).slice(2, 10)}...${Math.random().toString(36).slice(2, 6)}`,
        createdAt: '2024-01-15', lastUsed: 'Never', requestCount: 0,
      }]);
      setGenerating(false);
    }, 1200);
  };

  const toggleWebhook = (id: string) =>
    setWebhooks(ws => ws.map(w => w.id === id ? { ...w, active: !w.active } : w));

  const testWebhook = (id: string) =>
    setWebhooks(ws => ws.map(w => w.id === id ? { ...w, lastTriggered: 'Just now' } : w));

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">API & Webhooks</p>
          <p className="module-subtitle">{keys.filter(k => k.active).length} active keys · {webhooks.filter(w => w.active).length} active webhooks</p>
        </div>
        {tab === 'keys' && (
          <button className="btn-primary btn btn-sm" onClick={() => setShowAddKey(true)} disabled={generating}>
            {generating ? <><RefreshCw size={13} className="animate-spin" /> Generating...</> : <><Plus size={13} /> New API Key</>}
          </button>
        )}
      </div>

      <div className="p-6 space-y-4">
        <div className="chart-tabs">
          <button className={`chart-tab ${tab === 'keys' ? 'active' : ''}`} onClick={() => setTab('keys')}>
            <Key size={12} /> API Keys
            <span className="ml-1 font-mono text-[9px] text-fg3">{keys.length}</span>
          </button>
          <button className={`chart-tab ${tab === 'webhooks' ? 'active' : ''}`} onClick={() => setTab('webhooks')}>
            <Zap size={12} /> Webhooks
            <span className="ml-1 font-mono text-[9px] text-fg3">{webhooks.length}</span>
          </button>
        </div>

        {/* API Keys */}
        {tab === 'keys' && (
          <div className="space-y-3">
            {keys.map(k => (
              <div key={k.id} className={`card p-4 ${!k.active ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-fg1">{k.name}</p>
                      <span className={k.active ? 'status-active' : 'badge badge-muted'}>
                        {k.active ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="mono-cell text-[11px] text-fg2">
                        {revealed.has(k.id) ? k.key : k.key.replace(/[a-z0-9]/g, '•')}
                      </p>
                      <button className="btn-ghost btn btn-xs" onClick={() => toggleReveal(k.id)}>
                        {revealed.has(k.id) ? <EyeOff size={11} /> : <Eye size={11} />}
                      </button>
                      <button className="btn-ghost btn btn-xs" onClick={() => copyKey(k.id, k.key)}>
                        <Copy size={11} />
                        {copied === k.id && <span className="text-[9px] text-bull ml-1">Copied</span>}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {k.permissions.map(p => (
                        <span key={p} className="badge badge-muted">{p}</span>
                      ))}
                    </div>
                    <div className="flex gap-4 text-[10px] text-fg3">
                      <span>Created {k.createdAt}</span>
                      <span>Last used {k.lastUsed}</span>
                      <span className="mono-cell">{k.requestCount.toLocaleString()} requests</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Toggle on={k.active} onChange={v => setKeys(ks => ks.map(x => x.id === k.id ? { ...x, active: v } : x))} />
                    <button className="btn-danger btn btn-xs"
                      onClick={() => setKeys(ks => ks.filter(x => x.id !== k.id))}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Webhooks */}
        {tab === 'webhooks' && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button className="btn-primary btn btn-sm"><Plus size={13} /> Add Endpoint</button>
            </div>
            {webhooks.map(w => (
              <div key={w.id} className={`card p-4 ${!w.active ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="mono-cell text-[12px] font-medium text-fg1">{w.url}</p>
                      <span className={w.active ? 'status-active' : 'badge badge-muted'}>
                        {w.active ? 'Active' : 'Disabled'}
                      </span>
                      {w.failCount > 0 && (
                        <span className="badge badge-bear">{w.failCount} fails</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {w.events.map(e => (
                        <span key={e} className="badge badge-muted text-[9px]">{e}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-fg3">
                      <span className="mono-cell">{w.secret}</span>
                      {w.lastTriggered && <span>Last triggered {w.lastTriggered}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button className="btn-ghost btn btn-xs" onClick={() => testWebhook(w.id)}>Test</button>
                    <Toggle on={w.active} onChange={() => toggleWebhook(w.id)} />
                    <button className="btn-danger btn btn-xs"
                      onClick={() => setWebhooks(ws => ws.filter(x => x.id !== w.id))}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddKey && (
        <AddKeyModal onClose={() => setShowAddKey(false)} onSave={addKey} />
      )}
    </div>
  );
}
