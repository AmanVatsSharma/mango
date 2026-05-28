/**
* File: components/ui/theme-tab-selector.tsx
* Module: ui
* Purpose: Provide a segmented theme selector (Light/Dark/System) without a dropdown.
* Author: StockTrade
* Last-updated: 2026-02-12
* Notes:
* - Uses next-themes to persist theme selection.
* - Uses a mounted guard to avoid hydration mismatches when reading theme on first render.
*/

"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useTheme } from "next-themes"

import { TabSelector } from "@/components/ui/tab-selector"
import { cn } from "@/lib/utils"

export interface ThemeTabSelectorProps {
  className?: string
  disabled?: boolean
}

type ThemeValue = "light" | "dark" | "system"

export function ThemeTabSelector({ className, disabled = false }: ThemeTabSelectorProps) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const options = useMemo(
    () => [
      { id: "light", label: "Light", disabled },
      { id: "dark", label: "Dark", disabled },
      { id: "system", label: "System", disabled },
    ],
    [disabled]
  )

  const value: ThemeValue = (theme === "light" || theme === "dark" || theme === "system") ? theme : "system"

  return (
    <div className={cn("w-full sm:w-[260px]", className)} aria-label="Theme preference">
      <TabSelector
        options={options}
        value={mounted ? value : "system"}
        onChange={(next) => {
          if (!mounted || disabled) return
          setTheme(next as ThemeValue)
        }}
      />
    </div>
  )
}

