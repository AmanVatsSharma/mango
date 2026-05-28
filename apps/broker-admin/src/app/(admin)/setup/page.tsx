/**
 * File:        apps/broker-admin/src/app/(admin)/setup/page.tsx
 * Module:      broker-admin · Setup Wizard
 * Purpose:     Multi-step onboarding wizard for newly onboarded brokers to configure
 *              their brokerage before going live. Steps: Legal Entity → Brand Config →
 *              Branch & Desk → Activate. Guarded by SetupGuard in the admin layout.
 *
 * Exports:
 *   - SetupPage — client component; renders the multi-step wizard
 *
 * Depends on:
 *   - ../../lib/api/hooks/use-broker-setup — useSetupStatus, useSetupMutations
 *   - ../../lib/tenant/tenant-context — useTenant (for tenantCode)
 *
 * Side-effects:
 *   - POST calls to /broker-setup/legal-entity, /brand-config, /branch, /desk
 *   - POST to /broker-setup/advance (advances tenant PENDING → ACTIVE)
 *   - Redirects to /dashboard on completion
 *
 * Key invariants:
 *   - Wizard cannot be skipped — SetupGuard blocks all other routes until complete
 *   - Steps are sequential — later steps require earlier ones to succeed first
 *   - advance() returns 409 if already ACTIVE — redirect to /dashboard
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-11
 */

'use client';

import { useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
import { CheckCircle2, ChevronRight, Building2, Palette, GitBranch, Zap } from 'lucide-react';
import { useSetupStatus, useSetupMutations } from '../../../lib/api/hooks/use-broker-setup';
import { useTenant } from '../../../lib/tenant/tenant-context';

const STEPS = [
  { id: 'legal',    label: 'Legal Entity',   icon: Building2,  description: 'Company registration details' },
  { id: 'brand',    label: 'Brand Config',  icon: Palette,    description: 'Logo, colors, display name' },
  { id: 'hierarchy',label: 'Branch & Desk',   icon: GitBranch,  description: 'Your broker hierarchy root' },
  { id: 'activate', label: 'Go Live',        icon: Zap,        description: 'Activate your brokerage' },
] as const;

type StepId = typeof STEPS[number]['id'];

/* ── Field components ──────────────────────────────────────────────────────── */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="kpi-label block">{label}</label>
      {hint && <p className="text-[10px] text-fg3">{hint}</p>}
      {children}
    </div>
  );
}

function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`input w-full ${className}`}
      {...props}
    />
  );
}

function Select({ className = '', children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`input w-full ${className}`} {...props}>
      {children}
    </select>
  );
}

/* ── Progress indicator ─────────────────────────────────────────────────────── */

