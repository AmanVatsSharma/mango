# Referral service module

## Purpose

Enterprise referral attribution (`ReferralAttribution`), milestone rules, reward evaluation on approved deposits, and console/admin surfaces.

## Changelog

- **2026-04-03**: Admin referrals UI simplified — two tabs (Program setup / Activity); setup checklist; form-based new rule packages; shadcn `Select` + pagination + `search` query on `GET attributions` & `GET rewards` (clientId/email); cancel reward via `Dialog`. Panels: `components/admin-console/referrals/*`.

- **2026-04-02 (batches 2–4)**: `referral-admin-audit` → `TradingLog` for reward cancel, program PATCH, rule set create. `getReferralAdminSummary`, `GET /api/admin/referrals/summary`; enriched attributions (qualified deposits, KYC, reward chips); `cancelReferralReward` + `PATCH /api/admin/referrals/rewards/[rewardId]`. Admin UI: overview KPIs, columns, cancel. User dashboard: stats, `attributedAt`, reward detail + labels; `GET/PATCH /api/console/referral/settings` slim payload includes `programRules`. Prisma: `showRulesToUsers`, `showBonusAmountsToUsers`, `publicRulesNotice` on `ReferralProgramSettings`. `PATCH` rule-sets `[id]` and milestone-rules `[id]`; admin milestone table; user rules cards. Mirrored in `tradingpro-platform`.

- **2026-04-01**: Initial module — `referral-attribution`, `referral-invite-url`, `referral-reward-evaluator`, `referral-user-dashboard`, `referral-admin-service`; console + admin APIs; RBAC `admin.referrals.read` / `admin.referrals.manage`. Milestone evaluation hooks `AdminFundService.approveDeposit` only (excludes `admin_credit`). KYC gate via `ReferralProgramSettings.requireKycApprovedForPayout`.

## Fraud / KYC notes

- Only **COMPLETED** deposits with methods outside `admin_credit` count toward milestones.
- When **require KYC approved for payout** is on, rewards stay **ELIGIBLE** until the beneficiary’s KYC is **APPROVED**; the next qualifying deposit approval re-runs payout attempts for **PENDING/ELIGIBLE** rows on that attribution.
