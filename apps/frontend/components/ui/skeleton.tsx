/**
 * @file skeleton.tsx
 * @module components/ui
 * @description shadcn-style loading skeleton placeholder.
 * @author StockTrade
 * @created 2026-04-06
 */

import * as React from "react"
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} data-slot="skeleton" {...props} />
}

export { Skeleton }
