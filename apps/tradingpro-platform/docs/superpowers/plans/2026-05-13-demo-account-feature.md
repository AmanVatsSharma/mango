# Demo Account Feature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to self-create a demo trading account (one per user, with tiered virtual balance) switchable from the account tab, with all demo data excluded from admin consoles.

**Architecture:** Add `AccountType` enum on `TradingAccount` (LIVE/DEMO); relax `userId @unique` to `@@unique([userId, accountType])` so one LIVE + one DEMO per user; Prisma admin middleware auto-appends `accountType = 'LIVE'` to all trading model queries; session stores `demoTradingAccountId`; account switcher persists selection in `localStorage`.

**Tech Stack:** Prisma 6, NextAuth.js 5 (beta), Next.js App Router, React hooks (existing SWR hooks)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | Modify | Add `AccountType` enum, compound unique index |
| `prisma/migrations/` | Create | Migration for schema change |
| `lib/server/prisma-admin.ts` | Create | Admin Prisma client extension |
| `lib/constants/demo-tiers.ts` | Create | DEMO_ACCOUNT_TIERS constant |
| `app/api/account/demo/route.ts` | Create | `POST /api/account/demo` endpoint |
| `auth.ts` | Modify | `demoTradingAccountId` + `accountType` in JWT + session |
| `lib/server/trading-access.ts` | Modify | `assertTradingAccountOwnership` accepts both account IDs |
| `components/account/account-switcher.tsx` | Create | Account switcher dropdown |
| `components/Account.tsx` | Modify | Integrate switcher + demo badge |
| Admin service files | Modify | Swap `prisma` → `adminPrisma` where needed |

---

## Task 1: Schema Migration

**Files:**
- Modify: `tradingpro-platform/prisma/schema.prisma:629-651`
- Create: `prisma/migrations/`

**Prerequisites:** none

- [ ] **Step 1: Read current schema**

Read `prisma/schema.prisma` around lines 1-50 (enum section) and lines 629-651 (TradingAccount model) to get the exact text before editing.

- [ ] **Step 2: Add AccountType enum**

Add to the enum block (after the last existing enum, before the model block):

```prisma
enum AccountType {
  LIVE
  DEMO
}
```

- [ ] **Step 3: Update TradingAccount model**

In the `TradingAccount` model, add `accountType AccountType @default(LIVE)` as a field, change `userId String @unique` to `userId String`, and add the compound unique + index:

```prisma
  userId          String
  accountType     AccountType @default(LIVE)
```

Replace `userId String @unique` with just `userId String` (the `@unique` will be replaced by the compound index below). Add before `@@map`:

```prisma
  @@unique([userId, accountType])
  @@index([accountType])
```

- [ ] **Step 4: Run Prisma migration**

```bash
cd tradingpro-platform
npm run db:migrate -- --name add_account_type_enum
```

Expected: migration creates successfully. Verify migration file contains the compound unique constraint and new enum.

- [ ] **Step 5: Commit**

```bash
git -C tradingpro-platform add prisma/schema.prisma prisma/migrations/
git -C tradingpro-platform commit -m "$(cat <<'EOF'
feat(schema): add AccountType enum and compound unique on TradingAccount

Adds LIVE/DEMO enum on TradingAccount; replaces userId @unique with
@@unique([userId, accountType]) to allow one demo account per user.
Existing LIVE rows are unchanged (default = LIVE).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Demo Tiers Constant

**Files:**
- Create: `tradingpro-platform/lib/constants/demo-tiers.ts`
- Modify: `tradingpro-platform/prisma/schema.prisma` (add `AccountType` reference — done in Task 1)

**Prerequisites:** Task 1 complete

- [ ] **Step 1: Check existing constants directory**

```bash
ls tradingpro-platform/lib/constants/
```

- [ ] **Step 2: Create demo-tiers.ts**

File: `tradingpro-platform/lib/constants/demo-tiers.ts`

```typescript
/**
 * File:        lib/constants/demo-tiers.ts
 * Module:      Demo Account — Seed Tier Definitions
 * Purpose:     Preset virtual balances available when a user creates a demo account.
 *
 * Exports:
 *   - DEMO_ACCOUNT_TIERS — readonly array of tier options
 *   - DEMO_TIER_MAP      — lookup by value string
 *   - DemoTier           — tier object shape
 *
 * Depends on: none (pure data, no framework imports)
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - Values are string-serializable (to pass in API body) while amounts are integers (rupees)
 *
 * Read order:
 *   1. DEMO_ACCOUNT_TIERS — all tiers
 *   2. DEMO_TIER_MAP      — quick lookup
 *
 * Author:      Claude
 * Last-updated: 2026-05-13
 */

