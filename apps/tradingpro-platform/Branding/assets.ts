/**
 * @file Branding/assets.ts
 * @module Branding
 * @description Centralized brand asset paths for logos, icons, and favicon.
 * @author MarketPulse360
 * @created 2026-02-20
 */

export interface BrandAssets {
  logos: {
    mark: string
    wordmark: string
    /** Wide header / nav bar logo (admin sidebar, marketing chrome). */
    headerLogo: string
    authHeader: string
    email: string
    favicon: string
  }
  icons: {
    platformAndroid: string
    platformIos: string
    platformDesktop: string
    platformWeb: string
  }
  illustrations: {
    hero3D: string
    auth3D: string
    benefits3D: string
  }
}

export const BRAND_ASSETS: BrandAssets = {
  logos: {
    mark: "/marketpulse360/logo-mark.svg",
    wordmark: "/marketpulse360/logo-wordmark.svg",
    headerLogo: "/marketpulse360/logo-wordmark.svg",
    authHeader: "/marketpulse360/logo-wordmark.svg",
    email: "/marketpulse360/logo-wordmark.svg",
    favicon: "/favicon.ico",
  },
  icons: {
    platformAndroid: "/marketpulse360/icons/android.svg",
    platformIos: "/marketpulse360/icons/ios.svg",
    platformDesktop: "/marketpulse360/icons/desktop.svg",
    platformWeb: "/marketpulse360/icons/web.svg",
  },
  illustrations: {
    hero3D: "/site/firstfold.webp",
    auth3D: "https://images.unsplash.com/photo-1639322537228-f710d846310a?q=80&w=2000&auto=format&fit=crop",
    benefits3D: "/site/webtrial.png",
  },
}
