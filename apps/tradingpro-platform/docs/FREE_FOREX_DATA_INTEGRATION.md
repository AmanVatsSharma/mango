# Free Forex Data Integration Guide

## Overview

This guide provides step-by-step instructions for integrating free forex data providers into your trading platform. Since you're already using Vortex for NSE data, these providers will supplement your platform with forex/currency pair data.

---

## Recommended Free Forex Data Providers

### 1. Alpha Vantage ⭐ (RECOMMENDED)

**Why**: Best for Indian traders, good coverage of INR pairs, reliable API

**Free Tier**:
- 5 API calls per minute
- 500 API calls per day
- No credit card required

**Coverage**:
- 150+ currencies including major INR pairs (USD/INR, EUR/INR, GBP/INR, JPY/INR)
- Real-time and historical data
- Forex rates, digital currencies, technical indicators

**Sign Up**: https://www.alphavantage.co/support/#api-key

#### Implementation

```typescript
// lib/services/forex/AlphaVantageService.ts

export class AlphaVantageService {
  private apiKey: string
  private baseUrl = 'https://www.alphavantage.co/query'
  private cache: Map<string, { rate: number; timestamp: number }> = new Map()
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  constructor() {
    this.apiKey = process.env.ALPHA_VANTAGE_API_KEY || ''
    
    if (!this.apiKey) {
      console.error('❌ [ALPHA-VANTAGE] API key not configured')
      throw new Error('ALPHA_VANTAGE_API_KEY not set in environment variables')
    }
    
    console.log('✅ [ALPHA-VANTAGE] Service initialized')
  }

  /**
   * Get real-time forex exchange rate
   */
  async getExchangeRate(fromCurrency: string, toCurrency: string): Promise<{
    rate: number
    bidPrice: number
    askPrice: number
    timestamp: string
  }> {
    console.log(`📊 [ALPHA-VANTAGE] Fetching rate: ${fromCurrency}/${toCurrency}`)

    // Check cache first
    const cacheKey = `${fromCurrency}_${toCurrency}`
    const cached = this.cache.get(cacheKey)
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log('💾 [ALPHA-VANTAGE] Using cached rate:', cached.rate)
      return {
        rate: cached.rate,
        bidPrice: cached.rate * 0.9999, // Approximate bid
        askPrice: cached.rate * 1.0001, // Approximate ask
        timestamp: new Date(cached.timestamp).toISOString()
      }
    }

    try {
      const url = `${this.baseUrl}?function=CURRENCY_EXCHANGE_RATE&from_currency=${fromCurrency}&to_currency=${toCurrency}&apikey=${this.apiKey}`
      
      const response = await fetch(url)
      const data = await response.json()

      if (data['Error Message']) {
        throw new Error(data['Error Message'])
      }

      if (data['Note']) {
        console.warn('⚠️ [ALPHA-VANTAGE] API limit reached:', data['Note'])
        throw new Error('API call frequency exceeded')
      }

      const rateData = data['Realtime Currency Exchange Rate']
      
      if (!rateData) {
        throw new Error('Invalid response from Alpha Vantage')
      }

      const rate = parseFloat(rateData['5. Exchange Rate'])
      const bidPrice = parseFloat(rateData['8. Bid Price'])
      const askPrice = parseFloat(rateData['9. Ask Price'])
      const timestamp = rateData['6. Last Refreshed']

      // Cache the result
      this.cache.set(cacheKey, { rate, timestamp: Date.now() })

      console.log(`✅ [ALPHA-VANTAGE] Rate fetched: ${rate}`)

      return {
        rate,
        bidPrice,
        askPrice,
        timestamp
      }

    } catch (error: any) {
      console.error('❌ [ALPHA-VANTAGE] Error fetching rate:', error)
      
      // Return cached data if available (even if stale)
      if (cached) {
        console.warn('⚠️ [ALPHA-VANTAGE] Using stale cache due to error')
        return {
          rate: cached.rate,
          bidPrice: cached.rate * 0.9999,
          askPrice: cached.rate * 1.0001,
          timestamp: new Date(cached.timestamp).toISOString()
        }
      }
      
      throw error
    }
  }

  /**
   * Get multiple currency pairs at once
   * (Uses batch to stay within rate limits)
   */
  async getMultipleRates(pairs: Array<{ from: string; to: string }>): Promise<
    Array<{
      pair: string
      rate: number
      bidPrice: number
      askPrice: number
      timestamp: string
    }>
  > {
    console.log(`📊 [ALPHA-VANTAGE] Fetching ${pairs.length} currency pairs`)

    const results = []
    
    // Rate limit: 5 calls per minute
    // Add delay between calls
    for (const { from, to } of pairs) {
      try {
        const data = await this.getExchangeRate(from, to)
        results.push({
          pair: `${from}/${to}`,
          ...data
        })
        
        // Wait 12 seconds between calls (5 per minute = 1 every 12 seconds)
        if (pairs.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 12000))
        }
        
      } catch (error) {
        console.error(`❌ [ALPHA-VANTAGE] Failed to fetch ${from}/${to}:`, error)
      }
    }

    return results
  }
}
```

