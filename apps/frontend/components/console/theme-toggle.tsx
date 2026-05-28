/**
 * File:        components/console/theme-toggle.tsx
 * Module:      console · UI
 * Purpose:     Header theme-changer button: dropdown with Light / Dark / System options
 *              using next-themes. Replaces the original binary sun/moon toggle.
 *
 * Exports:
 *   - ThemeToggle({ className? }) — icon button + dropdown; self-contained, zero props required
 *
 * Depends on:
 *   - next-themes (useTheme) — reads and writes the stored theme preference
 *   - @/components/ui/dropdown-menu — Radix-based dropdown primitive
 *
 * Side-effects:
 *   - Writes to localStorage via next-themes on option select
 *
 * Key invariants:
 *   - `mounted` guard prevents SSR/hydration mismatch; trigger renders a neutral icon before mount
 *   - Active option is determined by `theme` (user intent), not `resolvedTheme`, so "system" checkmark stays correct
 *
 * Read order:
 *   1. ThemeToggle — the only export
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

"use client"

import { useEffect, useState } from "react"
import { Moon, Sun, Monitor, Check } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export interface ThemeToggleProps {
  className?: string
}

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const

type ThemeValue = (typeof OPTIONS)[number]["value"]

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const activeTheme = (theme as ThemeValue | undefined) ?? "system"

  const TriggerIcon =
    !mounted
      ? Sun
      : activeTheme === "light"
        ? Sun
        : activeTheme === "dark"
          ? Moon
          : Monitor

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("relative touch-manipulation", className)}
          aria-label="Change theme"
        >
          <TriggerIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-36">
        {OPTIONS.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 text-sm">{label}</span>
            {mounted && activeTheme === value && (
              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
