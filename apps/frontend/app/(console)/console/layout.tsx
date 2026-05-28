/**
 * @file layout.tsx
 * @module app/(console)/console
 * @description Segment layout for `/console`; must not nest html/body (root layout owns the document).
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-03-30
 */
import type React from "react"
import type { Metadata } from "next"
import { Suspense } from "react"
import { AuthedAppProviders } from "@/components/providers/AuthedAppProviders"

function ConsoleLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-background to-muted/20">
      <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
    </div>
  )
}

export const metadata: Metadata = {
  title: "Trading Console - Premium Dashboard",
  description: "Professional trading console dashboard",
}

export default function ConsoleSegmentLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <AuthedAppProviders>
      <div className="font-sans min-h-screen">
        <Suspense fallback={<ConsoleLoadingFallback />}>{children}</Suspense>
      </div>
    </AuthedAppProviders>
  )
}
