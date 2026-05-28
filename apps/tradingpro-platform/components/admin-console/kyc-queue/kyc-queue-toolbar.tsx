/**
 * @file kyc-queue-toolbar.tsx
 * @module admin-console/kyc-queue
 * @description Compact filter toolbar: primary search + shadcn Popover/Collapsible for queue filters.
 * @author StockTrade
 * @created 2026-04-07
 */

"use client"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
import { Filter, ChevronDown } from "lucide-react"
import {
  AML_STATUS_OPTIONS,
  KYC_LIFECYCLE_OPTIONS,
  KYC_STATUS_OPTIONS,
  SLA_FILTERS,
  SUSPICIOUS_STATUS_OPTIONS,
} from "./kyc-types"
import { cn } from "@/lib/utils"

export type AssignedOption = { label: string; value: string }

export function KycQueueToolbar({
  search,
  onSearchChange,
  lifecycleFilter,
  onLifecycleFilterChange,
  amlFlagFilter,
  onAmlFlagChange,
  statusFilter,
  onStatusFilterChange,
  assignedFilter,
  onAssignedFilterChange,
  slaFilter,
  onSlaFilterChange,
  amlStatusFilter,
  onAmlStatusFilterChange,
  suspiciousFilter,
  onSuspiciousFilterChange,
  relatedOverlapOnly,
  onRelatedOverlapChange,
  assignedOptions,
  activeFilterCount,
}: {
  search: string
  onSearchChange: (v: string) => void
  lifecycleFilter: string
  onLifecycleFilterChange: (v: string) => void
  amlFlagFilter: string
  onAmlFlagChange: (v: string) => void
  statusFilter: string
  onStatusFilterChange: (v: string) => void
  assignedFilter: string
  onAssignedFilterChange: (v: string) => void
  slaFilter: string
  onSlaFilterChange: (v: string) => void
  amlStatusFilter: string
  onAmlStatusFilterChange: (v: string) => void
  suspiciousFilter: string
  onSuspiciousFilterChange: (v: string) => void
  relatedOverlapOnly: boolean
  onRelatedOverlapChange: (checked: boolean) => void
  assignedOptions: AssignedOption[]
  /** Badge count for popover trigger (excludes search-only). */
  activeFilterCount: number
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col lg:flex-row gap-2 lg:items-end lg:justify-between">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center flex-1 min-w-0">
          <Input
            placeholder="Search name, email, phone, client ID…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="max-w-md h-9 text-sm"
          />
          <div className="flex flex-col gap-0.5 min-w-[200px] max-w-xs">
            <Label className="text-[10px] text-muted-foreground">Pipeline</Label>
            <Select value={lifecycleFilter} onValueChange={onLifecycleFilterChange}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Pipeline segment" />
              </SelectTrigger>
              <SelectContent>
                {KYC_LIFECYCLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      <div className="flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              Filters
              {activeFilterCount > 0 ? (
                <span
                  className={cn(
                    "ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground",
                  )}
                >
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-3" align="end">
            <p className="text-xs font-medium mb-2">Queue filters</p>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Status</Label>
                <Select value={statusFilter} onValueChange={onStatusFilterChange}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {KYC_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Assigned</Label>
                <Select value={assignedFilter} onValueChange={onAssignedFilterChange}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Assigned" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignedOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">SLA</Label>
                <Select value={slaFilter} onValueChange={onSlaFilterChange}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="SLA" />
                  </SelectTrigger>
                  <SelectContent>
                    {SLA_FILTERS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">AML status</Label>
                <Select value={amlStatusFilter} onValueChange={onAmlStatusFilterChange}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AML_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Suspicious</Label>
                <Select value={suspiciousFilter} onValueChange={onSuspiciousFilterChange}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUSPICIOUS_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-9 text-xs gap-1 text-muted-foreground">
              <ChevronDown className="h-3.5 w-3.5" />
              Advanced
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 space-y-2 border-t border-border/60 mt-2 sm:mt-0 sm:border-0 sm:pt-0">
            <Input
              placeholder="AML flags (comma separated)"
              value={amlFlagFilter}
              onChange={(e) => onAmlFlagChange(e.target.value)}
              className="h-8 text-xs"
            />
            <Separator />
            <div className="flex items-center gap-2">
              <Checkbox
                id="relatedContactOverlapKycToolbar"
                checked={relatedOverlapOnly}
                onCheckedChange={(c) => onRelatedOverlapChange(c === true)}
              />
              <Label htmlFor="relatedContactOverlapKycToolbar" className="text-xs text-muted-foreground cursor-pointer">
                Related contact overlap only
              </Label>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
      </div>
    </div>
  )
}
