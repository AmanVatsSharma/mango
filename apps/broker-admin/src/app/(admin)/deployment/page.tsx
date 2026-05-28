/**
 * File:        apps/broker-admin/src/app/(admin)/deployment/page.tsx
 * Module:      broker-admin · Platform · Deployment Management
 * Purpose:     Full deployment dashboard — server health grid, deploy trigger,
 *              history table, DNS config guide, and per-domain SSL status.
 *
 * Exports:
 *   - default (DeploymentPage) — deployment management page
 *
 * Depends on:
 *   - ../../../lib/api/hooks/use-deployment  — useDeployment
 *   - ../../../lib/api/hooks/use-domains    — useDomains (for DNS guide context)
 *
 * Side-effects:
 *   - GET /admin/deployment/status on mount
 *   - GET /admin/deployment/history on mount
 *   - POST /admin/deployment/deploy on trigger
 *   - GET /tenancy/domains for DNS config guide
 *
 * Key invariants:
 *   - Deployment trigger is optimistic; user should refetch to confirm completion
 *   - All domains/URLs use font-mono; all timestamps use font-mono with tnum
 *   - Health indicators use --bull / --bear tokens
 *   - Panel titles use font-display ALL CAPS
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

'use client';

import { useState } from 'react';
import { Server, Globe, ShieldCheck, RefreshCw, Upload, CheckCircle, XCircle, Loader, AlertTriangle, Eye } from 'lucide-react';
import { useDeployment } from '../../../lib/api/hooks/use-deployment';

const HEALTH_ITEMS = [
  { key: 'api',     label: 'API Gateway',  description: 'REST + GraphQL endpoint' },
  { key: 'db',      label: 'PostgreSQL',    description: 'Primary data store' },
  { key: 'redis',   label: 'Redis',         description: 'Cache + session store' },
  { key: 'ws',      label: 'WebSocket',     description: 'PranaStream gateway' },
  { key: 'graphql', label: 'GraphQL',        description: 'Admin schema endpoint' },
] as const;

function HealthCard({ label, description, online }: { label: string; description: string; online: boolean }) {
  return (
    <div className={`rounded-lg border p-4 flex flex-col gap-2 ${online ? 'border-[var(--border)] bg-[var(--bg-elevated)]' : 'border-bear/40 bg-bear/5'}`}>
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold text-fg1">{label}</p>
        <div className={`h-2 w-2 rounded-full ${online ? 'bg-bull shadow-[0_0_8px_var(--bull)]' : 'bg-bear shadow-[0_0_8px_var(--bear)]'}`} />
      </div>
      <p className="text-[11px] text-fg3">{description}</p>
      <p className={`text-[11px] font-medium ${online ? 'text-bull' : 'text-bear'}`}>
        {online ? 'Online' : 'Offline'}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'SUCCESS') return <span className="inline-flex items-center gap-1 text-[11px] text-bull"><CheckCircle size={12} /> SUCCESS</span>;
  if (status === 'FAILED')  return <span className="inline-flex items-center gap-1 text-[11px] text-bear"><XCircle size={12} /> FAILED</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] text-warn"><Loader size={12} className="animate-spin" /> IN PROGRESS</span>;
}

export default function DeploymentPage() {
  const { status, history, isLoading, isDeploying, error, refetch, triggerDeploy } = useDeployment();
  const [deployVersion, setDeployVersion] = useState('');
  const [deployTriggered, setDeployTriggered] = useState(false);

  const handleDeploy = async () => {
    if (!deployVersion.trim()) return;
    const ok = await triggerDeploy(deployVersion.trim());
    if (ok) {
      setDeployTriggered(true);
      setDeployVersion('');
      setTimeout(() => { setDeployTriggered(false); refetch(); }, 3000);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Page header */}
      <div className="module-header">
        <div>
          <p className="module-title">Web App Deployment</p>
          <p className="module-subtitle">Server health, deploy history, DNS &amp; SSL management</p>
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1 rounded-full border ${
              status.status === 'ACTIVE' ? 'text-bull border-bull/30 bg-bull/10' :
              status.status === 'DEPLOYING' ? 'text-warn border-warn/30 bg-warn/10' :
              'text-bear border-bear/30 bg-bear/10'
            }`}>
              <div className={`h-1.5 w-1.5 rounded-full ${status.status === 'ACTIVE' ? 'bg-bull' : status.status === 'DEPLOYING' ? 'bg-warn' : 'bg-bear'}`} />
              {status.status}
            </span>
          )}
          <span className="mono-cell text-[12px] font-mono text-fg2">v{status?.version ?? '—'}</span>
          <button className="btn-ghost btn btn-sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '8px 12px', background: 'var(--bear-dim)', border: '1px solid var(--bear)', borderRadius: 6, fontSize: 12, color: 'var(--bear)' }}>
          {error}
        </div>
      )}

      <div className="p-6 space-y-5">
        {isLoading && !status ? (
          <div className="flex items-center gap-2 py-12 text-fg3">
            <Loader size={18} className="animate-spin" /> Loading deployment info…
          </div>
        ) : !status ? (
          <div className="flex flex-col items-center gap-3 py-12 text-fg3">
            <Server size={32} />
            <p>No deployment information available. Is the backend running?</p>
          </div>
        ) : (
          <>
            {/* Deployment card */}
            <div className="rounded-lg border border-[var(--border)] p-5 space-y-4">
              <p className="text-[11px] uppercase tracking-widest text-fg3 font-display">Current Deployment</p>
              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-fg3">Web App URL</p>
                  <a href={status.webAppUrl} target="_blank" rel="noopener noreferrer" className="mono-cell text-[13px] font-mono text-accent hover:underline">{status.webAppUrl}</a>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-fg3">Version</p>
                  <p className="mono-cell text-[16px] font-mono font-bold text-fg1">{status.version}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-fg3">Last Deployed</p>
                  <p className="mono-cell text-[13px] font-mono text-fg2">
                    {status.lastDeployed ? new Date(status.lastDeployed).toLocaleString() : 'Never'}
                  </p>
                </div>
              </div>

              {/* Deploy trigger */}
              <div className="flex items-center gap-3 border-t border-[var(--border)] pt-4 mt-2">
                <input
                  className="input w-48 mono-cell text-[12px] font-mono"
                  placeholder="e.g. v2.4.1"
                  value={deployVersion}
                  onChange={e => setDeployVersion(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleDeploy(); }}
                />
                <button
                  className="btn-primary btn btn-sm flex items-center gap-2"
                  disabled={isDeploying || !deployVersion.trim() || deployTriggered}
                  onClick={handleDeploy}
                >
                  {isDeploying ? <Loader size={12} className="animate-spin" /> : <Upload size={12} />}
                  {deployTriggered ? 'Deployment Triggered' : isDeploying ? 'Triggering…' : 'Deploy New Version'}
                </button>
                {deployTriggered && (
                  <span className="text-[12px] text-warn flex items-center gap-1">
                    <AlertTriangle size={13} /> Deployment running in background — refresh to check status
                  </span>
                )}
              </div>
            </div>

            {/* Server health grid */}
            <div>
              <p className="text-[11px] uppercase tracking-widest text-fg3 font-display mb-3">Server Health</p>
              <div className="grid grid-cols-5 gap-3">
                {HEALTH_ITEMS.map(({ key, label, description }) => (
                  <HealthCard
                    key={key}
                    label={label}
                    description={description}
                    online={status.health[key] as boolean}
                  />
                ))}
              </div>
            </div>

            {/* Deploy history */}
            {history.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-widest text-fg3 font-display mb-3">Deploy History</p>
                <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Version</th>
                        <th>Deployed At</th>
                        <th>Status</th>
                        <th>Triggered By</th>
                        <th>Duration</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map(entry => (
                        <tr key={entry.id}>
                          <td className="mono-cell text-[12px] font-mono text-accent">{entry.version}</td>
                          <td className="mono-cell text-[11px] font-mono text-fg2">{new Date(entry.timestamp).toLocaleString()}</td>
                          <td><StatusBadge status={entry.status} /></td>
                          <td className="text-[12px] text-fg2">{entry.triggeredBy}</td>
                          <td className="mono-cell text-[11px] font-mono text-fg3">
                            {entry.durationMs ? `${(entry.durationMs / 1000).toFixed(1)}s` : '—'}
                          </td>
                          <td>
                            <button className="btn-ghost btn btn-xs text-[11px]">
                              <Eye size={12} /> Logs
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* DNS config guide */}
            <div className="rounded-lg border border-[var(--border)] p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Globe size={15} className="text-accent" />
                <p className="text-[11px] uppercase tracking-widest text-fg3 font-display">DNS Configuration Guide</p>
              </div>
              <p className="text-[12px] text-fg3">
                Add the following DNS records at your domain registrar to point your custom domain to the platform.
              </p>
              <div className="rounded border border-[var(--border)] overflow-hidden">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Record Type</th>
                      <th>Host / Name</th>
                      <th>Value / Target</th>
                      <th>TTL</th>
                      <th>Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="mono-cell text-[12px] font-mono text-bull">A</td>
                      <td className="mono-cell text-[12px] font-mono text-fg1">@</td>
                      <td className="mono-cell text-[12px] font-mono text-accent">{status.webAppUrl}</td>
                      <td className="mono-cell text-[11px] font-mono text-fg3">3600</td>
                      <td className="mono-cell text-[11px] font-mono text-fg3">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="flex items-start gap-2 rounded border border-warn/20 bg-warn/5 p-3">
                <AlertTriangle size={14} className="text-warn mt-0.5 shrink-0" />
                <p className="text-[11px] text-fg3">
                  DNS propagation can take up to 48 hours. SSL certificates are provisioned automatically once DNS resolves.
                  Use the Domains page to verify DNS and check SSL status per domain.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}