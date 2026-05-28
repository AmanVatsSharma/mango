/**
 * @file kyc-crm-help-popover.tsx
 * @module admin-console/kyc-queue
 * @description Keyboard shortcuts cheat sheet for the CRM drawer.
 * @author StockTrade
 * @created 2026-04-07
 */

"use client"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { HelpCircle } from "lucide-react"

export function KycCrmHelpPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="CRM shortcuts help">
          <HelpCircle className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-xs" align="end">
        <p className="font-medium mb-2">Telecaller shortcuts</p>
        <ul className="space-y-1.5 text-muted-foreground">
          <li>
            <kbd className="px-1 rounded bg-muted font-mono text-[10px]">Ctrl</kbd> +{" "}
            <kbd className="px-1 rounded bg-muted font-mono text-[10px]">Enter</kbd> — Save note (when note field focused)
          </li>
          <li>Due times in <strong>new task</strong> use your device local clock; list shows IST.</li>
          <li>Use <strong>Quick actions</strong> for common call outcomes.</li>
        </ul>
      </PopoverContent>
    </Popover>
  )
}
