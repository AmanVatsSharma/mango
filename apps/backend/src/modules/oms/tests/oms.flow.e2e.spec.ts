/**
 * @file src/modules/oms/tests/oms.flow.e2e.spec.ts
 * @module oms-tests
 * @description End-to-end-like flow test (service-level) for order->hold->execution->positions
 * @author BharatERP
 * @created 2025-09-24
 */

import { Test } from '@nestjs/testing';
import { OrderService } from '../services/order.service';
import { PositionsService } from '../positions/services/positions.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrderEntity } from '../entities/order.entity';
import { ExecutionEntity } from '../entities/execution.entity';
import { OrderAuditEntity } from '../entities/order-audit.entity';
import { PositionLedgerEntryEntity } from '../../accounts/entities/position-ledger-entry.entity';
import { PositionSnapshotEntity } from '../entities/position-snapshot.entity';
import { DataSource } from 'typeorm';
import { RiskConfigService } from '../services/risk-config.service';
import { LedgerService } from '../../accounts/services/ledger.service';
import { AppLoggerService } from '../../../shared/logger';
import { RealtimePublisherService } from '../../realtime/prana-stream/services/realtime-publisher.service';
import { InstrumentsService } from '../../market/services/instruments.service';
import { PriceFeedService } from '../../market/services/price-feed.service';
import { FxService } from '../../../shared/fx/fx.service';
import { MarginEngineService } from '../services/margin-engine.service';
import { BuyingPowerRuleEntity } from '../entities/buying-power-rule.entity';
import { UserLeverageOverrideEntity } from '../entities/user-leverage-override.entity';
import { BrokerageRuleEntity } from '../entities/brokerage-rule.entity';
import { EXCHANGE_ADAPTER } from '../adapters/exchange-adapter';
import { DEMO_EXCHANGE_ADAPTER } from '../adapters/demo-exchange.adapter';
import { AccountsService } from '../../accounts/services/accounts.service';
import { NotificationService } from '../../notifications/services/notification.service';
import { RiskPolicyService } from '../../risk-policy/services/risk-policy.service';
import { LimitsAndControlsService } from '../../limits-and-controls/services/limits-and-controls.service';
import { BrokerExchangeConfigService } from '../../broker-hierarchy/services/broker-exchange-config.service';
import { OrderEventsService } from '../services/order-events.service';

jest.mock('../../../shared/request-context', () => ({
  getRequestContext: () => ({ tenantId: 't1', requestId: 'r1', userId: 'u1' }),
}));

describe('OMS flow', () => {
  it('place -> hold -> execution -> positions', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderService,
        PositionsService,
        MarginEngineService,
        { provide: DataSource, useValue: { transaction: async (_iso: any, fn: any) => fn({ query: async () => {}, getRepository: (_e: any) => ({ findOne: jest.fn().mockResolvedValue(null), save: jest.fn().mockImplementation(async (x:any)=> ({ id: x.id || 'gen', ...x })), create: (x:any)=>x }) }) } },
        { provide: getRepositoryToken(OrderEntity), useValue: { count: jest.fn().mockResolvedValue(0) } },
        { provide: getRepositoryToken(ExecutionEntity), useValue: {} },
        { provide: getRepositoryToken(OrderAuditEntity), useValue: {} },
        { provide: getRepositoryToken(PositionLedgerEntryEntity), useValue: { createQueryBuilder: () => ({ select: ()=>({ addSelect: ()=>({ addSelect: ()=>({ where: ()=>({ groupBy: ()=>({ getRawMany: async ()=> [] }) }) }) }) }) }) } },
        { provide: getRepositoryToken(PositionSnapshotEntity), useValue: {} },
        { provide: getRepositoryToken(BuyingPowerRuleEntity), useValue: { findOne: jest.fn().mockResolvedValue({ multiplier: '2', isActive: true }) } },
        { provide: getRepositoryToken(UserLeverageOverrideEntity), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(BrokerageRuleEntity), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: RiskConfigService, useValue: { getBuyingPowerMultiplier: jest.fn().mockResolvedValue(2) } },
        { provide: LedgerService, useValue: { createHold: jest.fn(), releaseHold: jest.fn(), postPosition: jest.fn(), postCash: jest.fn() } },
        { provide: RealtimePublisherService, useValue: { publishOrderUpdate: jest.fn(), publishAccountUpdate: jest.fn() } },
        { provide: EXCHANGE_ADAPTER, useValue: { placeOrder: jest.fn().mockResolvedValue({ status: 'ACCEPTED', providerOrderId: 'mock-order' }), modifyOrder: jest.fn().mockResolvedValue({ status: 'ACCEPTED', providerOrderId: 'mock-order' }), cancelOrder: jest.fn().mockResolvedValue({ status: 'CANCELLED', providerOrderId: 'mock-order' }) } },
        { provide: DEMO_EXCHANGE_ADAPTER, useValue: { placeOrder: jest.fn().mockResolvedValue({ status: 'ACCEPTED', providerOrderId: 'demo-1' }), modifyOrder: jest.fn().mockResolvedValue({ status: 'ACCEPTED' }), cancelOrder: jest.fn().mockResolvedValue({ status: 'CANCELLED' }) } },
        { provide: AccountsService, useValue: { getById: jest.fn().mockResolvedValue({ id: 'a1', accountType: 'LIVE' }) } },
        { provide: NotificationService, useValue: { send: jest.fn() } },
        { provide: RiskPolicyService, useValue: { enforcePreTrade: jest.fn().mockResolvedValue(undefined) } },
        { provide: LimitsAndControlsService, useValue: { enforcePreTrade: jest.fn().mockResolvedValue(undefined) } },
        { provide: BrokerExchangeConfigService, useValue: { isExchangeEnabledForTenant: jest.fn().mockResolvedValue(true) } },
        { provide: OrderEventsService, useValue: { publish: jest.fn() } },
        { provide: InstrumentsService, useValue: { listByIds: async () => [{ id: 'i1', type: 'EQUITY', exchangeCode: 'NSE', symbol: 'ABC' }] } },
        { provide: PriceFeedService, useValue: { getSnapshot: () => [{ price: 100 }] } },
        { provide: FxService, useValue: { convert: async (x:string)=> x } },
        AppLoggerService,
      ],
    }).compile();

    const orderSvc = moduleRef.get(OrderService);
    const posSvc = moduleRef.get(PositionsService);

    const placed = await orderSvc.place({ accountId: 'a1', instrumentId: 'i1', side: 'BUY', type: 'LIMIT', quantity: '10', price: '10', externalRefId: 'ext-flow-1', timeInForce: 'DAY' } as any);
    expect(placed).toBeDefined();

    const exec = await orderSvc.addExecution({ orderId: placed.id, accountId: 'a1', instrumentId: 'i1', quantity: '5', price: '10', fees: '1', externalRefId: 'exec-1' } as any);
    expect(exec).toBeDefined();

    const positions = await posSvc.listPositions('a1', 'INR');
    expect(positions).toBeDefined();
  });
});


