/**
 * @file trading-policy-token-field.tsx
 * @module admin-console
 * @description Chip-style quick picks plus free-form comma list for segment/product CSV policy fields.
 * @author StockTrade
 * @created 2026-03-30
 */

"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { normalizeCsvTokenList } from "./trading-policy-studio-state"

const SEGMENT_PRESETS = ["NSE", "NFO", "MCX", "BSE", "BSE_FO", "MCX_FO", "NSE_EQ"]
const PRODUCT_PRESETS = ["MIS", "CNC", "NRML"]

export interface TradingPolicyTokenFieldProps {
  id?: string
  label: string
  value: string
  onChange: (nextCsv: string) => void
  placeholder?: string
  presetKind: "segment" | "product"
  className?: string
}

export function TradingPolicyTokenField({
  id,
  label,
  value,
  onChange,
  placeholder,
  presetKind,
  className,
}: TradingPolicyTokenFieldProps) {
  const tokens = normalizeCsvTokenList(value)
  const presetList = presetKind === "segment" ? SEGMENT_PRESETS : PRODUCT_PRESETS

  const toggleToken = (token: string) => {
    const upper = token.trim().toUpperCase()
    if (!upper) {
      return
    }
    const set = new Set(tokens)
    if (set.has(upper)) {
      set.delete(upper)
    } else {
      set.add(upper)
    }
    onChange(Array.from(set).join(","))
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {presetList.map((preset) => {
          const active = tokens.includes(preset)
          return (
            <Button
              key={preset}
              type="button"
              variant={active ? "secondary" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => toggleToken(preset)}
            >
              {preset}
            </Button>
          )
        })}
      </div>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Comma-separated, e.g. NSE,NFO"}
        className="bg-background border-border font-mono text-sm"
      />
      <p className="text-xs text-muted-foreground">
        Tap shortcuts or type a list. Values are saved in uppercase for matching.
      </p>
    </div>
  )
}