export const DEMO_ACCOUNT_TIERS = [
  { value: "100000",   label: "₹1 Lakh",   amount: 100_000   } as const,
  { value: "1000000",  label: "₹10 Lakh",  amount: 1_000_000  } as const,
  { value: "10000000", label: "₹1 Crore",  amount: 10_000_000 } as const,
] as const

export type DemoTier = typeof DEMO_ACCOUNT_TIERS[number]

export const DEMO_TIER_MAP: Record<DemoTier["value"], DemoTier> = Object.fromEntries(
  DEMO_ACCOUNT_TIERS.map((t) => [t.value, t])
) as Record<DemoTier["value"], DemoTier>

export function isValidDemoTier(value: string): value is DemoTier["value"] {
  return value in DEMO_TIER_MAP
}
```

- [ ] **Step 3: Type-check**

```bash
cd tradingpro-platform && npx tsc --noEmit lib/constants/demo-tiers.ts 2>&1 | head -20
```

Expected: no errors (pure TS file, no Next.js context needed).

- [ ] **Step 4: Commit**

```bash
git -C tradingpro-platform add lib/constants/demo-tiers.ts
git -C tradingpro-platform commit -m "$(cat <<'EOF'
feat(demo): add tiered virtual balance constants

Exports DEMO_ACCOUNT_TIERS (3 presets: 1L/10L/1Cr), DEMO_TIER_MAP,
and isValidDemoTier guard for the demo account creation endpoint.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Prisma Admin Middleware

**Files:**
- Create: `tradingpro-platform/lib/server/prisma-admin.ts`
- Modify: `tradingpro-platform/prisma/schema.prisma` (add AccountType — done in Task 1)

**Prerequisites:** Task 1 complete (needs AccountType enum in schema)

- [ ] **Step 1: Read existing prisma client setup**

```bash
ls tradingpro-platform/lib/server/prisma*.ts
```

Read the main Prisma client export file to understand the export pattern (e.g., `export const prisma = ...`).

- [ ] **Step 2: Create prisma-admin.ts**

File: `tradingpro-platform/lib/server/prisma-admin.ts`

