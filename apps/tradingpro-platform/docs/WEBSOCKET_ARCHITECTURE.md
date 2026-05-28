# WebSocket Architecture Documentation

## Overview

This platform uses **two separate WebSocket systems** for different purposes. Understanding their architecture and usage is crucial for proper integration.

---

## System 1: Market Data WebSocket (Socket.IO)

### Purpose
Real-time market prices, quotes, and market data streaming.

### Location
`lib/market-data/`

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Application                        │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐  │
│  │     WebSocketMarketDataProvider (Context API)         │  │
│  │  - Wraps dashboard components                        │  │
│  │  - Provides market data context                       │  │
│  │  - Auto-subscribes to watchlist/positions            │  │
│  └──────────────┬──────────────────────────────────────┘  │
│                 │                                           │
│  ┌──────────────▼──────────────────────────────────────┐  │
│  │        useWebSocketMarketData (React Hook)           │  │
│  │  - Manages WebSocket lifecycle                       │  │
│  │  - Handles subscription state                        │  │
│  │  - Provides price data to components                 │  │
│  └──────────────┬──────────────────────────────────────┘  │
│                 │                                           │
│  ┌──────────────▼──────────────────────────────────────┐  │
│  │   WebSocketMarketDataService (Business Logic)        │  │
│  │  - Price caching layer                               │  │
│  │  - Price enhancements (jitter, interpolation)        │  │
│  │  - Subscription management                           │  │
│  └──────────────┬──────────────────────────────────────┘  │
│                 │                                           │
│  ┌──────────────▼──────────────────────────────────────┐  │
│  │           SocketIOClient (Socket.IO Wrapper)         │  │
│  │  - Low-level Socket.IO connection                    │  │
│  │  - Event handlers                                    │  │
│  │  - Auto-reconnection logic                           │  │
│  └──────────────┬──────────────────────────────────────┘  │
└─────────────────┼───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│         Socket.IO Market Data Server                        │
│    (http://marketdata.vedpragya.com:3000/market-data)      │
│                                                          