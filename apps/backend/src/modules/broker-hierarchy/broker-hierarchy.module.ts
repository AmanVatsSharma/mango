/**
 * File:        apps/backend/src/modules/broker-hierarchy/broker-hierarchy.module.ts
 * Module:      broker-hierarchy
 * Purpose:     Broker hierarchy (branches, desks, dealers, IB trees) plus per-broker
 *              exchange access control and broker business metrics aggregation.
 *
 * Exports:
 *   - BrokerHierarchyService      — hierarchy CRUD
 *   - IbCommissionService         — IB commission rules and ledger
 *   - BrokerExchangeConfigService — isExchangeEnabled() used by OMS
 *   - BrokerMetricsService        — AUM / client-count / revenue / health metrics
 *
 * Depends on:
 *   - SharedModule        — AppLoggerService (global)
 *   - RbacModule         — role-based access for hierarchy assignment
 *   - AccountsModule     — CashLedgerEntryEntity for AUM aggregation
 *   - SettlementModule   — SettlementJobEntity for revenue aggregation
 *   - UsersModule       — countActiveByTenant() for client count
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - BrokerExchangeConfigService is exported so OmsModule can inject it
 *   - BrokerMetricsService is exported so SaasControlPlaneModule can call it after onboarding
 *
 * Read order:
 *   1. @Module declaration
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-10
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../../shared/shared.module';
import { RbacModule } from '../rbac/rbac.module';
import { AccountsModule } from '../accounts/accounts.module';
import { SettlementModule } from '../settlement/settlement.module';
import { UsersModule } from '../users/users.module';
import { BrokerHierarchyController } from './controllers/broker-hierarchy.controller';
import { AdminHierarchyController } from './controllers/admin-hierarchy.controller';
import { ClientGroupEntity } from './entities/client-group.entity';
import { BranchEntity } from './entities/branch.entity';
import { BrokerEntity } from './entities/broker.entity';
import { DealerEntity } from './entities/dealer.entity';
import { DeskEntity } from './entities/desk.entity';
import { HierarchyRoleMappingEntity } from './entities/hierarchy-role-mapping.entity';
import { IbRelationshipEntity } from './entities/ib-relationship.entity';
import { IbCommissionRuleEntity } from './entities/ib-commission-rule.entity';
import { IbCommissionLedgerEntity } from './entities/ib-commission-ledger.entity';
import { BrokerExchangeConfigEntity } from './entities/broker-exchange-config.entity';
import { BrokerMetricsEntity } from './entities/broker-metrics.entity';
import { BrokerHierarchyService } from './services/broker-hierarchy.service';
import { IbCommissionService } from './services/ib-commission.service';
import { BrokerExchangeConfigService } from './services/broker-exchange-config.service';
import { BrokerMetricsService } from './services/broker-metrics.service';
import { BrokerHierarchyResolver } from './broker-hierarchy.resolver';
import { CashLedgerEntryEntity } from '../accounts/entities/cash-ledger-entry.entity';
import { SettlementJobEntity } from '../settlement/entities/settlement-job.entity';

@Module({
  imports: [
    SharedModule,
    RbacModule,
    AccountsModule,
    SettlementModule,
    UsersModule,
    TypeOrmModule.forFeature([
      BrokerEntity,
      BranchEntity,
      DeskEntity,
      DealerEntity,
      HierarchyRoleMappingEntity,
      IbRelationshipEntity,
      IbCommissionRuleEntity,
      IbCommissionLedgerEntity,
      BrokerExchangeConfigEntity,
      BrokerMetricsEntity,
      ClientGroupEntity,
      CashLedgerEntryEntity,
      SettlementJobEntity,
    ]),
  ],
  controllers: [BrokerHierarchyController, AdminHierarchyController],
  providers: [BrokerHierarchyService, IbCommissionService, BrokerExchangeConfigService, BrokerMetricsService, BrokerHierarchyResolver],
  exports: [BrokerHierarchyService, IbCommissionService, BrokerExchangeConfigService, BrokerMetricsService],
})
export class BrokerHierarchyModule {}
