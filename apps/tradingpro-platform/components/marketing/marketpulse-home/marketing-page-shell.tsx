/**
 * @file components/marketing/marketpulse-home/marketing-page-shell.tsx
 * @module marketing/marketpulse-home
 * @description Shared shell wrapper for MarketPulse public marketing routes.
 * @author StockTrade
 * @created 2026-02-19
 */

"use client"

import React from "react"
import { motion } from "framer-motion"
import Image from "next/image"
import { MarketPulseFooter } from "./marketpulse-footer"
import { MarketPulseHeader } from "./marketpulse-header"
import { JoinchatWidget } from "./joinchat-widget"
import { PlatformStickyButtons } from "./platform-sticky-buttons"
import { ScheduledUpgradeBanner } from "./scheduled-upgrade-banner"
import { BRAND_ASSETS } from "@/Branding"

export function MarketingPageShell({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900 flex flex-col">
      <MarketPulseHeader />
      
      {/* Techy Hero Banner for Marketing Pages */}
      <section className="relative overflow-hidden bg-slate-900 py-20 lg:py-24">
        <div className="absolute inset-0 opacity-40">
          <Image 
            src={BRAND_ASSETS.illustrations.hero3D}
            alt="Abstract Tech Background"
            fill
            className="object-cover mix-blend-overlay"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent" />
        </div>
        
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl drop-shadow-lg">
              {title}
            </h1>
            <div className="mt-4 h-1 w-20 bg-primary rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
          </motion.div>
        </div>
      </section>

      <main className="flex-grow mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="marketpulse-card-premium rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm p-8 shadow-xl"
        >
          <div className="prose prose-slate max-w-none">
            {children}
          </div>
        </motion.div>
      </main>
      
      <div className="mt-auto">
        <ScheduledUpgradeBanner />
        <MarketPulseFooter />
      </div>
      
      <PlatformStickyButtons />
      <JoinchatWidget />
    </div>
  )
}
