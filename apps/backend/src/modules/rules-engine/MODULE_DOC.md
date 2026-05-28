# Rules Engine Module

Short: Tenant-scoped automation rules — define trigger events, condition chains, and action sequences for broker admin workflows.

Purpose: Allows broker admins to create event-driven automation rules without code. Each rule specifies: an event trigger, zero-or-more AND-chained conditions, and one-or-more actions to execute when conditions match.

Files:
```
rules-engine/
  entities/rule.entity.ts       — RuleEntity (automation_rules table)
  dtos/rule.dto.ts             — CreateRuleDto, UpdateRuleDto, RuleConditionDto, RuleActionDto
  services/rules-engine.service.ts — RulesEngineService (CRUD + toggle)
  controllers/rules-engine.controller.ts — RulesEngineController (REST endpoints)
  rules-engine.module.ts       — NestJS module
  MODULE_DOC.md                — this file
```

Entities:
- **RuleEntity** (automation_rules table): id, tenant_id, name, description, trigger_event, conditions (JSONB), actions (JSONB), status (active|inactive), priority, execution_count, last_triggered_at, created_at, updated_at

Flow:
1. A consuming service (e.g. OMS, Positions, Accounts) emits a domain event matching a registered trigger_event.
2. RulesEngineService queries all active rules for the tenant whose trigger_event matches.
3. Each rule's conditions (JSONB AND-chain) are evaluated against the event payload.
4. If all conditions pass, the rule's actions (JSONB array) are executed sequentially.
5. execution_count is incremented and last_triggered_at is updated atomically.

Trigger event names (consumed from calling services):
- `order.placed` — new order submitted
- `order.filled` — order fully or partially executed
- `order.cancelled` — order cancelled by user or system
- `position.opened` — new position opened
- `position.closed` — position closed (manual or stop-loss)
- `account.deposit` — funds deposited
- `account.withdrawal` — funds withdrawn
- Additional events may be registered as the module expands.

Actions (what a rule can do when triggered):
- `send_notification` — send a notification to a user or role
- `emit_event` — re-publish a synthetic event
- `webhook` — call an external HTTP endpoint
- Action schema is extensible via the JSONB actions column.

Who uses rules-engine:
- **OMS** — order lifecycle events (order.placed, order.filled, order.cancelled) drive order-related rules
- Other modules (Positions, Accounts) publish events and are hooked in as needed

Public Routes:
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /admin/rules | JwtAuthGuard + TenantGuard + PermissionsGuard(oms:admin) | List all rules |
| POST | /admin/rules | JwtAuthGuard + TenantGuard + PermissionsGuard(oms:admin) | Create a rule |
| GET | /admin/rules/:id | JwtAuthGuard + TenantGuard + PermissionsGuard(oms:admin) | Get one rule |
| PATCH | /admin/rules/:id | JwtAuthGuard + TenantGuard + PermissionsGuard(oms:admin) | Update a rule |
| DELETE | /admin/rules/:id | JwtAuthGuard + TenantGuard + PermissionsGuard(oms:admin) | Delete a rule |
| POST | /admin/rules/:id/toggle | JwtAuthGuard + TenantGuard + PermissionsGuard(oms:admin) | Toggle active/inactive |

Data Model:
- **automation_rules** table: id, tenant_id, name, description, trigger_event, conditions (JSONB), actions (JSONB), status, priority, execution_count, last_triggered_at, created_at, updated_at

Env vars:
- none specific currently; event bus / webhook proxy env vars to be added when async dispatch is wired

Tests: unit tests for condition evaluation (AND-chain), action execution ordering, and tenant isolation.

Change-log:
| Date | Change |
|------|--------|
| 2026-05-16 | Initial implementation — entity, service, controller, MODULE_DOC |
| 2026-05-23 | Expanded module doc — added ENTITIES, FLOW, trigger event names, action types, and consumer relationships (OMS, Positions, Accounts). |
