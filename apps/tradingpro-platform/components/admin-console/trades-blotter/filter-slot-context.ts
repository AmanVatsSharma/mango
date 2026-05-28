"use client"

/**
 * @file filter-slot-context.ts
 * @module admin-console/trades-blotter
 * @description Shared portal slot for the active TradesTable's filter row. Lets the tabs header
 *              and the filter controls share one horizontal line.
 */

import { createContext } from "react"

export const TradesFilterSlotContext = createContext<HTMLDivElement | null>(null)