#### Environment Configuration

Add to `.env.local`:

```bash
# Alpha Vantage API
ALPHA_VANTAGE_API_KEY=your_api_key_here
```

---

### 2. RBI (Reserve Bank of India) - Official Rates

**Why**: Official rates, most reliable for INR pairs, free unlimited access

**Free Tier**: Unlimited (no API key required)

**Coverage**: USD/INR, EUR/INR, GBP/INR, JPY/INR (100 Yen)

**Source**: https://www.rbi.org.in/Scripts/ReferenceRateArchive.aspx

#### Implementation

```typescript
// lib/services/forex/RBIForexService.ts

import * as cheerio from 'cheerio'

export class RBIForexService {
  private baseUrl = 'https://www.rbi.org.in/Scripts/ReferenceRateArchive.aspx'
  private cache: Map<string, { rate: number; date: string }> = new Map()

  /**
   * Get RBI reference rates for INR
   */
  async getRBIRates(): Promise<{
    'USD/INR': number
    'EUR/INR': number
    'GBP/INR': number
    'JPY/INR': number
    date: string
  }> {
    console.log('📊 [RBI-FOREX] Fetching official RBI rates')

    try {
      const response = await fetch(this.baseUrl)
      const html = await response.text()
      
      // Parse HTML to extract rates
      const $ = cheerio.load(html)
      
      // RBI publishes daily reference rates
      // Extract from table (structure may vary)
      const rates = {
        'USD/INR': 0,
        'EUR/INR': 0,
        'GBP/INR': 0,
        'JPY/INR': 0,
        date: new Date().toISOString().split('T')[0]
      }

      // Parse table rows to extract rates
      // Note: You'll need to inspect RBI's HTML structure
      $('table tr').each((i, row) => {
        const cols = $(row).find('td')
        if (cols.length >= 2) {
          const currency = $(cols[0]).text().trim()
          const rate = parseFloat($(cols[1]).text().trim())
          
          if (currency.includes('US Dollar')) {
            rates['USD/INR'] = rate
          } else if (currency.includes('Euro')) {
            rates['EUR/INR'] = rate
          } else if (currency.includes('UK Pound')) {
            rates['GBP/INR'] = rate
          } else if (currency.includes('100 Yen')) {
            rates['JPY/INR'] = rate / 100 // Per Yen
          }
        }
      })

      console.log('✅ [RBI-FOREX] Rates fetched:', rates)
      
      // Cache for the day
      Object.entries(rates).forEach(([pair, rate]) => {
        if (pair !== 'date' && rate > 0) {
          this.cache.set(pair, { rate: rate as number, date: rates.date })
        }
      })

      return rates

    } catch (error) {
      console.error('❌ [RBI-FOREX] Error fetching rates:', error)
      
      // Return cached rates if available
      if (this.cache.size > 0) {
        console.warn('⚠️ [RBI-FOREX] Using cached rates')
        return {
          'USD/INR': this.cache.get('USD/INR')?.rate || 0,
          'EUR/INR': this.cache.get('EUR/INR')?.rate || 0,
          'GBP/INR': this.cache.get('GBP/INR')?.rate || 0,
          'JPY/INR': this.cache.get('JPY/INR')?.rate || 0,
          date: this.cache.get('USD/INR')?.date || new Date().toISOString().split('T')[0]
        }
      }
      
      throw error
    }
  }
}
```

#### Install Dependencies

```bash
npm install cheerio
npm install --save-dev @types/cheerio
```

---

### 3. ExchangeRate-API

**Why**: Simple, reliable, good free tier

**Free Tier**:
- 1,500 requests per month
- No credit card required

**Coverage**: 161 currencies

**Sign Up**: https://www.exchangerate-api.com/

#### Implementation

```typescript
// lib/services/forex/ExchangeRateAPIService.ts

export class ExchangeRateAPIService {
  private apiKey: string
  private baseUrl = 'https://v6.exchangerate-api.com/v6'

  constructor() {
    this.apiKey = process.env.EXCHANGE_RATE_API_KEY || ''
    console.log('✅ [EXCHANGE-RATE-API] Service initialized')
  }

  async getRate(baseCurrency: string, targetCurrency: string): Promise<number> {
    console.log(`📊 [EXCHANGE-RATE-API] Fetching ${baseCurrency}/${targetCurrency}`)

    const url = `${this.baseUrl}/${this.apiKey}/pair/${baseCurrency}/${targetCurrency}`
    
    const response = await fetch(url)
    const data = await response.json()

    if (data.result !== 'success') {
      throw new Error(data['error-type'] || 'API request failed')
    }

    return data.conversion_rate
  }
}
```