```typescript
/**
 * File:        lib/server/prisma-admin.ts
 * Module:      Admin Console — Prisma Client with Demo-Data Exclusion
 * Purpose:     Prisma client extension that auto-appends accountType='LIVE' to all
 *              trading model queries. Used by admin routes to ensure demo account
 *              data never surfaces in live dashboards.
 *
 * Exports:
 *   - adminPrisma — Prisma client with trading-model query overrides
 *
 * Depends on:
 *   - @/lib/server/prisma — base Prisma client (singleton)
 *
 * Side-effects: none (pure query-layer wrapper)
 *
 * Key invariants:
 *   - All queries on TradingAccount, Position, Order, Transaction, Deposit,
 *     Withdrawal are scoped to accountType = 'LIVE' unless adminPrisma is
 *     explicitly NOT used (e.g., a future Demo Accounts admin panel)
 *
 * Read order:
 *   1. adminPrisma — query client with demo exclusion overrides
 *   2. OVERRIDE_DEFAULTS — shared where clause fragment
 *
 * Author:      Claude
 * Last-updated: 2026-05-13
 */

import { prisma } from "@/lib/server/prisma"

const LIVE_ACCOUNT_FILTER = { accountType: "LIVE" as const }

/** Accounts that link to TradingAccount and must be filtered */
const TRADING_LINKED_MODELS = [
  "position",
  "order",
  "transaction",
  "deposit",
  "withdrawal",
] as const

type TradingLinkedModel = (typeof TRADING_LINKED_MODELS)[number]

function appendLiveFilter<T extends object>(query: T): T & { where: object } {
  const existingWhere = "where" in query && query.where !== undefined ? query.where : {}
  return {
    ...query,
    where: { ...existingWhere, ...LIVE_ACCOUNT_FILTER },
  } as T & { where: object }
}

/**
 * Admin-safe Prisma client. Overrides findMany / findFirst / count on all
 * trading-linked models to always include accountType = 'LIVE'.
 *
 * TradingAccount itself is also overridden so admin list views never surface
 * demo accounts.
 *
 * Usage in admin service files:
 *   import { adminPrisma } from "@/lib/server/prisma-admin"
 *   const accounts = await adminPrisma.tradingAccount.findMany(...)
 *   const positions = await adminPrisma.position.findMany(...)
 */
export const adminPrisma = prisma.$extends({
  model: {
    tradingAccount: {
      async findMany<T extends Parameters<typeof prisma.tradingAccount.findMany>[0]>(
        query?: T
      ) {
        return prisma.tradingAccount.findMany(appendLiveFilter(query ?? {}))
      },
      async findFirst<T extends Parameters<typeof prisma.tradingAccount.findFirst>[0]>(
        query?: T
      ) {
        return prisma.tradingAccount.findFirst(appendLiveFilter(query ?? {}))
      },
      async count<T extends Parameters<typeof prisma.tradingAccount.count>[0]>(
        query?: T
      ) {
        return prisma.tradingAccount.count(appendLiveFilter(query ?? {}))
      },
    },
    // Position, Order, Transaction, Deposit, Withdrawal — all get the same overrides
    ...(Object.fromEntries(
      TRADING_LINKED_MODELS.map((modelName) => [
        modelName,
        {
          async findMany<T extends { where?: object; orderBy?: object; skip?: number; take?: number }>(
            query?: T
          ) {
            const fn = (prisma as any)[modelName].findMany.bind(prisma)
            return fn(appendLiveFilter(query ?? {}))
          },
          async findFirst<T extends { where?: object; orderBy?: object }>(query?: T) {
            const fn = (prisma as any)[modelName].findFirst.bind(prisma)
            return fn(appendLiveFilter(query ?? {}))
          },
          async count<T extends { where?: object }>(query?: T) {
            const fn = (prisma as any)[modelName].count.bind(prisma)
            return fn(appendLiveFilter(query ?? {}))
          },
        },
      ])
    ) as Record<TradingLinkedModel, object>),
  },
})
```

- [ ] **Step 3: Type-check**

```bash
cd tradingpro-platform && npx tsc --noEmit lib/server/prisma-admin.ts 2>&1 | head -30
```

Expected: no errors or only import-path related warnings (Next.js path alias may need the tsconfig context).

- [ ] **Step 4: Commit**

