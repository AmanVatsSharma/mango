/**
 * @file page.tsx
 * @description Demo page for enhanced market data features
 */

"use client"

import { MarketDataProvider } from "@/lib/hooks/MarketDataProvider"
import { MarketDataDemo } from "@/components/MarketDataDemo"

export default function MarketDemoPage() {
  // Mock user ID for demo purposes
  const userId = "demo-user-123"

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Enhanced Market Data Demo</h1>
        <p className="text-muted-foreground">
          Experience near real-time market data with smooth transitions, jittering effects, and configurable deviation.
        </p>
      </div>

      <MarketDataProvider userId={userId}>
        <MarketDataDemo />
      </MarketDataProvider>
    </div>
  )
}
