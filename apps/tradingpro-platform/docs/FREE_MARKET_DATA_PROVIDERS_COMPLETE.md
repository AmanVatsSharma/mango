# Complete Free Market Data Providers Guide

## Overview

This comprehensive guide covers **free data sources** for all asset classes:
- 🪙 **Cryptocurrencies** (Binance - BEST!)
- 💱 **Forex/Currencies** (Alpha Vantage, RBI, Binance USDT pairs)
- 📈 **US Stocks** (Yahoo Finance, Alpha Vantage, Finnhub)
- 🇮🇳 **Indian Stocks** (Vortex - already integrated)

---

## 🪙 Cryptocurrency Data

### 1. Binance API ⭐⭐⭐ (HIGHLY RECOMMENDED)

**Why**: Best free crypto API, no limits, real-time data

**Free Tier**:
- ✅ **UNLIMITED** API calls (no rate limits on public endpoints)
- ✅ No API key required for public data
- ✅ Real-time WebSocket support
- ✅ 1,000+ trading pairs

**Coverage**:
- Bitcoin, Ethereum, all major cryptos
- USDT, BUSD, BTC, ETH base pairs
- Real-time prices, order books, trades
- Historical klines (candlestick data)

**API Documentation**: https://binance-docs.github.io/apidocs/spot/en/

#### Implementation - REST API