---

## Unified Forex Data Service

Create a unified service that combines all providers with fallback logic:

```typescript
// lib/services/forex/UnifiedForexService.ts

import { AlphaVantageService } from './AlphaVantageService'
import { RBIForexService } from './RBIForexService'
import { ExchangeRateAPIService } from './ExchangeRateAPIService'

export class UnifiedForexService {
  private alphaVantage: AlphaVantageService
  private rbi: RBIForexService
  private exchangeRateAPI: ExchangeRateAPIService
  
  private cache: Map<string, { rate: number; timestamp: number }> = new Map()
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  constructor() {
    this.alphaVantage = new AlphaVantageService()
    this.rbi = new RBIForexService()
    this.exchangeRateAPI = new ExchangeRateAPIService()
    
    console.log('✅ [UNIFIED-FOREX] Service initialized with multi-provider fallback')
  }

  /**
   * Get forex rate with automatic fallback
   */
  async getForexRate(fromCurrency: string, toCurrency: string): Promise<{
    rate: number
    source: 'ALPHA_VANTAGE' | 'RBI' | 'EXCHANGE_RATE_API' | 'CACHE'
    timestamp: Date
  }> {
    console.log(`📊 [UNIFIED-FOREX] Fetching ${fromCurrency}/${toCurrency}`)

    // Check cache first
    const cacheKey = `${fromCurrency}_${toCurrency}`
    const cached = this.cache.get(cacheKey)
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log('💾 [UNIFIED-FOREX] Using cached rate')
      return {
        rate: cached.rate,
        source: 'CACHE',
        timestamp: new Date(cached.timestamp)
      }
    }

    // Try Alpha Vantage first (best for real-time)
    try {
      console.log('🔵 [UNIFIED-FOREX] Trying Alpha Vantage...')
      const data = await this.alphaVantage.getExchangeRate(fromCurrency, toCurrency)
      
      this.cache.set(cacheKey, { rate: data.rate, timestamp: Date.now() })
      
      console.log('✅ [UNIFIED-FOREX] Alpha Vantage success')
      return {
        rate: data.rate,
        source: 'ALPHA_VANTAGE',
        timestamp: new Date()
      }
    } catch (error) {
      console.warn('⚠️ [UNIFIED-FOREX] Alpha Vantage failed:', error)
    }

    // Try RBI for INR pairs
    if (toCurrency === 'INR') {
      try {
        console.log('🟢 [UNIFIED-FOREX] Trying RBI...')
        const rates = await this.rbi.getRBIRates()
        const pair = `${fromCurrency}/${toCurrency}` as keyof typeof rates
        
        if (rates[pair] && rates[pair] > 0) {
          const rate = rates[pair] as number
          this.cache.set(cacheKey, { rate, timestamp: Date.now() })
          
          console.log('✅ [UNIFIED-FOREX] RBI success')
          return {
            rate,
            source: 'RBI',
            timestamp: new Date()
          }
        }
      } catch (error) {
        console.warn('⚠️ [UNIFIED-FOREX] RBI failed:', error)
      }
    }

    // Try ExchangeRate-API as last resort
    try {
      console.log('🟡 [UNIFIED-FOREX] Trying ExchangeRate-API...')
      const rate = await this.exchangeRateAPI.getRate(fromCurrency, toCurrency)
      
      this.cache.set(cacheKey, { rate, timestamp: Date.now() })
      
      console.log('✅ [UNIFIED-FOREX] ExchangeRate-API success')
      return {
        rate,
        source: 'EXCHANGE_RATE_API',
        timestamp: new Date()
      }
    } catch (error) {
      console.error('❌ [UNIFIED-FOREX] ExchangeRate-API failed:', error)
    }

    // All providers failed - use stale cache if available
    if (cached) {
      console.warn('⚠️ [UNIFIED-FOREX] All providers failed, using stale cache')
      return {
        rate: cached.rate,
        source: 'CACHE',
        timestamp: new Date(cached.timestamp)
      }
    }

    throw new Error(`Unable to fetch forex rate for ${fromCurrency}/${toCurrency}`)
  }

  /**
   * Get rates for multiple pairs efficiently
   */
  async getMultiplePairs(pairs: Array<{ from: string; to: string }>): Promise<
    Array<{
      pair: string
      rate: number
      source: string
      timestamp: Date
    }>
  > {
    console.log(`📊 [UNIFIED-FOREX] Fetching ${pairs.length} pairs`)

    const results = await Promise.allSettled(
      pairs.map(async ({ from, to }) => {
        const data = await this.getForexRate(from, to)
        return {
          pair: `${from}/${to}`,
          ...data
        }
      })
    )

    return results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map(r => r.value)
  }
}
```

