# Demo Account Feature — Design Spec

**Date:** 2026-05-13
**Feature:** Multi-account support with self-serve demo accounts, fully excluded from admin consoles
**Approach:** Approach 1 — single `TradingAccount` model with `accountType` enum, Prisma middleware for admin isolation

---

## 1. Context

**Why this change exists:**
- Users currently have exactly one trading account (enforced by `userId @unique` on `TradingAccount`)
- No demo/paper trading capability exists — any "demo" shown in the UI is hardcoded mock data
- Admin consoles show ALL account data with no way to exclude test/sandbox activity
- This feature gives users a self-serve demo account with virtual funds, and ensures demo data never pollutes live admin metrics

**What triggered it:**
- User request: "can we comfortably add a feature of demo account? like a user can have multiple accounts and from account tab he can switch trading account? so we can give demo accounts to users which are excluded from all datas in admin consoles"
- Constraints: same login, Option A (users self-create), Option C (tiered amounts), Option A for admin (filtered out entirely)

---

## 2. Database Schema

**File:** `pradingpro-platform/prisma/schema.prisma`

### 2.1 New Enum

```prisma
enum AccountType {
  LIVE
  DEMO
}
```

### 2.2 TradingAccount Changes

- Add `accountType AccountType @default(LIVE)` field
- Replace `userId String @unique` with `@@unique([userId, accountType])` compound index
- Add `@@index([accountType])` for fast admin filtering

**Migration safety:** All existing rows have `accountType = LIVE`. The compound unique `(userId, LIVE)` is equivalent to the old `userId @unique` constraint — Prisma migration is a no-op schema rename.

### 2.3 All Trading Models — Implicit accountType

These models link to `TradingAccount` via `tradingAccountId`. Admin Prisma middleware (Section 3) auto-filters them to `accountType = LIVE`:
- `Position`
- `Order`
- `Transaction`
- `Deposit`
- `Withdrawal`

No schema changes needed on these models — filtering happens at the query layer.

---

## 3. Admin Console Isolation — Prisma Middleware

**File:** `tradingpro-platform/lib/server/prisma-admin.ts` (new)

A Prisma client extension that intercepts all trading model queries in an admin context and auto-appends `accountType = 'LIVE'`.

### 3.1 Why a middleware

Admin routes call service functions with raw Prisma calls. Scattering `where: { accountType: 'LIVE' }` across every query is error-prone — a missed filter leaks demo data. A middleware enforces it at the only place that matters: the query layer.

**Trade-off accepted:** Any direct `prisma.tradingAccount.findMany()` call in a route handler bypasses the middleware. These must be audited post-implementation (see Section 8).

### 3.2 Structure

```typescript
// lib/server/prisma-admin.ts
export const adminPrisma = prisma.$extends({
  model: {
    tradingAccount: {
      async findMany(query) {
        return prisma.tradingAccount.findMany({
          ...query,
          where: { ...query.where, accountType: 'LIVE' }
        })
      },
      async findFirst(query) {
        return prisma.tradingAccount.findFirst({
          ...query,
          where: { ...query.where, accountType: 'LIVE' }
        })
      },
      // count, findUnique, update, delete — all overridden
    },
    position: { /* same pattern */ },
    order: { /* same pattern */ },
    transaction: { /* same pattern */ },
    deposit: { /* same pattern */ },
    withdrawal: { /* same pattern */ },
  }
})
```

### 3.3 Usage in Admin Routes

Replace `import { prisma }` with `import { adminPrisma }` in admin service files. Admin routes that need to see demo data (future "Demo Accounts" admin panel) use regular `prisma`.

---

## 4. Demo Account Creation

**File:** `tradingpro-platform/app/api/account/demo/route.ts` (new)

### 4.1 Endpoint

- `POST /api/account/demo`
- Requires authenticated user (no admin needed)
- Request body: `{ tier: "100000" | "1000000" | "10000000" }`
- Response: created `TradingAccount` object

### 4.2 Logic

1. Get `authenticatedUserId` from session
2. Check `TradingAccount.findFirst({ where: { userId, accountType: 'DEMO' } })` — if exists, return `409 Conflict`
3. Create `TradingAccount` with:
   - `accountType: 'DEMO'`
   - `balance` = tier amount
   - `availableMargin` = tier amount
4. Call `auth.update()` to stamp `demoTradingAccountId: newAccount.id` in the JWT
5. Return the new account

### 4.3 Seed Tiers

