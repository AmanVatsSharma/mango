# Module: common-errors

**Short:** Shared application error definitions.

**Purpose:** Standardize error codes, statuses, and details for domain failures.

**Files:**
- `app-error.ts` — base error class with status + code
- `order-validation.error.ts` — invalid order inputs
- `insufficient-margin.error.ts` — margin check failures
- `exchange-down.error.ts` — upstream outage
- `duplicate-order.error.ts` — duplicate submissions
- `http-error-mapper.ts` — map errors to HTTP payloads
- `index.ts` — public exports
- `MODULE_DOC.md` — this file

**Dependencies:** none.

**APIs:** consumed by service layers and API handlers.

**Env vars:** none.

**Tests:** `tests/common/app-error.test.ts`

**Change-log:**
- 2026-01-15: Added AppError base class and domain error set.