---

## API Route for Forex Data

Create an API endpoint to serve forex data:

```typescript
// app/api/forex/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { UnifiedForexService } from '@/lib/services/forex/UnifiedForexService'

const forexService = new UnifiedForexService()

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const pairs = searchParams.get('pairs') // Comma-separated: USD-INR,EUR-INR

  try {
    // Single pair request
    if (from && to) {
      const data = await forexService.getForexRate(from, to)
      
      return NextResponse.json({
        success: true,
        data: {
          pair: `${from}/${to}`,
          ...data
        }
      })
    }

    // Multiple pairs request
    if (pairs) {
      const pairArray = pairs.split(',').map(p => {
        const [from, to] = p.split('-')
        return { from, to }
      })
      
      const data = await forexService.getMultiplePairs(pairArray)
      
      return NextResponse.json({
        success: true,
        data
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Missing parameters. Provide either from/to or pairs'
    }, { status: 400 })

  } catch (error: any) {
    console.error('❌ [FOREX-API] Error:', error)
    
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}
```

---

## Usage Examples

### Frontend: Fetch Forex Rates

```typescript
// Get single pair
const response = await fetch('/api/forex?from=USD&to=INR')
const data = await response.json()

console.log('USD/INR rate:', data.data.rate)
console.log('Source:', data.data.source)

// Get multiple pairs
const response = await fetch('/api/forex?pairs=USD-INR,EUR-INR,GBP-INR')
const data = await response.json()

data.data.forEach((pair: any) => {
  console.log(`${pair.pair}: ${pair.rate} (from ${pair.source})`)
})
```

### Display in UI

```tsx
// components/forex-ticker.tsx

'use client'

import { useEffect, useState } from 'react'

export function ForexTicker() {
  const [rates, setRates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRates = async () => {
      try {
        const response = await fetch('/api/forex?pairs=USD-INR,EUR-INR,GBP-INR,JPY-INR')
        const data = await response.json()
        
        if (data.success) {
          setRates(data.data)
        }
      } catch (error) {
        console.error('Failed to fetch forex rates:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchRates()
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchRates, 5 * 60 * 1000)
    
    return () => clearInterval(interval)
  }, [])

  if (loading) return <div>Loading forex rates...</div>

  return (
    <div className="flex gap-4 overflow-x-auto">
      {rates.map((rate) => (
        <div key={rate.pair} className="border rounded-lg p-3 min-w-[150px]">
          <div className="text-sm text-gray-500">{rate.pair}</div>
          <div className="text-xl font-bold">₹{rate.rate.toFixed(2)}</div>
          <div className="text-xs text-gray-400">
            {rate.source} • {new Date(rate.timestamp).toLocaleTimeString()}
          </div>
        </div>
      ))}
    </div>
  )
}
```

---

## Best Practices

### 1. Caching Strategy
- Cache forex rates for 5-15 minutes
- Store in Redis or in-memory cache
- Return stale cache on API failure

### 2. Rate Limiting
- Alpha Vantage: 5 calls/min → Use for on-demand requests
- RBI: Unlimited → Use for daily reference rates
- ExchangeRate-API: 1,500/month → Use as backup

### 3. Error Handling
- Always have fallback providers
- Return cached data when all providers fail
- Log failures for monitoring

### 4. Database Storage
```sql
-- Store forex rates in database
CREATE TABLE forex_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair VARCHAR(10) NOT NULL,
  rate DECIMAL(20, 6) NOT NULL,
  bid_price DECIMAL(20, 6),
  ask_price DECIMAL(20, 6),
  source VARCHAR(50) NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_pair_timestamp (pair, timestamp)
);
```

### 5. WebSocket for Real-Time (Paid Tier)
For high-frequency trading, consider upgrading to:
- **Twelve Data** ($9/month for WebSocket)
- **Fixer.io** ($10/month for real-time)
- **Forex Data Feed** ($19/month for streaming)

---

## Summary

✅ **Alpha Vantage**: Primary source (5 calls/min free)
✅ **RBI**: Backup for INR pairs (unlimited, official)  
✅ **ExchangeRate-API**: Fallback (1,500/month)
✅ **Caching**: 5-minute cache with stale fallback
✅ **Unified Service**: Automatic provider switching
✅ **Error Handling**: Multi-tier fallback strategy

This setup gives you reliable forex data with minimal cost and maximum uptime!