/**
 * @file src/modules/dealing/tests/dealing.service.spec.ts
 * @module dealing
 * @description Unit tests for dealing service scaffold
 * @author BharatERP
 * @created 2026-02-19
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { DealEntity } from '../entities/deal.entity';
import { DealingService } from '../services/dealing.service';

describe('DealingService', () => {
  let service: DealingService;
  const repo = { save: jest.fn(), create: jest.fn(), find: jest.fn(), findOne: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DealingService,
        { provide: getRepositoryToken(DealEntity), useValue: repo },
        { provide: AppLoggerService, useValue: { setContext: jest.fn(), debug: jest.fn() } },
      ],
    }).compile();
    service = module.get<DealingService>(DealingService);
    jest.clearAllMocks();
  });

  it('creates deal', async () => {
    repo.create.mockReturnValue({});
    repo.save.mockResolvedValue({ id: 'deal-1' });
    const result = await service.createDeal({
      tenantId: '50edbf05-f7f0-4f95-a9d5-141bce0e7471',
      instrumentId: 'NSE:SBIN',
      side: 'BUY',
      quantity: '100',
      price: '750.50',
      metadata: '{}',
    });
    expect(result.id).toBe('deal-1');
  });

  it('returns deal status', async () => {
    repo.findOne.mockResolvedValue({ id: 'deal-1', status: 'PENDING' });
    const result = await service.getDealStatus('deal-1');
    expect(result).toEqual({ id: 'deal-1', status: 'PENDING' });
  });
});
