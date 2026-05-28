/**
 * @file src/modules/oms/tests/order.service.spec.ts
 * @module oms-tests
 * @description Unit tests for OrderService place() idempotency and margin hold
 * @author BharatERP
 * @created 2025-09-24
 */

import { Test } from '@nestjs/testing';
import { OrderService } from '../services/order.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrderEntity } from '../entities/order.entity';
import { ExecutionEntity } from '../entities/execution.entity';
import { OrderAuditEntity } from '../entities/order-audit.entity';
import { DataSource, Repository } from 'typeorm';
import { RiskConfigService } from '../services/risk-config.service';
import { LedgerService } from '../../accounts/services/ledger.service';
import { AppLoggerService } from '../../../shared/logger';
import { RealtimePublisherService } from '../../realtime/prana-stream/services/realtime-publisher.service';
import { MarginEngineService } from '../services/margin-engine.service';
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

const mockLiveAccount = { id: 'a1', accountType: 'LIVE' as const };
const mockDemoAccount = { id: 'a1', accountType: 'DEMO' as const };

describe('OrderService', () => {
  let service: OrderService;
  let ordersRepo: Repository<OrderEntity>;
  let accountsService: { getById: jest.Mock };
  let exchangeAdapter: { placeOrder: jest.Mock; modifyOrder: jest.Mock; cancelOrder: jest.Mock };
  let demoExchangeAdapter: { placeOrder: jest.Mock; modifyOrder: jest.Mock; cancelOrder: jest.Mock };

  beforeEach(async () => {
    accountsService = { getById: jest.fn().mockResolvedValue(mockLiveAccount) };
    exchangeAdapter = {
      placeOrder: jest.fn().mockResolvedValue({ status: 'ACCEPTED', providerOrderId: 'mock-order' }),
      modifyOrder: jest.fn().mockResolvedValue({ status: 'ACCEPTED', providerOrderId: 'mock-order' }),
      cancelOrder: jest.fn().mockResolvedValue({ status: 'CANCELLED', providerOrderId: 'mock-order' }),
    };
    demoExchangeAdapter = {
      placeOrder: jest.fn().mockResolvedValue({ status: 'ACCEPTED', providerOrderId: 'demo-uuid' }),
      modifyOrder: jest.fn().mockResolvedValue({ status: 'ACCEPTED', providerOrderId: 'mock-order' }),
      cancelOrder: jest.fn().mockResolvedValue({ status: 'CANCELLED', providerOrderId: 'mock-order' }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: DataSource, useValue: { transaction: async (_iso: any, fn: any) => fn({ query: async () => {}, getRepository: (_e: any) => ({ findOne: jest.fn().mockResolvedValue(null), save: jest.fn().mockResolvedValue({ id: 'o1', clientOrderId: 'cli-1', accountId: 'a1' }), create: (x: any) => x }) }) } },
        { provide: getRepositoryToken(OrderEntity), useValue: { create: (x: any) => x, save: jest.fn(), findOne: jest.fn(), count: jest.fn().mockResolvedValue(0) } },
        { provide: getRepositoryToken(ExecutionEntity), useValue: {} },
        { provide: getRepositoryToken(OrderAuditEntity), useValue: {} },
        { provide: RiskConfigService, useValue: { getBuyingPowerMultiplier: jest.fn().mockResolvedValue(1) } },
        { provide: LedgerService, useValue: { createHold: jest.fn(), releaseHold: jest.fn(), postPosition: jest.fn(), postCash: jest.fn() } },
        { provide: RealtimePublisherService, useValue: { publishOrderUpdate: jest.fn() } },
        { provide: EXCHANGE_ADAPTER, useValue: exchangeAdapter },
        { provide: DEMO_EXCHANGE_ADAPTER, useValue: demoExchangeAdapter },
        { provide: AccountsService, useValue: accountsService },
        { provide: NotificationService, useValue: { send: jest.fn() } },
        { provide: MarginEngineService, useValue: { estimate: jest.fn().mockResolvedValue({ totalRequired: '100.00000000', initialMargin: '90', maintenanceMargin: '80', brokerage: '10', buyingPower: '0', canPlace: true, reasons: [], appliedRules: {} }) } },
        { provide: RiskPolicyService, useValue: { enforcePreTrade: jest.fn().mockResolvedValue(undefined) } },
        { provide: LimitsAndControlsService, useValue: { enforcePreTrade: jest.fn().mockResolvedValue(undefined) } },
        { provide: BrokerExchangeConfigService, useValue: { isExchangeEnabledForTenant: jest.fn().mockResolvedValue(true) } },
        { provide: OrderEventsService, useValue: { publish: jest.fn() } },
        AppLoggerService,
      ],
    }).compile();

    service = moduleRef.get(OrderService);
    ordersRepo = moduleRef.get(getRepositoryToken(OrderEntity));
  });

  it('places order with idempotent externalRefId', async () => {
    (ordersRepo.findOne as any).mockResolvedValueOnce(null);
    (ordersRepo.save as any).mockResolvedValueOnce({ id: 'o1', clientOrderId: 'cli-1', accountId: 'a1' });
    const res = await service.place({ accountId: 'a1', instrumentId: 'i1', side: 'BUY', type: 'LIMIT', quantity: '10', price: '10', externalRefId: 'ext1', timeInForce: 'DAY' } as any);
    expect(res).toBeDefined();
    expect(exchangeAdapter.placeOrder).toHaveBeenCalled();
    expect(demoExchangeAdapter.placeOrder).not.toHaveBeenCalled();
  });

  it('uses demo adapter when account is DEMO', async () => {
    accountsService.getById.mockResolvedValueOnce(mockDemoAccount);
    (ordersRepo.findOne as any).mockResolvedValueOnce(null);
    (ordersRepo.save as any).mockResolvedValueOnce({ id: 'o1', clientOrderId: 'cli-1', accountId: 'a1' });
    await service.place({ accountId: 'a1', instrumentId: 'i1', side: 'BUY', type: 'LIMIT', quantity: '10', price: '10', externalRefId: 'ext2', timeInForce: 'DAY' } as any);
    expect(demoExchangeAdapter.placeOrder).toHaveBeenCalled();
    expect(exchangeAdapter.placeOrder).not.toHaveBeenCalled();
  });
});


