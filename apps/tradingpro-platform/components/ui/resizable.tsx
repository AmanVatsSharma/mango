/**
 * File:        components/ui/resizable.tsx
 * Module:      components/ui
 * Purpose:     Shadcn-compatible Resizable primitives wrapping react-resizable-panels v4.
 *              Provides ResizablePanelGroup, ResizablePanel, and ResizableHandle with
 *              Tailwind-styled drag grips for the desktop trading terminal layout.
 *
 * Exports:
 *   - ResizablePanelGroup — wrapper around Group (v4); accepts `orientation` prop
 *   - ResizablePanel      — re-export of Panel (v4)
 *   - ResizableHandle     — styled Separator (v4); accepts `withHandle` for visible grip
 *
 * Depends on:
 *   - react-resizable-panels — Group, Panel, Separator (v4 API)
 *   - @/lib/utils — cn
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - v4 API: orientation="vertical"|"horizontal" (was direction in v3).
 *     Persistence via useDefaultLayout hook (storage + id + panelIds), NOT autoSaveId (v3 API)
 *   - Children of ResizablePanel must have height: "100%" to fill allocated panel height
 *   - Separator emits aria-orientation INVERTED from group orientation:
 *       group orientation="horizontal" (side-by-side) → aria-orientation="vertical" (bar is vertical)
 *       group orientation="vertical" (stacked)        → aria-orientation="horizontal" (bar is horizontal)
 *     We use aria-[orientation=*] Tailwind selectors to size + rotate the grip accordingly
 *   - Colours are theme-aware via CSS variables (--terminal-border, --terminal-surface,
 *     --terminal-text-muted) defined in app/globals.css for both light (:root) and dark (.dark).
 *     Previously this handle was hardcoded to oklch(0.2 0 0) which leaked dark-theme colours
 *     into the light dashboard.
 *
 * Read order:
 *   1. ResizablePanelGroup — container
 *   2. ResizablePanel — individual pane
 *   3. ResizableHandle — drag divider
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-22 — theme-aware border colours
 */

"use client"

import * as React from "react"
import { GripVertical } from "lucide-react"
import { Group, Panel, Separator, type GroupProps, type SeparatorProps } from "react-resizable-panels"
import { cn } from "@/lib/utils"

function ResizablePanelGroup({ className, ...props }: GroupProps) {
  return (
    <Group
      className={cn(
        "flex h-full w-full",
        props.orientation === "vertical" && "flex-col",
        className,
      )}
      {...props}
    />
  )
}

const ResizablePanel = Panel

interface ResizableHandleProps extends SeparatorProps {
  withHandle?: boolean
}

function ResizableHandle({ className, withHandle, ...props }: ResizableHandleProps) {
  return (
    <Separator
      className={cn(
        // Bar colour tracks the theme: light mode uses the light --terminal-border (oklch 0.88),
        // dark mode swaps to the dark --terminal-border (oklch 0.18). No dark: variants needed —
        // the CSS variable flips with the .dark ancestor.
        "group/handle relative flex items-center justify-center bg-[var(--terminal-border)] transition-colors",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
        "hover:bg-[#22D3EE]/40 active:bg-[#22D3EE]/60",
        // Vertical drag bar (between side-by-side panels) — 4px wide, full height, col-resize cursor
        "aria-[orientation=vertical]:w-1 aria-[orientation=vertical]:self-stretch aria-[orientation=vertical]:cursor-col-resize",
        // Horizontal drag bar (between stacked panels) — 4px tall, full width, row-resize cursor
        "aria-[orientation=horizontal]:h-1 aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:cursor-row-resize",
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div
          className={cn(
            // Grip block also tracks theme via --terminal-surface / --terminal-border / --terminal-text-muted.
            "z-10 flex items-center justify-center rounded-sm border border-[var(--terminal-border)]",
            "bg-[var(--terminal-surface)] text-[var(--terminal-text-muted)] transition-colors",
            "group-hover/handle:border-[#22D3EE]/60 group-hover/handle:text-[#22D3EE]",
            // Vertical bar (side-by-side panels) → tall vertical grip
            "group-aria-[orientation=vertical]/handle:h-6 group-aria-[orientation=vertical]/handle:w-3",
            // Horizontal bar (stacked panels) → wide horizontal grip
            "group-aria-[orientation=horizontal]/handle:h-3 group-aria-[orientation=horizontal]/handle:w-6",
          )}
        >
          <GripVertical className="h-3 w-3 group-aria-[orientation=horizontal]/handle:rotate-90" />
        </div>
      )}
    </Separator>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
