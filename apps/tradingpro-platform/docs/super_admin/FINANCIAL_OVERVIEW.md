## Financial audit: deposits & withdrawals (Super Admin)

> Updated: 2026-03-20  
> Deposit section: GPT-5 Codex (Cursor); withdrawal audit: BharatERP

## Deposit Audit Trail (Super Admin)

> Updated: 2025-11-12  
> Author: GPT-5 Codex (Cursor)

### Purpose
- Give the super admin a single source of truth for every deposit approval or rejection performed by moderators/admins.
- Surface who acted, when, and why — including rejection reasons — so suspicious behaviour can be escalated quickly.
- Replace the previous KPI-only financial overview tab with an actionable ledger of approval activity.

### Data Sources
- `trading_logs` table (category: `FUNDS`) emitted by `AdminFundService` via `TradingLogger`.
- Joined with `deposits` and `users` for monetary + identity context.

### API
- `GET /api/super-admin/deposits/audit`
  - **Query params**
    - `status`: `APPROVED | REJECTED` (defaults to all)
    - `adminId`, `adminName`: filter by actor metadata
    - `search`: keyword (deposit id or free-text match against log message)
    - `from`, `to`: ISO date range boundaries; interpreted as IST when provided via UI date inputs
    - `page`, `pageSize`: server-side pagination controls (default `1`, `20`)
  - **Response**
    ```json
    {
      "success": true,
      "data": {
        "records": [
          {
            "id": "log-uuid",
            "depositId": "dep-uuid",
            "status": "APPROVED",
            "adminId": "admin-uuid",
            "adminName": "Shakti",
            "adminRole": "SUPER_ADMIN",
            "reason": null,
            "amount": 75000,
            "remarks": "Approved by Shakti",
            "user": {
              "id": "user-uuid",
              "name": "Raghav",
              "email": "raghav@example.com",
              "clientId": "CLI-101"
            },
            "createdAt": "2024-11-12T10:45:00.000Z"
          }
        ],
        "page": 1,
        "pageSize": 20,
        "total": 57
      }
    }
    ```

### UI Highlights
- Filter toolbar (status, search, admin id/name, date range) with reset + refresh controls.
- Paginated table showing timestamp (IST), deposit id, user identity, admin identity, role, amount, and reason/remarks.
- Badges to visually separate approved vs rejected decisions.
- Console logging instrumentation baked into component for quick runtime introspection.

### Flow Overview
```mermaid
flowchart TD
    A[Super Admin filters UI] -->|build query| B[/api/super-admin/deposits/audit]
    B -->|auth check + parsing| C[DepositAuditService.list]
    C -->|fetch| D[trading_logs]
    C -->|join| E[deposits + users]
    C -->|shape records| F[data payload]
    F -->|JSON response| G[Admin console table]
```

### Withdrawal Audit Trail (Super Admin)

#### Purpose
- Same guarantees as the deposit trail: every user withdrawal **approved** or **rejected** by admins, with actor, timestamp, amount (including fees), and bank reference on approval.

#### Data sources
- `trading_logs` (`FUNDS`): `ADMIN_APPROVE_WITHDRAWAL_COMPLETED`, `ADMIN_REJECT_WITHDRAWAL_COMPLETED` from `AdminFundService` / `TradingLogger`.
- Joined with `withdrawals` and `users`. **Amount** in the API is gross withdrawal `amount` + `charges` (matches debited total on approve).

#### API
- `GET /api/super-admin/withdrawals/audit`
  - **Query params**: same as deposit audit (`status`, `adminId`, `adminName`, `search`, `from`, `to`, `page`, `pageSize`).
  - **Search**: matches `withdrawalId` in log details or log `message`.
  - **Response** `records[]` fields include `withdrawalId`, `bankReference` (from admin-entered `transactionId` on approve, else null), `reason`, `remarks`, `user`, `createdAt`, and the same `status` / admin fields as deposits.

#### UI
- Admin console **Financial overview**: tabs **Deposits** and **Withdrawals** with independent filters and pagination.

### Changelog
- **2026-03-20**: Added withdrawal audit API (`WithdrawalAuditService`, `/api/super-admin/withdrawals/audit`) and Financial overview withdrawals tab.

### Follow-ups / Notes
- KPI widgets can return as a secondary section once real data is ready; API contracts remain in `/api/super-admin/finance/*`.
- For deeper analytics (weekly/monthly aggregates) consider exporting audit data to the data warehouse and layering dashboards in Metabase/Looker.
- Admin-initiated debits (`ADMIN_WITHDRAW_FUNDS_COMPLETED`) are not included in the withdrawal request trail; add a separate view if needed.
