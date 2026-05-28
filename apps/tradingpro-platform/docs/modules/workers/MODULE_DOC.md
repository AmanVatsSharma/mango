# Module: workers

**Short:** Admin-facing worker registry snapshot + heartbeat health rules.

**Purpose:** Provide a single operational view of background workers (order execution, position PnL, risk backstop), including enable flags, heartbeat freshness, Redis realtime readiness, and worker-linked daily cleanup automation.

**Key files:**
- `lib/server/workers/registry.ts` — builds snapshot + health status, reads/writes heartbeats
- `lib/server/workers/worker-run-lock.ts` — global DB-backed overlap guard for worker runs
- `lib/server/workers/worker-number-utils.ts` — shared strict finite-number parser for worker/admin/cron runtime inputs
- `lib/server/workers/cleanup-auto-runner.ts` — daily cleanup scheduler/runner triggered by worker ticks
- `lib/server/cron-number-utils.ts` — shared strict query-number parser used by order/position cron endpoints
- `lib/server/instrument-token-utils.ts` — shared best-effort instrument-token resolver reused by order/position workers
- `lib/server/workers/types.ts` — snapshot types returned to UI
- `app/api/admin/workers/route.ts` — admin API endpoint (read + manage)
- `components/admin-console/workers.tsx` — Admin Console Workers page

**APIs:**
- `GET /api/admin/workers` — list workers with heartbeat health
- `POST /api/admin/workers` — toggle, run-once, set PnL mode
- `GET/POST /api/admin/cleanup/automation` — cleanup schedule controls consumed by worker-linked auto purge

## Risk: canonical enforcer + backstop

- **Canonical enforcer**: `PositionPnLWorker` (server-side PnL + SL/TP + risk auto square-off).
- **Backstop**: `risk_monitoring` is repurposed as a safety net runner that triggers the positions worker only when the positions worker heartbeat is stale (unless force-run).
  - Cron endpoint: `GET /api/cron/risk-monitoring`
  - Admin run-now: `POST /api/admin/risk/monitor`

Risk thresholds are stored in **SystemSettings** (canonical) with env fallback:

- `risk_warning_threshold`
- `risk_auto_close_threshold`

## Position EOD enforcement notes

- `PositionPnLWorker` now includes segment-aware intraday EOD square-off enforcement with configurable pre-close buffer.
- Marker idempotency is persisted in `SystemSettings` per day/segment:
  - `positions_intraday_eod_squareoff_nse_<yyyy-mm-dd>`
  - `positions_intraday_eod_squareoff_mcx_<yyyy-mm-dd>`
- Position worker heartbeat now surfaces EOD counters:
  - `intradayEodCandidates`
  - `intradayEodClosed`
  - `intradayEodSkipped`
  - `intradayEodMarkersWritten`

Backstop invocation (auth-protected, dry-run compatible):

- `GET /api/cron/position-pnl-worker?eod=1`
- `GET /api/cron/position-pnl-worker?eod=1&dryRun=1`
- Optional tuning query params:
  - `intradayEodForceRun=1`
  - `intradayEodPreCloseBufferMinutes=<1..120>`
  - `intradayEodMaxAutoClosesPerTick=<0..5000>`

**Env vars:**
- `REDIS_URL` (optional) — enables Redis readiness signals in snapshot
- `REDIS_POSITIONS_PNL_TTL_SECONDS` (default `120`)
- `REDIS_POSITIONS_PNL_MAX_AGE_MS` (default `15000`)
- `POSITION_INTRADAY_EOD_PRE_CLOSE_BUFFER_MINUTES` (default `15`, clamp `1..120`)

**Tests:**
- `tests/workers/worker-run-lock.test.ts`
- `tests/api/cron-risk-monitoring-route.test.ts`
- `tests/api/cron-position-pnl-worker-route.test.ts`
- `tests/api/cron-order-worker-route.test.ts`
- `tests/api/admin-cleanup-automation-route.test.ts`
- `tests/api/admin-workers-route.test.ts`
- `tests/risk/risk-monitoring-job.test.ts`
- `tests/position/position-pnl-worker-global-lock.test.ts`

