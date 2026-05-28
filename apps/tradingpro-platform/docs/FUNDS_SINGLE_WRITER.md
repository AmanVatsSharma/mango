# Funds and ledger: single-writer policy

## Current source of truth

- **Account state:** `TradingAccount.balance`, `availableMargin`, `usedMargin` (Prisma / PostgreSQL).
- **Audit trail:** `Transaction` rows created in the same Prisma transaction as balance/margin updates via **`FundManagementService`** (`*Tx` methods).

## Legacy stack

PostgreSQL migrations define `fn_block_margin`, `fn_close_position`, etc. The deprecated TypeScript module `lib/server/fund-management.ts` called Supabase RPCs. **Active application flows use Prisma + `FundManagementService`.** Do not mix RPC writers and Prisma writers against the same logical account.

## Statements

- **Cash running balance** in admin/console views uses **`cashAmount`** (margin reserve/release ledger lines have `cashAmount = 0` because they do not change `balance`).
- **Deduped** deposit/withdrawal rows when a matching `Transaction` already reflects the movement (e.g. `Deposit ref:` / `Withdrawal ref:` in descriptions).

## Operations checklist

1. Prefer **`FundManagementService`** for any new fund movement.
2. Avoid admin-only `Order` status patches that imply execution without posting ledger rows; see `statementHint` on admin order execute responses.
3. If reintroducing RPCs, route them through one adapter that matches Prisma semantics and emits identical `Transaction` shapes.
