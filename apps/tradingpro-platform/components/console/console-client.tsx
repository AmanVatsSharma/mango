/**
 * File:        components/console/console-client.tsx
 * Module:      Console · Client controller
 * Purpose:     Interactive console controller — section state, ?section= deep link,
 *              feature gating. Lifted out of `app/(console)/console/page.tsx` so the
 *              page entry can stay a server component and stream the loading shell.
 *              All 9 section panels are dynamically imported so first paint only
 *              downloads the active section's chunk (default: Account).
 *
 * Exports:
 *   - ConsoleClient — props: none. Self-contained interactive console.
 *
 * Depends on:
 *   - next-auth/react.useSession — gates render until session is authenticated
 *   - @/lib/hooks/use-console-features — statementsEnabled gate
 *   - @/components/console/* — layout + sections (sections via next/dynamic)
 *
 * Side-effects:
 *   - useSession may poll /api/auth/session per next-auth defaults
 *   - Reads window.location.search once after session/features ready
 *
 * Key invariants:
 *   - Each section import MUST go through next/dynamic with ssr:false. Eager imports
 *     ship all 9 sections in the first load even though only one renders — that was the
 *     Wave 1 perf bug. ssr:false also keeps the WS/auth hooks each section uses out of
 *     the server-rendered HTML.
 *   - First-render default section is "account"; "?section=" overrides AFTER auth + features ready.
 *
 * Read order:
 *   1. CONSOLE_SECTION_IDS / type guard
 *   2. ConsoleClient — state machine + render switch
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-03
 */

"use client"

import { useEffect, useRef, useState, Suspense } from "react"
import { useSession } from "next-auth/react"
import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"
import { ConsoleLayout } from "@/components/console/console-layout"
import { ConsoleErrorBoundary } from "@/components/console/console-error-boundary"
import { ConsoleLoadingState } from "@/components/console/console-loading-state"
import { useConsoleFeatures } from "@/lib/hooks/use-console-features"
import { Button } from "@/components/ui/button"
import { getAuthRoute } from "@/lib/branding-routes"

const SectionSkeleton = () => (
  <div className="space-y-3 px-1 pt-2">
    <div className="h-10 rounded-xl bg-muted/40 animate-pulse" />
    <div className="h-32 rounded-xl bg-muted/40 animate-pulse" />
    <div className="h-32 rounded-xl bg-muted/40 animate-pulse" />
  </div>
)

const AccountSection = dynamic(
  () => import("@/components/console/sections/account-section").then((m) => ({ default: m.AccountSection })),
  { loading: () => <SectionSkeleton />, ssr: false },
)
const BankAccountsSection = dynamic(
  () => import("@/components/console/sections/bank-accounts-section").then((m) => ({ default: m.BankAccountsSection })),
  { loading: () => <SectionSkeleton />, ssr: false },
)
const DepositsSection = dynamic(
  () => import("@/components/console/sections/deposits-section").then((m) => ({ default: m.DepositsSection })),
  { loading: () => <SectionSkeleton />, ssr: false },
)
const ProfileSection = dynamic(
  () => import("@/components/console/sections/profile-section").then((m) => ({ default: m.ProfileSection })),
  { loading: () => <SectionSkeleton />, ssr: false },
)
const StatementsSection = dynamic(
  () => import("@/components/console/sections/statements-section").then((m) => ({ default: m.StatementsSection })),
  { loading: () => <SectionSkeleton />, ssr: false },
)
const WithdrawalsSection = dynamic(
  () => import("@/components/console/sections/withdrawals-section").then((m) => ({ default: m.WithdrawalsSection })),
  { loading: () => <SectionSkeleton />, ssr: false },
)
const SecuritySection = dynamic(
  () => import("@/components/console/sections/security-section").then((m) => ({ default: m.SecuritySection })),
  { loading: () => <SectionSkeleton />, ssr: false },
)
const ReferralSection = dynamic(
  () => import("@/components/console/sections/referral-section").then((m) => ({ default: m.ReferralSection })),
  { loading: () => <SectionSkeleton />, ssr: false },
)
const ReferralSettingsSection = dynamic(
  () => import("@/components/console/sections/referral-settings-section").then((m) => ({ default: m.ReferralSettingsSection })),
  { loading: () => <SectionSkeleton />, ssr: false },
)

