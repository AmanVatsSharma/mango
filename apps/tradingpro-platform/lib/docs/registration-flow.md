### Registration Flow (Server-Side)

This document describes the server-side registration transaction and related DB writes.

#### Steps
- Create `User`
- Create `TradingAccount` for the user
- Create default `KYC` record with status `PENDING`

#### Sequence Diagram (ASCII)
```
Client -> API: POST /auth/register
API -> DB (transaction): begin
API -> DB: create User
DB --> API: userId
API -> DB: create TradingAccount (userId)
DB --> API: tradingAccountId
API -> DB: create KYC (userId, status=PENDING)
DB --> API: kycId
API -> DB (transaction): commit
API --> Client: 201 Created (userId, tradingAccountId)
```

#### Code Reference
`lib/database-transactions.ts` function `withUserRegistrationTransaction`

#### Notes
- The default `KYC` is intentionally created with empty fields and `PENDING` status to ensure downstream flows can always query a KYC row.
- Actual KYC details are populated later via the KYC submission endpoint.


