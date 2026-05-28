/**
 * File:        app/(main)/test-dock/page.tsx
 * Module:      Test · FloatingDock demo
 * Purpose:     Showcases the touch-driven magnifying dock on mobile; the dock uses the
 *              same five dashboard tabs (Home/Watchlist/Orders/Positions/Account) and
 *              navigates to /dashboard?tab=X on tap or drag-release.
 *
 * Exports:
 *   - default TestDockPage — client component
 *
 * Depends on:
 *   - @/components/ui/floating-dock — FloatingDockDesktop
 *   - next/navigation — useRouter for programmatic navigation
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - Uses FloatingDockDesktop directly (not the composed FloatingDock) so the magnifying
 *     row shows on all screen sizes, not just md+
 *   - activeHref tracks the last-selected tab for highlight state
 *
 * Read order:
 *   1. TABS constant — data shape
 *   2. TestDockPage — page + active-tab state machine
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-09
 */

"use client";

import { FloatingDockDesktop } from "@/components/ui/floating-dock";
import { AnimatePresence, motion } from "framer-motion";
import {
  Eye,
  FileText,
  Home,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const TABS = [
  {
    title: "Home",
    icon: <Home className="h-full w-full" />,
    href: "/dashboard",
    description: "Market pulse, portfolio snapshot, and trading opportunities.",
  },
  {
    title: "Watchlist",
    icon: <Eye className="h-full w-full" />,
    href: "/dashboard?tab=watchlist",
    description: "Track symbols, react quickly, and place orders in one flow.",
  },
  {
    title: "Orders",
    icon: <FileText className="h-full w-full" />,
    href: "/dashboard?tab=orders",
    description: "Monitor all order activity with clear execution visibility.",
  },
  {
    title: "Positions",
    icon: <TrendingUp className="h-full w-full" />,
    href: "/dashboard?tab=positions",
    description: "Manage open risk with real-time P&L and protection controls.",
  },
  {
    title: "Account",
    icon: <Wallet className="h-full w-full" />,
    href: "/dashboard?tab=account",
    description: "Review balance, funds, profile, and account-level settings.",
  },
] as const;

const ICON_MAP: Record<string, React.ReactNode> = {
  "/dashboard": <Home className="h-10 w-10" />,
  "/dashboard?tab=watchlist": <Eye className="h-10 w-10" />,
  "/dashboard?tab=orders": <FileText className="h-10 w-10" />,
  "/dashboard?tab=positions": <TrendingUp className="h-10 w-10" />,
  "/dashboard?tab=account": <Wallet className="h-10 w-10" />,
};

export default function TestDockPage() {
  const router = useRouter();
  const [activeHref, setActiveHref] = useState<string>("/dashboard");
  const [navigating, setNavigating] = useState(false);

  const activeTab = TABS.find((t) => t.href === activeHref) ?? TABS[0];

  const handleSelect = (href: string) => {
    setActiveHref(href);
    setNavigating(true);
    // Brief delay so the selection highlight is visible before navigation
    setTimeout(() => router.push(href), 350);
  };

  return (
    <div className="relative flex flex-col min-h-screen bg-background overflow-hidden">
      {/* Header pill */}
      <div className="flex justify-center pt-8 pb-4 px-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          FloatingDock · Touch demo
        </div>
      </div>

      {/* Active tab preview — springs in/out on change */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-28">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeHref}
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="flex flex-col items-center gap-4 text-center"
          >
            {/* Large icon with glow */}
            <div className="relative">
              <span
                className="absolute inset-0 rounded-full blur-2xl opacity-30"
                style={{ background: "color-mix(in oklab, var(--primary), transparent 40%)" }}
              />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
                {ICON_MAP[activeHref]}
              </div>
            </div>

            {/* Tab name */}
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold tracking-tight">{activeTab.title}</h2>
              <p className="max-w-[260px] text-sm text-muted-foreground leading-relaxed">
                {activeTab.description}
              </p>
            </div>

            {/* Navigation indicator */}
            {navigating && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs text-primary/70 font-medium"
              >
                Navigating to {activeTab.title}…
              </motion.p>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Usage hint */}
        <p className="mt-2 text-[11px] text-muted-foreground/50 text-center">
          Tap · or drag finger across the dock · and release
        </p>
      </div>

      {/* Floating dock — fixed at bottom, full-width on mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col items-center pb-[env(safe-area-inset-bottom,12px)] pt-2 bg-background/80 backdrop-blur-lg border-t border-border/40">
        <FloatingDockDesktop
          items={TABS.map(({ title, icon, href }) => ({ title, icon, href }))}
          activeHref={activeHref}
          onSelect={handleSelect}
          fabIndex={3}
          className="w-full max-w-sm shadow-xl"
        />
      </div>
    </div>
  );
}
