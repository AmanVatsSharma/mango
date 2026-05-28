# `components/admin-v2/` — National-Grade B-Book Admin Console (v2)

## Status: Phase 1 — Foundation (in progress)

This module is the **parallel v2 shell** for the admin console redesign. v1 (`components/admin-console/`) is left **completely untouched** for the entire build; v2 ships under `/admin-v2/` behind the `ADMIN_V2_ALLOWLIST` env-var, then graduates to a percentage-based feature flag in Phase 17.

See the full plan at `~/.claude/plans/see-go-and-analyse-reactive-stallman.md` and tracking beads via `TaskList`.

## Directory Layout

```
components/admin-v2/
  primitives/      Reusable building blocks (DataTable, Drawer, KpiTile, StatusPill, etc.)
                   Thin wrappers around shadcn/Radix + TanStack Table/Virtual + Vaul.
                   See primitives/README.md for the full inventory + per-primitive notes.

  power/           Power-user fabric — Cmd+K palette, keyboard shortcut registry, cheatsheet.
                   Mounted globally inside the v2 layout.

  shell/           v2 layout pieces (sidebar, header). Replaces v1's components/admin-console/{sidebar,header}.tsx
                   without touching the v1 originals.

  client-360/      [Phase 2] Canonical client surface — page + drawer twin, lazy-loaded tabs.
  clients/         [Phase 2] Clients list view.
  crm/             [Phase 4] Single canonical CRM panels (notes, tasks, quick-note).
  compliance/      [Phase 3] Compliance Workbench (KYC anti-fraud queue).
  rm/              [Phase 5] RM workbench (org tree, roster, leaderboard).
  command-centre/  [Phase 6] Trade Command Centre v2.

  (Phase 8+ B-book modules: house/, bonuses/, affiliates/, comms/, surveillance/, team/, reports/, observability/)
```

## Conventions

- Every file starts with the project header (`@file`, `@module`, `@description`, `@author`, `@created`).
- Every file is `"use client"` unless it's a server component (most v2 components are client; lists fetch via SWR).
- No `console.log` — use the Pino logger from `lib/logger.ts` for server-side; client-side errors go through `react-error-boundary`.
- Async/await only.
- Functions ≤ ~40 lines.
- All timestamps shown in IST.
- All admin reads aggregate via existing `/api/admin/...` endpoints (REST or GraphQL); v2 introduces no parallel API tree until a new contract is genuinely needed.

## Reuse Rule

If the same UI element appears in two places **inside v2**, consolidate it into `primitives/` immediately — never accumulate duplicates. The v1↔v2 boundary is the **only** place where duplication is expected (and intentional, per the v2-parallel safety posture).

## Cutover (Phase 17)

When v2 reaches 100% traffic for ≥ 30 days with zero open P1/P2 bugs, Phase 18 deletes `components/admin-console/` and the v1 routes wholesale. Until then, **no v1 file is to be modified or deleted by v2 work**.
