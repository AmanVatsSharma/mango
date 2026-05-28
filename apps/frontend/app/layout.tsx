/**
 * File:        apps/frontend/app/layout.tsx
 * Module:      App · Root layout
 * Purpose:     Root document for every route. Holds <html>/<body>, font, theme provider.
 *              Auth routes get AuthedAppProviders from their route-group layout.
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-19
 */

import type { Metadata } from "next"
import "./globals.css"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { BRAND_IDENTITY, BRAND_THEME } from "@/Branding"

export const metadata: Metadata = {
  title: BRAND_IDENTITY.meta.appTitle,
  description: BRAND_IDENTITY.meta.appDescription,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}