```typescript
// lib/services/crypto/BinanceService.ts

export class BinanceService {
  private baseUrl = 'https://api.binance.com/api/v3'
  private cache: Map<string, { price: number; timestamp: number }> = new Map()
  private readonly CACHE_TTL = 10000 // 10 seconds for crypto (fast-moving)

  constructor() {
    console.log('✅ [BINANCE] Service initialized (NO API KEY NEEDED!)')
  }

  /**
   * Get current price for a symbol
   * Example: symbol = 'BTCUSDT'
   */
  async getPrice(symbol: string): Promise<{
    symbol: string
    price: number
    timestamp: number
  }> {
    console.log(`📊 [BINANCE] Fetching price for ${symbol}`)

    // Check cache first
    const cached = this.cache.get(symbol)
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log('💾 [BINANCE] Using cached price:', cached.price)
      return {
        symbol,
        price: cached.price,
        timestamp: cached.timestamp
      }
    }

    try {
      const url = `${this.baseUrl}/ticker/price?symbol=${symbol}`
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status}`)
      }

      const data = await response.json()
      const price = parseFloat(data.price)

      // Cache the result
      const timestamp = Date.now()
      this.cache.set(symbol, { price, timestamp })

      console.log(`✅ [BINANCE] Price fetched: ${symbol} = $${price}`)

      return {
        symbol: data.symbol,
        price,
        timestamp
      }

    } catch (error: any) {
      console.error('❌ [BINANCE] Error fetching price:', error)
      
      // Return stale cache if available
      if (cached) {
        console.warn('⚠️ [BINANCE] Using stale cache')
        return {
          symbol,
          price: cached.price,
          timestamp: cached.timestamp
        }
      }
      
      throw error
    }
  }

  /**
   * Get 24hr ticker statistics (more detailed)
   */
  async get24hrTicker(symbol: string): Promise<{
    symbol: string
    price: number
    priceChange: number
    priceChangePercent: number
    high: number
    low: number
    volume: number
    quoteVolume: number
    openPrice: number
    bidPrice: number
    askPrice: number
    timestamp: number
  }> {
    console.log(`📊 [BINANCE] Fetching 24hr ticker for ${symbol}`)

    try {
      const url = `${this.baseUrl}/ticker/24hr?symbol=${symbol}`
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status}`)
      }

      const data = await response.json()

      console.log(`✅ [BINANCE] 24hr ticker fetched for ${symbol}`)

      return {
        symbol: data.symbol,
        price: parseFloat(data.lastPrice),
        priceChange: parseFloat(data.priceChange),
        priceChangePercent: parseFloat(data.priceChangePercent),
        high: parseFloat(data.highPrice),
        low: parseFloat(data.lowPrice),
        volume: parseFloat(data.volume),
        quoteVolume: parseFloat(data.quoteVolume),
        openPrice: parseFloat(data.openPrice),
        bidPrice: parseFloat(data.bidPrice),
        askPrice: parseFloat(data.askPrice),
        timestamp: data.closeTime
      }

    } catch (error: any) {
      console.error('❌ [BINANCE] Error fetching 24hr ticker:', error)
      throw error
    }
  }

  /**
   * Get multiple prices at once
   */
  async getMultiplePrices(symbols: string[]): Promise<
    Array<{
      symbol: string
      price: number
      timestamp: number
    }>
  > {
    console.log(`📊 [BINANCE] Fetching ${symbols.length} prices`)

    try {
      // Binance supports batch request
      const symbolsParam = symbols.map(s => `"${s}"`).join(',')
      const url = `${this.baseUrl}/ticker/price?symbols=[${symbolsParam}]`
      
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status}`)
      }

      const data = await response.json()
      const timestamp = Date.now()

      const results = data.map((item: any) => ({
        symbol: item.symbol,
        price: parseFloat(item.price),
        timestamp
      }))

      // Cache all results
      results.forEach((result: any) => {
        this.cache.set(result.symbol, {
          price: result.price,
          timestamp: result.timestamp
        })
      })

      console.log(`✅ [BINANCE] Fetched ${results.length} prices`)

      return results

    } catch (error: any) {
      console.error('❌ [BINANCE] Error fetching multiple prices:', error)
      throw error
    }
  }

  /**
   * Get order book (bid/ask depth)
   */
  async getOrderBook(symbol: string, limit: number = 5): Promise<{
    symbol: string
    bids: Array<{ price: number; quantity: number }>
    asks: Array<{ price: number; quantity: number }>
    timestamp: number
  }> {
    console.log(`📊 [BINANCE] Fetching order book for ${symbol}`)

    try {
      const url = `${this.baseUrl}/depth?symbol=${symbol}&limit=${limit}`
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status}`)
      }

      const data = await response.json()

      const result = {
        symbol,
        bids: data.bids.map((bid: [string, string]) => ({
          price: parseFloat(bid[0]),
          quantity: parseFloat(bid[1])
        })),
        asks: data.asks.map((ask: [string, string]) => ({
          price: parseFloat(ask[0]),
          quantity: parseFloat(ask[1])
        })),
        timestamp: Date.now()
      }

      console.log(`✅ [BINANCE] Order book fetched:`, {
        bestBid: result.bids[0]?.price,
        bestAsk: result.asks[0]?.price,
        spread: result.asks[0]?.price - result.bids[0]?.price
      })

      return result

    } catch (error: any) {
      console.error('❌ [BINANCE] Error fetching order book:', error)
      throw error
    }
  }

  /**
   * Convert crypto symbol to Binance format
   * BTC/USDT → BTCUSDT
   */
  formatSymbol(base: string, quote: string = 'USDT'): string {
    return `${base.toUpperCase()}${quote.toUpperCase()}`
  }

  /**
   * Get all available trading pairs
   */
  async getExchangeInfo(): Promise<{
    symbols: Array<{
      symbol: string
      baseAsset: string
      quoteAsset: string
      status: string
    }>
  }> {
    console.log('📊 [BINANCE] Fetching exchange info')

    try {
      const url = `${this.baseUrl}/exchangeInfo`
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status}`)
      }

      const data = await response.json()

      const symbols = data.symbols
        .filter((s: any) => s.status === 'TRADING')
        .map((s: any) => ({
          symbol: s.symbol,
          baseAsset: s.baseAsset,
          quoteAsset: s.quoteAsset,
          status: s.status
        }))

      console.log(`✅ [BINANCE] Found ${symbols.length} active trading pairs`)

      return { symbols }

    } catch (error: any) {
      console.error('❌ [BINANCE] Error fetching exchange info:', error)
      throw error
    }
  }
}
```

#### WebSocket Implementation (Real-time)

```typescript
// lib/services/crypto/BinanceWebSocket.ts

