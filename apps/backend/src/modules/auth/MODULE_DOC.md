# Module: auth

Short: Mobile-first authentication with SMS OTP (SNS) and JWT tokens.

Purpose: Authenticate users via E.164 mobile numbers; issue access/refresh tokens with rotation.

Files:
- auth.module.ts — Nest module
- auth.controller.ts — HTTP controller
- auth.service.ts — Business logic
- entities/ — DB entities (refresh_tokens)
- dto/ — request DTOs (request/verify otp, refresh)
- strategies/ — passport jwt strategy
- MODULE_DOC.md — this file

Flow diagram: `flowcharts/auth-flow.svg`

Dependencies: users module, shared logger, AWS SNS

APIs:
- POST /auth/otp/request — request OTP
- POST /auth/otp/verify — verify OTP and return tokens
- POST /auth/refresh — rotate refresh token
- POST /auth/me — protected: current principal
- Admin (JWT + Tenant + RBAC):
  - GET /admin/auth/users/:userId/sessions — list sessions (ip, userAgent, deviceInfo, createdAt, lastUsedAt, expires, revoked)
  - POST /admin/auth/users/:userId/sessions/revoke — revoke one
  - POST /admin/auth/users/:userId/sessions/revoke-all — revoke all

Filters:
- Admin list accepts optional query: `ipAddress`, `userAgent`, `deviceInfo`.
- User history: GET /auth/sessions/history?limit=10 (default 10, max 100).

Env vars:
- JWT_ACCESS_SECRET, JWT_ACCESS_TTL
- JWT_REFRESH_SECRET, JWT_REFRESH_TTL
- AWS_REGION, AWS_SNS_SENDER_ID (optional)

Tests: Skipped per instruction

Change-log:
- 2025-09-18 IST: Initial scaffold
- 2025-09-19 IST: Added SMS via AWS SNS wrapper; JWT strategy; refresh token rotation; TOTP 2FA endpoints; tenant fallback via subdomain; rate limiting
- 2025-09-19 IST: Hardened auth — enforced TOTP during OTP verify for 2FA users; strengthened refresh rotation with revoked/expiry checks and tenantId preservation; secured RBAC admin endpoints with JwtAuthGuard
- 2025-09-24 IST: Session management admin endpoints; sessions include ipAddress, userAgent, deviceInfo, createdAt; user.lastLoginAt updated on OTP verify
- 2025-09-24 IST: Added filters for admin sessions and user history endpoint
- 2026-02-17 IST: Refactored controller async flows to async/await, hardened refresh-token decode/validation, and added module `index.ts` for Nx domain boundaries.
- 2026-05-18: Updated "NestTrade" to "Obsidian" branding throughout.
