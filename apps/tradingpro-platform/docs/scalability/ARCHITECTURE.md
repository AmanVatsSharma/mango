## Architecture: Quotes Request Flow

```mermaid
flowchart LR
  A[Client] -- GET /api/quotes?q=... --> B[Next.js API Route]
  B -->|Per-IP 1 rps| C[RateLimiter]
  B -->|Lookup| D[In-Memory Cache (TTL 2s)]
  D -- hit --> E[Respond]
  D -- miss --> F[Quotes Batcher (1s window)]
  F -- union+dedupe --> G[Request Queue (1 RPS)]
  G --> H[Upstream Vortex API]
  H --> G
  G --> F
  F --> D
  D -->|SWR store| E
  E -->|ETag/Cache-Control| A
```

- ETag is a hash of canonical JSON; 304 served on match.
- Cache-Control includes short TTL and `stale-while-revalidate`.
- Request queue guarantees ≤1 upstream request/sec.
- Batcher coalesces all requests within 1s.
- Metrics: request_count, request_duration_seconds, cache_hits/miss, upstream_errors, circuit_breaker_open.