```bash
git -C tradingpro-platform add lib/server/prisma-admin.ts
git -C tradingpro-platform commit -m "$(cat <<'EOF'
feat(admin): add prisma-admin client with accountType=LIVE enforcement

AdminPrisma client extension auto-appends accountType='LIVE' to all
TradingAccount/Position/Order/Transaction/Deposit/Withdrawal queries.
Admin routes importing adminPrisma instead of prisma are demo-safe by design.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Session Extensions for Demo Account

**Files:**
- Modify: `tradingpro-platform/auth.ts`
- Modify: `tradingpro-platform/lib/server/trading-access.ts` (ownership assertion)

**Prerequisites:** Task 1 complete

- [ ] **Step 1: Read auth.ts — JWT refresh block**

Read `auth.ts` lines 292-320 (the `shouldRefreshUserClaims` block that sets `anyToken.tradingAccountId`). Also read the top of the JWT callback to understand what `token.id` resolves to.

- [ ] **Step 2: Extend JWT claim refresh block**

In the `shouldRefreshUserClaims` block (around line 296), after the `include: { kyc: true, tradingAccount: true }`, the `anyToken.tradingAccountId` is set from `dbUser?.tradingAccount?.id`.

Extend the include and add the demo account lookup:

```typescript
include: { kyc: true, tradingAccount: true },  // existing — no DEMO accounts
```

Wait — existing accounts all have `accountType = LIVE` (default). For demo accounts, we need a separate query. In the same `shouldRefreshUserClaims` block, after setting `anyToken.tradingAccountId`, add:

```typescript
// Demo account lookup (separate — tradingAccount relation only returns LIVE by default)
try {
  const demoAccount = await prisma.tradingAccount.findFirst({
    where: { userId: token.id as string, accountType: "DEMO" },
    select: { id: true },
  })
  anyToken.demoTradingAccountId = demoAccount?.id ?? undefined
} catch {
  anyToken.demoTradingAccountId = undefined
}
anyToken.accountType = dbUser?.tradingAccount?.accountType ?? "LIVE"
```

- [ ] **Step 3: Expose in session callback**

In the session callback (around lines 208-221), after `anySessionUser.tradingAccountId = ...`, add:

```typescript
anySessionUser.demoTradingAccountId = anyToken.demoTradingAccountId as string | undefined
anySessionUser.accountType = anyToken.accountType as "LIVE" | "DEMO" | undefined
```

Also add the type `AccountType` import at the top of the file (from `@prisma/client` or use a string literal).

- [ ] **Step 4: Read trading-access.ts — assertTradingAccountOwnership**

Read `tradingpro-platform/lib/server/trading-access.ts` to find `assertTradingAccountOwnership`. This function asserts a `tradingAccountId` belongs to the authenticated user. It needs to accept either the LIVE or the DEMO account ID.

- [ ] **Step 5: Extend assertTradingAccountOwnership**

The function signature currently takes `tradingAccountId: string`. Change it to also accept an optional second param `demoTradingAccountId?: string`. The ownership check:

```typescript
const isLiveOwned = tradingAccountId === session.user.tradingAccountId
const isDemoOwned = demoTradingAccountId ? tradingAccountId === demoTradingAccountId : false
if (!isLiveOwned && !isDemoOwned) {
  throw new AppError("FORBIDDEN", "Account does not belong to you", 403)
}
```

Update callers that already pass `tradingAccountId` — they need to also pass `demoTradingAccountId` from the session. The simplest call-site change: for write operations (orders, positions), the API route handler calls `assertTradingAccountOwnership` — update the call to pass both from session:

```typescript
assertTradingAccountOwnership(tradingAccountId, session.user.demoTradingAccountId)
```

- [ ] **Step 6: Type-check**

```bash
cd tradingpro-platform && npm run type-check 2>&1 | grep -E "(auth\.ts|trading-access\.ts)" | head -20
```

Expected: no errors in those two files.

- [ ] **Step 7: Commit**

```bash
git -C tradingpro-platform add auth.ts lib/server/trading-access.ts
git -C tradingpro-platform commit -m "$(cat <<'EOF'
feat(auth): add demoTradingAccountId + accountType to JWT and session

JWT callback refresh block now fetches and caches the user's demo
TradingAccount.id alongside the live account. Session exposes both
demoTradingAccountId and accountType to the client. Trading ownership
assertion updated to accept both LIVE and DEMO account IDs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Demo Account Creation API

**Files:**
- Create: `tradingpro-platform/app/api/account/demo/route.ts`
- Modify: `tradingpro-platform/auth.ts` (session update — done in Task 4)

**Prerequisites:** Tasks 1, 2, 4 complete

- [ ] **Step 1: Check existing API route pattern**

```bash
ls tradingpro-platform/app/api/account/
```

Read one existing route (e.g., `/app/api/account/route.ts`) to match the file header, import style, and response shape.

- [ ] **Step 2: Create demo route**

File: `tradingpro-platform/app/api/account/demo/route.ts`

