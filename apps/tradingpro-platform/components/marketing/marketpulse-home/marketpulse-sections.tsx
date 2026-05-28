/**
 * @file components/marketing/marketpulse-home/marketpulse-sections.tsx
 * @module marketing/marketpulse-home
 * @description MarketPulse homepage sections — hero, stats, highlights, payments, platforms, benefits, blog preview.
 *
 * Exports:
 *   - MarketPulseHeroSection          — full-bleed desktop hero + stacked mobile layout
 *   - MarketPulseStatsSection         — stat bar with CTAs
 *   - MarketPulseHighlightsSection    — feature highlight cards
 *   - MarketPulseCashSettlementSection — payment methods overview
 *   - MarketPulsePlatformsSection     — platform cards + APK/IPA download CTAs
 *   - MarketPulseBenefitsAndMarginSection — benefits + margin explainer with image
 *   - MarketPulseOpenAccountSection   — CTA banner
 *   - MarketPulseBlogPreviewSection   — blog teaser cards
 *
 * Depends on:
 *   - @/Branding — BRAND_ASSETS, BRAND_IDENTITY, BRAND_MARKETING for all branding values
 *   - @/lib/marketing/marketpulse-homepage-content — copy/content config
 *   - @/lib/branding-routes — getUiRoutes() for all internal links
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - Download paths derive from BRAND_IDENTITY.names.slug so each brand gets its own APK/IPA filename
 *   - All text, logos, and route links are branding-neutral — no hardcoded brand strings
 *
 * Read order:
 *   1. MarketPulseHeroSection — entry point; full-bleed hero with responsive layout
 *   2. MarketPulsePlatformsSection — has the APK slug pattern to reference
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

"use client"

import React from "react"
import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { TrendingUp, ChevronRight } from "lucide-react"
import { BRAND_ASSETS, BRAND_IDENTITY, BRAND_MARKETING } from "@/Branding"
import { MARKETPULSE_HOMEPAGE_CONTENT } from "@/lib/marketing/marketpulse-homepage-content"
import { getUiRoutes } from "@/lib/branding-routes"

const routes = getUiRoutes()

function PrimaryCta({ href, children }: { href: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <Link
      href={href}
      className="marketpulse-cta-primary inline-flex items-center justify-center px-5 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      {children}
    </Link>
  )
}

function SecondaryCta({ href, children }: { href: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      {children}
    </Link>
  )
}

function getPlatformIconSrc(platformLabel: string): string {
  switch (platformLabel.toLowerCase()) {
    case "android":
      return BRAND_ASSETS.icons.platformAndroid
    case "ios":
      return BRAND_ASSETS.icons.platformIos
    case "desktop":
      return BRAND_ASSETS.icons.platformDesktop
    case "web":
      return BRAND_ASSETS.icons.platformWeb
    default:
      return BRAND_ASSETS.icons.platformWeb
  }
}

export function MarketPulseHeroSection(): React.JSX.Element {
  const heroImage = (
    <Image
      src={BRAND_ASSETS.illustrations.hero3D}
      alt="Trading Platform Dashboard"
      fill
      className="object-cover object-right"
      priority
      sizes="100vw"
    />
  )

  return (
    <section className="relative overflow-hidden bg-slate-900 flex flex-col lg:min-h-[90vh] lg:items-center">
      {/* Desktop: full-bleed hero background */}
      <div className="hidden lg:block absolute inset-0">{heroImage}</div>
      <div className="hidden lg:block absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-900/50 to-transparent" />
      <div className="hidden lg:block absolute inset-0 brand-gradient-primary opacity-10 mix-blend-screen" />

      {/* Content: on top on mobile, overlay on desktop */}
      <div className="relative z-10 mx-auto max-w-7xl w-full px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-24 order-1 lg:order-none">
        <div className="max-w-2xl">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-white"
          >
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl"
            >
              {MARKETPULSE_HOMEPAGE_CONTENT.hero.headline}
            </motion.h1>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="mt-8 flex flex-wrap gap-2"
            >
              {MARKETPULSE_HOMEPAGE_CONTENT.hero.productTabs.map((tab) => (
                <span
                  key={tab}
                  className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-100 backdrop-blur shadow-[0_0_10px_rgba(16,185,129,0.1)]"
                >
                  {tab}
                </span>
              ))}
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.6 }}
              className="mt-6 text-xl font-medium text-slate-300"
            >
              {MARKETPULSE_HOMEPAGE_CONTENT.hero.subheadline}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.6 }}
              className="mt-8 flex flex-wrap gap-4"
            >
              <Link
                href={MARKETPULSE_HOMEPAGE_CONTENT.hero.ctas.primaryHref}
                className="marketpulse-cta-primary inline-flex items-center justify-center px-6 py-3.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-transform hover:scale-105"
              >
                {MARKETPULSE_HOMEPAGE_CONTENT.hero.ctas.primaryLabel} <ChevronRight className="ml-2 w-4 h-4" />
              </Link>
              <Link
                href={MARKETPULSE_HOMEPAGE_CONTENT.hero.ctas.secondaryHref}
                className="inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-800/50 backdrop-blur px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-slate-700/50 hover:border-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              >
                {MARKETPULSE_HOMEPAGE_CONTENT.hero.ctas.secondaryLabel}
              </Link>
            </motion.div>
          </motion.div>

          {/* Quick links below CTAs */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 1, duration: 0.6 }}
            className="mt-10 grid gap-4 sm:grid-cols-2 max-w-xl"
          >
            {BRAND_MARKETING.homepage.heroQuickLinks.slice(0, 2).map((quickLink) => (
              <Link
                key={quickLink.title}
                href={routes.marketing[quickLink.routeKey]}
                className="marketpulse-card-premium rounded-xl border border-white/20 bg-white/10 backdrop-blur-md p-4 transition-all hover:bg-white/20"
              >
                <p className="text-sm font-bold text-white">{quickLink.title}</p>
                <p className="mt-1 text-xs text-slate-300">{quickLink.description}</p>
              </Link>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Mobile: hero image below text, blended at top into content */}
      <div className="relative h-[42vh] min-h-[240px] w-full shrink-0 order-2 lg:hidden">
        {heroImage}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-900/50 to-transparent" />
      </div>
    </section>
  )
}

