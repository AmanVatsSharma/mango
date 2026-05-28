/**
 * @file pro-order-entry.tsx
 * @module components/trading/widgets
 * @description Rapid order-entry widget for professional traders with quantity presets and quick
 *              actions (Lift Ask / Hit Bid / Flatten / Reverse).
 *
 *              Trading-wc6: the Lift Ask / Hit Bid / Flatten / Reverse buttons are NOT wired to
 *              the order engine — they previously fired toasts only, which made the widget look
 *              functional but silently no-op'd. To prevent users from thinking they placed real
 *              orders, the widget now renders a clear "Demo · not wired" banner and disables the
 *              action buttons unless `NEXT_PUBLIC_PRO_ORDER_ENTRY_DEMO=1` is set (mirrors the
 *              Time & Sales / MarketDataConfig pattern). When the env flag is on, the original
 *              toast behavior is preserved for development sanity-checks.
 *
 * @author StockTrade
 * @created 2026-02-22
 * @updated 2026-05-08 — gate toast-only buttons behind NEXT_PUBLIC_PRO_ORDER_ENTRY_DEMO (Trading-wc6)
 */

"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Zap, XSquare, ArrowLeftRight, AlertTriangle } from "lucide-react"
import { toast } from "@/hooks/use-toast"

const DEMO_FLAG_ENABLED = process.env.NEXT_PUBLIC_PRO_ORDER_ENTRY_DEMO === "1"

export interface ProOrderEntryProps {
  defaultQuantityPresets?: number[]
}

export const ProOrderEntry: React.FC<ProOrderEntryProps> = ({
  defaultQuantityPresets = [10, 50, 100],
}) => {
  const [quantity, setQuantity] = useState<string>("10")

  const handleAction = (action: string) => {
    if (!DEMO_FLAG_ENABLED) return
    toast({
      title: "[Demo] Order Action: " + action,
      description: `Demo only — no real order placed. Quantity ${quantity}.`,
    })
  }

  const handleSpecialAction = (action: string) => {
    if (!DEMO_FLAG_ENABLED) return
    toast({
      title: "[Demo] Special Action: " + action,
      description: `Demo only — no real action executed.`,
    })
  }

  const buttonsDisabled = !DEMO_FLAG_ENABLED

  return (
    <Card className="border-border/50 bg-card shadow-sm rounded-md overflow-hidden">
      <CardHeader className="p-3 pb-2 border-b border-border/50 bg-muted/20">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">Pro Order Entry</CardTitle>
          </div>
          {!DEMO_FLAG_ENABLED && (
            <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-sm bg-amber-500/10 text-amber-600 border border-amber-500/30">
              Demo · not wired
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3 space-y-3">
        {!DEMO_FLAG_ENABLED && (
          <div className="flex items-start gap-2 rounded-sm border border-amber-500/30 bg-amber-500/5 p-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-300">
              Quick-action buttons are not connected to the order engine yet. Use the main order
              ticket to place trades. Set <code className="font-mono">NEXT_PUBLIC_PRO_ORDER_ENTRY_DEMO=1</code> to enable demo toasts.
            </p>
          </div>
        )}

        {/* Quantity Selection */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">Quantity</span>
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="h-8 font-mono text-sm w-24 bg-background border-border focus-visible:ring-1 focus-visible:ring-primary/50 rounded-sm"
            />
            <div className="flex gap-1 flex-1">
              {defaultQuantityPresets.map((preset) => (
                <Button
                  key={preset}
                  variant="outline"
                  size="sm"
                  onClick={() => setQuantity(preset.toString())}
                  className="h-8 flex-1 text-xs font-mono rounded-sm border-border/50 hover:bg-muted"
                >
                  {preset}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="default"
            disabled={buttonsDisabled}
            aria-disabled={buttonsDisabled}
            title={buttonsDisabled ? "Not implemented — demo mode disabled" : "Place a buy order at the ask"}
            className="h-10 bg-green-600/10 text-green-600 hover:bg-green-600/20 border border-green-600/30 rounded-sm font-semibold tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => handleAction("Lift Ask (Buy)")}
          >
            LIFT ASK
          </Button>
          <Button
            variant="default"
            disabled={buttonsDisabled}
            aria-disabled={buttonsDisabled}
            title={buttonsDisabled ? "Not implemented — demo mode disabled" : "Place a sell order at the bid"}
            className="h-10 bg-red-600/10 text-red-600 hover:bg-red-600/20 border border-red-600/30 rounded-sm font-semibold tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => handleAction("Hit Bid (Sell)")}
          >
            HIT BID
          </Button>
        </div>

        {/* Special Actions */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button
            variant="outline"
            disabled={buttonsDisabled}
            aria-disabled={buttonsDisabled}
            title={buttonsDisabled ? "Not implemented — demo mode disabled" : "Close all open positions"}
            className="h-8 text-xs font-semibold rounded-sm border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => handleSpecialAction("Flatten")}
          >
            <XSquare className="w-3 h-3 mr-1.5" /> FLATTEN
          </Button>
          <Button
            variant="outline"
            disabled={buttonsDisabled}
            aria-disabled={buttonsDisabled}
            title={buttonsDisabled ? "Not implemented — demo mode disabled" : "Reverse all open positions"}
            className="h-8 text-xs font-semibold rounded-sm border-border hover:bg-blue-500/10 hover:text-blue-500 hover:border-blue-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => handleSpecialAction("Reverse")}
          >
            <ArrowLeftRight className="w-3 h-3 mr-1.5" /> REVERSE
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
