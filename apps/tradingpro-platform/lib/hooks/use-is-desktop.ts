/**
 * File:        lib/hooks/use-is-desktop.ts
 * Module:      Layout · Viewport
 * Purpose:     Returns true when the viewport is at or above the given breakpoint.
 *              Reads window.matchMedia synchronously on first client render so mobile
 *              users don't briefly mount desktop-only components (and pay for their
 *              chunk download) while waiting for a useEffect to correct the value.
 *
 * Exports:
 *   - useIsDesktop(breakpoint?) → boolean
 *
 * Side-effects: none (MediaQueryList listener only)
 *
 * Key invariants:
 *   - SSR initial state is `true` (desktop, matches Tailwind `lg:` default).
 *   - First CLIENT render reads the actual matchMedia value via the useState lazy
 *     initializer — no post-mount flip, no DesktopTerminalLayout chunk wasted on mobile.
 *   - Listener still updates on viewport resize crossings.
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-07
 */

"use client"

import { useState, useEffect } from "react"

export function useIsDesktop(breakpointPx = 1024): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined") return true
    return window.matchMedia(`(min-width: ${breakpointPx}px)`).matches
  })

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${breakpointPx}px)`)
    if (mq.matches !== isDesktop) {
      setIsDesktop(mq.matches)
    }
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
    // isDesktop intentionally omitted — we only want this to re-bind when the
    // breakpoint changes (effectively never), not on every value flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakpointPx])

  return isDesktop
}