export class BinanceWebSocket {
  private ws: WebSocket | null = null
  private baseUrl = 'wss://stream.binance.com:9443/ws'
  private subscribers = new Map<string, Set<(data: any) => void>>()

  /**
   * Subscribe to real-time price updates
   */
  subscribeTicker(symbol: string, callback: (data: {
    symbol: string
    price: number
    timestamp: number
  }) => void): void {
    console.log(`📡 [BINANCE-WS] Subscribing to ${symbol}`)

    const stream = `${symbol.toLowerCase()}@ticker`
    
    if (!this.subscribers.has(stream)) {
      this.subscribers.set(stream, new Set())
    }
    
    this.subscribers.get(stream)!.add(callback)

    // Connect WebSocket
    this.connect(stream)
  }

  private connect(stream: string): void {
    const url = `${this.baseUrl}/${stream}`
    
    console.log(`🔌 [BINANCE-WS] Connecting to ${url}`)

    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      console.log('✅ [BINANCE-WS] Connected')
    }

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        const parsed = {
          symbol: data.s,
          price: parseFloat(data.c), // Current price
          timestamp: data.E
        }

        // Notify all subscribers
        const callbacks = this.subscribers.get(stream)
        if (callbacks) {
          callbacks.forEach(cb => cb(parsed))
        }

      } catch (error) {
        console.error('❌ [BINANCE-WS] Parse error:', error)
      }
    }

    this.ws.onerror = (error) => {
      console.error('❌ [BINANCE-WS] Error:', error)
    }

    this.ws.onclose = () => {
      console.log('🔌 [BINANCE-WS] Disconnected')
      
      // Auto-reconnect after 5 seconds
      setTimeout(() => {
        console.log('🔄 [BINANCE-WS] Reconnecting...')
        this.connect(stream)
      }, 5000)
    }
  }

  /**
   * Unsubscribe from price updates
   */
  unsubscribe(symbol: string, callback: (data: any) => void): void {
    const stream = `${symbol.toLowerCase()}@ticker`
    const callbacks = this.subscribers.get(stream)
    
    if (callbacks) {
      callbacks.delete(callback)
      
      if (callbacks.size === 0) {
        this.subscribers.delete(stream)
        this.ws?.close()
      }
    }
  }

  /**
   * Close all connections
   */
  disconnect(): void {
    console.log('🔌 [BINANCE-WS] Disconnecting all streams')
    this.ws?.close()
    this.subscribers.clear()
  }
}
```

---

## 💱 Forex/Currency Data

### 1. Alpha Vantage ⭐ (Recommended for Traditional Forex)

**Best for**: USD/INR, EUR/USD, GBP/USD, etc.
**Free Tier**: 5 calls/min, 500/day

*Already documented in previous guide - see `docs/FREE_FOREX_DATA_INTEGRATION.md`*

---

### 2. Binance (Crypto-Based Forex Pairs)

**Coverage**:
- ✅ Major crypto/USDT pairs (BTC/USDT, ETH/USDT)
- ✅ Stablecoins (USDT, BUSD, USDC)
- ⚠️ **Limited traditional forex** (no direct USD/INR, EUR/USD)
- ✅ Can derive rates: BTC/USDT ÷ BTC/EUR = USDT/EUR

**Use Case**: Good for crypto-fiat conversions, not traditional forex

```typescript
// Example: Get crypto-based exchange rates
const binance = new BinanceService()

// BTC price in USDT
const btcUsdt = await binance.getPrice('BTCUSDT')

// BTC price in EUR
const btcEur = await binance.getPrice('BTCEUR')

