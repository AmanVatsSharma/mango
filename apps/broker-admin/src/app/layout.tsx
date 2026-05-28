/**
 * File:        apps/broker-admin/src/app/layout.tsx
 * Module:      broker-admin · Root Layout
 * Purpose:     Root Next.js layout — injects Obsidian fonts, wraps app with TenantProvider,
 *              AuthProvider, and MockBrokerDataProvider. Auth guard is applied at the
 *              (admin) group layout level to avoid protecting the /login route.
 *
 * Exports:
 *   - metadata    — Next.js page metadata
 *   - RootLayout() — root layout component
 *
 * Depends on:
 *   - next/font/google                   — self-hosted Syne, IBM Plex Mono, DM Sans
 *   - @obsidian/obsidian-ui             — ObsidianProvider
 *   - ../lib/tenant/tenant-context       — TenantProvider (resolves subdomain → tenantCode)
 *   - ../lib/auth/auth-context           — AuthProvider (stores access token)
 *   - ../lib/mock-data-context           — MockBrokerDataProvider (mock data for non-wired pages)
 *
 * Side-effects:
 *   - Injects CSS font variables (--font-display, --font-ui, --font-data) on <html>
 *
 * Key invariants:
 *   - defaultTheme="system" — first visit respects OS preference; subsequent visits restore localStorage
 *   - Font vars on <html> so tokens.css :root fallbacks are overridden
 *   - Provider order: TenantProvider → AuthProvider → MockBrokerDataProvider
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-09
 */

import './global.css';
import { DM_Sans, IBM_Plex_Mono, Syne } from 'next/font/google';
import { ObsidianProvider } from '@obsidian/obsidian-ui';
import { TenantProvider } from '../lib/tenant/tenant-context';
import { AuthProvider } from '../lib/auth/auth-context';
import { MockBrokerDataProvider } from '../lib/mock-data-context';

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-data',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-ui',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
});

export const metadata = {
  title: 'Broker Admin — ArcaFX Markets',
  description: 'World-class broker administration platform — clients, risk, compliance, finance, and trading operations',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${ibmPlexMono.variable} ${dmSans.variable}`}
    >
      <body className="bg-bg-base text-fg1 antialiased">
        <ObsidianProvider defaultTheme="system">
          <TenantProvider>
            <AuthProvider>
              <MockBrokerDataProvider>
                {children}
              </MockBrokerDataProvider>
            </AuthProvider>
          </TenantProvider>
        </ObsidianProvider>
      </body>
    </html>
  );
}
