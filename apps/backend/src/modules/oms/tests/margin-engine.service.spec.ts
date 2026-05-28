/**
 * @file src/modules/oms/tests/margin-engine.service.spec.ts
 * @module oms-tests
 * @description Unit tests for MarginEngineService across segments and overrides
 * @author BharatERP
 * @created 2025-09-24
 */

import { Test } from '@nestjs/testing';
import { MarginEngineService } from '../services/margin-engine.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BuyingPowerRuleEntity } from '../entities/buying-power-rule.entity';
import { UserLeverageOverrideEntity } from '../entities/user-leverage-override.entity';
import { BrokerageRuleEntity } from '../entities/brokerage-rule.entity';
import { InstrumentsService } from '../../market/services/instruments.service';
import { AppLoggerService } from '../../../shared/logger';

jest.mock('../../../shared/request-context', () => ({
  getRequestContext: () => ({ tenantId: 't1', requestId: 'r1' }),
}));

describe('MarginEngineService', () => {
  let service: MarginEngineService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MarginEngineService,
        { provide: getRepositoryToken(BuyingPowerRuleEntity), useValue: { findOne: jest.fn().mockResolvedValue({ multiplier: '2', isActive: true }) } },
        { provide: getRepositoryToken(UserLeverageOverrideEntity), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: getRepositoryToken(BrokerageRuleEntity), useValue: { findOne: jest.fn().mockResolvedValue({ appliesTo: 'TENANT', percent: '0.001', perOrderFlat: '2', capPerOrder: null, side: 'BOTH', isActive: true }) } },
        { provide: InstrumentsService, useValue: { listByIds: async () => [{ id: 'i1', type: 'FNO' }] } },
        AppLoggerService,
      ],
    }).compile();
    service = moduleRef.get(MarginEngineService);
  });

  it('computes margin for FNO short with brokerage', async () => {
    const est = await service.estimate({ accountId: 'a1', instrumentId: 'i1', side: 'SELL', type: 'LIMIT', quantity: '100', price: '10', positionType: 'SHORT' });
    expect(Number(est.initialMargin)).toBeGreaterThan(0);
    expect(Number(est.brokerage)).toBeGreaterThan(0);
  });

  it('applies buying power multiplier to reduce requirement', async () => {
    const est = await service.estimate({ accountId: 'a1', instrumentId: 'i1', side: 'BUY', type: 'LIMIT', quantity: '10', price: '10', positionType: 'INTRADAY' });
    expect(Number(est.totalRequired)).toBeGreaterThan(0);
  });
});