// Derive USDT/EUR rate
const usdtEur = btcUsdt.price / btcEur.price
console.log('1 USDT =', usdtEur, 'EUR')
```

---

### 3. RBI (Reserve Bank of India) - Official INR Rates

**Best for**: Official USD/INR, EUR/INR rates
**Free Tier**: Unlimited

*Already documented - see `docs/FREE_FOREX_DATA_INTEGRATION.md`*

---

## 📈 US Stocks Data

### 1. Yahoo Finance (yfinance) ⭐⭐⭐ (BEST for Stocks)

**Why**: Most reliable free stock data, used by millions

**Free Tier**:
- ✅ Unlimited API calls (unofficial but stable)
- ✅ Real-time quotes (15-min delay for some)
- ✅ Historical data
- ✅ All US stocks + international

**Coverage**: 
- All US stocks (NYSE, NASDAQ)
- Indices (S&P 500, Dow, etc.)
- ETFs, mutual funds
- Commodities (GLD, SLV, etc.)

#### Implementation

```typescript
// lib/services/stocks/YahooFinanceService.ts

export class YahooFinanceService {
  private baseUrl = 'https://query1.finance.yahoo.com/v8/finance/chart'
  private cache: Map<string, { price: number; timestamp: number }> = new Map()
  private readonly CACHE_TTL = 60000 // 1 minute

  /**
   * Get current price for a symbol
   * Example: symbol = 'AAPL', 'TSLA', 'GOOGL'
   */
  async getQuote(symbol: string): Promise<{
    symbol: string
    price: number
    open: number
    high: number
    low: number
    previousClose: number
    volume: number
    change: number
    changePercent: number
    marketCap?: number
    timestamp: number
  }> {
    console.log(`📊 [YAHOO-FINANCE] Fetching quote for ${symbol}`)

    // Check cache
    const cached = this.cache.get(symbol)
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log('💾 [YAHOO-FINANCE] Using cached price')
      return {
        symbol,
        price: cached.price,
        open: 0,
        high: 0,
        low: 0,
        previousClose: 0,
        volume: 0,
        change: 0,
        changePercent: 0,
        timestamp: cached.timestamp
      }
    }