function StepProgress({ current }: { current: StepId }) {
  const currentIndex = STEPS.findIndex(s => s.id === current);
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, i) => {
        const done = i < currentIndex;
        const active = step.id === current;
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all
                  ${done   ? 'border-bull bg-bull/10 text-bull' : ''}
                  ${active ? 'border-accent bg-accent/10 text-accent' : ''}
                  ${!done && !active ? 'border-border text-fg3' : ''}`}
              >
                {done ? <CheckCircle2 size={16} /> : <step.icon size={16} />}
              </div>
              <span
                className={`mt-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-widest
                  ${active ? 'text-accent' : done ? 'text-bull' : 'text-fg3'}`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-8 sm:w-16 mb-4 mx-1 transition-colors ${done ? 'bg-bull' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Step 1: Legal Entity ─────────────────────────────────────────────────── */

function LegalEntityStep({
  done,
  onNext,
}: {
  done: boolean;
  onNext: (data: { legalName: string; registrationNumber: string; countryCode: string; type: string }) => void;
}) {
  const [form, setForm] = useState({ legalName: '', registrationNumber: '', countryCode: 'IN', type: 'PRIMARY' });
  const { createLegalEntity, isLoading, error } = useSetupMutations();

  const handle = async () => {
    if (!form.legalName || !form.registrationNumber) return;
    const result = await createLegalEntity(form);
    if (result !== null) onNext(form);
  };

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-4">
        <Field label="Legal Company Name" hint="As registered with your regulator">
          <Input
            value={form.legalName}
            onChange={e => setForm(f => ({ ...f, legalName: e.target.value }))}
            placeholder="Acme Securities Ltd."
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Registration Number" hint="Company/LLC registration number">
            <Input
              value={form.registrationNumber}
              onChange={e => setForm(f => ({ ...f, registrationNumber: e.target.value }))}
              placeholder="CIN / LLC-2024-XXXXX"
            />
          </Field>
          <Field label="Entity Type">
            <Select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              <option value="PRIMARY">Primary</option>
              <option value="SUBSIDIARY">Subsidiary</option>
              <option value="BRANCH">Branch Office</option>
            </Select>
          </Field>
        </div>
        <Field label="Country of Registration">
          <Select value={form.countryCode} onChange={e => setForm(f => ({ ...f, countryCode: e.target.value }))}>
            <option value="IN">India</option>
            <option value="US">United States</option>
            <option value="GB">United Kingdom</option>
            <option value="SG">Singapore</option>
            <option value="AE">United Arab Emirates</option>
            <option value="SC">Seychelles</option>
            <option value="MY">Malaysia</option>
            <option value="HK">Hong Kong</option>
            <option value="CY">Cyprus</option>
            <option value="VG">British Virgin Islands</option>
          </Select>
        </Field>
      </div>
      {error && <p className="text-[12px] text-bear">{error}</p>}
      {done && <p className="flex items-center gap-2 text-[12px] text-bull"><CheckCircle2 size={14} /> Legal entity saved</p>}
      <div className="flex justify-end">
        <button
          className="btn-primary btn flex items-center gap-2"
          disabled={isLoading || !form.legalName || !form.registrationNumber}
          onClick={handle}
        >
          {isLoading ? 'Saving…' : 'Save & Continue'} <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

/* ── Step 2: Brand Config ─────────────────────────────────────────────────── */

function BrandConfigStep({
  done,
  onNext,
  tenantCode,
}: {
  done: boolean;
  onNext: () => void;
  tenantCode: string;
}) {
  const [form, setForm] = useState({
    appName: tenantCode.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    primaryColor: '#3B82F6',
    logoUrl: '',
    supportEmail: '',
  });
  const { upsertBrandConfig, isLoading, error } = useSetupMutations();

  const handle = async () => {
    const result = await upsertBrandConfig(form);
    if (result !== null) onNext();
  };

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-4">
        <Field label="Brand / App Display Name" hint="Shown in trader terminals and login screens">
          <Input
            value={form.appName}
            onChange={e => setForm(f => ({ ...f, appName: e.target.value }))}
            placeholder="Acme Markets"
          />
        </Field>
        <Field label="Support Email">
          <Input
            type="email"
            value={form.supportEmail}
            onChange={e => setForm(f => ({ ...f, supportEmail: e.target.value }))}
            placeholder="support@acmemarkets.com"
          />
        </Field>
        <Field label="Logo URL" hint="Publicly accessible image URL">
          <Input
            value={form.logoUrl}
            onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))}
            placeholder="https://cdn.example.com/logo.png"
          />
        </Field>
        <Field label="Primary / Accent Color">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.primaryColor}
              onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
              className="h-10 w-14 cursor-pointer rounded border border-[var(--border)] bg-transparent"
            />
            <Input
              className="flex-1 mono-cell"
              value={form.primaryColor}
              onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
              placeholder="#3B82F6"
            />
          </div>
        </Field>
        {/* Live preview */}
        <div className="overflow-hidden rounded-lg border border-white/10 bg-[#06080A] p-3"
          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
          <div className="mb-2 flex items-center gap-2 border-b border-white/8 pb-2">
            <div className="h-4 w-4 rounded-full" style={{ background: form.logoUrl ? 'transparent' : form.primaryColor }} />
            <span className="font-display text-[13px] font-bold tracking-wide" style={{ color: form.primaryColor }}>
              {form.appName || 'Your Brokerage'}
            </span>
          </div>
          <div className="space-y-1">
            <p className="font-mono text-[11px] text-fg2">EUR/USD <span className="text-bull">1.08942</span></p>
            <p className="text-[10px] text-fg3">Go Live · Activate your brokerage</p>
          </div>
        </div>
      </div>
      {error && <p className="text-[12px] text-bear">{error}</p>}
      {done && <p className="flex items-center gap-2 text-[12px] text-bull"><CheckCircle2 size={14} /> Brand config saved</p>}
      <div className="flex justify-end">
        <button
          className="btn-primary btn flex items-center gap-2"
          disabled={isLoading || !form.appName}
          onClick={handle}
        >
          {isLoading ? 'Saving…' : 'Save & Continue'} <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

/* ── Step 3: Branch & Desk ───────────────────────────────────────────────── */

function HierarchyStep({
  done,
  onNext,
}: {
  done: boolean;
  onNext: () => void;
}) {
  const [branch, setBranch] = useState({ branchCode: '', displayName: '', countryCode: 'IN' });
  const [desk, setDesk] = useState({ deskCode: '', displayName: '' });
  const [branchId, setBranchId] = useState<string | null>(null);
  const [step, setStep] = useState<'branch' | 'desk'>('branch');
  const { createBranch, createDesk, isLoading, error } = useSetupMutations();

  const handleBranch = async () => {
    if (!branch.branchCode || !branch.displayName) return;
    const result = await createBranch(branch as Parameters<typeof createBranch>[0]);
    if (result !== null) {
      // Extract branchId from response (API returns the created branch)
      const data = (result as any);
      setBranchId(data?.id ?? null);
      setStep('desk');
    }
  };

  const handleDesk = async () => {
    if (!desk.deskCode || !desk.displayName || !branchId) return;
    const result = await createDesk({ branchId, ...desk });
    if (result !== null) onNext();
  };

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-4">
        {step === 'branch' && (
          <>
            <p className="text-[12px] text-fg3">
              Create your top-level branch. All sub-brokers and dealers will sit under this.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Branch Code" hint="Short slug, no spaces">
                <Input
                  value={branch.branchCode}
                  onChange={e => setBranch(b => ({ ...b, branchCode: e.target.value.toUpperCase().replace(/\s/g, '-') }))}
                  placeholder="HQ"
                />
              </Field>
              <Field label="Branch Display Name">
                <Input
                  value={branch.displayName}
                  onChange={e => setBranch(b => ({ ...b, displayName: e.target.value }))}
                  placeholder="Headquarters"
                />
              </Field>
            </div>
            <Field label="Country">
              <Select value={branch.countryCode} onChange={e => setBranch(b => ({ ...b, countryCode: e.target.value }))}>
                <option value="IN">India</option>
                <option value="US">United States</option>
                <option value="GB">United Kingdom</option>
                <option value="SG">Singapore</option>
                <option value="AE">United Arab Emirates</option>
              </Select>
            </Field>
            <div className="flex justify-end">
              <button
                className="btn-primary btn flex items-center gap-2"
                disabled={isLoading || !branch.branchCode || !branch.displayName}
                onClick={handleBranch}
              >
                {isLoading ? 'Creating…' : 'Create Branch'} <ChevronRight size={14} />
              </button>
            </div>
          </>
        )}
        {step === 'desk' && (
          <>
            <p className="flex items-center gap-2 text-[12px] text-bull">
              <CheckCircle2 size={14} /> Branch created. Now add your first trading desk.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Desk Code">
                <Input
                  value={desk.deskCode}
                  onChange={e => setDesk(d => ({ ...d, deskCode: e.target.value.toUpperCase().replace(/\s/g, '-') }))}
                  placeholder="DESK-001"
                />
              </Field>
              <Field label="Desk Display Name">
                <Input
                  value={desk.displayName}
                  onChange={e => setDesk(d => ({ ...d, displayName: e.target.value }))}
                  placeholder="Retail Trading Desk"
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost btn" onClick={() => setStep('branch')}>Back</button>
              <button
                className="btn-primary btn flex items-center gap-2"
                disabled={isLoading || !desk.deskCode || !desk.displayName}
                onClick={handleDesk}
              >
                {isLoading ? 'Creating…' : 'Create Desk & Continue'} <ChevronRight size={14} />
              </button>
            </div>
          </>
        )}
      </div>
      {error && <p className="text-[12px] text-bear">{error}</p>}
      {done && <p className="flex items-center gap-2 text-[12px] text-bull"><CheckCircle2 size={14} /> Branch & desk created</p>}
    </div>
  );
}

/* ── Step 4: Activate ──────────────────────────────────────────────────────── */

function ActivateStep({ onComplete }: { onComplete: () => void }) {
  const router = useRouter();
  const { advance, isLoading, error } = useSetupMutations();

  const handle = async () => {
    const result = await advance();
    if (result?.success) {
      onComplete();
      router.replace('/dashboard');
    }
  };

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-3 rounded-lg border border-bull/20 bg-bull/5 p-4">
          <Zap size={20} className="text-bull shrink-0" />
          <div>
            <p className="text-[13px] font-semibold text-fg1">Ready to go live</p>
            <p className="text-[11px] text-fg3 mt-0.5">
              Your brokerage is configured. Click Activate to go live and open for business.
              Your traders will be able to register and trade.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {[
            'Legal entity registered',
            'Brand configured and ready',
            'Branch & trading desk created',
          ].map(item => (
            <div key={item} className="flex items-center gap-2 text-[12px] text-fg2">
              <CheckCircle2 size={14} className="text-bull shrink-0" />
              {item}
            </div>
          ))}
        </div>
      </div>
      {error && <p className="text-[12px] text-bear">{error}</p>}
      <div className="flex justify-end">
        <button
          className="btn-primary btn flex items-center gap-2 px-6"
          disabled={isLoading}
          onClick={handle}
        >
          {isLoading ? 'Activating…' : 'Activate Brokerage'} <Zap size={14} />
        </button>
      </div>
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────────────────────────── */

export default function SetupPage() {
  const { tenantCode } = useTenant();
  const { status } = useSetupStatus();

  const [step, setStep] = useState<StepId>('legal');
  const [completed, setCompleted] = useState<Record<StepId, boolean>>({
    legal: false,
    brand: false,
    hierarchy: false,
    activate: false,
  });

  // Already ACTIVE — redirect to dashboard immediately
  const handleComplete = useCallback(() => {
    setCompleted(c => ({ ...c, activate: true }));
  }, []);

  if (status?.status === 'ACTIVE') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-3">
          <CheckCircle2 size={40} className="text-bull mx-auto" />
          <p className="text-[14px] font-semibold text-fg1">Brokerage already active</p>
          <p className="text-[12px] text-fg3">Redirecting to dashboard…</p>
        </div>
      </div>
    );
  }

  // Pre-fill completed steps from status
  const hasCompleted = (id: StepId) => {
    if (id === 'legal')     return !!status?.hasLegalEntity || completed.legal;
    if (id === 'brand')    return !!status?.hasBrandConfig || completed.brand;
    if (id === 'hierarchy') return !!status?.hasBranch || completed.hierarchy;
    return false;
  };

  const advanceTo = (id: StepId) => {
    setCompleted(c => ({ ...c, [id]: true }));
    const idx = STEPS.findIndex(s => s.id === id);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1].id);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="module-header border-b border-[var(--border)] px-6 py-4">
        <div>
          <h1 className="module-title">Setup Your Brokerage</h1>
          <p className="module-subtitle">
            Complete these steps to activate your account · {tenantCode ?? '…'}
          </p>
        </div>
      </div>

      <div className="flex flex-1 overflow-y-auto">
        <div className="flex w-full max-w-3xl flex-col gap-6 px-6 py-6 mx-auto">

          {/* Progress */}
          <div className="flex justify-center">
            <StepProgress current={step} />
          </div>

          {/* Step title */}
          <div className="text-center space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-accent">
              Step {STEPS.findIndex(s => s.id === step) + 1} of {STEPS.length}
            </p>
            <h2 className="font-display text-[18px] font-bold tracking-wide text-fg1 uppercase">
              {STEPS.find(s => s.id === step)?.label}
            </h2>
            <p className="text-[12px] text-fg3">
              {STEPS.find(s => s.id === step)?.description}
            </p>
          </div>

          {/* Step content */}
          {step === 'legal'     && <LegalEntityStep  done={hasCompleted('legal')}     onNext={d => advanceTo('brand')} />}
          {step === 'brand'     && <BrandConfigStep  done={hasCompleted('brand')}     onNext={() => advanceTo('hierarchy')} tenantCode={tenantCode ?? ''} />}
          {step === 'hierarchy' && <HierarchyStep   done={hasCompleted('hierarchy')} onNext={() => advanceTo('activate')} />}
          {step === 'activate'  && <ActivateStep    onComplete={handleComplete} />}
        </div>
      </div>
    </div>
  );
}