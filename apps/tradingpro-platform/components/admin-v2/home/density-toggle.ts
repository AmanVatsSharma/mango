/**
 * @file components/admin-v2/home/density-toggle.ts
 * @module admin-v2/home
 * @description LocalStorage-backed density preference. Applies a `data-v2-density` attribute
 *              to the v2 shell so any primitive can opt into compact spacing via attribute
 *              selectors. Persists per user.
 *
 *              Exports:
 *                - Density            — "comfortable" | "default" | "compact".
 *                - useDensity()       — current density + setter; reads from localStorage on mount.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import * as React from "react"

export type Density = "comfortable" | "default" | "compact"

const KEY = "v2.density"

function read(): Density {
  if (typeof window === "undefined") return "default"
  const v = window.localStorage.getItem(KEY)
  if (v === "comfortable" || v === "compact" || v === "default") return v
  return "default"
}

export function useDensity(): { density: Density; setDensity: (d: Density) => void } {
  const [density, setDensityState] = React.useState<Density>("default")

  React.useEffect(() => {
    const initial = read()
    setDensityState(initial)
    document.querySelector("[data-admin-v2-shell]")?.setAttribute("data-v2-density", initial)
  }, [])

  function setDensity(d: Density) {
    setDensityState(d)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY, d)
      document.querySelector("[data-admin-v2-shell]")?.setAttribute("data-v2-density", d)
    }
  }

  return { density, setDensity }
}
