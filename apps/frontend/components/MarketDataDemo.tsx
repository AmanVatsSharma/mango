/**
 * @file MarketDataDemo.tsx
 * @description Demo component showcasing enhanced market data with jitter, deviation, and smooth transitions
 */

"use client"

import { } from "react"
import { useMarketData } from "@/lib/hooks/MarketDataProvider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MarketDataConfig } from "./MarketDataConfig"

interface MarketDataDemoProps {
  className?: string;
}

export function MarketDataDemo({ className }: MarketDataDemoProps) {
  const { quotes, isLoading, config } = useMarketData()

  const getTrendColor = (trend: 'up' | 'down' | 'neutral') => {
    switch (trend) {
      case 'up': return 'text-green-500'
      case 'down': return 'text-red-500'
      default: return 'text-gray-500'
    }
  }

  const getTrendIcon = (trend: 'up' | 'down' | 'neutral') => {
    switch (trend) {
      case 'up': return '↗'
      case 'down': return '↘'
      default: return '→'
    }
  }

  const formatPrice = (price: number) => {
    return price.toFixed(2)
  }

  const formatOffset = (offset: number) => {
    return offset >= 0 ? `+${offset.toFixed(3)}` : offset.toFixed(3)
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Market Data Demo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-muted-foreground">Loading market data...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const quoteEntries = Object.entries(quotes)

  return (
    <div className={className}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Market Data Display */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Live Market Data
              <Badge variant="outline" className="text-xs">
                {config.jitter.enabled ? 'Jitter ON' : 'Jitter OFF'} | 
                {config.deviation.enabled ? 'Deviation ON' : 'Deviation OFF'} | 
                {config.interpolation.enabled ? 'Smooth ON' : 'Smooth OFF'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {quoteEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No market data available
              </div>
            ) : (
              <div className="space-y-4">
                {quoteEntries.map(([instrumentId, quote]) => (
                  <div key={instrumentId} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">{instrumentId}</h4>
                      <span className={`text-sm ${getTrendColor(quote.trend)}`}>
                        {getTrendIcon(quote.trend)} {quote.trend}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Display Price</p>
                        <p className="text-lg font-mono font-bold">
                          ₹{formatPrice(quote.display_price)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Actual LTP</p>
                        <p className="text-lg font-mono">
                          ₹{formatPrice(quote.actual_price)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <p className="text-muted-foreground">Jitter Offset</p>
                        <p className={`font-mono ${quote.jitter_offset >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatOffset(quote.jitter_offset)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Deviation Offset</p>
                        <p className={`font-mono ${quote.deviation_offset >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatOffset(quote.deviation_offset)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="text-xs text-muted-foreground">
                      Updated: {new Date(quote.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Configuration Panel */}
        <MarketDataConfig />
      </div>

      {/* Feature Explanation */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Enhanced Market Data Features</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium text-green-600">🎯 Jitter System</h4>
              <p className="text-sm text-muted-foreground">
                Adds realistic micro-movements every 200-300ms to simulate live trading activity. 
                The jitter gradually converges toward the actual price, creating a natural feel.
              </p>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium text-blue-600">📈 Smooth Transitions</h4>
              <p className="text-sm text-muted-foreground">
                Linear interpolation between price updates creates smooth transitions instead of 
                jarring jumps. Updates every 5 seconds feel like continuous movement.
              </p>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium text-purple-600">🎛️ Deviation Control</h4>
              <p className="text-sm text-muted-foreground">
                Offset prices from actual LTP while maintaining trend direction. Useful for 
                testing or creating slight variations in displayed prices.
              </p>
            </div>
          </div>
          
          <div className="bg-muted p-4 rounded-lg">
            <h5 className="font-medium mb-2">How It Works:</h5>
            <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
              <li>Real prices are fetched every 5 seconds from the API</li>
              <li>Jitter adds small random movements every 250ms (configurable)</li>
              <li>Smooth interpolation transitions between major price changes</li>
              <li>Deviation can offset all prices while preserving trends</li>
              <li>Display price = Actual Price + Deviation + Jitter</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
