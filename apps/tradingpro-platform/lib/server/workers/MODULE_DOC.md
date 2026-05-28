<!--
MODULE_DOC.md
Module: lib/server/workers
Purpose: Central registry + health snapshot for background workers (Admin Console).
Last-updated: 2026-02-15
-->

## Overview

This module owns the **worker registry** used by Admin Console to:

- Fetch a unified snapshot of worker status (`enabled`, `health`, `lastRunAtIso`)
- Store/parse worker **heartbeats** from `SystemSettings`
- Provide safe, non-secret **config hints** for operators (cron endpoints, EC2 commands, Redis readiness)
- Coordinate worker-linked **daily cleanup automation** so old orders/closed positions are purged once per IST day
- Surface intraday EOD square-off operational semantics (segment-window + idempotency markers) from `PositionPnLWorker`

As of 2026-02-13 (IST), **risk monitoring is treated as a backstop runner**:

- The canonical enforcer is `PositionPnLWorker` (runs continuously on EC2).
- The `risk_monitoring` cron/API should only run when the positions worker is stale (unless force-run).

## Heartbeats

Heartbeats are stored in `SystemSettings` as JSON values.

Key rules:

- Heartbeat keys are per worker (e.g. `order_worker_heartbeat`, `positions_pnl_worker_heartbeat`)
- Value must include `lastRunAtIso`
- Backward-compatible parsing: accepts JSON or a plain ISO string
- Health is derived as `healthy`/`stale`/`unknown`/`disabled` based on TTL and enabled flag

### Backstop heartbeat fields (risk monitoring)

The `risk_monitoring_heartbeat` JSON may include operational fields like:

- `source`: `"backstop"`
- `skipped`: boolean
- `skippedReason`: e.g. `"positions_worker_healthy"`
- `pnlWorkerHealth`: snapshot health string for the positions worker
- `pnlWorkerLastRunAtIso`: last run timestamp of the positions worker
- `positionWorkerHeartbeat`: embedded `PositionPnLWorker` heartbeat (optional, for operator visibility)

### Position worker EOD fields

`positions_pnl_worker_heartbeat` may now include intraday EOD enforcement counters:

- `intradayEodCandidates`
- `intradayEodClosed`
- `intradayEodSkipped`
- `intradayEodMarkersWritten`
- `intradayEodPreCloseBufferMinutes`

Per-day/per-segment marker keys are persisted in `SystemSettings`:

- `positions_intraday_eod_squareoff_nse_<yyyy-mm-dd>`
- `positions_intraday_eod_squareoff_mcx_<yyyy-mm-dd>`

These markers are used by the position worker to prevent repeated full EOD reruns in the same trading day/segment.

## Redis readiness

If `REDIS_URL` is configured, the registry surfaces `redisEnabled=true` and sets:

- `realtimeBus = "redis_pubsub"` (cross-process worker → app realtime delivery)
- Position PnL cache knobs (`redisPnlCacheTtlSeconds`, `redisPnlMaxAgeMs`, key prefix)

This is informational only; worker processes must also be configured with the same env.

## Files

- `registry.ts` — snapshot builder + health computation + heartbeat upsert helpers
- `worker-run-lock.ts` — DB-backed global worker run lock (lease + advisory-keyed acquisition serialization)
- `worker-number-utils.ts` — shared strict finite-number parser for worker/admin/cron runtime inputs
- `cleanup-auto-runner.ts` — worker-linked daily cleanup scheduler + retention execution helper
- `../cron-number-utils.ts` — shared strict query-number parser used by order/position cron endpoints
- `../instrument-token-utils.ts` — shared best-effort instrument-token resolver reused by order/position workers
- `types.ts` — shared types returned to Admin Console
- `MODULE_DOC.md` — this file

## APIs (consumers)

- `GET /api/admin/workers` — returns snapshot (used by `components/admin-console/workers.tsx`)
- `POST /api/admin/workers` — run-once / toggle / set-mode actions
- `GET/POST /api/admin/cleanup/automation` — reads/writes worker-linked cleanup schedule controls

## Env vars

