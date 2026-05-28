/**
 * @file src/modules/oms/oms.module.ts
 * @module oms
 * @description OMS module for risk configuration and buying power rules
 * @author BharatERP
 * @created 2025-09-19
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../../shared/shared.module';
import { BuyingPowerRuleEntity } from './entities/buying-power-rule.entity';
import { RiskConfigService } from './services/risk-config.service';
import { OrderEntity } from './entities/order.entity';
import { ExecutionEntity } from './entities/execution.entity';
import { OrderAuditEntity } from './entities/order-audit.entity';
import { PositionSnapshotEntity } from './entities/position-snapshot.entity';
import { OrderService } from './services/order.service';
import { OrdersController } from './controllers/orders.controller';
import { AdminRiskController } from './controllers/oms-admin-risk.controller';
import { AdminLeverageOverridesController } from './controllers/admin-leverage.controller';
import { AdminBrokerageRulesController } from './controllers/admin-brokerage.controller';
import { AdminOrdersController } from './controllers/admin-orders.controller';
import { MarginEngineService } from './services/margin-engine.service';
import { BrokerageRuleEntity } from './entities/brokerage-rule.entity';
import { UserLeverageOverrideEntity } from './entities/user-leverage-override.entity';
import { MarginController } from './controllers/margin.controller';
import { AccountsModule } from '../accounts/accounts.module';
import { forwardRef } from '@nestjs/common';
import { OrderEventsService } from './services/order-events.service';
import { PositionsModule } from './positions/positions.module';
import { RbacModule } from '../rbac/rbac.module';
import { PranaStreamModule } from '../realtime/prana-stream/prana-stream.module';
import { MarketModule } from '../market/market.module';
import { EXCHANGE_ADAPTER, OmsExecutionGatewayAdapter } from './adapters/exchange-adapter';
import {
  DEMO_EXCHANGE_ADAPTER,
  DemoExchangeAdapter,
} from './adapters/demo-exchange.adapter';
import { ExecutionGatewayModule } from '@obsidian/backend-execution-gateway';
import { RiskPolicyModule } from '@obsidian/backend-risk-policy';
import { LimitsAndControlsModule } from '@obsidian/backend-limits-controls';
import { BrokerHierarchyModule } from '../broker-hierarchy/broker-hierarchy.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OmsResolver } from './oms.resolver';

@Module({
  imports: [
    SharedModule,
    RbacModule,
    PranaStreamModule,
    MarketModule,
    ExecutionGatewayModule,
    RiskPolicyModule,
    LimitsAndControlsModule,
    BrokerHierarchyModule,
    NotificationsModule,
    forwardRef(() => AccountsModule),
    TypeOrmModule.forFeature([
      BuyingPowerRuleEntity,
      OrderEntity,
      ExecutionEntity,
      OrderAuditEntity,
      PositionSnapshotEntity,
      BrokerageRuleEntity,
      UserLeverageOverrideEntity,
    ]),
    PositionsModule,
  ],
  controllers: [OrdersController, AdminRiskController, MarginController, AdminLeverageOverridesController, AdminBrokerageRulesController, AdminOrdersController],
  providers: [
    RiskConfigService,
    OrderService,
    MarginEngineService,
    OrderEventsService,
    OmsResolver,
    { provide: EXCHANGE_ADAPTER, useClass: OmsExecutionGatewayAdapter },
    { provide: DEMO_EXCHANGE_ADAPTER, useClass: DemoExchangeAdapter },
  ],
  // BrokerExchangeConfigService is exported from BrokerHierarchyModule and injected into OrderService
  exports: [RiskConfigService, OrderService, MarginEngineService, OrderEventsService, TypeOrmModule],
})
export class OmsModule {}


