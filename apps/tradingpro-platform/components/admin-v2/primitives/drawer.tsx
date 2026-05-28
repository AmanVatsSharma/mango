/**
 * @file components/admin-v2/primitives/drawer.tsx
 * @module admin-v2/primitives
 * @description Right-side glass drawer for v2 — Vaul-based, with brand-grade chrome.
 *              Slides in over a darkened backdrop; sticky glass header + scrollable body
 *              + sticky glass footer slot for primary actions.
 *
 *              Exports:
 *                - V2Drawer            — controlled root.
 *                - V2DrawerTrigger     — re-export.
 *                - V2DrawerHeader      — title + actions + close button.
 *                - V2DrawerBody        — scrollable region.
 *                - V2DrawerFooter      — sticky action bar.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"
import { X } from "lucide-react"
import {
  Drawer as VaulDrawer,
  DrawerContent,
  DrawerOverlay,
  DrawerPortal,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { cn } from "@/lib/utils"

type V2DrawerWidth = "default" | "wide"

interface V2DrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  width?: V2DrawerWidth
  dismissible?: boolean
  children: React.ReactNode
}

const WIDTH_CLASS: Record<V2DrawerWidth, string> = {
  default: "w-full sm:max-w-[680px]",
  wide: "w-full sm:max-w-[1000px]",
}

export function V2Drawer({
  open,
  onOpenChange,
  width = "default",
  dismissible = true,
  children,
}: V2DrawerProps) {
  return (
    <VaulDrawer
      open={open}
      onOpenChange={onOpenChange}
      direction="right"
      dismissible={dismissible}
    >
      <DrawerPortal>
        <DrawerOverlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-md" />
        <DrawerContent
          data-admin-v2-shell
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-full flex-col border-l border-white/[0.08] bg-[var(--v2-bg-deep)] shadow-[0_0_120px_-20px_rgba(77,124,254,0.35)] outline-none",
            WIDTH_CLASS[width],
          )}
        >
          {children}
        </DrawerContent>
      </DrawerPortal>
    </VaulDrawer>
  )
}

interface V2DrawerHeaderProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  onClose: () => void
}

export function V2DrawerHeader({
  title,
  subtitle,
  actions,
  onClose,
}: V2DrawerHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.06] bg-[var(--v2-bg-glass)] px-5 py-3.5 backdrop-blur-xl">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-[var(--v2-text)]">{title}</div>
        {subtitle ? (
          <div className="mt-0.5 truncate text-xs text-[var(--v2-text-mute)]">{subtitle}</div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {actions}
        <button
          type="button"
          aria-label="Close drawer"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.03] text-[var(--v2-text-mute)] transition-colors hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-[var(--v2-text)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}

export function V2DrawerBody({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn("flex-1 overflow-y-auto", className)}>{children}</div>
}

export function V2DrawerFooter({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <footer
      className={cn(
        "sticky bottom-0 z-10 flex shrink-0 items-center justify-end gap-2 border-t border-white/[0.06] bg-[var(--v2-bg-glass)] px-5 py-3 backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </footer>
  )
}

export { DrawerTrigger as V2DrawerTrigger }
