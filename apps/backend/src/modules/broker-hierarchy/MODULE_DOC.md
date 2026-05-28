---
title: Broker Hierarchy Module
created: 2026-02-17
maintainer: BharatERP
---

## Purpose
Scaffolds the multi-level broker organization model and delegation flow:
platform-owner -> broker-admin -> dealer.

## Entities
- BrokerEntity
- BranchEntity
- DeskEntity
- DealerEntity
- HierarchyRoleMappingEntity

## APIs
- POST /broker-hierarchy/brokers
- POST /broker-hierarchy/branches
- POST /broker-hierarchy/desks
- POST /broker-hierarchy/dealers
- POST /broker-hierarchy/roles
- GET /broker-hierarchy/tenant/:tenantId

## Dependencies
- Shared logger
- TypeORM
- Tenancy tenant identifiers

## Flow
1. Broker is created under a tenant.
2. Branch and desk nodes create operational hierarchy.
3. Dealers are mapped to desks.
4. Role mappings define delegated capabilities.

## Env
- BROKER_HIERARCHY_ENABLED=true

## Tests
- Unit test scaffold in `tests/broker-hierarchy.service.spec.ts`.

## Changelog
- 2026-02-17 IST: Added broker hierarchy scaffolding with entities, DTOs, service/controller flows, tests, and module documentation.
- 2026-05-09 IST: Added BrokerHierarchyService.findBrokerByCode(tenantId, brokerCode) and listAllBrokers(). Added PlatformOwnerGuard on POST /broker-hierarchy/brokers. Other endpoints retain tenant-scoped PermissionsGuard.