**Change-log:**
- 2026-02-21 (IST): Documented `PositionPnLWorker` intraday EOD square-off marker strategy (per-day/per-segment `SystemSettings` keys) and new heartbeat EOD counters for operator visibility.
- 2026-02-21 (IST): Position PnL cron endpoint now supports explicit intraday EOD backstop trigger params (`eod|intradayEodSquareOff`) with dry-run-safe override knobs.
- 2026-02-17 (IST): Added worker-linked cleanup automation runner (`cleanup-auto-runner`) with IST daily window + retention controls, and wired cron/script worker execution paths to trigger once-per-day cleanup ticks.
- 2026-02-16 (IST): `components/admin-console/workers.tsx` now reuses shared strict admin number helpers for run-once param shaping and heartbeat metric formatting, preventing malformed numeric inputs from producing non-finite worker action payloads or dashboard stat artifacts.
- 2026-02-16 (IST): `instrument-token-utils` now accepts only strict positive-integer token segments (rejecting decimal/scientific/partial strings), so malformed instrument suffixes cannot be truncated into unintended worker subscription tokens.
- 2026-02-16 (IST): `instrumentMapper.parseInstrumentId` now uses strict positive-integer token parsing (no partial `parseInt` coercion), so worker token extraction paths reject malformed suffixes like `26000abc` instead of subscribing to incorrect instruments.
- 2026-02-16 (IST): Added shared `instrument-token-utils` resolver and refactored order/position workers to reuse a single strict token extraction path from `instrumentId` values.
- 2026-02-16 (IST): `scripts/worker-script-env` now reuses shared `worker-number-utils` parsing so long-running worker script env normalization stays consistent with admin/cron/registry numeric behavior.
- 2026-02-16 (IST): Added shared `cron-number-utils` parser and refactored order/position cron routes to reuse it, removing duplicated query-number parsing logic across worker cron endpoints.
- 2026-02-16 (IST): Added shared `worker-number-utils` parser and refactored registry/lock/admin/cron paths to reuse it, removing duplicated numeric coercion logic across worker runtime surfaces.
- 2026-02-16 (IST): Worker/admin/cron numeric parsers now treat `null`/`undefined` as unset values (instead of coercing to `0`), so run_once params and worker TTL/env settings reliably use intended fallback defaults.
- 2026-02-04 (IST): Added workers management API + UI with heartbeats and run-once actions.
- 2026-02-13 (IST): Workers snapshot/UI now surfaces Redis realtime readiness + richer heartbeat stats for ops. Risk monitoring is now documented as a backstop runner (positions worker is canonical).
- 2026-02-15 (IST): Risk cron path now skips overlapping in-process runs (`already_running`) for safer scheduled execution.
- 2026-02-15 (IST): Added global worker run lock and `reason=locked` skip visibility for overlapping risk/PnL runs.
- 2026-02-15 (IST): Risk cron now persists heartbeat reasons for disabled/overlap/error paths for clearer worker-state observability.
- 2026-02-15 (IST): Admin run-once risk trigger now respects global lock guard and records locked/error heartbeat reasons.
- 2026-02-16 (IST): `RiskMonitoringJob.runOnce()` now uses the same global `risk_monitoring` lock to prevent overlap in non-cron invocations and safely releases lock in all exit paths.
- 2026-02-16 (IST): `RiskMonitoringJob` now normalizes env/constructor threshold values (valid range + `autoCloseThreshold >= warningThreshold`) before running monitoring.
- 2026-02-16 (IST): `RiskMonitoringJob.start()` now clamps invalid/too-small interval values to a safe 1-second minimum to avoid accidental tight-loop scheduling.
- 2026-02-16 (IST): Risk/Order/Position worker numeric parsing now treats blank-string and boolean numeric payload/env values as unset defaults (instead of permissive numeric coercion), preventing accidental low-limit/low-TTL misconfiguration.
- 2026-02-16 (IST): Long-running worker scripts (`scripts/order-worker.ts`, `scripts/position-pnl-worker.ts`) now share strict env-number parsing helpers so blank/sentinel env overrides cannot trigger busy-loop intervals or unsafe batch-size coercion.
- 2026-02-16 (IST): Added regression coverage for cron/job lock-release and threshold normalization behavior to preserve overlap safety under failure paths.
- 2026-02-16 (IST): Added admin run-once risk regression to ensure lock-release failures in cleanup do not regress successful API responses.
- 2026-02-16 (IST): Added position PnL worker lock-release regression coverage to keep successful runs resilient under cleanup failures.
- 2026-02-16 (IST): Worker lock helper now normalizes malformed TTL/workerId inputs and ignores malformed release keys for safer deterministic lease semantics.
- 2026-02-16 (IST): Worker lock key normalization now sanitizes special characters, lowercases IDs, and caps worker-id length for stable lock-key generation across noisy caller payloads.
- 2026-02-16 (IST): Worker lock acquire/release paths now defensively handle malformed acquire payloads and blank owner tokens before DB lock operations.
- 2026-02-16 (IST): Worker lock TTL parsing now safely rejects non-coercible numeric carriers (for example `Symbol`) without throwing, preserving fallback lease defaults under malformed caller inputs.
- 2026-02-16 (IST): Worker lock parser now accepts numeric-string lease timestamp metadata so active locks remain correctly detected across serialization variants.
- 2026-02-16 (IST): Worker lock release path now trims lock key/owner token inputs before lookup/comparison so whitespace-padded caller payloads still release matching leases.
- 2026-02-16 (IST): Position PnL cron route now normalizes malformed query values/relative URLs and accepts broader dryRun truthy variants with route-level regression coverage.
- 2026-02-16 (IST): Order worker cron route now normalizes malformed query values/relative URLs and clamps `limit/maxAgeMs` safely before execution.
- 2026-02-16 (IST): Risk/order/position cron routes now guard unreadable `authorization` header accessors so secret-protected runs return stable `401` responses instead of `500` errors.
- 2026-02-16 (IST): Risk/order/position cron routes now trim configured secret env values before comparison to avoid false unauthorized responses from whitespace-padded secrets.
- 2026-02-16 (IST): Risk/order/position cron routes now accept case-insensitive `Bearer` schemes and trim token payloads before secret comparison for proxy/header compatibility.
- 2026-02-16 (IST): Risk/order/position bearer token parsing now scans comma-separated authorization segments and matches the first valid bearer fragment (including when non-bearer segments appear first).
- 2026-02-16 (IST): Risk/order/position cron routes now also unwrap quoted bearer token payloads (`Bearer "secret"` / `Bearer 'secret'`) before secret comparison for proxy compatibility.
- 2026-02-16 (IST): Risk/order/position cron auth parsing now also supports plain-object header wrappers (`Authorization`/`authorization`) when adapter request objects do not expose `headers.get(...)`.
- 2026-02-16 (IST): Risk/order/position cron plain-object auth parsing now matches authorization header keys case-insensitively to support mixed-case adapter header maps.
- 2026-02-16 (IST): Risk/order/position cron auth normalization now supports array-valued authorization header carriers (e.g., `authorization: ["Bearer ..."]`) used by some proxy adapters.
- 2026-02-16 (IST): Risk/order/position cron auth parsing now also supports nested plain-object header wrappers (`headers.headers.authorization`) for layered request adapters.
- 2026-02-16 (IST): Risk/order/position cron auth parsing now also supports iterable header-entry wrappers (e.g., `[["authorization","Bearer ..."]]`) when adapter headers are tuple-based iterables.
- 2026-02-16 (IST): Risk/order/position cron auth parsing now also supports `headers.entries()` tuple wrappers when adapter headers expose entry accessors without direct iterability.
- 2026-02-16 (IST): Risk/order/position cron auth parsing now also supports flat raw-header arrays (`["authorization","Bearer ...", ...]`) emitted by Node/proxy adapters.
- 2026-02-16 (IST): Risk/order/position cron auth parsing now also supports `headers.forEach(...)` wrappers when adapter headers expose callback-based iterators.
- 2026-02-16 (IST): Risk/order/position callback-based header parsing now tolerates either `forEach(value, key)` or swapped `forEach(key, value)` callback argument ordering.
- 2026-02-16 (IST): Risk/order/position cron routes now accept either worker-specific secrets or global `CRON_SECRET` when both are configured, improving scheduler secret-rotation compatibility.
- 2026-02-16 (IST): Risk/order/position cron secret parsing now supports delimiter-based lists (comma/semicolon/newline), JSON-array lists, and JSON-object wrappers (`{"secrets":[...]}`) so rotated secrets can be accepted concurrently across env serialization styles.
- 2026-02-16 (IST): Risk/order/position cron secret parsing now ignores placeholder tokens (`undefined`, `null`, `none`, `n/a`, `false`, `0`, `off`, `disabled`) and empty JSON wrappers (`{}`, `{"secrets":[]}`) so misconfigured env defaults do not accidentally enforce auth and block schedulers.
- 2026-02-16 (IST): Risk/order/position cron secret parsing now also unwraps quoted secret tokens (`"secret"` / `'secret'`) before comparison for compatibility with quoted env serialization styles.
- 2026-02-16 (IST): Risk cron route numeric normalization now treats blank/boolean lock TTL env values as unset fallback defaults and rejects boolean/blank heartbeat summary counts instead of coercing them via permissive number casting.
- 2026-02-16 (IST): Risk cron numeric parsing now also guards non-coercible summary/TTL carriers (for example `Symbol`) so malformed monitoring payload values fall back safely without turning successful runs into 500 responses.
- 2026-02-16 (IST): Order/position cron routes now parse query params from URL-object request wrappers in addition to string URLs for framework adapter compatibility.
- 2026-02-16 (IST): Order/position cron URL-object parsing now also supports `pathname/search` carriers (including callable wrappers) when adapter URL objects do not expose `href`.
- 2026-02-16 (IST): Order/position cron URL-object parsing now also supports `searchParams` carriers (including callable wrappers), even when adapter wrappers omit `pathname`.
- 2026-02-16 (IST): Order/position cron query parsing now also falls back to `req.nextUrl` wrappers when direct `req.url` access throws or is unavailable in adapter-provided request objects.
- 2026-02-16 (IST): Order/position cron routes now also parse query params from function-valued URL wrappers for lazy adapter compatibility.
- 2026-02-16 (IST): Order/position cron query normalization now treats blank/sentinel numeric query params as unset defaults (avoiding coercion of empty values into `limit=1`/`updateThreshold=0` style behavior).
- 2026-02-16 (IST): Order/position cron routes now also resolve query params from nested `req.url.href` wrappers when adapter-provided URL objects do not stringify directly.
- 2026-02-16 (IST): Position PnL dry-run parsing now also accepts compact/status aliases (`y`, `t`, `enabled`) across cron query parsing and direct worker invocation payload normalization.
- 2026-02-16 (IST): Worker heartbeat parsing now accepts timestamp aliases (`lastRunAt`, `last_run_at`, `timestamp`, `ts`) and nested `heartbeat` wrappers for backward-compatible health tracking.
- 2026-02-16 (IST): Order cron route now explicitly pins Node runtime to avoid accidental edge-runtime execution mismatches.
- 2026-02-16 (IST): Admin `run_once` param parsing now clamps malformed order/position worker payload values (`limit`, `maxAgeMs`, `updateThreshold`, `dryRun`) before invoking workers.
- 2026-02-16 (IST): Admin `run_once` now accepts numeric dry-run flags (`1` => true) for compatibility with numeric JSON payload emitters.
- 2026-02-16 (IST): Admin `run_once` now ignores malformed non-object `params` payloads (e.g., string/array) and safely falls back to worker defaults.
- 2026-02-16 (IST): Admin `run_once` now also parses stringified JSON `params` payloads (`"{\"limit\":10}"`) so mis-serialized request payloads still execute deterministically.
- 2026-02-16 (IST): Admin `run_once` now also unwraps nested params wrappers (`params.payload`, `params.data`, `params.body`) so adapter-wrapped payloads are normalized before worker invocation.
- 2026-02-16 (IST): Admin `run_once` numeric normalization now treats blank/boolean numeric payload values as unset defaults (order/position params + risk summary counters) and treats blank admin risk lock TTL env values as fallback defaults instead of permissive numeric coercion.
- 2026-02-16 (IST): Admin `run_once` numeric parsing now also guards non-coercible numeric carriers (for example `Symbol`) so malformed risk summary values and worker params degrade safely to defaults without throwing.
- 2026-02-16 (IST): Admin worker action/workerId normalization now accepts hyphen/space aliases (`run-once`, `set-mode`, `risk-monitoring`, `position-pnl`, `order-execution`) by canonicalizing tokens before validation.
- 2026-02-16 (IST): Admin `/api/admin/workers` now accepts double-encoded JSON body wrappers (stringified object payloads) for broader proxy/client serializer compatibility.
- 2026-02-16 (IST): Admin `/api/admin/workers` now also unwraps nested body wrappers (`payload`, `data`, `body`, `request`, `value`) to support adapter-enveloped action payloads.
- 2026-02-16 (IST): Worker registry mode parsing now trims/case-normalizes `position_pnl_mode` values (e.g., ` SERVER `) to prevent accidental mode drift from settings whitespace/casing.
- 2026-02-16 (IST): Worker snapshot TTL options now normalize malformed/undersized values into safe bounded ranges (minimum 1s, maximum 24h) before health-state classification.
- 2026-02-16 (IST): Worker snapshot TTL option parsing now also guards non-coercible numeric carriers (for example `Symbol`) and falls back to default TTLs without throwing.
- 2026-02-16 (IST): Worker heartbeat parsing now accepts numeric epoch timestamps (string/number) and normalized ISO payloads for compatibility with legacy serialization variants.
- 2026-02-16 (IST): Worker heartbeat timestamp normalization now guards out-of-range epoch values and invalid Date serialization, preventing `RangeError` from malformed persisted heartbeat timestamps.
- 2026-02-16 (IST): `updateWorkerHeartbeat` now rejects malformed/blank heartbeat payload overrides and falls back to canonical `{lastRunAtIso}` JSON to keep heartbeat reads parseable.
- 2026-02-16 (IST): Worker settings boolean parsing now trims/case-normalizes values and accepts aliases (`1/0`, `yes/no`, `on/off`) so enable-flag interpretation stays stable across emitters.
- 2026-02-16 (IST): Worker settings boolean parsing now also accepts compact/status aliases (`y/n`, `t/f`, `enabled/disabled`) for broader compatibility with legacy setting emitters.
- 2026-02-16 (IST): Worker system-settings key handling now trims/validates global keys before lookup/upsert, preventing whitespace/malformed keys from creating divergent setting rows.
- 2026-02-16 (IST): Worker registry mutation helpers (`updateWorkerHeartbeat`, `setWorkerEnabled`) now reject unknown runtime worker IDs instead of implicitly falling through to risk-monitoring keys.
- 2026-02-16 (IST): Worker snapshot assembly now falls back to default worker states when global settings lookup fails, preserving Admin worker visibility during transient settings-read errors.
- 2026-02-16 (IST): Worker registry numeric env parsing now treats blank/sentinel redis TTL settings (`REDIS_POSITIONS_PNL_TTL_SECONDS`, `REDIS_POSITIONS_PNL_MAX_AGE_MS`) as fallback defaults instead of coercing them into minimum clamp values.
- 2026-02-16 (IST): Risk monitoring cron now normalizes monitoring summary counters (`checkedAccounts`, `positionsClosed`, `alertsCreated`, `errors`) into bounded non-negative integers before heartbeat writes and API responses.
- 2026-02-16 (IST): Admin workers `run_once` risk response/heartbeat paths now normalize monitoring summary counters into bounded non-negative integers before API/heartbeat serialization.
- 2026-02-16 (IST): Risk-monitoring lock TTL config parsing in cron + admin run-once paths now enforces safe bounds (10s minimum, 24h maximum) to avoid malformed env values creating unsafe lock windows.
- 2026-02-16 (IST): Global worker run-lock helper now clamps direct caller lock TTLs to safe bounds (5s minimum, 24h maximum) so non-cron/non-admin code paths cannot create runaway leases.
- 2026-02-16 (IST): Global worker run-lock parser now accepts ISO-8601 timestamp strings in persisted lock payloads, preventing false lock misses when legacy rows serialize timestamps as date strings.
- 2026-02-16 (IST): Global worker run-lock parser now also unwraps nested lock envelopes (`{ lock: {...} }` / `{ payload: {...} }`) for backward compatibility with legacy serialized lock shapes.
- 2026-02-16 (IST): Global worker run-lock parser now also accepts alias lock fields (`owner`, `acquiredAt`, `expiresAt`, `releasedAt`) in addition to `*AtMs` fields, preserving overlap safety across mixed legacy lock payload formats.
- 2026-02-16 (IST): Global worker run-lock parser now falls back across alias/wrapper candidates when higher-priority fields are malformed, so one bad persisted field no longer masks an otherwise-active lock lease.
- 2026-02-16 (IST): Risk cron/admin error-heartbeat payloads now normalize error messages (trim + whitespace collapse + 256-char bound) before persistence, preventing oversized/garbled failure metadata.
- 2026-02-16 (IST): Admin workers POST action/workerId parsing now trims and case-normalizes incoming tokens (e.g., ` RUN_ONCE ` / ` RISK_MONITORING `) before validation and dispatch.
- 2026-02-16 (IST): Order/position cron 500 responses now normalize worker error messages (trim + whitespace collapse + 256-char bound) to keep failure payloads bounded and readable.
- 2026-02-16 (IST): Admin workers `toggle` action now accepts boolean aliases (`yes/no`, `1/0`, `on/off`) in addition to strict booleans, with normalized action/worker token dispatch.
- 2026-02-16 (IST): Admin workers boolean alias parsing now also supports compact/status forms (`y/n`, `t/f`, `enabled/disabled`) for both toggle payloads and position run-once dry-run flags.