export function MarketPulseStatsSection(): React.JSX.Element {
  return (
    <section className="relative -mt-16 z-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="grid gap-6 rounded-2xl border border-white/40 bg-white/70 backdrop-blur-xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] lg:grid-cols-3 lg:items-center"
        >
          <div className="flex items-center space-x-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <TrendingUp className="h-7 w-7 text-primary" />
            </div>
            <div>
              <p className="text-3xl font-extrabold text-primary">{MARKETPULSE_HOMEPAGE_CONTENT.stats.value}</p>
              <p className="mt-1 text-sm font-bold uppercase tracking-wide text-slate-500">{MARKETPULSE_HOMEPAGE_CONTENT.stats.label}</p>
            </div>
          </div>
          <div className="lg:col-span-2">
            <div className="flex flex-wrap gap-4 lg:justify-end">
              <SecondaryCta href={MARKETPULSE_HOMEPAGE_CONTENT.stats.ctas.leftHref}>
                {MARKETPULSE_HOMEPAGE_CONTENT.stats.ctas.leftLabel}
              </SecondaryCta>
              <PrimaryCta href={MARKETPULSE_HOMEPAGE_CONTENT.stats.ctas.rightHref}>
                {MARKETPULSE_HOMEPAGE_CONTENT.stats.ctas.rightLabel}
              </PrimaryCta>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export function MarketPulseHighlightsSection(): React.JSX.Element {
  return (
    <section>
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MARKETPULSE_HOMEPAGE_CONTENT.highlights.map((label) => (
            <div key={label} className="marketpulse-card-premium rounded-xl border bg-white p-5">
              <p className="text-sm font-semibold text-slate-900">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function MarketPulseCashSettlementSection(): React.JSX.Element {
  const paymentItems = BRAND_MARKETING.homepage.cashSettlement.methods.map((method) => ({
    label: method.label,
    href: routes.marketing[method.routeKey],
  }))

  return (
    <section>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">{BRAND_MARKETING.homepage.cashSettlement.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{BRAND_MARKETING.homepage.cashSettlement.description}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <SecondaryCta href={routes.marketing.paymentMethodsRoot}>
                {BRAND_MARKETING.homepage.cashSettlement.viewAllMethodsLabel}
              </SecondaryCta>
              <PrimaryCta href={routes.marketing.contact}>{BRAND_MARKETING.homepage.cashSettlement.contactSupportLabel}</PrimaryCta>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {paymentItems.map((item) => (
              <Link key={item.href} href={item.href} className="marketpulse-card-premium rounded-xl border bg-white p-5 hover:bg-slate-50">
                <p className="text-sm font-semibold text-slate-900">{item.label}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export function MarketPulsePlatformsSection(): React.JSX.Element {
  const androidApkPath = `/downloads/${BRAND_IDENTITY.names.slug}-android.apk`
  const iosIpaPath = `/downloads/${BRAND_IDENTITY.names.slug}-ios.ipa`

  return (
    <section id="platforms" className="bg-slate-50/50 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">{BRAND_MARKETING.homepage.platformsSection.title}</h2>
          <p className="mt-3 text-base text-slate-600 max-w-2xl mx-auto">{BRAND_MARKETING.homepage.platformsSection.subtitle}</p>
          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href={androidApkPath}
                download
                className="marketpulse-cta-primary inline-flex items-center justify-center px-6 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                aria-label={`Download ${BRAND_IDENTITY.names.full} Android APK`}
              >
                Download APK
              </a>
              <a
                href={iosIpaPath}
                download
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                aria-label={`Download ${BRAND_IDENTITY.names.full} iOS IPA`}
              >
                Download iOS IPA
              </a>
            </div>
            <p className="mt-3 text-xs text-slate-500">iOS direct install works only with trusted signed profiles (Ad Hoc/Enterprise/TestFlight-equivalent distribution).</p>
          </div>
        </motion.div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {MARKETPULSE_HOMEPAGE_CONTENT.platforms.map((platform, i) => (
            <motion.div
              key={platform.label}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ scale: 1.05 }}
            >
              <Link
                href={platform.href}
                className="group block marketpulse-card-premium rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm hover:shadow-xl transition-all duration-300"
              >
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 group-hover:bg-primary/5 transition-colors">
                  <Image src={getPlatformIconSrc(platform.label)} alt="" width={32} height={32} className="h-8 w-8 transition-transform group-hover:scale-110" aria-hidden="true" />
                </div>
                <p className="mt-5 text-base font-bold text-slate-900 group-hover:text-primary transition-colors">{platform.label}</p>
                <div className="mt-2 inline-flex items-center text-xs font-semibold text-slate-500 group-hover:text-primary">
                  {BRAND_MARKETING.homepage.platformsSection.openLabel} <ChevronRight className="ml-1 w-3 h-3" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function MarketPulseBenefitsAndMarginSection(): React.JSX.Element {
  const whyUsSectionId = routes.marketing.whyUs.replace(/^\//, "")
  const cards = BRAND_MARKETING.homepage.benefitsSection.cards

  return (
    <section id={whyUsSectionId} className="overflow-hidden bg-white py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="order-2 lg:order-1"
          >
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">{BRAND_MARKETING.homepage.benefitsSection.title}</h2>
            <p className="mt-4 text-base leading-relaxed text-slate-600">{BRAND_MARKETING.homepage.benefitsSection.description}</p>

            <h3 className="mt-10 text-xl font-extrabold text-slate-900">{BRAND_MARKETING.homepage.benefitsSection.marginTitle}</h3>
            <p className="mt-3 text-base text-slate-600">{BRAND_MARKETING.homepage.benefitsSection.marginDescription}</p>

            <div className="mt-8 flex flex-wrap gap-4">
              <PrimaryCta href={routes.auth.register}>{BRAND_MARKETING.homepage.benefitsSection.tradeNowLabel}</PrimaryCta>
              <SecondaryCta href={routes.marketing.contact}>{BRAND_MARKETING.homepage.benefitsSection.contactLabel}</SecondaryCta>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2">
              {cards.map((card, i) => (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                  className="marketpulse-card-premium rounded-xl border border-slate-200/60 bg-slate-50/50 p-5 hover:bg-white hover:shadow-lg transition-all"
                >
                  <p className="text-sm font-bold text-slate-900">{card.title}</p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">{card.body}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="order-1 lg:order-2 relative w-full rounded-[2.5rem] overflow-hidden shadow-2xl"
          >
            <Image
              src={BRAND_ASSETS.illustrations.benefits3D}
              alt="Trading Benefits"
              width={1200}
              height={800}
              className="w-full h-auto object-contain"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-slate-900/20 to-transparent mix-blend-multiply pointer-events-none" aria-hidden />
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export function MarketPulseOpenAccountSection(): React.JSX.Element {
  return (
    <section className="relative overflow-hidden bg-slate-900 py-16">
      <div className="absolute inset-0 brand-gradient-primary opacity-20 mix-blend-screen" />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="grid gap-8 rounded-[2rem] border border-white/10 bg-slate-800/40 backdrop-blur-xl p-10 shadow-[0_0_50px_rgba(16,185,129,0.1)] lg:grid-cols-2 lg:items-center relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-primary/20 rounded-full blur-[80px]" />

          <div className="relative z-10">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{BRAND_MARKETING.homepage.openAccountSection.title}</h2>
            <p className="mt-4 text-lg text-slate-300 leading-relaxed max-w-xl">{BRAND_MARKETING.homepage.openAccountSection.description}</p>
          </div>
          <div className="flex gap-4 lg:justify-end relative z-10">
            <Link
              href={routes.auth.register}
              className="marketpulse-cta-primary inline-flex items-center justify-center px-8 py-4 text-base font-bold shadow-lg shadow-primary/20 transition-transform hover:scale-105 hover:shadow-xl hover:shadow-primary/30"
            >
              {BRAND_MARKETING.homepage.openAccountSection.ctaLabel} <ChevronRight className="ml-2 w-5 h-5" />
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export function MarketPulseBlogPreviewSection(): React.JSX.Element {
  return (
    <section id="news">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-2xl font-extrabold text-slate-900">{BRAND_MARKETING.homepage.blogSection.title}</h2>
          <p className="mt-2 text-sm text-slate-600">{BRAND_MARKETING.homepage.blogSection.subtitle}</p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MARKETPULSE_HOMEPAGE_CONTENT.blogTitles.map((title) => (
            <Link key={title} href={routes.marketing.blog} className="group marketpulse-card-premium overflow-hidden rounded-xl border bg-white hover:bg-slate-50">
              <div className="flex aspect-[4/3] items-center justify-center bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {BRAND_MARKETING.homepage.blogSection.cardBadgeLabel}
              </div>
              <div className="p-4">
                <p className="text-sm font-semibold leading-snug text-slate-900 group-hover:underline">{title}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
