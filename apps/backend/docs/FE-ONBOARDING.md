## FE Onboarding Quickstart

- Auth: obtain JWT access/refresh via OTP+TOTP. Send headers: `Authorization: Bearer <token>`, `x-tenant-id: <tenant>`.
- Market:
  - GET /instruments
  - SSE: GET /quotes/stream?exchange=...&symbol=...
- Accounts:
  - POST /accounts; GET /accounts; GET /accounts/:id
  - POST /accounts/:id/ledger/cash; POST /accounts/:id/ledger/hold|release
  - GET /accounts/:id/balances?currency=INR
  - GET /accounts/:id/ledger
  - GET /accounts/:id/statements
- OMS:
  - POST /orders; POST /orders/cancel; POST /orders/executions
  - SSE: GET /orders/stream

Swagger docs: /docs


