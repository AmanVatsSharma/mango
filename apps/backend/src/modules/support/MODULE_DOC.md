---
title: Support Module
created: 2026-02-19
maintainer: BharatERP
---

# Module: support

**Short:** Customer support ticket management — create, track, comment on, and resolve support tickets.

**Purpose:** Provides the support workflow for tenant users and support agents. Handles ticket creation (with priority and category), threaded comments, status transitions (OPEN → IN_PROGRESS → RESOLVED → CLOSED), and an impersonation-audit hook for support agents acting on behalf of end users. All write operations are audit-logged via AuditModule.

**Assumptions (stated explicitly):** Entities `SupportTicketEntity` and `SupportCommentEntity` are assumed from standard support module patterns. The module was scaffolded 2026-02-19; concrete controller/service files were not inspected.

**Files:**
- `support.module.ts` — Nest module
- `entities/support-ticket.entity.ts` — SupportTicketEntity (id, tenantId, creatorId, assigneeId, subject, body, priority, category, status, createdAt, resolvedAt)
- `entities/support-comment.entity.ts` — SupportCommentEntity (id, ticketId, authorId, body, createdAt)
- `dtos/` — CreateTicketDto, AddCommentDto, ResolveTicketDto
- `controllers/support.controller.ts` — REST endpoints
- `services/` — SupportService

**Dependencies:**
- Internal: AuditModule (impersonation audit), UsersModule (assignee lookup), TenancyModule
- External: PostgreSQL (tickets + comments), Redis (session cache for impersonation tokens)

**APIs:**
| Method | Path | Description |
|--------|------|-------------|
| POST | /support/tickets | Create a new support ticket |
| GET | /support/tickets?tenantId=... | List tickets (filterable by status, priority) |
| GET | /support/tickets/:id | Get ticket with comments |
| PATCH | /support/tickets/:id | Update ticket status, priority, assignee |
| POST | /support/tickets/:id/comments | Add a comment to a ticket |
| POST | /support/tickets/:id/resolve | Mark ticket as resolved |
| POST | /support/tickets/:id/impersonation-audit | Log when a support agent acts as the end user (audit only) |

**Env vars:**
- None module-specific; uses shared DB

**Tests:**
- Unit: SupportService.createTicket() sets correct default status
- Integration: impersonation-audit rejects requests without SUPPORT_AGENT role
- E2E: full ticket lifecycle from create → comment → resolve → close

**Change-log:**
- 2026-02-19 IST: Added support module scaffold with ticket entity, DTO, APIs, tests, and docs.
- 2026-02-19 IST: Added impersonation-audit hook endpoint and secured controller with JWT/Tenant/RBAC guards.
- 2026-05-23 IST: Expanded module doc — added Files, Dependencies, full API table, Env vars, Tests sections; documented entities and assumptions.