**File:** `tradingpro-platform/lib/constants/demo-tiers.ts` (new)

```typescript
export const DEMO_ACCOUNT_TIERS = [
  { value: "100000",    label: "₹1 Lakh",   amount: 100_000 },
  { value: "1000000",   label: "₹10 Lakh",  amount: 1_000_000 },
  { value: "10000000",  label: "₹1 Crore",  amount: 10_000_000 },
] as const

export type DemoTierValue = typeof DEMO_ACCOUNT_TIERS[number]["value"]
```

---

## 5. Account Switching

**File:** `tradingpro-platform/components/account/account-switcher.tsx` (new)

### 5.1 UI

- Dropdown component placed in the header (next to existing `Account` display card)
- Shows current account type as a badge:
  - `[DEMO]` in amber/yellow
  - `[LIVE]` in green
- If user has both accounts, dropdown lists both with name + balance
- "Create Demo Account" option shown only if user has no DEMO account yet

### 5.2 State Management

- Selected `accountId` persisted to `localStorage` key `active_account_id`
- On page load, `localStorage` → session check → resolve active account
- Read path: hooks in `lib/hooks/use-realtime-account.ts` and `lib/hooks/use-trading-data.ts` use the resolved `accountId`
- Write path: `lib/server/trading-access.ts` — `assertTradingAccountOwnership` extended to accept both `tradingAccountId` and `demoTradingAccountId` from session, so writes are scoped to the correct account without needing `accountId` in the request body

### 5.3 No URL Routing Change

Existing routes (`/console`, etc.) remain unchanged. Account context flows via session + localStorage.

---

## 6. Session Changes

**File:** `tradingpro-platform/auth.ts`

### 6.1 JWT Callback Changes

Add:
```typescript
demoTradingAccountId: (token.demoTradingAccountId as string | undefined)
accountType: (token.accountType as AccountType | undefined)
```

On demo account creation, call `auth.update()` to inject `demoTradingAccountId` into the session JWT.

### 6.2 Session Callback

Expose new fields:
```typescript
anySessionUser.demoTradingAccountId = anyToken.demoTradingAccountId as string | undefined
anySessionUser.accountType = anyToken.accountType as AccountType | undefined
```

---

## 7. Files to Create / Modify

| File | Action | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | Modify | Add `AccountType` enum, compound unique index |
| `prisma/migrations/` | Create | Migration for schema change |
| `lib/server/prisma-admin.ts` | Create | Admin Prisma middleware |
| `lib/constants/demo-tiers.ts` | Create | Tier constants |
| `app/api/account/demo/route.ts` | Create | Demo account creation endpoint |
| `auth.ts` | Modify | Add `demoTradingAccountId` + `accountType` to JWT/session |
| `lib/server/trading-access.ts` | Modify | Extend ownership assertion for demo account |
| `components/account/account-switcher.tsx` | Create | Account switcher dropdown UI |
| `components/Account.tsx` | Modify | Integrate switcher, add demo badge |
| Admin service files | Modify | Replace `prisma` with `adminPrisma` |

---

## 8. Audit: Direct Prisma Calls to Fix

After implementing the admin middleware, grep for all direct `prisma.tradingAccount` (and position/order/transaction) calls across admin routes and service files. Any call not covered by `adminPrisma` extensions must be manually annotated with `where: { accountType: 'LIVE' }`.

```bash
grep -rn "prisma\.tradingAccount\|prisma\.position\|prisma\.order\|prisma\.transaction" \
  --include="*.ts" tradingpro-platform/app/api/admin/ \
  --include="*.ts" tradingpro-platform/lib/services/admin/
```

---

## 9. Out of Scope (v1)

- Demo account expiry / auto-deactivation
- Demo → Live account funding (conversion)
- Multiple demo accounts per user
- Demo trading history export
- Admin "Demo Accounts" panel
- Real-time sync between live and demo portfolios

---

## 10. Verification Plan

1. Run `npm run db:migrate` — verify migration succeeds with no data loss
2. Create a demo account via `POST /api/account/demo` — verify `TradingAccount` row created with `accountType = DEMO`
3. Login and check JWT — verify `demoTradingAccountId` is set
4. Account switcher — verify switching between LIVE and DEMO updates the correct account data
5. Admin console — verify demo positions/orders/transactions do NOT appear in any admin view
6. Run `npm run type-check && npm run lint` — verify no type errors
7. Run existing test suite — verify no regressions