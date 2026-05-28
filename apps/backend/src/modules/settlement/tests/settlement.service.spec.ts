/**
 * @file src/modules/settlement/tests/settlement.service.spec.ts
 * @module settlement
 * @description Unit tests for settlement service scaffold
 * @author BharatERP
 * @created 2026-02-17
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { SettlementJobEntity } from '../entities/settlement-job.entity';
import { SettlementService } from '../services/settlement.service';

describe('SettlementService', () => {
  let service: SettlementService;
  const repo = { save: jest.fn(), create: jest.fn(), find: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementService,
        { provide: getRepositoryToken(SettlementJobEntity), useValue: repo },
        { provide: AppLoggerService, useValue: { setContext: jest.fn(), debug: jest.fn() } },
      ],
    }).compile();
    service = module.get<SettlementService>(SettlementService);
    jest.clearAllMocks();
  });

  it('creates settlement job', async () => {
    repo.create.mockReturnValue({});
    repo.save.mockResolvedValue({ id: 'job-1' });
    const result = await service.createJob({
      tenantId: '5a393c63-2809-4f5e-ad12-dd08e14f4f78',
      accountId: 'f685ebde-e98e-473d-b8e4-6ce61dcb0132',
      tradeDate: '2026-02-17',
      amount: '100',
      currency: 'USD',
    });
    expect(result.id).toBe('job-1');
  });
});