- `REDIS_URL` (optional): enables Redis realtime bus + cache signals
- `REDIS_POSITIONS_PNL_TTL_SECONDS` (default: `120`)
- `REDIS_POSITIONS_PNL_MAX_AGE_MS` (default: `15000`)
- `POSITION_INTRADAY_EOD_PRE_CLOSE_BUFFER_MINUTES` (default: `15`, clamp `1..120`)

## Tests

- `tests/workers/worker-run-lock.test.ts` — lock acquire/locked/release semantics
- `tests/api/cron-risk-monitoring-route.test.ts` — cron lock + heartbeat reason branches
- `tests/api/cron-position-pnl-worker-route.test.ts` — position PnL cron auth/query normalization + failure response resilience
- `tests/api/cron-order-worker-route.test.ts` — order-worker cron auth/query normalization + failure response resilience
- `tests/api/admin-cleanup-automation-route.test.ts` — cleanup automation read/write API behavior
- `tests/api/admin-workers-route.test.ts` — admin run-once risk lock + heartbeat branches
- `tests/risk/risk-monitoring-job.test.ts` — service-level risk job lock + threshold normalization regression coverage
- `tests/position/position-pnl-worker-global-lock.test.ts` — position PnL worker global-lock skip + lock-release failure resilience

## Change-log

