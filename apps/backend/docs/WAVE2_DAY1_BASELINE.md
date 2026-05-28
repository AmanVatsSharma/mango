# Wave-2 Day-1 Baseline Ledger

Legend: `[x] scaffolded` `[~] partial` `[ ] pending`

## Surfaces
- [x] `apps/mobile` (Expo-style shell)
- [x] `apps/dealer-workstation`
- [x] `apps/support-ops`
- [x] `apps/ib-portal`
- [x] `apps/developer-portal`
- [x] `apps/public-site`
- [x] `apps/desktop-pro`

## Shared Client Libraries
- [x] `libs/mobile-ui-kit`
- [x] `libs/mobile-auth`
- [x] `libs/mobile-api-client`
- [x] `libs/web-shell`
- [x] `libs/desktop-shell`

## New Backend Domains
- [x] `dealing`
- [x] `support`
- [x] `partners`
- [x] `developer-platform`

## Connectivity and Scale Scaffolds
- [x] `shared/messaging`
- [x] `shared/outbox`
- [x] `shared/resilience`
- [x] `shared/cache`
- [x] Realtime scale coordinator stub

## Deployability Scaffolds
- [x] AWS Terraform skeleton (`infra/aws/terraform`)
- [x] Helm chart skeleton (`deploy/helm`)
- [x] API edge contracts doc
- [x] AWS deployment baseline doc

## Security and Governance Baseline
- [x] Guard baseline added on new controller surfaces (JWT + Tenant + Permissions)
- [x] Audit envelope hooks added for sensitive placeholder flows
- [x] CI includes connector + developer platform contract checks
- [x] CI includes mobile lint and desktop smoke step

## Hardening Backlog (next layers)
- [ ] Real API gateway + WAF + edge auth policies
- [ ] Real Kafka publisher/consumer wiring for outbox worker
- [ ] Real partner payout workflows and maker-checker approvals
- [ ] Real support impersonation policy + immutable audit sink
- [ ] Real mobile runtime stack (`@nx/expo` + native build targets)
- [ ] Real desktop runtime stack (Electron/Tauri packaging and updates)