```typescript
/**
 * File:        app/api/account/demo/route.ts
 * Module:      Account — Demo Account Creation
 * Purpose:     POST endpoint for users to self-create a single demo trading account
 *              with a tiered virtual balance.
 *
 * Exports:
 *   - GET  — unused (405)
 *   - POST — create demo account
 *
 * Depends on:
 *   - @/lib/server/prisma          — TradingAccount write
 *   - @/lib/server/trading-access  — requireAuthenticatedUserId
 *   - @/lib/constants/demo-tiers   — DEMO_ACCOUNT_TIERS, isValidDemoTier
 *
 * Side-effects:
 *   - DB write: creates one TradingAccount row
 *   - Session update: calls auth.update() to stamp demoTradingAccountId in JWT
 *
 * Key invariants:
 *   - Only one DEMO account per user (Prisma unique constraint catches duplicates)
 *   - Virtual balance is seeded from the selected tier; no real funds involved
 *
 * Read order:
 *   1. POST — handler entry point
 *   2. createDemoAccount — core logic
 *
 * Author:      Claude
 * Last-updated: 2026-05-13
 */

import { NextResponse } from "next/server"
import { requireAuthenticatedUserId } from "@/lib/server/trading-access"
import { prisma } from "@/lib/server/prisma"
import { auth } from "@/auth"
import { DEMO_ACCOUNT_TIERS, isValidDemoTier } from "@/lib/constants/demo-tiers"

export const POST = async () => {
  let userId: string
  try {
    userId = await requireAuthenticatedUserId()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Parse tier from request body
  let tierValue = "1000000" // default: ₹10 Lakh
  try {
    const body = await request.json().catch(() => ({}))
    if (body?.tier && isValidDemoTier(String(body.tier))) {
      tierValue = String(body.tier)
    }
  } catch {
    /* use default */
  }

  const tier = DEMO_ACCOUNT_TIERS.find((t) => t.value === tierValue) ?? DEMO_ACCOUNT_TIERS[1]

  // Check for existing demo account (unique constraint will also catch this)
  const existing = await prisma.tradingAccount.findFirst({
    where: { userId, accountType: "DEMO" },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json(
      { error: "Demo account already exists", code: "DEMO_EXISTS" },
      { status: 409 }
    )
  }

  // Create demo account
  const demoAccount = await prisma.tradingAccount.create({
    data: {
      userId,
      accountType: "DEMO",
      balance: tier.amount,
      availableMargin: tier.amount,
      usedMargin: 0,
    },
  })

  // Update session JWT with the demo account ID
  const session = await auth()
  if (session) {
    await auth.update({
      extend: false,
      data: {
        demoTradingAccountId: demoAccount.id,
        accountType: "DEMO" as const,
      },
    })
  }

  return NextResponse.json(
    {
      id: demoAccount.id,
      accountType: "DEMO",
      balance: demoAccount.balance,
      availableMargin: demoAccount.availableMargin,
      createdAt: demoAccount.createdAt,
    },
    { status: 201 }
  )
}
```

> **Note:** `request` is available via `const request = NextRequest`. If the existing route pattern uses `req` differently, adapt accordingly.

- [ ] **Step 3: Type-check**

```bash
cd tradingpro-platform && npx tsc --noEmit app/api/account/demo/route.ts 2>&1 | head -30
```

Expected: no errors (may need Next.js Request type adaptation based on existing patterns).

- [ ] **Step 4: Commit**

```bash
git -C tradingpro-platform add app/api/account/demo/route.ts
git -C tradingpro-platform commit -m "$(cat <<'EOF'
feat(api): add POST /api/account/demo for self-serve demo account creation

Creates a DEMO TradingAccount with tiered virtual balance (default ₹10L).
Checks for duplicate demo accounts (409 if exists). Updates session JWT
with demoTradingAccountId. Returns created account object.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Account Switcher Component

**Files:**
- Create: `tradingpro-platform/components/account/account-switcher.tsx`
- Modify: `tradingpro-platform/components/Account.tsx`

**Prerequisites:** Tasks 3, 4, 5 complete

- [ ] **Step 1: Read existing Account.tsx**

Read `components/Account.tsx` around lines 100-310 (account display) and lines 345-347 (balance stat cards). Also read the imports at the top.

- [ ] **Step 2: Read existing hooks for account state**

Read `lib/hooks/use-realtime-account.ts` around lines 172-204 (how account data is fetched). Also check if there's a SWR key or fetcher that accepts `accountId`.

- [ ] **Step 3: Create account-switcher.tsx**

File: `tradingpro-platform/components/account/account-switcher.tsx`

```typescript
/**
 * File:        components/account/account-switcher.tsx
 * Module:      Account — Account Type Switcher Dropdown
 * Purpose:     Dropdown for users with both LIVE and DEMO accounts to switch between them.
 *              Persists selected accountId in localStorage and triggers data revalidation.
 *
 * Exports:
 *   - AccountSwitcher — dropdown component (rendered in header near Account card)
 *
 * Depends on:
 *   - @/lib/hooks/use-realtime-account — useRealtimeAccount hook
 *   - SWR useSWRConfig for revalidation trigger
 *
 * Side-effects:
 *   - Reads/writes localStorage key "active_account_id"
 *   - Calls SWR revalidate to refresh data on switch
 *
 * Key invariants:
 *   - Only rendered if user has both LIVE and DEMO accounts
 *   - Defaults to LIVE account if localStorage key is absent
 *
 * Read order:
 *   1. AccountSwitcher — main component
 *   2. getActiveAccountId — resolves localStorage → session fallback
 *
 * Author:      Claude
 * Last-updated: 2026-05-13
 */

