<!--
MODULE_DOC.md
Module: lib/surveillance
Purpose: Internal fraud surveillance engine — five alert-only rules, nightly batch, event hooks, admin queue.
Last-updated: 2026-04-30
-->

## Overview

This module implements **Phase 13b — Internal Surveillance**. It monitors for five classes of suspicious behaviour and emits `HouseSurveillanceAlert` rows that admin operators triage through `/admin-v2/surveillance`.

**Single-writer rule** (advisor-locked, non-negotiable): rules create alerts only. They do not mutate `ClientWinnerControl.rung`, `BonusGrant.status`, or any other module's live state. Operators act on findings through the matching workbench (Phase 9 winner control, Phase 10 bonus engine, etc.).

## Architecture

```
Event hooks (withdrawal, order fill)
    → event-dispatcher.ts
        → rule evaluator (heavy-hitter, suspicious-winner)
            → writer.ts (upsert by @@unique[ruleKey, dedupeKey])

Nightly CRON (or manual batch trigger from admin-v2)
    → batch-runner.ts
        → rule evaluators (coordinated-trading, multi-account, bonus-abuse)
            → writer.ts
```

## Rules (Phase 13b)

| Key | Trigger | Detects |
|-----|---------|---------|
| `HEAVY_HITTER` | Post-order-fill event | User's trailing-window notional > minNotional AND > multiplier × prior window |
| `SUSPICIOUS_WINNER` | Post-withdrawal-queue event | Winner-control rung escalated within windowHours before withdrawal |
| `COORDINATED_TRADING` | Nightly batch | N+ accounts same symbol/side/window cluster |
| `MULTI_ACCOUNT` | Nightly batch | Shared IP / network key / device across ≥ minClusterSize users |
| `BONUS_ABUSE` | Nightly batch | Active grant with ≥ minTurnoverPct progress AND ≥ 50% wash-trade round-trips |

`LATENCY_ARB` is deferred to Phase 13b.5 (tracked as `Trading-gqj`) pending `Order.quoteTickAt` field.

## dedupeKey — the dedupe contract

Every evaluator produces a **deterministic** `dedupeKey`. The `@@unique([ruleKey, dedupeKey])` constraint in the Prisma schema turns duplicate evidence from repeat batch runs into a no-op upsert. The key must be stable across runs for the same real-world event.

| Rule | dedupeKey |
|------|-----------|
| HEAVY_HITTER | `${userId}:${windowBucket}` where `windowBucket = floor(windowStart/windowMs)` |
| SUSPICIOUS_WINNER | `${withdrawalId}` |
| COORDINATED_TRADING | `cluster:${symbol}\|${side}\|${bucket}` |
| MULTI_ACCOUNT | `${dimension}:${value}` (e.g. `ipFingerprint:192.168.1.100`) |
| BONUS_ABUSE | `${grantId}` |

## Status preservation on re-fire

`writer.ts` deliberately does **not** update `status` on the upsert path. A dismissed alert re-fires only to update `confidenceScore`, `message`, and `evidence`. The operator's decision is preserved. Auto-reopen would create an inescapable noise loop.

## Admin tuning

Each rule has a `SurveillanceRule` DB row. Admins can adjust:
- `baseConfidence` — the floor confidence score passed to evaluators.
- `severity` — the default severity label on new alerts.
- `isActive` — gate toggle; inactive rules skip evaluation.
- `params` — free-form JSON; merged with per-rule DEFAULTS at evaluation time.

Changes take effect immediately for new alerts. Past alerts retain their snapshotted params (the `evidence` JSON is self-contained).

## File index

| File | Role |
|------|------|
| `types.ts` | Shared contracts: `RuleKey`, `RuleFireResult`, `SurveillanceEvaluator`, DTOs |
| `writer.ts` | Single write point: `persistFires` + `autoDismissLowConfidence` |
| `event-dispatcher.ts` | Fire-and-forget hooks called from order worker + withdrawal service |
| `batch-runner.ts` | Nightly CRON entry; iterates BATCH_RULE_REGISTRY |
| `queue-service.ts` | Admin queue: list + KPIs + status transitions (assign/dismiss/resolve) |
| `seed.ts` | Seeds/upserts the 5 `SurveillanceRule` rows; safe to re-run |
| `rules/registry.ts` | `EVENT_RULE_REGISTRY` and `BATCH_RULE_REGISTRY` maps |
| `rules/heavy-hitter.ts` | `evaluateHeavyHitter` |
| `rules/suspicious-winner.ts` | `evaluateSuspiciousWinner` |
| `rules/coordinated-trading.ts` | `evaluateCoordinatedTrading` |
| `rules/multi-account.ts` | `evaluateMultiAccount` |
| `rules/bonus-abuse.ts` | `evaluateBonusAbuse` |

## Tests

`tests/surveillance/`:
- `writer.test.ts` — idempotency, re-fire updates but not status, dismissed-stays-dismissed.
- `rules.test.ts` — happy-path fire, no-fire gate, dedupeKey determinism per rule.
- `queue-service.test.ts` — KPI tile semantics (open/highSeverity/unassigned/resolvedToday), row DTO shape, status transitions.