const CONSOLE_SECTION_IDS = [
  "profile",
  "account",
  "statements",
  "deposits",
  "withdrawals",
  "banks",
  "referral",
  "referral-settings",
  "security",
] as const

function isConsoleSectionId(value: string): value is (typeof CONSOLE_SECTION_IDS)[number] {
  return (CONSOLE_SECTION_IDS as readonly string[]).includes(value)
}

export function ConsoleClient() {
  const [activeSection, setActiveSection] = useState("account")
  const appliedUrlSectionRef = useRef(false)

  const { data: session, status } = useSession()
  const userId = (session?.user as any)?.id as string | undefined
  if (process.env.NODE_ENV === "development") {
    console.log("/console: session status", { status, userId })
  }

  const { statementsEnabled, isLoading: isFeaturesLoading, source } = useConsoleFeatures()

  useEffect(() => {
    if (status !== "authenticated" || !userId || isFeaturesLoading) return
    if (appliedUrlSectionRef.current) return
    appliedUrlSectionRef.current = true

    const raw = new URLSearchParams(window.location.search).get("section")
    if (!raw || !isConsoleSectionId(raw)) return

    if (raw === "statements" && !statementsEnabled) {
      setActiveSection("account")
      return
    }
    setActiveSection(raw)
  }, [status, userId, isFeaturesLoading, statementsEnabled])

  useEffect(() => {
    if (!statementsEnabled && activeSection === "statements") {
      if (process.env.NODE_ENV === "development") {
        console.log("🚫 [/console] Statements disabled; redirecting to account", { source })
      }
      setActiveSection("account")
    }
  }, [statementsEnabled, activeSection, source])

  const renderSection = () => {
    switch (activeSection) {
      case "profile":
        return <ProfileSection />
      case "account":
        return <AccountSection />
      case "statements":
        return statementsEnabled ? <StatementsSection /> : <AccountSection />
      case "deposits":
        return <DepositsSection />
      case "withdrawals":
        return <WithdrawalsSection />
      case "banks":
        return <BankAccountsSection />
      case "referral":
        return <ReferralSection />
      case "referral-settings":
        return <ReferralSettingsSection />
      case "security":
        return <SecuritySection />
      default:
        return <AccountSection />
    }
  }

  if (status === "loading" || isFeaturesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-background to-muted/20 px-4">
        <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/80 p-6 text-center shadow-sm backdrop-blur-md space-y-2">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
          <div className="text-base font-semibold text-foreground">Loading your console</div>
          <div className="mt-1 text-sm text-muted-foreground">Preparing your account workspace...</div>
        </div>
      </div>
    )
  }

  if (!userId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-background to-muted/20 px-4">
        <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/80 p-6 text-center shadow-sm backdrop-blur-md space-y-2">
          <div className="text-xl font-semibold">Please sign in</div>
          <div className="text-sm text-muted-foreground">Your trading console requires an active session.</div>
          <Button className="mt-3" onClick={() => window.location.assign(getAuthRoute("login"))}>
            Go to Login
          </Button>
        </div>
      </div>
    )
  }

  return (
    <ConsoleErrorBoundary>
      <Suspense fallback={<ConsoleLoadingState />}>
        <ConsoleLayout
          activeSection={activeSection}
          statementsEnabled={statementsEnabled}
          onNavigateSection={(section) => setActiveSection(section)}
        >
          {renderSection()}
        </ConsoleLayout>
      </Suspense>
    </ConsoleErrorBoundary>
  )
}
