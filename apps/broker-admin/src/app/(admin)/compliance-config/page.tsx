/**
 * File:        apps/broker-admin/src/app/(admin)/compliance-config/page.tsx
 * Module:      broker-admin · Platform · Compliance Configuration
 * Purpose:     KYC requirements, jurisdiction leverage caps, restricted countries, risk toggles
 *
 * Exports:
 *   - default (ComplianceConfigPage) — two-column settings panel with save feedback
 *
 * Depends on:
 *   - none (local state seeded from constants)
 *
 * Side-effects:
 *   - Local state; save shows "Saved!" for 2s
 *
 * Key invariants:
 *   - restricted Set is checked against ALL_COUNTRIES for badge display
 *   - Leverage caps are display-only (non-editable in demo); auto-applied flag shown
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

'use client';

import { useState } from 'react';
import { Save, AlertTriangle } from 'lucide-react';

const HIGH_RISK_COUNTRIES = ['AF','BY','CF','CD','CU','ER','ET','GN','GW','HT','IR','IQ','KP','LB','LY','ML','MM','NI','RU','SO','SS','SD','SY','UA','VE','YE','ZW'];
const RESTRICTED_COUNTRIES_DEFAULT = new Set(['KP','IR','SY','CU','SD','RU','BY']);
const ALL_COUNTRIES = [
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'CN', name: 'China',         flag: '🇨🇳' },
  { code: 'RU', name: 'Russia',        flag: '🇷🇺' },
  { code: 'IR', name: 'Iran',          flag: '🇮🇷' },
  { code: 'KP', name: 'North Korea',   flag: '🇰🇵' },
  { code: 'SY', name: 'Syria',         flag: '🇸🇾' },
  { code: 'BY', name: 'Belarus',       flag: '🇧🇾' },
  { code: 'CU', name: 'Cuba',          flag: '🇨🇺' },
  { code: 'SD', name: 'Sudan',         flag: '🇸🇩' },
  { code: 'AF', name: 'Afghanistan',   flag: '🇦🇫' },
];

const LEVERAGE_CAPS = [
  { jurisdiction: 'EU (ESMA)',         retail: '1:30', pro: '1:200', auto: true  },
  { jurisdiction: 'UK (FCA)',          retail: '1:30', pro: '1:200', auto: true  },
  { jurisdiction: 'Australia (ASIC)',  retail: '1:30', pro: '1:500', auto: false },
  { jurisdiction: 'Custom',            retail: '1:100', pro: '1:500', auto: false },
];

type Cfg = {
  minKycDeposit:      string;
  minKycWithdraw:     string;
  minKycTrade:        string;
  expiryAlertDays:    number;
  autoRestrictExpiry: boolean;
  negBalProtection:   boolean;
  riskDisclosure:     boolean;
  appTest:            boolean;
  restricted:         Set<string>;
};

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => onChange(!on)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-bull/30' : 'bg-[var(--border-md)]'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
      {label && <span className="text-[12px] text-fg2">{label}</span>}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-3 border-b border-[var(--border)] pb-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-fg3">{title}</p>
    </div>
  );
}

export default function ComplianceConfigPage() {
  const [cfg, setCfg] = useState<Cfg>({
    minKycDeposit: 'Full', minKycWithdraw: 'Full', minKycTrade: 'Basic',
    expiryAlertDays: 30, autoRestrictExpiry: true,
    negBalProtection: true, riskDisclosure: true, appTest: true,
    restricted: RESTRICTED_COUNTRIES_DEFAULT,
  });
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg(c => ({ ...c, [k]: v }));
  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const toggleRestricted = (code: string) => {
    const next = new Set(cfg.restricted);
    if (next.has(code)) next.delete(code); else next.add(code);
    set('restricted', next);
  };

  const highRiskCount = ALL_COUNTRIES.filter(c => HIGH_RISK_COUNTRIES.includes(c.code)).length;

  return (
    <div className="flex flex-col">
      <div className="module-header">
        <div>
          <p className="module-title">Compliance Configuration</p>
          <p className="module-subtitle">KYC requirements · Jurisdiction controls · Regulatory settings</p>
        </div>
        <button className="btn-primary btn btn-sm" onClick={handleSave}>
          <Save size={13} /> {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-2 gap-5">
          {/* Left column */}
          <div className="space-y-5">
            {/* KYC requirements */}
            <div className="card p-5">
              <SectionHeader title="KYC Requirements" />
              <div className="space-y-3">
                {[
                  { label: 'Minimum KYC for Deposit',    key: 'minKycDeposit' },
                  { label: 'Minimum KYC for Withdrawal', key: 'minKycWithdraw' },
                  { label: 'Minimum KYC for Trading',    key: 'minKycTrade' },
                ].map(field => (
                  <div key={field.key}>
                    <label className="kpi-label mb-1 block">{field.label}</label>
                    <select className="input"
                      value={(cfg as Record<string, unknown>)[field.key] as string}
                      onChange={e => set(field.key as keyof Cfg, e.target.value as never)}>
                      <option>None</option>
                      <option>Basic</option>
                      <option>Standard</option>
                      <option>Full</option>
                    </select>
                  </div>
                ))}
                <div>
                  <label className="kpi-label mb-1 block">KYC Expiry Alert (days before)</label>
                  <input className="input" type="number" min={1} max={90}
                    value={cfg.expiryAlertDays}
                    onChange={e => set('expiryAlertDays', +e.target.value)} />
                </div>
                <div className="mt-2">
                  <Toggle on={cfg.autoRestrictExpiry} onChange={v => set('autoRestrictExpiry', v)}
                    label="Auto-restrict account when KYC expires" />
                </div>
              </div>
            </div>

            {/* Leverage caps */}
            <div className="card p-5">
              <SectionHeader title="Leverage Caps by Jurisdiction" />
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Jurisdiction</th>
                    <th>Retail</th>
                    <th>Professional</th>
                    <th>Auto-Applied</th>
                  </tr>
                </thead>
                <tbody>
                  {LEVERAGE_CAPS.map(j => (
                    <tr key={j.jurisdiction}>
                      <td className="text-[12px] text-fg1">{j.jurisdiction}</td>
                      <td className="mono-cell text-[11px] text-warn">{j.retail}</td>
                      <td className="mono-cell text-[11px] text-accent">{j.pro}</td>
                      <td>
                        {j.auto
                          ? <span className="status-active">Auto</span>
                          : <span className="text-[11px] text-fg3">Manual</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-5">
            {/* Regulatory toggles */}
            <div className="card p-5">
              <SectionHeader title="Regulatory Protections" />
              <div className="space-y-3">
                <Toggle on={cfg.negBalProtection} onChange={v => set('negBalProtection', v)}
                  label="Negative balance protection (mandatory for retail)" />
                <Toggle on={cfg.riskDisclosure} onChange={v => set('riskDisclosure', v)}
                  label="Mandatory risk disclosure on account open" />
                <Toggle on={cfg.appTest} onChange={v => set('appTest', v)}
                  label="Appropriateness test for retail clients" />
              </div>
              <div className="mt-4 flex items-start gap-2 rounded border border-warn/20 bg-warn/5 px-3 py-2">
                <AlertTriangle size={12} className="mt-0.5 shrink-0 text-warn" />
                <p className="text-[10px] text-warn">
                  Disabling negative balance protection may violate ESMA/FCA regulations for retail clients.
                </p>
              </div>
            </div>

            {/* Country restrictions */}
            <div className="card p-5">
              <SectionHeader title="Country Restrictions" />
              <p className="text-[11px] text-fg3 mb-3">
                Restricted countries are blocked from account registration.
                {highRiskCount} FATF high-risk jurisdictions detected in configuration.
              </p>
              <div className="space-y-1.5">
                {ALL_COUNTRIES.map(c => {
                  const isRestricted = cfg.restricted.has(c.code);
                  const isHighRisk = HIGH_RISK_COUNTRIES.includes(c.code);
                  return (
                    <div key={c.code}
                      className="flex items-center justify-between rounded border border-[var(--border)] px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span>{c.flag}</span>
                        <p className="text-[12px] text-fg1">{c.name}</p>
                        {isHighRisk && (
                          <span className="badge badge-warn text-[9px]">High-Risk</span>
                        )}
                      </div>
                      <button
                        onClick={() => toggleRestricted(c.code)}
                        className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                          isRestricted
                            ? 'bg-bear/10 text-bear border border-bear/30'
                            : 'bg-[var(--bg-elevated)] text-fg3 border border-[var(--border)]'
                        }`}>
                        {isRestricted ? 'Restricted' : 'Allowed'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
