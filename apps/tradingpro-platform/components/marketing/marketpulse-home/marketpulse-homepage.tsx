/**
 * @file components/marketing/marketpulse-home/marketpulse-homepage.tsx
 * @module marketing/marketpulse-home
 * @description Compose MarketPulse public homepage sections in TradeBazaar-inspired order.
 * @author StockTrade
 * @created 2026-02-20
 */

import React from "react"
import { JoinchatWidget } from "./joinchat-widget"
import { MarketPulseFooter } from "./marketpulse-footer"
import { MarketPulseHeader } from "./marketpulse-header"
import {
  MarketPulseBenefitsAndMarginSection,
  MarketPulseBlogPreviewSection,
  MarketPulseCashSettlementSection,
  MarketPulseHeroSection,
  MarketPulseHighlightsSection,
  MarketPulseOpenAccountSection,
  MarketPulsePlatformsSection,
  MarketPulseStatsSection,
} from "./marketpulse-sections"
import { PlatformStickyButtons } from "./platform-sticky-buttons"
import { ScheduledUpgradeBanner } from "./scheduled-upgrade-banner"

export function MarketPulseHomepage(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-cyan-50 text-slate-900">
      <MarketPulseHeader />

      <main className="pb-32">
        <MarketPulseHeroSection />
        <MarketPulseStatsSection />
        <MarketPulseHighlightsSection />
        <MarketPulseCashSettlementSection />
        <MarketPulsePlatformsSection />
        <MarketPulseBenefitsAndMarginSection />
        <MarketPulseOpenAccountSection />
        <MarketPulseBlogPreviewSection />
        <ScheduledUpgradeBanner />
      </main>

      <MarketPulseFooter />
      <PlatformStickyButtons />
      <JoinchatWidget />
    </div>
  )
}
