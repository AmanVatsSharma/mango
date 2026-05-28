'use client';

import { NextRouter, useRouter } from 'next/router';
import { useEffect, useState } from 'react';

/**
 * File:        apps/broker-admin/src/app/global-error.tsx
 * Module:      broker-admin · Global Error Boundary
 * Purpose:     Next.js App Router error boundary — catches unhandled React errors
 *              (render exceptions, uncaught promise rejections) at the root level.
 *              Renders a recovery UI with a "Try Again" button that calls router.push('/')
 *              to reinitialize the app shell. This prevents a blank/white screen on
 *              any unexpected crash.
 *
 * Exports:
 *   - default (GlobalError) — Next.js error boundary component
 *
 * Depends on:
 *   - next/router — useRouter for navigation recovery
 *
 * Side-effects:
 *   - none (read-only component)
 *
 * Key invariants:
 *   - 'use client' — uses router API and useState
 *   - Renders at the app root; does NOT wrap individual pages
 *   - Has its own "use client" boundary — separate from page-level 'use client'
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Log to console for dev visibility — replace with an observability SDK in production
    console.error('[GlobalError]', error);
  }, [error]);

  const copyError = () => {
    const text = `${error.message}\n\nDigest: ${error.digest ?? 'unknown'}\n\nStack:\n${error.stack ?? ''}`;
    navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => {});
  };

  return (
    <html lang="en">
      <body style={{ background: '#0b0d10', color: '#e8eaf0', fontFamily: 'DM Sans, sans-serif', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ maxWidth: 480, textAlign: 'center', padding: '2rem' }}>
          {/* Icon */}
          <div style={{ fontSize: 48, marginBottom: 16, lineHeight: 1 }}>⚠</div>

          <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, letterSpacing: '-0.01em' }}>
            Something went wrong
          </h1>

          <p style={{ fontSize: 13, color: '#8b90a0', marginBottom: 24, lineHeight: 1.6 }}>
            An unexpected error occurred. Your session is safe — try reloading the app.
            If this persists, contact support with the error reference below.
          </p>

          {error.digest && (
            <p style={{ fontSize: 10, color: '#5a5f72', fontFamily: 'IBM Plex Mono, monospace', marginBottom: 24, wordBreak: 'break-all' }}>
              Ref: {error.digest}
            </p>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={reset}
              style={{
                padding: '8px 20px',
                background: '#10d996',
                color: '#0b0d10',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Try Again
            </button>

            <button
              onClick={() => router.push('/')}
              style={{
                padding: '8px 20px',
                background: 'transparent',
                color: '#8b90a0',
                border: '1px solid #2a2e3a',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Go to Dashboard
            </button>

            <button
              onClick={copyError}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                color: copied ? '#10d996' : '#8b90a0',
                border: '1px solid #2a2e3a',
                borderRadius: 6,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'color 0.15s',
              }}
            >
              {copied ? 'Copied!' : 'Copy Error'}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}