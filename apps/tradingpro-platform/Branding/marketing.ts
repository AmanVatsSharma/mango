/**
 * @file Branding/marketing.ts
 * @module Branding
 * @description Centralized marketing copy/labels for homepage, navigation, and public marketing pages.
 * @author StockTrade
 * @created 2026-02-20
 */

import { BRAND_IDENTITY, type BrandRouteTemplateGroups } from "./identity"

type MarketingRouteKey = keyof BrandRouteTemplateGroups["marketing"]

function withBrand(text: string): string {
  return text
    .split("{brandFull}")
    .join(BRAND_IDENTITY.names.full)
    .split("{brandShort}")
    .join(BRAND_IDENTITY.names.short)
}

export interface BrandMarketingConfig {
  navigation: {
    menuLabel: string
    homeLabel: string
    aboutUsLabel: string
    productsLabel: string
    newsBlogsLabel: string
    contactLabel: string
    platformsLabel: string
    paymentMethodLabel: string
    loginLabel: string
    signupLabel: string
  }
  homepage: {
    hero: {
      headline: string
      productTabs: string[]
      subheadline: string
      primaryCtaLabel: string
      secondaryCtaLabel: string
    }
    stats: {
      value: string
      label: string
      leftCtaLabel: string
      rightCtaLabel: string
    }
    highlights: string[]
    platforms: Array<{ label: string; anchor: string }>
    blogTitles: string[]
    heroQuickLinks: Array<{ title: string; description: string; routeKey: MarketingRouteKey }>
    cashSettlement: {
      title: string
      description: string
      viewAllMethodsLabel: string
      contactSupportLabel: string
      methods: Array<{ label: string; routeKey: MarketingRouteKey }>
    }
    platformsSection: {
      title: string
      subtitle: string
      openLabel: string
    }
    benefitsSection: {
      title: string
      description: string
      marginTitle: string
      marginDescription: string
      tradeNowLabel: string
      contactLabel: string
      cards: Array<{ title: string; body: string }>
    }
    openAccountSection: {
      title: string
      description: string
      ctaLabel: string
    }
    blogSection: {
      title: string
      subtitle: string
      cardBadgeLabel: string
    }
  }
  pages: {
    whyUs: {
      title: string
      descriptionOne: string
      descriptionTwo: string
    }
    affiliate: {
      title: string
      intro: string
      partnershipText: string
      contactLabel: string
    }
    contact: {
      title: string
      description: string
      supportLabel: string
    }
    privacyPolicy: {
      title: string
      summary: string
    }
    terms: {
      title: string
      summary: string
    }
    blog: {
      title: string
      intro: string
      comingSoonLabel: string
    }
    newsBlogs: {
      title: string
    }
    downloads: {
      title: string
      items: Array<{ id: string; label: string; hint: string }>
      contactSupportToGetAccessLabel: string
    }
    products: {
      title: string
      items: Array<{ label: string; routeKey: MarketingRouteKey }>
    }
    paymentMethods: {
      title: string
      items: Array<{ label: string; routeKey: MarketingRouteKey }>
    }
  }
}

