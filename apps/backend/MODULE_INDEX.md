# Backend Module Index — apps/backend

**Status:** Complete
**Last-updated:** 2026-05-23

---

## Module Registry

| # | Module | Purpose | Key Entities | Key APIs | Consumers |
|---|--------|---------|--------------|----------|-----------|
| 1 | `auth` | JWT/passport authentication, OTP flows, refresh tokens | `RefreshTokenEntity` | `AuthService`, `AuthController`, `AdminAuthController` | All apps |
| 2 | `users` | User accounts, profiles, admin user management | `UserEntity`, `CreateUserDto` | `UsersService`, `UsersController`, `AdminUsersController`, `ProfileController` | broker-admin, frontend |
| 3 | `rbac` | Role-based access control, permissions, roles | `RoleEntity`, `PermissionEntity`, `UserRoleEntity`, `RolePermissionEntity` | `RbacService`, `RbacResolver` | All modules |
| 4 | `accounts` | Trading accounts, cash ledger, positions, withdrawals | `AccountEntity`, `CashLedgerEntry`, `PositionLedgerEntry`, `HoldEntity`, `DailyStatement`, `WithdrawalRequest`, `BankAccount` | `AccountsService`, `AccountsController` | frontend, broker-admin |
| 5 | `oms` | Order Management System — order lifecycle, risk config, margin engine | `OrderEntity`, `ExecutionEntity`, `OrderAuditEntity`, `PositionSnapshotEntity`, `BrokerageRule` | `OrderService`, `RiskConfigService`, `MarginEngineService`, `OmsResolver` | frontend, execution-gateway |
| 6 | `market` | Market data — instruments, watchlists, price feeds | `ExchangeEntity`, `InstrumentEntity`, `WatchlistEntity`, `WatchlistItemEntity` | `InstrumentsService`, `WatchlistsService`, `PriceFeedService` | frontend, broker-admin |
| 7 | `realtime` | WebSocket infrastructure via Prana-stream | (Prana-stream internals) | Socket.io gateway, Redis adapter | frontend |
| 8 | `risk-policy` | Margin & risk limits per broker/account | `RiskPolicyEntity`, `TenantRiskPolicyEntity` | `RiskPolicyService`, `RiskPolicyResolver` | oms, broker-admin |
| 9 | `limits-and-controls` | Exposure limits and limit exceptions | `LimitControlEntity`, `LimitExceptionEntity`, `ExposureLimitEntity` | `LimitsAndControlsService`, `LimitsAndControlsResolver` | oms, broker-admin |
| 10 | `execution-gateway` | Broker/exchange connectivity — routing orders to connectors | `ExecutionConnectorEntity` | `ExecutionGatewayService`, `RouteOrderDto` | oms |
| 11 | `notifications` | Email/SMS/push notifications, templates | `NotificationEntity`, `NotificationPreferenceEntity` | `NotificationService`, `NotificationTemplateService`, `NotificationsResolver` | All modules |
| 12 | `compliance` | KYC, regulatory compliance, surveillance | `CompliancePolicyEntity`, `SurveillanceAlertEntity` | `ComplianceService`, `SurveillanceService`, `ComplianceResolver` | broker-admin |
| 13 | `tenancy` | Multi-tenant setup, brand config, domains | `TenantEntity`, `LegalEntity`, `TenantBrandConfigEntity`, `TenantDomainEntity` | `TenancyService`, `TenancyResolver` | broker-admin |
| 14 | `onboarding` | Broker/sub-broker/client onboarding | `OnboardingProfileEntity` | `OnboardingService`, `OnboardingResolver` | broker-admin |
| 15 | `broker-hierarchy` | IB/sub-broker tree — brokers, branches, desks, dealers | `BrokerEntity`, `BranchEntity`, `DeskEntity`, `DealerEntity`, `HierarchyRoleMapping` | `BrokerHierarchyService`, `BrokerHierarchyResolver` | broker-admin |
| 16 | `dealing` | Dealer terminal — quotes, manual deal entry | `DealEntity`, `DealingQuoteEntity` | `DealingService`, `DealingResolver` | broker-admin |
| 17 | `promotions` | Campaigns, promotional offers | `PromotionEntity` | `PromotionsService`, `PromotionsResolver` | broker-admin |
| 18 | `reports` | Report definitions, analytics | `ReportDefinitionEntity` | `ReportsService`, `ReportsResolver` | broker-admin |
| 19 | `reconciliation` | P&L reconciliation with LP statements | `ReconciliationBreakEntity`, `LPStatementLineEntity` | `ReconciliationService` | broker-admin |
| 20 | `settlement` | Trade settlement jobs | `SettlementJobEntity` | `SettlementService`, `SettlementResolver` | broker-admin |
| 21 | `partners` | Partner management, integrations, payouts | `PartnerEntity`, `PartnerIntegrationEntity` | `PartnersService`, `PartnersResolver` | broker-admin |
| 22 | `copy-trading` | Copy-trading signals and subscriptions | `CopyTradingSignalEntity`, `CopyTradingSubscriptionEntity` | `CopyTradingService`, `CopyTradingResolver` | broker-admin |
| 23 | `pamm` | PAMM (Percent Allocation Management Module) — master/slave accounts | `PammMasterEntity`, `PammSlaveEntity` | `PammService`, `PammResolver` | broker-admin |
| 24 | `crm` | CRM outreach, retention offers | `CrmOutreachEntity`, `CrmRetentionOfferEntity` | `CrmService`, `CrmResolver` | broker-admin |
| 25 | `lp-routing` | Liquidity provider routing | `LPProviderEntity` | `LpRoutingService`, `LpRoutingResolver` | execution-gateway |
| 26 | `rules-engine` | Configurable business rules | `RuleEntity` | `RulesEngineService`, `RulesEngineResolver` | broker-admin |
| 27 | `admin` | Admin dashboard, audit log | — | `AdminDashboardService`, `AdminDashboardController`, `AdminAuditController`, `AdminResolver` | broker-admin |
| 28 | `saas-control-plane` | Multi-tenant SaaS provisioning, broker onboarding, billing placeholders | `TenantProvisioningEntity`, `EntitlementPlanEntity`, `BillingInvoicePlaceholderEntity`, `SupportImpersonationAuditEntity` | `SaasControlPlaneService`, `BrokerOnboardingService` | broker-admin (setup) |
| 29 | `support` | Support tickets and comments | `SupportTicketEntity`, `SupportCommentEntity` | `SupportService`, `SupportResolver` | broker-admin |
| 30 | `demo-accounts` | Demo account provisioning | — | `DemoAccountService`, `DemoAccountsResolver` | frontend |
| 31 | `corporate-actions` | Corporate actions — dividends, splits, mergers | `CorporateActionEntity` | `CorporateActionsService`, `CorporateActionsResolver` | frontend, broker-admin |
| 32 | `developer-platform` | API keys, developer apps, webhook endpoints | `ApiKeyEntity`, `DeveloperAppEntity` | `DeveloperPlatformService`, `DeveloperPlatformResolver` | broker-admin |

