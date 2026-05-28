/**
 * @file filter-bar.tsx
 * @module admin-console/shared
 * @description Enhanced filter bar component combining best features from all admin console components
 * @author StockTrade
 * @created 2025-01-27
 */

"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Search, FilterX } from "lucide-react"
import { ReactNode } from "react"

export interface FilterField {
  key: string
  label: string
  type: 'text' | 'select' | 'date' | 'number'
  placeholder?: string
  options?: { label: string; value: string }[]
  className?: string
  span?: number // Grid span (default: 1)
}

interface FilterBarProps {
  filters: Record<string, string>
  fields: FilterField[]
  onFilterChange: (key: string, value: string) => void
  onReset?: () => void
  className?: string
  showReset?: boolean
  customFields?: ReactNode
}

/**
 * Enhanced Filter Bar Component
 * 
 * Combines filter patterns from:
 * - user-management.tsx (advanced filters)
 * - orders-management.tsx (URL-synced filters)
 * - positions-management.tsx (URL-synced filters)
 * - trade-management.tsx (URL-synced filters)
 * - audit-trail.tsx (comprehensive filters)
 * - fund-management.tsx (search and status filters)
 * - financial-overview.tsx (multiple filter types)
 * 
 * Features:
 * - Responsive grid layout
 * - Multiple field types (text, select, date, number)
 * - Search icon support
 * - Reset functionality
 * - Custom fields support
 * - Consistent styling
 */
export function FilterBar({
  filters,
  fields,
  onFilterChange,
  onReset,
  className = "",
  showReset = true,
  customFields
}: FilterBarProps) {
  return (
    <Card className={`bg-card border-border shadow-sm neon-border ${className}`}>
      <CardContent className="p-3 sm:p-4 md:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          {fields.map((field) => {
            const span = field.span || 1
            const fieldClasses = field.className || ""
            
            if (field.type === 'text') {
              const isSearch = field.key.toLowerCase().includes('search')
              return (
                <div key={field.key} className={`sm:col-span-${span} lg:col-span-${span} xl:col-span-${span}`}>
                  {isSearch ? (
                    <div className="relative">
                      <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder={field.placeholder || `Search ${field.label.toLowerCase()}...`}
                        value={filters[field.key] || ''}
                        onChange={(e) => onFilterChange(field.key, e.target.value)}
                        className={`pl-8 sm:pl-10 bg-background border-border text-sm ${fieldClasses}`}
                      />
                    </div>
                  ) : (
                    <Input
                      placeholder={field.placeholder || field.label}
                      value={filters[field.key] || ''}
                      onChange={(e) => onFilterChange(field.key, e.target.value)}
                      className={`bg-background border-border text-sm ${fieldClasses}`}
                    />
                  )}
                </div>
              )
            }

            if (field.type === 'select') {
              return (
                <div key={field.key} className={`sm:col-span-${span} lg:col-span-${span} xl:col-span-${span}`}>
                  <Select
                    value={filters[field.key] || 'all'}
                    onValueChange={(value) => onFilterChange(field.key, value)}
                  >
                    <SelectTrigger className={`bg-background border-border ${fieldClasses}`}>
                      <SelectValue placeholder={field.placeholder || field.label} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options?.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            }

            if (field.type === 'date') {
              return (
                <div key={field.key} className={`sm:col-span-${span} lg:col-span-${span} xl:col-span-${span}`}>
                  <Input
                    type="date"
                    placeholder={field.placeholder || field.label}
                    value={filters[field.key] || ''}
                    onChange={(e) => onFilterChange(field.key, e.target.value)}
                    className={`bg-background border-border ${fieldClasses}`}
                  />
                </div>
              )
            }

            if (field.type === 'number') {
              return (
                <div key={field.key} className={`sm:col-span-${span} lg:col-span-${span} xl:col-span-${span}`}>
                  <Input
                    type="number"
                    placeholder={field.placeholder || field.label}
                    value={filters[field.key] || ''}
                    onChange={(e) => onFilterChange(field.key, e.target.value)}
                    className={`bg-background border-border ${fieldClasses}`}
                  />
                </div>
              )
            }

            return null
          })}

          {customFields}

          {showReset && onReset && (
            <div className="sm:col-span-full lg:col-span-full xl:col-span-full flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={onReset}
                className="border-primary/50 text-primary hover:bg-primary/10"
              >
                <FilterX className="w-4 h-4 mr-2" />
                Reset Filters
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
