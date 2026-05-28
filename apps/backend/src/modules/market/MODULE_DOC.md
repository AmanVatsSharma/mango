# Module: market

**Short:** Instruments, exchanges, and user watchlists; integrates with external live data aggregator.

**Purpose:** Provide a master catalog of tradable instruments across NSE, global equities, forex, and crypto; expose watchlist APIs; and interface with a dedicated market-data service for live quotes.

**Files:**
- market.module.ts — Nest module
- controllers/
  - instruments.controller.ts — instrument discovery APIs
  - watchlists.controller.ts — watchlist CRUD
  - quotes.controller.ts — snapshots/subscriptions/SSE stream
- services/
  - instruments.service.ts — instruments logic
  - watchlists.service.ts — watchlist logic
  - price-feed.service.ts — batching price feed
- entities/ — exchange, instrument, watchlist, watchlist_item
- dto/ — request/response DTOs
- MODULE_DOC.md — this file

**Flow diagram:** `flowcharts/market-flow.svg`

**Dependencies:**
- Internal: shared logger, database
- External: market-data aggregator service (HTTP/WebSocket)

**APIs (REST/SSE):**
- GET /market/instruments — list instruments (filter by exchange/symbol/type)
- GET /market/exchanges — list exchanges
- POST /market/quotes/snapshot — snapshot for symbols
- POST /market/quotes/subscribe — register interest for batched polling
- POST /market/quotes/unsubscribe — remove interest
- SSE /market/quotes/stream — receive batched quote updates (auto-subscribes to user watchlists)
- Watchlists (auth required):
  - POST /market/watchlists — create
  - GET /market/watchlists — list my watchlists
  - GET /market/watchlists/:id — get one with items
  - GET /market/watchlists/:id/items — list items
  - PATCH /market/watchlists/:id — rename
  - DELETE /market/watchlists/:id — delete
  - POST /market/watchlists/:id/items — add instrument
  - DELETE /market/watchlists/:id/items/:itemId — remove instrument

**Env vars:**
- MARKET_DATA_URL=http(s)://market-data-aggregator:port
- MARKET_DATA_WS_URL=ws(s)://market-data-aggregator:port

**Tests:**
- DTO shape via zod; service unit tests with repository mocks

**Change-log:**
- 2025-09-19 IST: Initial scaffold (module, entities, controllers, services, docs)
- 2025-09-19 IST: Wired MarketModule into AppModule; added DTOs for queries/watchlists; added migration 1700000000003
- 2025-09-19 IST: Added batched PriceFeed (1 req/sec, 1000 tickers), snapshot/subscribe/unsubscribe, and SSE streaming
- 2025-09-19 IST: SSE stream now auto-subscribes to user watchlists and lists items endpoint added

