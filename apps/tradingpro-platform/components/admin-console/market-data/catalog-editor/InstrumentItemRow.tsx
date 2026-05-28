/**
 * @file InstrumentItemRow.tsx
 * @module components/admin-console/market-data/catalog-editor
 * @description Read-only display row for a flat instrument catalog item, with delete + reorder
 *              affordances. Pure presentational — parent owns the item state.
 *
 * Exports:
 *   - InstrumentItemRow — props { item, onRemove, onMoveUp, onMoveDown, isFirst, isLast }
 *
 * @author        BharatERP
 * @created       2026-05-01
 */

"use client"

import { ChevronDown, ChevronUp, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { InstrumentItem } from "@/lib/market-catalog/catalog-schema"

export interface InstrumentItemRowProps {
  item: InstrumentItem
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
}

export function InstrumentItemRow({
  item,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: InstrumentItemRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg",
        "bg-muted/30 border border-border/40",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground">{item.symbol}</div>
        <div className="text-[11px] text-muted-foreground line-clamp-1">
          {item.name ? `${item.name} · ` : ""}
          {item.exchange} · token {item.token}
        </div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          disabled={isFirst}
          onClick={onMoveUp}
          aria-label="Move up"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          disabled={isLast}
          onClick={onMoveDown}
          aria-label="Move down"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-rose-500 hover:text-rose-500 hover:bg-rose-500/10"
          onClick={onRemove}
          aria-label="Remove"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
