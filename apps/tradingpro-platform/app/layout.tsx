/**
 * File:        app/layout.tsx
 * Module:      App · Root layout
 * Purpose:     Root document for every route. Holds <html>/<body>, font, brand CSS vars,
 *              theme provider, global error handler, and the toaster — and intentionally
 *              NOT SessionProvider or ApolloProviderWrapper. Those moved to
 *              `(main)/layout.tsx`, `(console)/console/layout.tsx`, and
 *              `(admin)/admin-console/layout.tsx` so marketing pages no longer pay their cost.
 *
 * Exports:
 *   - default RootLayout({ children })
 *   - metadata — Next.js metadata API
 *
 * Depends on:
 *   - next/font/google · Inter — base body font (text, headings)
 *   - next/font/local · KohinoorBangla — numeric font, all 5 weights (Light→Bold),
 *     files in public/fonts/kohinoor-bangla/*.otf; injected as --font-numeric CSS variable
 *   - @/Branding — runtime brand identity + theme tokens (no I/O)
 *   - @/components/providers/theme-provider — next-themes wrapper
 *   - @/components/trading/GlobalErrorHandler — chunk-load recovery + window.onerror
 *
 * Side-effects: none at module scope; child providers may register listeners
 *
 * Key invariants:
 *   - DO NOT add SessionProvider or ApolloProviderWrapper here. They cost on every
 *     marketing page and were the Wave 1 perf cleanup. Authenticated routes get them
 *     via AuthedAppProviders in their respective route-group layouts.
 *   - --font-numeric is the CSS token for all numeric/financial display (prices, P&L,
 *     quantities). Currently declared in globals.css :root as 'Kohinoor Bangla' with
 *     ui-monospace fallback. To self-host the font, add a next/font/local loader here
 *     pointing to public/fonts/kohinoor-bangla/*.woff2 and apply its .variable.
 *
 * Read order:
 *   1. metadata + brand css var map
 *   2. RootLayout — html/body shell
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-09
 */

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { GlobalErrorHandler } from "@/components/trading/GlobalErrorHandler";
import { BRAND_IDENTITY, BRAND_THEME } from "@/Branding";

const inter = Inter({ subsets: ["latin"], display: "swap" });

const kohinoorBangla = localFont({
  src: [
    { path: "../public/fonts/kohinoor-bangla/KohinoorBangla-Light.otf",    weight: "300" },
    { path: "../public/fonts/kohinoor-bangla/KohinoorBangla-Regular.otf",  weight: "400" },
    { path: "../public/fonts/kohinoor-bangla/KohinoorBangla-Medium.otf",   weight: "500" },
    { path: "../public/fonts/kohinoor-bangla/KohinoorBangla-Semibold.otf", weight: "600" },
    { path: "../public/fonts/kohinoor-bangla/KohinoorBangla-Bold.otf",     weight: "700" },
  ],
  display: "swap",
  variable: "--font-numeric",
  fallback: ["ui-monospace", "monospace"],
});

export const metadata: Metadata = {
  title: BRAND_IDENTITY.meta.appTitle,
  description: BRAND_IDENTITY.meta.appDescription,
};

const brandCssVariables = {
  "--brand-primary-light": BRAND_THEME.oklch.light.primary,
  "--brand-secondary-light": BRAND_THEME.oklch.light.secondary,
  "--brand-accent-light": BRAND_THEME.oklch.light.accent,
  "--brand-ring-light": BRAND_THEME.oklch.light.ring,
  "--brand-chart-1-light": BRAND_THEME.oklch.light.chart1,
  "--brand-chart-2-light": BRAND_THEME.oklch.light.chart2,
  "--brand-chart-3-light": BRAND_THEME.oklch.light.chart3,
  "--brand-chart-4-light": BRAND_THEME.oklch.light.chart4,
  "--brand-chart-5-light": BRAND_THEME.oklch.light.chart5,
  "--brand-primary-dark": BRAND_THEME.oklch.dark.primary,
  "--brand-secondary-dark": BRAND_THEME.oklch.dark.secondary,
  "--brand-accent-dark": BRAND_THEME.oklch.dark.accent,
  "--brand-ring-dark": BRAND_THEME.oklch.dark.ring,
  "--brand-chart-1-dark": BRAND_THEME.oklch.dark.chart1,
  "--brand-chart-2-dark": BRAND_THEME.oklch.dark.chart2,
  "--brand-chart-3-dark": BRAND_THEME.oklch.dark.chart3,
  "--brand-chart-4-dark": BRAND_THEME.oklch.dark.chart4,
  "--brand-chart-5-dark": BRAND_THEME.oklch.dark.chart5,
  "--brand-gradient-primary-from": BRAND_THEME.gradients.primaryFrom,
  "--brand-gradient-primary-to": BRAND_THEME.gradients.primaryTo,
  "--brand-chat-primary": BRAND_THEME.chatWidget.primary,
  "--brand-chat-primary-hover": BRAND_THEME.chatWidget.hover,
} as Record<string, string>

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning is required because next-themes adds class="dark|light"
    // to <html> on mount; without this React warns about the class/style mismatch
    // between server-rendered HTML and post-mount client DOM.
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${kohinoorBangla.variable}`} style={brandCssVariables}>
        <GlobalErrorHandler>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster />
          </ThemeProvider>
        </GlobalErrorHandler>
      </body>
    </html>
  );
}