---

## Module Dependency Graph

```
auth ──────┬──→ users
          └──→ rbac

users ────┬──→ rbac
         ├──→ accounts
         └──→ onboarding

accounts ──┬──→ oms
           └──→ market

oms ──────┬──→ accounts
         ├──→ risk-policy
         ├──→ limits-and-controls
         ├──→ execution-gateway
         └──→ market

market ────────→ oms
           └──→ broker-admin

realtime ──────→ market
             └──→ notifications

risk-policy ───→ oms
            └──→ accounts

limits-and-controls ───→ oms

execution-gateway ──┬──→ lp-routing
                   └──→ accounts

compliance ──────→ users
             └──→ broker-admin

tenancy ─────────→ users
             └──→ broker-admin

onboarding ──────→ users
              └──→ accounts

broker-hierarchy ───→ accounts
                 └──→ rbac

notifications ────→ users
              └──→ (all modules emit events)

rules-engine ─────→ oms

reconciliation ────→ accounts
               └──→ settlement

settlement ───────→ accounts

copy-trading ─────→ oms
               └──→ accounts

pamm ─────────────→ oms
               └──→ accounts

admin ────────────→ users
              ├──→ accounts
              ├──→ oms
              └──→ compliance

saas-control-plane → tenancy
                 └──→ users
```

---

## Module Classification

### Foundation / Infrastructure (shared across business logic)
- `auth`, `users`, `rbac`, `tenancy`

### Trading Core (order lifecycle)
- `oms`, `accounts`, `market`, `execution-gateway`, `risk-policy`, `limits-and-controls`

### Real-time
- `realtime` (prana-stream Socket.io gateway)

### Broker Operations (broker-admin consumers)
- `admin`, `compliance`, `broker-hierarchy`, `dealing`, `promotions`, `reports`, `reconciliation`, `settlement`, `partners`, `copy-trading`, `pamm`, `crm`, `rules-engine`, `support`, `onboarding`

### Platform / Developer
- `lp-routing`, `developer-platform`, `saas-control-plane`, `demo-accounts`, `corporate-actions`, `notifications`

---

## Module Ownership

**Business Logic modules** — owned by feature team, each should have a `MODULE_DOC.md`:
- `oms`, `accounts`, `market`, `risk-policy`, `execution-gateway`, `compliance`, `broker-hierarchy`, `dealing`, `copy-trading`, `pamm`, `onboarding`

**Infrastructure modules** — owned by platform team:
- `auth`, `users`, `rbac`, `tenancy`, `realtime`, `saas-control-plane`

**Operational modules** — owned by broker-ops:
- `admin`, `notifications`, `reports`, `reconciliation`, `settlement`, `rules-engine`, `support`, `promotions`, `partners`, `crm`, `limits-and-controls`, `lp-routing`, `developer-platform`, `demo-accounts`, `corporate-actions`