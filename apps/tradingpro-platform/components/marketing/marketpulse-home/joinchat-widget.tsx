/**
 * @file components/marketing/marketpulse-home/joinchat-widget.tsx
 * @module marketing/marketpulse-home
 * @description Floating chat popover widget used on MarketPulse marketing pages.
 * @author StockTrade
 * @created 2026-02-19
 */

"use client"

import React from "react"
import Link from "next/link"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BRAND_IDENTITY } from "@/Branding"
import { getMarketingRoute } from "@/lib/branding-routes"

function isEnabled(value: string | undefined, fallback = true): boolean {
  if (value === undefined) return fallback
  return value === "true"
}

export function JoinchatWidget(): React.JSX.Element | null {
  const enabled = isEnabled(process.env.CHAT_WIDGET_ENABLED, true)
  if (!enabled) return null

  const title = process.env.CHAT_WIDGET_TITLE || `Hi there, welcome to ${BRAND_IDENTITY.names.full}`
  const message = process.env.CHAT_WIDGET_MESSAGE || "Can we help you with onboarding, access, or trading support?"
  const ctaLabel = process.env.CHAT_WIDGET_CTA_LABEL || "Open Chat"
  const ctaHref = process.env.CHAT_WIDGET_CTA_HREF || getMarketingRoute("contact")

  return (
    <div className="fixed bottom-5 right-5 z-50">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="brand-chat-surface flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-black/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-chat-primary)] focus-visible:ring-offset-2"
            aria-label="Open chat widget"
          >
            <span className="h-2 w-2 rounded-full bg-white/90" />
            <span>Open Chat</span>
          </button>
        </PopoverTrigger>

        <PopoverContent align="end" side="top" sideOffset={12} className="w-[340px] p-0">
          <div className="overflow-hidden rounded-xl border bg-white shadow-2xl">
            <div className="brand-chat-surface px-4 py-3">
              <p className="text-sm font-semibold text-white">{title}</p>
            </div>
            <div className="px-4 py-4">
              <p className="text-sm text-slate-700">{message}</p>
              <div className="mt-4 flex items-center justify-between">
                <Link
                  href={ctaHref}
                  className="brand-chat-surface inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-semibold text-white"
                >
                  {ctaLabel}
                </Link>
                <span className="text-xs text-slate-400">Powered by Joinchat</span>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
