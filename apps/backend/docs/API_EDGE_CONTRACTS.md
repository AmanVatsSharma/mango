# API Edge Contracts

## Scope
Canonical contracts for API edge layer: REST and GraphQL boundaries, request/response shapes, and versioning.

## REST Contracts
- **Transactional endpoints** (orders, auth, funds): JSON request/response with DTO validation.
- **Versioning**: `Accept: application/vnd.obsidian.v1+json` or path prefix `/api/v1/`.
- **Idempotency**: `Idempotency-Key` header for POST/PUT where applicable.

## GraphQL Contracts
- **Dashboards & aggregation**: Positions, reporting, watchlist.
- **Schema versioning**: Via schema hash or `@deprecated` directives.
- **Pagination**: Relay-style cursors (`first`, `after`, `pageInfo`).

## Shared Concerns
- **requestId**: All responses include `X-Request-Id` for correlation.
- **Tenant isolation**: `X-Tenant-Id` or JWT claims; never trust client-supplied tenant.
- **Rate limiting**: Per-tenant and per-user limits at edge.

## Integration Path
1. Edge gateway validates DTOs and attaches requestId.
2. Controllers delegate to services; services enforce tenant context.
3. Exception filter maps domain errors to HTTP status codes.