export const BRAND_MARKETING: BrandMarketingConfig = {
  navigation: {
    menuLabel: "Menu",
    homeLabel: "Home",
    aboutUsLabel: "About us",
    productsLabel: "Products",
    newsBlogsLabel: "News & Blogs",
    contactLabel: "Contact",
    platformsLabel: "Platforms",
    paymentMethodLabel: "Payment Method",
    loginLabel: "Login",
    signupLabel: "Signup",
  },
  homepage: {
    hero: {
      headline: "Trade Smarter with Zero Brokerage & Up To 500X Margin",
      productTabs: ["Indian Stocks (F&O)", "Indian Commodities", "COMEX", "US Stocks"],
      subheadline: withBrand("Trade confidently with {brandFull}"),
      primaryCtaLabel: "Get started",
      secondaryCtaLabel: withBrand("Why {brandShort}"),
    },
    stats: {
      value: "₹ 98.2 Crore",
      label: "BROKERAGE SAVED",
      leftCtaLabel: "Know More",
      rightCtaLabel: "Trade Now",
    },
    highlights: ["Zero Brokerage", "24/7 Deposit And Withdrawal", "Upto 500x Margin", "Indian + US Stocks & Commodities"],
    platforms: [
      { label: "Android", anchor: "android" },
      { label: "IOS", anchor: "ios" },
      { label: "Desktop", anchor: "desktop" },
      { label: "Web", anchor: "web" },
    ],
    blogTitles: [
      "What is a Forward Market? Meaning, Functions, and Real-World Insights",
      "Cryptocurrency Market Cap Reaches Record $4 Trillion: Causes and Impact",
      "What Is Algorithm Trading? Definition, How It Works, Pros & Cons",
      "Multi-Commodity Exchange of India (NSE: MCX) Sheds 6.3% - Analysing the Recent Decline and What Lies Ahead",
    ],
    heroQuickLinks: [
      { title: "Explore Products", description: "Stocks, indices, commodities and CFD instruments", routeKey: "productsRoot" },
      { title: "Cash Settlement", description: "Bank transfer, UPI, cash and crypto options", routeKey: "paymentMethodsRoot" },
      { title: "Multi-Platform Access", description: "Web, desktop, Android and iOS support", routeKey: "downloads" },
      { title: "Market Insights", description: "Stay updated with trading-focused blog content", routeKey: "newsBlogs" },
    ],
    cashSettlement: {
      title: "Cash Settlement",
      description: "Deposit and withdrawal options designed for active traders with fast turnaround support.",
      viewAllMethodsLabel: "View all payment methods",
      contactSupportLabel: "Contact support",
      methods: [
        { label: "Bank Transfer", routeKey: "paymentBankTransfer" },
        { label: "UPI Transfer", routeKey: "paymentUpiTransfer" },
        { label: "Cash Payment", routeKey: "paymentCashPayment" },
        { label: "Crypto USDT TRC20", routeKey: "paymentCryptoUsdtTrc20" },
      ],
    },
    platformsSection: {
      title: "Platforms We Are Available On",
      subtitle: "Initiate smart trading across multiple platforms",
      openLabel: "Open",
    },
    benefitsSection: {
      title: "Enjoy Maximum Profits with ZERO BROKERAGE",
      description: "Trade anytime, anywhere, with low friction execution and market-focused tools.",
      marginTitle: "500x Margin for Maximum Returns",
      marginDescription: "Scale opportunity with less deployed capital using high leverage configurations.",
      tradeNowLabel: "Trade Now",
      contactLabel: "Contact",
      cards: [
        { title: "Secure Investment", body: withBrand("{brandFull} protects account integrity with real-time safeguards.") },
        { title: "Zero Brokerage", body: "Maximize returns by avoiding unnecessary brokerage overhead on key segments." },
        { title: "500x Margin Facilities", body: "Deploy capital efficiently with high-margin opportunities for active strategies." },
        { title: "24x7 Deposit & Withdrawal", body: "Move funds around the clock to stay responsive to market movement." },
      ],
    },
    openAccountSection: {
      title: "Open Live Account",
      description: withBrand("Start with {brandFull} and access equities, commodities, and derivatives in one place."),
      ctaLabel: "Open Live Account",
    },
    blogSection: {
      title: "Stay Updated with Market Insights",
      subtitle: "Get regular updates from our market and platform blog stream",
      cardBadgeLabel: "Market Update",
    },
  },
  pages: {
    whyUs: {
      title: withBrand("Why {brandShort}"),
      descriptionOne: withBrand("{brandFull} offers zero brokerage trading, deep liquidity access, and up to 500x margin support."),
      descriptionTwo: "Our mission is to make active trading fast, transparent, and reliable across web, desktop, and mobile platforms.",
    },
    affiliate: {
      title: "Become an Affiliate",
      intro: withBrand("{brandShort} affiliate program details will be published here."),
      partnershipText: "For partnership discussions, please reach out via",
      contactLabel: "Contact",
    },
    contact: {
      title: "Contact",
      description: "We are here to help with onboarding, platform setup, verification, and payments.",
      supportLabel: "Email",
    },
    privacyPolicy: {
      title: "Privacy Policy",
      summary: withBrand("Privacy policy content for {brandFull} will be maintained here."),
    },
    terms: {
      title: "Terms & Conditions",
      summary: withBrand("Terms and conditions content for {brandFull} will be maintained here."),
    },
    blog: {
      title: "Blog",
      intro: "Blog articles and market insights will be published here.",
      comingSoonLabel: "Coming soon",
    },
    newsBlogs: {
      title: "News & Blogs",
    },
    downloads: {
      title: "Downloads",
      items: [
        { id: "android", label: "Android", hint: "APK link will be published here." },
        { id: "ios", label: "IOS", hint: "App Store link will be published here." },
        { id: "desktop", label: "Desktop", hint: "Installer link will be published here." },
        { id: "web", label: "Web", hint: "Web terminal link will be published here." },
      ],
      contactSupportToGetAccessLabel: "Contact support to get access",
    },
    products: {
      title: "Products",
      items: [
        { label: "CFD instrument", routeKey: "productsCfdInstrument" },
        { label: "Indexes", routeKey: "productsIndexes" },
        { label: "Stocks", routeKey: "productsStocks" },
        { label: "Commodity", routeKey: "productsCommodity" },
      ],
    },
    paymentMethods: {
      title: "Payment Method",
      items: [
        { label: "Bank Transfer", routeKey: "paymentBankTransfer" },
        { label: "UPI Transfer", routeKey: "paymentUpiTransfer" },
        { label: "Cash Payment", routeKey: "paymentCashPayment" },
        { label: "Crypto USDT TRC20", routeKey: "paymentCryptoUsdtTrc20" },
      ],
    },
  },
}