- 2026-02-22 (IST): Fixed worker lock runtime failures by switching `worker-run-lock` advisory lock calls from Prisma `$queryRaw` to `$executeRaw` for `pg_advisory_xact_lock(...)` (void-returning SQL), preventing `Failed to deserialize column of type 'void'` in order/position worker cleanup ticks.
- 2026-02-21 (IST): Documented intraday EOD square-off marker semantics and heartbeat fields (`intradayEodCandidates/Closed/Skipped/MarkersWritten`) emitted by `PositionPnLWorker`.
- 2026-02-21 (IST): `/api/cron/position-pnl-worker` now supports explicit EOD backstop invocation (`eod|intradayEodSquareOff`) with dry-run-safe overrides (`intradayEodForceRun`, pre-close buffer, max-close caps).
- 2026-02-17 (IST): Added `cleanup-auto-runner` with retention-based daily purge orchestration (IST run window + once-per-day guard + global lock) and wired order/position/risk worker cron paths plus EC2 worker scripts to trigger auto-cleanup ticks.
- 2026-02-16 (IST): `components/admin-console/workers.tsx` now reuses shared strict admin number helpers for run-once param shaping and heartbeat metric formatting, preventing malformed numeric inputs from producing non-finite worker action payloads or dashboard stat artifacts.
- 2026-02-16 (IST): `instrument-token-utils` now accepts only strict positive-integer token segments (rejecting decimal/scientific/partial strings), so malformed instrument suffixes cannot be truncated into unintended worker subscription tokens.
- 2026-02-16 (IST): `instrumentMapper.parseInstrumentId` now uses strict positive-integer token parsing (no partial `parseInt` coercion), so worker token extraction paths reject malformed suffixes like `26000abc` instead of subscribing to incorrect instruments.
- 2026-02-16 (IST): Added shared `instrument-token-utils` resolver and refactored order/position workers to reuse a single strict token extraction path from `instrumentId` values.
- 2026-02-16 (IST): `scripts/worker-script-env` now reuses shared `worker-number-utils` parsing so long-running worker script env normalization stays consistent with admin/cron/registry numeric behavior.
- 2026-02-16 (IST): Added shared `cron-number-utils` parser and refactored order/position cron routes to reuse it, removing duplicated query-number parsing logic across worker cron endpoints.
- 2026-02-16 (IST): Added shared `worker-number-utils` parser and refactored registry/lock/admin/cron paths to reuse it, removing duplicated numeric coercion logic across worker runtime surfaces.
- 2026-02-16 (IST): Worker/admin/cron numeric parsers now treat `null`/`undefined` as unset values (instead of coercing to `0`), so run_once params and worker TTL/env settings reliably use intended fallback defaults.
- 2026-02-04 (IST): Added worker registry snapshot + heartbeat rules for Admin Console workers management.
- 2026-02-13 (IST): Snapshot now surfaces Redis readiness + PnL cache knobs for better ops visibility.
- 2026-02-13 (IST): Documented risk backstop heartbeat fields and clarified canonical enforcement path (positions worker primary).
- 2026-02-15 (IST): Risk monitoring cron now has an in-process overlap guard and returns `reason=already_running` when a run is active.
- 2026-02-15 (IST): Added global DB-backed worker lock helper and wired risk/position workers to skip overlapping runs with `reason=locked`.
- 2026-02-15 (IST): Risk monitoring cron now writes skip-state heartbeats for `disabled` / `already_running` / `locked` and marks `reason=error` on failures.
- 2026-02-15 (IST): Admin `run_once` risk monitoring now uses the same global lock guard and emits heartbeat reasons for locked/error branches.
- 2026-02-16 (IST): `RiskMonitoringJob.runOnce()` now also acquires the shared global worker lock (`risk_monitoring`) so non-cron invocations avoid cross-process overlap and release lock safely on success/failure.
- 2026-02-16 (IST): `RiskMonitoringJob` now normalizes warning/auto-close thresholds from env/constructor inputs (finite range + autoClose >= warning) before invoking monitoring service.
- 2026-02-16 (IST): `RiskMonitoringJob.start(intervalMs)` now normalizes non-finite/too-small intervals to a safe minimum (1s) to prevent runaway scheduling loops.
- 2026-02-16 (IST): Risk/Order/Position worker numeric parsing now treats blank-string and boolean numeric payload/env values as unset defaults (instead of permissive numeric coercion), preventing accidental low-limit/low-TTL misconfiguration.
- 2026-02-16 (IST): Long-running worker scripts (`scripts/order-worker.ts`, `scripts/position-pnl-worker.ts`) now share strict env-number parsing helpers so blank/sentinel env overrides cannot trigger busy-loop intervals or unsafe batch-size coercion.
- 2026-02-16 (IST): Added regression coverage for risk cron/job lock release and threshold normalization paths to prevent silent overlap regressions.
- 2026-02-16 (IST): Added admin run-once risk regression coverage ensuring successful responses are preserved even if post-run lock release fails.
- 2026-02-16 (IST): Added position PnL worker regression coverage to ensure successful processing responses are preserved when lock release fails during cleanup.
- 2026-02-16 (IST): Worker run lock helper now normalizes invalid TTL/workerId inputs and skips malformed release keys to keep lock leases deterministic under malformed caller inputs.
- 2026-02-16 (IST): Worker lock key normalization now sanitizes special characters, lowercases IDs, and bounds worker-id length to keep advisory lock key generation stable across arbitrary caller input.
- 2026-02-16 (IST): Worker lock acquire/release guards now safely handle malformed acquire payloads and blank owner tokens without issuing DB lock queries.
- 2026-02-16 (IST): Worker lock TTL parsing now safely rejects non-coercible numeric carriers (for example `Symbol`) without throwing, preserving fallback lease defaults under malformed caller inputs.
- 2026-02-16 (IST): Worker lock parser now accepts numeric-string timestamp metadata from persisted lease rows so active locks remain correctly detected across serialization variants.
- 2026-02-16 (IST): Worker lock release path now trims lock key/owner token inputs before lookup/comparison so whitespace-padded caller payloads still release matching leases.
- 2026-02-16 (IST): Position PnL cron route now normalizes malformed query params/relative URLs and broadens dryRun truthy parsing (`true|1|yes|on`) with dedicated route-level regression coverage.
- 2026-02-16 (IST): Order worker cron route now normalizes malformed query/URL inputs and clamps `limit/maxAgeMs` safely before worker execution, with dedicated route-level regression coverage.
- 2026-02-16 (IST): Risk/order/position cron routes now guard unreadable `authorization` header accessors so secret-protected runs consistently return `401` instead of surfacing `500` transport errors.
- 2026-02-16 (IST): Risk/order/position cron routes now also trim configured secret env values before auth comparison to avoid false unauthorized responses caused by whitespace-padded secrets.
- 2026-02-16 (IST): Risk/order/position cron routes now accept case-insensitive `Bearer` schemes and trim token payloads before secret comparison for broader proxy header compatibility.
- 2026-02-16 (IST): Risk/order/position bearer token parsing now scans comma-separated authorization segments and matches the first valid bearer fragment (including when non-bearer segments appear first).
- 2026-02-16 (IST): Risk/order/position cron routes now also unwrap quoted bearer token payloads (`Bearer "secret"` / `Bearer 'secret'`) before secret comparison for proxy compatibility.
- 2026-02-16 (IST): Risk/order/position cron auth parsing now also supports plain-object header wrappers (`Authorization`/`authorization`) when request adapters do not expose `headers.get(...)`.
- 2026-02-16 (IST): Risk/order/position cron plain-object auth parsing now matches authorization header keys case-insensitively to support mixed-case adapter header maps.
- 2026-02-16 (IST): Risk/order/position cron auth normalization now supports array-valued authorization header carriers (for example `authorization: ["Bearer ..."]`) used by some proxy adapters.
- 2026-02-16 (IST): Risk/order/position cron auth parsing now also supports nested plain-object header wrappers (`headers.headers.authorization`) for layered request adapters.
- 2026-02-16 (IST): Risk/order/position cron auth parsing now also supports iterable header-entry wrappers (for example `[["authorization","Bearer ..."]]`) when adapter headers are tuple-based iterables.
- 2026-02-16 (IST): Risk/order/position cron auth parsing now also supports `headers.entries()` tuple wrappers when adapter headers expose entry accessors without direct iterability.
- 2026-02-16 (IST): Risk/order/position cron auth parsing now also supports flat raw-header arrays (`["authorization","Bearer ...", ...]`) emitted by Node/proxy adapters.
- 2026-02-16 (IST): Risk/order/position cron auth parsing now also supports `headers.forEach(...)` wrappers when adapter headers expose callback-based iterators.
- 2026-02-16 (IST): Risk/order/position callback-based header parsing now tolerates either `forEach(value, key)` or swapped `forEach(key, value)` callback argument ordering.
- 2026-02-16 (IST): Risk/order/position cron routes now accept either worker-specific secrets or global `CRON_SECRET` when both are configured, improving secret-rotation compatibility across schedulers.
- 2026-02-16 (IST): Risk/order/position cron secret parsing now supports delimiter-based lists (comma/semicolon/newline), JSON-array lists, and JSON-object wrappers (`{"secrets":[...]}`) so rotated secrets can be accepted concurrently across env serialization styles.
- 2026-02-16 (IST): Risk/order/position cron secret parsing now ignores placeholder tokens (`undefined`, `null`, `none`, `n/a`, `false`, `0`, `off`, `disabled`) and empty JSON wrappers (`{}`, `{"secrets":[]}`) so misconfigured env defaults do not accidentally enforce auth and block schedulers.
- 2026-02-16 (IST): Risk/order/position cron secret parsing now also unwraps quoted secret tokens (`"secret"` / `'secret'`) before comparison for compatibility with quoted env serialization styles.
- 2026-02-16 (IST): Risk cron route numeric normalization now treats blank/boolean lock TTL env values as unset fallback defaults and rejects boolean/blank heartbeat summary counts instead of coercing them via permissive number casting.
- 2026-02-16 (IST): Risk cron numeric parsing now also guards non-coercible summary/TTL carriers (for example `Symbol`) so malformed monitoring payload values fall back safely without turning successful runs into 500 responses.
- 2026-02-16 (IST): Order/position cron routes now parse query strings from URL-object request wrappers in addition to string URLs for broader framework adapter compatibility.
- 2026-02-16 (IST): Order/position cron URL-object parsing now also supports `pathname/search` carriers (including callable wrappers) when adapter URL objects do not expose `href`.
- 2026-02-16 (IST): Order/position cron URL-object parsing now also supports `searchParams` carriers (including callable wrappers), even when adapter wrappers omit `pathname`.
- 2026-02-16 (IST): Order/position cron query parsing now also falls back to `req.nextUrl` wrappers when direct `req.url` access throws or is unavailable in adapter-provided request objects.
- 2026-02-16 (IST): Order/position cron routes now also parse query strings from function-valued URL wrappers for lazy request adapter compatibility.
- 2026-02-16 (IST): Order/position cron query normalization now treats blank/sentinel numeric query params as unset defaults (avoiding coercion of empty values into `limit=1`/`updateThreshold=0` style behavior).
- 2026-02-16 (IST): Order/position cron routes now also resolve query strings from nested `req.url.href` wrappers when request adapters expose URL objects without a useful top-level string serialization.
- 2026-02-16 (IST): Position PnL dry-run parsing now also accepts compact/status aliases (`y`, `t`, `enabled`) across cron query parsing and direct worker invocation payload normalization.
- 2026-02-16 (IST): Worker heartbeat parsing now accepts timestamp aliases (`lastRunAt`, `last_run_at`, `timestamp`, `ts`) and nested `heartbeat` wrappers for backward-compatible health tracking.
- 2026-02-16 (IST): Order cron endpoint now explicitly pins Node runtime to avoid accidental edge-runtime execution incompatibilities.
- 2026-02-16 (IST): Admin `run_once` parameter parsing now clamps order/position worker inputs (`limit`, `maxAgeMs`, `updateThreshold`, `dryRun`) before execution to keep run-once behavior deterministic under malformed payloads.
- 2026-02-16 (IST): Admin `run_once` dry-run parsing now also accepts numeric flags (`1` => true) for compatibility with numeric JSON payload emitters.
- 2026-02-16 (IST): Admin `run_once` now ignores malformed non-object `params` payloads (for example string/array) and safely falls back to worker defaults.
- 2026-02-16 (IST): Admin `run_once` now also parses stringified JSON `params` payloads (`"{\"limit\":10}"`) so mis-serialized request payloads still execute deterministically.
- 2026-02-16 (IST): Admin `run_once` now also unwraps nested params wrappers (`params.payload`, `params.data`, `params.body`) so adapter-wrapped payloads are normalized before worker invocation.
- 2026-02-16 (IST): Admin `run_once` numeric normalization now treats blank/boolean numeric payload values as unset defaults (order/position params + risk summary counters) and treats blank admin risk lock TTL env values as fallback defaults instead of permissive numeric coercion.
- 2026-02-16 (IST): Admin `run_once` numeric parsing now also guards non-coercible numeric carriers (for example `Symbol`) so malformed risk summary values and worker params degrade safely to defaults without throwing.
- 2026-02-16 (IST): Admin worker action/workerId normalization now accepts hyphen/space aliases (`run-once`, `set-mode`, `risk-monitoring`, `position-pnl`, `order-execution`) by canonicalizing tokens before validation.
- 2026-02-16 (IST): Admin `/api/admin/workers` now accepts double-encoded JSON body wrappers (stringified object payloads) to improve compatibility with proxy/client body serializers.
- 2026-02-16 (IST): Admin `/api/admin/workers` now also unwraps nested body wrappers (`payload`, `data`, `body`, `request`, `value`) to support adapter-enveloped action payloads.
- 2026-02-16 (IST): Worker registry mode parsing now trims/case-normalizes `position_pnl_mode` values (for example ` SERVER `) to prevent accidental mode drift from whitespace/casing in settings rows.
- 2026-02-16 (IST): Worker snapshot TTL options now normalize malformed/undersized values to safe bounded ranges (minimum 1s, maximum 24h) before health classification.
- 2026-02-16 (IST): Worker snapshot TTL option parsing now also guards non-coercible numeric carriers (for example `Symbol`) and falls back to default TTLs without throwing.
- 2026-02-16 (IST): Worker heartbeat parsing now accepts numeric epoch timestamps (string/number) and normalizes ISO payloads, improving compatibility with legacy heartbeat serialization variants.
- 2026-02-16 (IST): Worker heartbeat timestamp normalization now guards out-of-range epoch values and invalid Date serialization, preventing `RangeError` from malformed persisted heartbeat timestamps.
- 2026-02-16 (IST): `updateWorkerHeartbeat` now rejects malformed/blank heartbeat payload overrides and falls back to canonical `{lastRunAtIso}` JSON to keep admin heartbeat reads parseable.
- 2026-02-16 (IST): Worker settings boolean parser now trims/case-normalizes values and accepts common aliases (`1/0`, `yes/no`, `on/off`) so enable flags remain stable across inconsistent setting emitters.
- 2026-02-16 (IST): Worker settings boolean parser now also accepts compact/status aliases (`y/n`, `t/f`, `enabled/disabled`) for broader compatibility with legacy setting emitters.
- 2026-02-16 (IST): Worker system-settings key handling now trims and validates global keys before lookup/upsert, preventing malformed whitespace keys from creating divergent rows.
- 2026-02-16 (IST): Worker registry mutation helpers (`updateWorkerHeartbeat`, `setWorkerEnabled`) now explicitly reject unknown runtime worker IDs instead of implicitly falling through to risk-monitoring keys.
- 2026-02-16 (IST): Worker snapshot assembly now degrades to default worker states when global settings lookup fails, so Admin worker visibility remains available during transient settings-read failures.
- 2026-02-16 (IST): Worker registry numeric env parsing now treats blank/sentinel redis TTL settings (`REDIS_POSITIONS_PNL_TTL_SECONDS`, `REDIS_POSITIONS_PNL_MAX_AGE_MS`) as fallback defaults instead of coercing them into minimum clamp values.
- 2026-02-16 (IST): Risk monitoring cron now normalizes monitoring summary counters (`checkedAccounts`, `positionsClosed`, `alertsCreated`, `errors`) to bounded non-negative integers before heartbeat writes and API responses.
- 2026-02-16 (IST): Admin workers `run_once` risk response/heartbeat paths now normalize monitoring summary counters to bounded non-negative integers before serializing API payloads and heartbeat metadata.
- 2026-02-16 (IST): Risk-monitoring lock TTL config parsing in both cron and admin run-once paths now enforces safe bounds (10s minimum, 24h maximum) to avoid runaway lock windows from malformed env values.
- 2026-02-16 (IST): Global worker run-lock helper now clamps direct caller lock TTLs to safe bounds (5s minimum, 24h maximum) to prevent runaway leases outside cron/admin code paths.
- 2026-02-16 (IST): Global worker run-lock parser now accepts ISO-8601 timestamp strings in persisted lock payloads, preventing false lock misses when legacy rows serialize timestamps as date strings.
- 2026-02-16 (IST): Global worker run-lock parser now also unwraps nested lock envelopes (`{ lock: {...} }` / `{ payload: {...} }`) for backward compatibility with legacy serialized lock shapes.
- 2026-02-16 (IST): Global worker run-lock parser now also accepts alias lock fields (`owner`, `acquiredAt`, `expiresAt`, `releasedAt`) in addition to `*AtMs` fields, preserving overlap safety across mixed legacy lock payload formats.
- 2026-02-16 (IST): Global worker run-lock parser now falls back across alias/wrapper candidates when higher-priority fields are malformed, so one bad persisted field no longer masks an otherwise-active lock lease.
- 2026-02-16 (IST): Risk cron/admin error-heartbeat payloads now normalize error messages (trim + whitespace collapse + 256-char bound) before persistence, preventing oversized/garbled failure metadata.
- 2026-02-16 (IST): Admin workers POST action/workerId parsing now trims and case-normalizes incoming tokens (for example ` RUN_ONCE ` / ` RISK_MONITORING `) before validation/dispatch.
- 2026-02-16 (IST): Order/position cron 500 responses now normalize worker error messages (trim + whitespace collapse + 256-char bound) to keep failure payloads readable and bounded.
- 2026-02-16 (IST): Admin workers `toggle` action now accepts boolean aliases (`yes/no`, `1/0`, `on/off`) in addition to strict booleans, with normalized worker/action token parsing before dispatch.
- 2026-02-16 (IST): Admin workers boolean alias parsing now also supports compact/status forms (`y/n`, `t/f`, `enabled/disabled`) for both toggle payloads and position run-once dry-run flags.

