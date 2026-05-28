/**
 * @file components/marketing/stocktrade-home/stocktrade-homepage.tsx
 * @module marketing/stocktrade-home
 * @description Compose StockTrade public homepage sections.
 * @author BharatERP
 * @created 2026-02-20
 */

import React from "react"
import { JoinchatWidget } from "./joinchat-widget"
import { StockTradeFooter } from "./stocktrade-footer"
import { StockTradeHeader } from "./stocktrade-header"
import {
  StockTradeBenefitsAndMarginSection,
  StockTradeBlogPreviewSection,
  StockTradeCashSettlementSection,
  StockTradeHeroSection,
  StockTradeHighlightsSection,
  StockTradeOpenAccountSection,
  StockTradePlatformsSection,
  StockTradeStatsSection,
} from "./stocktrade-sections"
import { PlatformStickyButtons } from "./platform-sticky-buttons"
import { ScheduledUpgradeBanner } from "./scheduled-upgrade-banner"

export function StockTradeHomepage(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-cyan-50 text-slate-900">
      <StockTradeHeader />

      <main className="pb-32">
        <StockTradeHeroSection />
        <StockTradeStatsSection />
        <StockTradeHighlightsSection />
        <StockTradeCashSettlementSection />
        <StockTradePlatformsSection />
        <StockTradeBenefitsAndMarginSection />
        <StockTradeOpenAccountSection />
        <StockTradeBlogPreviewSection />
        <ScheduledUpgradeBanner />
      </main>

      <StockTradeFooter />
      <PlatformStickyButtons />
      <JoinchatWidget />
    </div>
  )
}