"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useSWRConfig } from "swr"

const LOCAL_STORAGE_KEY = "active_account_id"

export function AccountSwitcher() {
  const { data: session } = useSession()
  const { mutate } = useSWRConfig()
  const [open, setOpen] = useState(false)

  const liveAccountId = session?.user?.tradingAccountId as string | undefined
  const demoAccountId = session?.user?.demoTradingAccountId as string | undefined

  // Don't render if user doesn't have a demo account yet
  if (!demoAccountId) return null

  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
    setActiveId(stored && (stored === liveAccountId || stored === demoAccountId) ? stored : liveAccountId ?? null)
  }, [liveAccountId, demoAccountId])

  if (!activeId) return null

  const isDemo = activeId === demoAccountId

  const handleSwitch = (newId: string) => {
    localStorage.setItem(LOCAL_STORAGE_KEY, newId)
    setActiveId(newId)
    setOpen(false)
    // Revalidate all SWR keys so hooks re-fetch from the new account
    mutate(() => true, undefined, { revalidate: true })
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`
          flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md border
          ${isDemo
            ? "border-amber-300 bg-amber-50 text-amber-700"
            : "border-emerald-300 bg-emerald-50 text-emerald-700"
          }
        `}
        aria-label="Switch account type"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        {isDemo ? "DEMO" : "LIVE"}
        <ChevronDownIcon className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-zinc-200 rounded-lg shadow-lg w-48 py-1">
            <button
              onClick={() => handleSwitch(liveAccountId!)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 flex items-center justify-between ${
                activeId === liveAccountId ? "font-medium" : "text-zinc-600"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Live Account
              </span>
              {activeId === liveAccountId && <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />}
            </button>
            <button
              onClick={() => handleSwitch(demoAccountId!)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 flex items-center justify-between ${
                activeId === demoAccountId ? "font-medium" : "text-zinc-600"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Demo Account
              </span>
              {activeId === demoAccountId && <CheckIcon className="w-3.5 h-3.5 text-amber-600" />}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}
```

- [ ] **Step 4: Integrate into Account.tsx**

Read `components/Account.tsx` to find the header/nav area (where the account card is rendered). Add the `AccountSwitcher` import and render it next to the account display. The demo badge (`[DEMO]` or `[LIVE]`) should appear as a badge on the account display area.

- [ ] **Step 5: Commit**

```bash
git -C tradingpro-platform add components/account/account-switcher.tsx components/Account.tsx
git -C tradingpro-platform commit -m "$(cat <<'EOF'
feat(ui): add AccountSwitcher dropdown component

Dropdown in the header lets users with both LIVE and DEMO accounts
switch between them. Selected account persisted to localStorage.
Account badge (amber for DEMO, green for LIVE) shown on the Account card.
Revalidates SWR data on switch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Audit Direct Prisma Calls in Admin Routes

**Files:** (audit only — grep, no file edits unless needed)

**Prerequisites:** Tasks 1-6 complete

- [ ] **Step 1: Audit grep for trading model calls outside adminPrisma**

```bash
grep -rn "prisma\.tradingAccount\|prisma\.position\|prisma\.order\|prisma\.transaction\|prisma\.deposit\|prisma\.withdrawal" \
  --include="*.ts" tradingpro-platform/app/api/admin/ \
  tradingpro-platform/lib/services/admin/ 2>/dev/null | grep -v "adminPrisma"
```

- [ ] **Step 2: For each hit — check if it should use adminPrisma**

If the query is on admin routes reading live data (positions list, account overview, etc.), it MUST use `adminPrisma`. Fix by replacing the import.

If the query is for demo-specific data (a future demo admin panel), it can keep `prisma`.

- [ ] **Step 3: Commit any fixes**

```bash
git -C tradingpro-platform add [fixed files]
git -C tradingpro-platform commit -m "$(cat <<'EOF'
fix(admin): audit trading model queries for accountType=LIVE coverage

Replaced prisma→adminPrisma in admin routes that read TradingAccount/
Position/Order/Transaction data to ensure demo accounts remain
excluded from admin dashboards.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Mirror to TradeBazaar

**Files:** (copy changed files to TradeBazaar/)

**Prerequisites:** All tasks complete, all commits pushed for tradingpro-platform

- [ ] **Step 1: Mirror changed files**

```bash
# Mirror all changed files from tradingpro-platform to TradeBazaar
COPY_DIR="/home/amansharma/Desktop/DevOPS/Trading"

# Schema + migration
cp "$COPY_DIR/tradingpro-platform/prisma/schema.prisma" "$COPY_DIR/TradeBazaar/prisma/"
cp "$COPY_DIR/tradingpro-platform/prisma/migrations/"* "$COPY_DIR/TradeBazaar/prisma/migrations/" 2>/dev/null || true

# New files
cp "$COPY_DIR/tradingpro-platform/lib/server/prisma-admin.ts" "$COPY_DIR/TradeBazaar/lib/server/"
cp "$COPY_DIR/tradingpro-platform/lib/constants/demo-tiers.ts" "$COPY_DIR/TradeBazaar/lib/constants/"
cp "$COPY_DIR/tradingpro-platform/app/api/account/demo/route.ts" "$COPY_DIR/TradeBazaar/app/api/account/demo/"

# Modified files
cp "$COPY_DIR/tradingpro-platform/auth.ts" "$COPY_DIR/TradeBazaar/auth.ts"
cp "$COPY_DIR/tradingpro-platform/lib/server/trading-access.ts" "$COPY_DIR/TradeBazaar/lib/server/"
cp "$COPY_DIR/tradingpro-platform/components/account/account-switcher.tsx" "$COPY_DIR/TradeBazaar/components/account/"
cp "$COPY_DIR/tradingpro-platform/components/Account.tsx" "$COPY_DIR/TradeBazaar/components/"

echo "Mirror copy complete — verify with diff -rq"
```

- [ ] **Step 2: Commit in TradeBazaar**

```bash
cd /home/amansharma/Desktop/DevOPS/Trading/TradeBazaar
git add \
  prisma/schema.prisma \
  lib/server/prisma-admin.ts \
  lib/constants/demo-tiers.ts \
  app/api/account/demo/route.ts \
  auth.ts \
  lib/server/trading-access.ts \
  components/account/account-switcher.tsx \
  components/Account.tsx
git commit -m "$(cat <<'EOF'
mirror(demo-account): sync demo account feature from tradingpro-platform

Adds AccountType enum, compound unique index, demo account creation
API, account switcher UI, and Prisma admin middleware.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Verification

After all tasks:

```bash
cd tradingpro-platform

# 1. Migration clean
npm run db:migrate 2>&1 | tail -5

# 2. Type check
npm run type-check 2>&1 | tail -10

# 3. Lint
npm run lint 2>&1 | tail -10

# 4. Run tests
npm test 2>&1 | tail -20
```

Expected: type-check clean, lint clean, tests passing.

---

## Task Classification
- Estimated scope:        ~8 files, ~400 lines of new code + 1 migration
- Modules involved:       prisma, auth, api, ui components, admin services
- Isolation:              Sequential dependencies (Task 1 → 2-6 → 7 → 8)
- Main's context state:    warm for schema + auth patterns
- Trigger fired (L2):      none — isolated modules, sequential deps prevent parallel
- Dispatch decision:      DIRECT (sequential dependencies chain Task 1→8)
- Reason:                 Prisma middleware must exist before the API route; session changes must exist before the switcher reads session data — true sequential chain, no parallelization possible