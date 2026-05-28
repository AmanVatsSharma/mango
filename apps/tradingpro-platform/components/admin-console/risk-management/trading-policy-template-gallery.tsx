/**
 * @file trading-policy-template-gallery.tsx
 * @module admin-console
 * @description Searchable, grouped cards for choosing a trading policy preset template.
 * @author StockTrade
 * @created 2026-03-30
 */

"use client"

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Search } from "lucide-react"
import { POLICY_STUDIO_BLUEPRINTS } from "./trading-policy-studio-state"
import type { PolicyContext, PolicyStudioBlueprint } from "./trading-policy-types"

export type TemplateComplexityFilter = "all" | "Simple" | "Medium" | "Advanced"

export interface TradingPolicyTemplateGalleryProps {
  scope: PolicyContext
  complexityFilter: TemplateComplexityFilter
  onComplexityFilterChange: (v: TemplateComplexityFilter) => void
  selected: PolicyStudioBlueprint
  onSelect: (blueprint: PolicyStudioBlueprint) => void
  showRawLock: boolean
  className?: string
}

export function TradingPolicyTemplateGallery({
  scope,
  complexityFilter,
  onComplexityFilterChange,
  selected,
  onSelect,
  showRawLock,
  className,
}: TradingPolicyTemplateGalleryProps) {
  const [search, setSearch] = useState("")

  const entries = useMemo(() => {
    const q = search.trim().toLowerCase()
    return POLICY_STUDIO_BLUEPRINTS.filter((entry) => {
      if (entry.value === "RAW_POLICY_LOCK" && !showRawLock) {
        return false
      }
      if (entry.context !== scope) {
        return false
      }
      if (complexityFilter !== "all" && entry.complexity !== complexityFilter) {
        return false
      }
      if (!q) {
        return true
      }
      return (
        entry.label.toLowerCase().includes(q) ||
        entry.briefing.toLowerCase().includes(q) ||
        entry.value.toLowerCase().includes(q)
      )
    })
  }, [scope, complexityFilter, search, showRawLock])

  const sectionTitle =
    scope === "ORDER_PLACE" ? "Rules that run when placing orders" : "Rules that run when closing positions"

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="pl-9 bg-background border-border"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["all", "Simple", "Medium", "Advanced"] as TemplateComplexityFilter[]).map((c) => (
            <Button
              key={c}
              type="button"
              variant={complexityFilter === c ? "secondary" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => onComplexityFilterChange(c)}
            >
              {c === "all" ? "All levels" : c}
            </Button>
          ))}
        </div>
      </div>

      <p className="text-sm font-semibold text-foreground">{sectionTitle}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {entries.map((entry) => (
          <TemplateCard
            key={entry.value}
            entry={entry}
            isSelected={selected === entry.value}
            onSelect={() => onSelect(entry.value)}
          />
        ))}
      </div>

      {entries.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          No templates match your filters. Try another difficulty or clear search.
        </p>
      )}
    </div>
  )
}

function TemplateCard({
  entry,
  isSelected,
  onSelect,
}: {
  entry: (typeof POLICY_STUDIO_BLUEPRINTS)[number]
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <Card
      className={cn(
        "cursor-pointer transition-colors border-border",
        isSelected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/40",
      )}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <CardHeader className="p-3 pb-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-foreground leading-tight">{entry.label}</p>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {entry.complexity}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <p className="text-xs text-muted-foreground leading-relaxed">{entry.briefing}</p>
      </CardContent>
    </Card>
  )
}
