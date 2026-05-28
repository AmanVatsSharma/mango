/**
 * File:        apps/broker-admin/src/app/login/page.tsx
 * Module:      broker-admin · Login Page
 * Purpose:     Two-step OTP login for broker admins. Resolves the tenant code from
 *              TenantContext, fetches brand config for custom branding, then guides
 *              the user through mobile → OTP → authenticated shell.
 *              Uses the Obsidian shared auth UI (AuthShell + FormCard + MarketHero).
 *
 * Exports:
 *   - LoginPage() — client component
 *
 * Depends on:
 *   - ../../lib/tenant/tenant-context  — useTenant() for broker code
 *   - ../../lib/auth/auth-context      — useAuth() login()
 *   - @obsidian/web-auth               — AuthShell, FormCard, TextInput, PrimaryButton
 *
 * Side-effects:
 *   - Calls POST /auth/otp/request and POST /auth/otp/verify on the backend
 *   - Calls GET /tenancy/brand-config?slug={tenantCode} (public, no auth required)
 *
 * Key invariants:
 *   - 'use client' — OTP flow, state, router navigation
 *   - If brand config fetch fails (network down / tenant not found), silently falls back to defaults
 *   - Successful OTP verify stores token via auth-context and redirects to /dashboard
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-09
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '../../lib/tenant/tenant-context';
import { useAuth } from '../../lib/auth/auth-context';
import { AuthShell, FormCard, TextInput, PrimaryButton, FieldLabel, AuthIcons } from '@obsidian/web-auth';

interface BrandConfig {
  appName?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

async function fetchBrandConfig(tenantCode: string): Promise<BrandConfig> {
  try {
    const res = await fetch(`/api/tenancy/brand-config?slug=${encodeURIComponent(tenantCode)}`);
    if (!res.ok) return {};
    return res.json();
  } catch {
    return {};
  }
}

async function requestOtp(tenantCode: string, mobile: string): Promise<void> {
  const res = await fetch('/api/auth/otp/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tenant-id': tenantCode },
    body: JSON.stringify({ tenantId: tenantCode, mobileE164: mobile }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
}

async function verifyOtp(
  tenantCode: string,
  mobile: string,
  otp: string,
): Promise<{ accessToken: string }> {
  const res = await fetch('/api/auth/otp/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tenant-id': tenantCode },
    credentials: 'include',
    body: JSON.stringify({ tenantId: tenantCode, mobileE164: mobile, otp }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export default function LoginPage() {
  const { tenantCode } = useTenant();
  const { isAuthenticated, login } = useAuth();
  const router = useRouter();

  const [brand, setBrand] = useState<BrandConfig>({});
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'mobile' | 'otp'>('mobile');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) router.replace('/dashboard');
  }, [isAuthenticated, router]);

  // Fetch brand config once tenantCode resolves
  useEffect(() => {
    if (tenantCode) {
      fetchBrandConfig(tenantCode).then(setBrand);
    }
  }, [tenantCode]);

  async function handleRequestOtp() {
    if (!tenantCode) { setError('Tenant not resolved — check the URL'); return; }
    setError('');
    setLoading(true);
    try {
      await requestOtp(tenantCode, mobile.trim());
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (!tenantCode) { setError('Tenant not resolved'); return; }
    setError('');
    setLoading(true);
    try {
      const { accessToken } = await verifyOtp(tenantCode, mobile.trim(), otp.trim());
      login(accessToken, mobile.trim());
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  const brokerName = brand.appName ?? (tenantCode
    ? tenantCode.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : 'Obsidian');

  // OTP digit refs for step 2
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);

  function handleDigit(i: number, v: string) {
    const c = v.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = c;
    setDigits(next);
    setOtp(next.join(''));
    if (c && i < 5) otpRefs.current[i + 1]?.focus();
  }

  function handleDigitKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) otpRefs.current[i - 1]?.focus();
  }

  function handleDigitPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) {
      const arr = text.split('');
      setDigits(arr);
      setOtp(text);
      otpRefs.current[5]?.focus();
    }
    e.preventDefault();
  }

  const heroTitle = `${brokerName} Admin Portal`;
  const heroSubtitle = 'Manage clients, orders, and dealer operations for your brokerage.';

  if (step === 'mobile') {
    return (
      <AuthShell heroVariant="broker" heroTitle={heroTitle} heroSubtitle={heroSubtitle}>
        <FormCard
          title={`Sign in to ${brokerName}`}
          subtitle="Enter your registered mobile number. We'll send a one-time passcode."
          footer={
            <div style={{
              fontFamily: 'var(--font-data)', fontSize: 9, fontWeight: 600,
              letterSpacing: '0.08em', color: 'var(--fg3)', textTransform: 'uppercase', textAlign: 'center',
            }}>
              {tenantCode ? `BROKER · ${tenantCode.toUpperCase()}` : 'RESOLVING TENANT…'}
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <FieldLabel>Mobile number (E.164)</FieldLabel>
              <TextInput
                value={mobile}
                onChange={setMobile}
                type="tel"
                placeholder="+919999999999"
                icon={AuthIcons.phone}
                autoFocus
              />
            </div>

            {error && (
              <div style={{
                padding: '10px 14px', background: 'var(--bear-dim)',
                border: '1px solid rgba(255,59,92,0.25)', borderRadius: 'var(--r-md)',
                fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--bear)',
              }}>{error}</div>
            )}

            <PrimaryButton
              onClick={handleRequestOtp}
              disabled={loading || !mobile.trim()}
            >
              {loading ? 'Sending…' : <>Send OTP {AuthIcons.arrowRight}</>}
            </PrimaryButton>
          </div>
        </FormCard>
      </AuthShell>
    );
  }

  return (
    <AuthShell heroVariant="broker" heroTitle={heroTitle} heroSubtitle={heroSubtitle}>
      <FormCard
        back={
          <span
            onClick={() => { setStep('mobile'); setDigits(['','','','','','']); setOtp(''); setError(''); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              fontFamily: 'var(--font-data)', fontSize: 10, fontWeight: 600,
              letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg2)',
            }}
          >
            {AuthIcons.arrowLeft} Change number
          </span>
        }
        title="Enter your OTP"
        subtitle={
          <>
            We sent a 6-digit code to{' '}
            <span style={{ color: 'var(--fg1)', fontFamily: 'var(--font-data)' }}>{mobile}</span>.
            Code expires in 10 minutes.
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <FieldLabel>One-time passcode</FieldLabel>
            <div style={{ display: 'flex', gap: 10 }} onPaste={handleDigitPaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={el => { otpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  autoFocus={i === 0}
                  onChange={e => handleDigit(i, e.target.value)}
                  onKeyDown={e => handleDigitKeyDown(i, e)}
                  style={{
                    flex: 1, height: 64, borderRadius: 'var(--r-md)',
                    background: d ? 'var(--bg-panel)' : 'var(--bg-elevated)',
                    border: `1px solid ${!d && i === digits.findIndex(x => !x) ? 'var(--accent)' : d ? 'var(--border-md)' : 'var(--border)'}`,
                    boxShadow: (!d && i === digits.findIndex(x => !x)) ? '0 0 0 3px rgba(59,130,246,0.15)' : 'none',
                    textAlign: 'center',
                    fontFamily: 'var(--font-data)', fontSize: 28, fontWeight: 600,
                    color: 'var(--fg1)', outline: 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', background: 'var(--bear-dim)',
              border: '1px solid rgba(255,59,92,0.25)', borderRadius: 'var(--r-md)',
              fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--bear)',
            }}>{error}</div>
          )}

          <PrimaryButton
            onClick={handleVerifyOtp}
            disabled={loading || otp.length < 6}
          >
            {loading ? 'Verifying…' : <>Verify & sign in {AuthIcons.arrowRight}</>}
          </PrimaryButton>

          <div style={{
            padding: '10px 14px', background: 'var(--bg-panel)',
            border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
            display: 'flex', alignItems: 'center', gap: 12,
            fontFamily: 'var(--font-data)', fontSize: 11, color: 'var(--fg2)',
          }}>
            <span style={{ color: 'var(--warn)', display: 'flex' }}>{AuthIcons.info}</span>
            <span>OTP valid for 10 minutes</span>
            <span style={{ marginLeft: 'auto' }}>
              <span
                onClick={() => requestOtp(tenantCode!, mobile.trim())}
                style={{ color: 'var(--accent)', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: 9, fontWeight: 600 }}
              >
                RESEND
              </span>
            </span>
          </div>
        </div>
      </FormCard>
    </AuthShell>
  );
}
