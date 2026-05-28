"use client"

/**
 * File:        components/trading/order-drawer/SwipeToConfirm.tsx
 * Module:      Trading · Watchlist Order Drawer
 * Purpose:     Drag-right confirmation pill — Kite-style solid track + white thumb.
 *              Adds intentional friction to prevent accidental order placement.
 *
 * Exports:
 *   - SwipeToConfirm (props: { side, label?, threshold?, disabled?, busy?, onConfirm }) — the pill
 *
 * Depends on:
 *   - framer-motion — drag motion + spring snap-back
 *   - lucide-react (ChevronRight, ChevronsRight, Loader2)
 *   - lib/utils (cn)
 *
 * Side-effects:
 *   - Calls onConfirm() exactly once when user drags past threshold * track width.
 *
 * Key invariants:
 *   - useLayoutEffect measures clientWidth synchronously before first paint so maxX is
 *     never 0 when the component becomes interactive (fixes "pill can't drag" bug).
 *   - threshold default 0.72 — lower than old 0.8 for better feel on small screens.
 *   - onConfirm fires ONCE per drag gesture; firedRef resets when busy → false.
 *   - avoid bg-blue-* / text-blue-* — globals.css remaps them via !important.
 *
 * Read order:
 *   1. Props + constants
 *   2. handleDragEnd — threshold + snap logic
 *   3. JSX — solid track → white thumb → fading label
 *
 * Author:      Aman Sharma
 * Last-updated: 2026-04-30
 */

import * as React from "react"
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion"
import { ChevronsRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SwipeToConfirmProps {
  side: "BUY" | "SELL"
  label?: string
  /** Fraction of track the user must drag past to commit. Default 0.72. */
  threshold?: number
  disabled?: boolean
  busy?: boolean
  onConfirm: () => void
}

const THUMB = 48   // white circle diameter (px)
const PAD   = 4    // gap between thumb edge and track edge (px)

export function SwipeToConfirm({
  side,
  label,
  threshold = 0.72,
  disabled = false,
  busy = false,
  onConfirm,
}: SwipeToConfirmProps) {
  const trackRef  = React.useRef<HTMLDivElement>(null)
  const [trackW, setTrackW] = React.useState(0)
  const x          = useMotionValue(0)
  const firedRef   = React.useRef(false)
  const isBuy      = side === "BUY"

  // Measure synchronously before first paint so constraints are correct on mount.
  React.useLayoutEffect(() => {
    const el = trackRef.current
    if (!el) return
    setTrackW(el.clientWidth)
    const ro = new ResizeObserver(() => setTrackW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  React.useEffect(() => {
    if (!busy) {
      firedRef.current = false
      x.set(0) // snap pill back to start when parent allows a retry
    }
  }, [busy, x])

  const maxX         = Math.max(0, trackW - THUMB - PAD * 2)
  const labelOpacity = useTransform(x, [0, maxX * 0.45], [1, 0])
  const dragLocked   = disabled || busy

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (firedRef.current || disabled || maxX === 0) return
    if (info.offset.x >= maxX * threshold) {
      firedRef.current = true
      x.set(maxX)
      onConfirm()
    } else {
      x.set(0)
    }
  }

  const trackBg   = isBuy ? "bg-primary"   : "bg-rose-500"
  const arrowColor = isBuy ? "text-primary" : "text-rose-500"
  const labelText  = label ?? (isBuy ? "Swipe to Buy" : "Swipe to Sell")

  return (
    <div
      ref={trackRef}
      role="button"
      aria-label={labelText}
      className={cn(
        "relative h-14 w-full select-none overflow-hidden rounded-full",
        trackBg,
        dragLocked && "opacity-55",
      )}
    >
      {/* Animated label — fades out as thumb moves right */}
      <motion.span
        style={{ opacity: labelOpacity }}
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-extrabold uppercase tracking-[0.18em] text-white"
      >
        {labelText}
      </motion.span>

      {/* White thumb / drag circle */}
      <motion.div
        drag={dragLocked ? false : "x"}
        dragConstraints={{ left: 0, right: maxX }}
        dragElastic={0}
        dragMomentum={false}
        style={{ x, top: PAD, left: PAD, width: THUMB, height: THUMB }}
        onDragEnd={handleDragEnd}
        className={cn(
          "absolute flex items-center justify-center rounded-full bg-white shadow-lg",
          dragLocked ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
        )}
        whileTap={!dragLocked ? { scale: 0.93 } : undefined}
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
      >
        {busy ? (
          <Loader2 className={cn("h-5 w-5 animate-spin", arrowColor)} aria-hidden />
        ) : (
          <ChevronsRight className={cn("h-6 w-6", arrowColor)} aria-hidden />
        )}
      </motion.div>
    </div>
  )
}