    try {
      const url = `${this.baseUrl}/${symbol}?interval=1d&range=1d`
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`Yahoo Finance API error: ${response.status}`)
      }

      const data = await response.json()
      const result = data.chart.result[0]
      const meta = result.meta
      const quote = result.indicators.quote[0]

      const price = meta.regularMarketPrice
      const previousClose = meta.previousClose

      const quoteData = {
        symbol: meta.symbol,
        price,
        open: quote.open[0] || meta.regularMarketOpen,
        high: quote.high[0] || meta.regularMarketDayHigh,
        low: quote.low[0] || meta.regularMarketDayLow,
        previousClose,
        volume: quote.volume[0] || meta.regularMarketVolume,
        change: price - previousClose,
        changePercent: ((price - previousClose) / previousClose) * 100,
        marketCap: meta.marketCap,
        timestamp: Date.now()
      }

      // Cache the result
      this.cache.set(symbol, {
        price: quoteData.price,
        timestamp: quoteData.timestamp
      })

      console.log(`✅ [YAHOO-FINANCE] Quote fetched: ${symbol} = $${price}`)

      return quoteData

    } catch (error: any) {
      console.error('❌ [YAHOO-FINANCE] Error fetching quote:', error)
      
      // Return stale cache if available
      if (cached) {
        console.warn('⚠️ [YAHOO-FINANCE] Using stale cache')
        return {
          symbol,
          price: cached.price,
          open: 0,
          high: 0,
          low: 0,
          previousClose: 0,
          volume: 0,
          change: 0,
          changePercent: 0,
          timestamp: cached.timestamp
        }
      }
      
      throw error
    }
  }

  /**
   * Get multiple quotes at once
   */
  async getMultipleQuotes(symbols: string[]): Promise<
    Array<{
      symbol: string
      price: number
      change: number
      changePercent: number
    }>
  > {
    console.log(`📊 [YAHOO-FINANCE] Fetching ${symbols.length} quotes`)

    const results = await Promise.allSettled(
      symbols.map(symbol => this.getQuote(symbol))
    )

    return results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map(r => ({
        symbol: r.value.symbol,
        price: r.value.price,
        change: r.value.change,
        changePercent: r.value.changePercent
      }))
  }

  /**
   * Search for stocks by query
   */
  async search(query: string): Promise<
    Array<{
      symbol: string
      name: string
      exchange: string
      type: string
    }>
  > {
    console.log(`🔍 [YAHOO-FINANCE] Searching for: ${query}`)

    try {
      const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`
      
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`Yahoo Finance search error: ${response.status}`)
      }

      const data = await response.json()
      
      const results = data.quotes.map((quote: any) => ({
        symbol: quote.symbol,
        name: quote.shortname || quote.longname,
        exchange: quote.exchDisp,
        type: quote.quoteType
      }))

      console.log(`✅ [YAHOO-FINANCE] Found ${results.length} results`)

      return results

    } catch (error: any) {
      console.error('❌ [YAHOO-FINANCE] Search error:', error)
      throw error
    }
  }
}
```

---

### 2. Alpha Vantage (Also Stocks)

**Free Tier**: 5 calls/min, 500/day
**Coverage**: US stocks, real-time quotes, fundamentals

*See `docs/FREE_FOREX_DATA_INTEGRATION.md` for full implementation*

---

### 3. Finnhub ⭐

**Why**: Good free tier, WebSocket support

**Free Tier**:
- ✅ 60 API calls/minute
- ✅ Real-time quotes (WebSocket)
- ✅ Company fundamentals
- ✅ News and sentiment

**Sign Up**: https://finnhub.io/register

```typescript
// lib/services/stocks/FinnhubService.ts

export class FinnhubService {
  private apiKey: string
  private baseUrl = 'https://finnhub.io/api/v1'

  constructor() {
    this.apiKey = process.env.FINNHUB_API_KEY || ''
    console.log('✅ [FINNHUB] Service initialized')
  }

  async getQuote(symbol: string): Promise<{
    symbol: string
    price: number
    high: number
    low: number
    open: number
    previousClose: number
    timestamp: number
  }> {
    console.log(`📊 [FINNHUB] Fetching quote for ${symbol}`)

    try {
      const url = `${this.baseUrl}/quote?symbol=${symbol}&token=${this.apiKey}`
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`Finnhub API error: ${response.status}`)
      }

      const data = await response.json()

      console.log(`✅ [FINNHUB] Quote fetched: ${symbol} = $${data.c}`)

      return {
        symbol,
        price: data.c, // Current price
        high: data.h,
        low: data.l,
        open: data.o,
        previousClose: data.pc,
        timestamp: data.t * 1000
      }

    } catch (error: any) {
      console.error('❌ [FINNHUB] Error:', error)
      throw error
    }
  }
}
```

---

### 4. Polygon.io

**Free Tier**: 5 API calls/minute
**Coverage**: US stocks, forex, crypto

**Sign Up**: https://polygon.io/

---

### 5. IEX Cloud

**Free Tier**: 50,000 messages/month
**Coverage**: US stocks, real-time data

**Sign Up**: https://iexcloud.io/

---

## 🌍 Unified Multi-Asset Service

Combine all providers into one unified service:

```typescript
// lib/services/market-data/UnifiedMarketDataService.ts

import { BinanceService } from '../crypto/BinanceService'
import { YahooFinanceService } from '../stocks/YahooFinanceService'
import { AlphaVantageService } from '../forex/AlphaVantageService'

export class UnifiedMarketDataService {
  private binance: BinanceService
  private yahoo: YahooFinanceService
  private alphaVantage: AlphaVantageService

  constructor() {
    this.binance = new BinanceService()
    this.yahoo = new YahooFinanceService()
    this.alphaVantage = new AlphaVantageService()
    
    console.log('✅ [UNIFIED-MARKET-DATA] All providers initialized')
  }

  /**
   * Get price for any asset type
   */
  async getPrice(
    symbol: string,
    assetType: 'CRYPTO' | 'STOCK' | 'FOREX'
  ): Promise<{
    symbol: string
    price: number
    source: string
    timestamp: number
  }> {
    console.log(`📊 [UNIFIED] Fetching ${assetType} price for ${symbol}`)

    try {
      switch (assetType) {
        case 'CRYPTO':
          const cryptoData = await this.binance.getPrice(symbol)
          return {
            symbol: cryptoData.symbol,
            price: cryptoData.price,
            source: 'BINANCE',
            timestamp: cryptoData.timestamp
          }

        case 'STOCK':
          const stockData = await this.yahoo.getQuote(symbol)
          return {
            symbol: stockData.symbol,
            price: stockData.price,
            source: 'YAHOO_FINANCE',
            timestamp: stockData.timestamp
          }

        case 'FOREX':
          const [from, to] = symbol.split('/')
          const forexData = await this.alphaVantage.getExchangeRate(from, to)
          return {
            symbol: `${from}/${to}`,
            price: forexData.rate,
            source: 'ALPHA_VANTAGE',
            timestamp: Date.now()
          }

        default:
          throw new Error(`Unknown asset type: ${assetType}`)
      }

    } catch (error: any) {
      console.error(`❌ [UNIFIED] Error fetching ${assetType} price:`, error)
      throw error
    }
  }

  /**
   * Get detailed quote with bid/ask
   */
  async getDetailedQuote(
    symbol: string,
    assetType: 'CRYPTO' | 'STOCK' | 'FOREX'
  ): Promise<{
    symbol: string
    price: number
    bidPrice?: number
    askPrice?: number
    high?: number
    low?: number
    volume?: number
    source: string
    timestamp: number
  }> {
    console.log(`📊 [UNIFIED] Fetching detailed quote for ${symbol}`)

    try {
      if (assetType === 'CRYPTO') {
        const ticker = await this.binance.get24hrTicker(symbol)
        return {
          symbol: ticker.symbol,
          price: ticker.price,
          bidPrice: ticker.bidPrice,
          askPrice: ticker.askPrice,
          high: ticker.high,
          low: ticker.low,
          volume: ticker.volume,
          source: 'BINANCE',
          timestamp: ticker.timestamp
        }
      }

      if (assetType === 'STOCK') {
        const quote = await this.yahoo.getQuote(symbol)
        return {
          symbol: quote.symbol,
          price: quote.price,
          high: quote.high,
          low: quote.low,
          volume: quote.volume,
          source: 'YAHOO_FINANCE',
          timestamp: quote.timestamp
        }
      }

      if (assetType === 'FOREX') {
        const [from, to] = symbol.split('/')
        const data = await this.alphaVantage.getExchangeRate(from, to)
        return {
          symbol: `${from}/${to}`,
          price: data.rate,
          bidPrice: data.bidPrice,
          askPrice: data.askPrice,
          source: 'ALPHA_VANTAGE',
          timestamp: Date.now()
        }
      }

      throw new Error(`Unknown asset type: ${assetType}`)

    } catch (error: any) {
      console.error('❌ [UNIFIED] Error fetching detailed quote:', error)
      throw error
    }
  }
}
```

---

## 📊 API Routes

Create unified API endpoints:

```typescript
// app/api/market-data/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { UnifiedMarketDataService } from '@/lib/services/market-data/UnifiedMarketDataService'

const marketData = new UnifiedMarketDataService()

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  const symbol = searchParams.get('symbol')
  const assetType = searchParams.get('type') as 'CRYPTO' | 'STOCK' | 'FOREX'
  const detailed = searchParams.get('detailed') === 'true'

  if (!symbol || !assetType) {
    return NextResponse.json({
      success: false,
      error: 'Missing required parameters: symbol and type'
    }, { status: 400 })
  }

  try {
    const data = detailed
      ? await marketData.getDetailedQuote(symbol, assetType)
      : await marketData.getPrice(symbol, assetType)

    return NextResponse.json({
      success: true,
      data
    })

  } catch (error: any) {
    console.error('❌ [MARKET-DATA-API] Error:', error)
    
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}
```

---

## 🎯 Usage Examples

### Fetch Crypto Price (Binance)

```typescript
// Get Bitcoin price
const response = await fetch('/api/market-data?symbol=BTCUSDT&type=CRYPTO')
const data = await response.json()

console.log('BTC Price:', data.data.price) // $45,123.45
console.log('Source:', data.data.source) // BINANCE
```

### Fetch US Stock Price (Yahoo Finance)

```typescript
// Get Apple stock price
const response = await fetch('/api/market-data?symbol=AAPL&type=STOCK&detailed=true')
const data = await response.json()

console.log('AAPL Price:', data.data.price) // $178.23
console.log('Change:', data.data.change) // +2.45
console.log('Volume:', data.data.volume) // 52,341,234
```

### Fetch Forex Rate (Alpha Vantage)

```typescript
// Get USD to INR rate
const response = await fetch('/api/market-data?symbol=USD/INR&type=FOREX&detailed=true')
const data = await response.json()

console.log('USD/INR:', data.data.price) // 83.25
console.log('Bid:', data.data.bidPrice) // 83.24
console.log('Ask:', data.data.askPrice) // 83.26
```

---

## 📋 Summary Table

| Asset Class | Provider | Free Tier | API Key? | Best For |
|-------------|----------|-----------|----------|----------|
| 🪙 **Crypto** | Binance | ✅ Unlimited | ❌ No | Real-time crypto prices |
| 💱 **Forex** | Alpha Vantage | 5/min, 500/day | ✅ Yes | Traditional forex pairs |
| 💱 **Forex** | RBI | ✅ Unlimited | ❌ No | Official INR rates |
| 📈 **US Stocks** | Yahoo Finance | ✅ Unlimited | ❌ No | All US stocks (best) |
| 📈 **US Stocks** | Finnhub | 60/min | ✅ Yes | Real-time + news |
| 📈 **US Stocks** | Alpha Vantage | 5/min, 500/day | ✅ Yes | Fundamentals |
| 🇮🇳 **Indian Stocks** | Vortex | ✅ Active | ✅ Yes | NSE/BSE (current) |

---

## 🚀 Recommended Setup

### For Your Platform:

1. **Indian Stocks**: ✅ Vortex (already integrated)
2. **Cryptocurrencies**: ✅ **Binance** (add this - FREE, unlimited!)
3. **Forex**: ✅ **Alpha Vantage** + **RBI** (fallback)
4. **US Stocks**: ✅ **Yahoo Finance** (when you expand)

### API Keys Needed:

```bash
# .env.local

# Already have
VORTEX_X_API_KEY=your_vortex_key

# Add these (all free)
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key  # Get from: https://www.alphavantage.co/support/#api-key
FINNHUB_API_KEY=your_finnhub_key              # Optional: https://finnhub.io/register

# Binance - NO API KEY NEEDED for public data! 🎉
```

---

## 🎉 Benefits

✅ **Crypto**: Binance gives you **unlimited free real-time crypto data**  
✅ **Forex**: Alpha Vantage covers all major pairs (500 calls/day is enough)  
✅ **US Stocks**: Yahoo Finance gives **unlimited US stock quotes**  
✅ **Indian Stocks**: Vortex already integrated  

**Result**: Complete multi-asset platform with **99% free data**! 🚀

---

## 💡 Pro Tips

1. **Binance is amazing for crypto** - No limits, no API key for public data
2. **Yahoo Finance is most reliable for stocks** - Used by millions, very stable
3. **Alpha Vantage 500/day is enough** for most forex needs (cache for 5-15 min)
4. **Combine providers for redundancy** - If one fails, fallback to another
5. **Cache aggressively** - Crypto: 10s, Stocks: 1min, Forex: 5min

---

## 📞 Next Steps

1. **Add Binance service** for crypto (code provided above)
2. **Add Yahoo Finance service** for US stocks (code provided above)
3. **Keep Alpha Vantage** for forex (already documented)
4. **Create unified API route** (code provided above)
5. **Update UI** to show multi-asset data

You'll have a **complete multi-asset trading platform** with **free data** for everything! 🎉