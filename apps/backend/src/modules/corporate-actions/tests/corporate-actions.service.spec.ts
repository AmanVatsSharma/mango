/**
 * @file src/modules/corporate-actions/tests/corporate-actions.service.spec.ts
 * @module corporate-actions
 * @description Unit tests for corporate actions service scaffold
 * @author BharatERP
 * @created 2026-02-17
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { CorporateActionEntity } from '../entities/corporate-action.entity';
import { CorporateActionsService } from '../services/corporate-actions.service';

describe('CorporateActionsService', () => {
  let service: CorporateActionsService;
  const repo = { save: jest.fn(), create: jest.fn(), find: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CorporateActionsService,
        { provide: getRepositoryToken(CorporateActionEntity), useValue: repo },
        { provide: AppLoggerService, useValue: { setContext: jest.fn(), debug: jest.fn() } },
      ],
    }).compile();
    service = module.get<CorporateActionsService>(CorporateActionsService);
    jest.clearAllMocks();
  });

  it('creates event', async () => {
    repo.create.mockReturnValue({});
    repo.save.mockResolvedValue({ id: 'action-1' });
    const result = await service.createAction({
      tenantId: '50edbf05-f7f0-4f95-a9d5-141bce0e7471',
      actionType: 'DIVIDEND',
      instrumentId: 'NSE:SBIN',
      effectiveDate: '2026-02-17',
      payload: {},
    });
    expect(result.id).toBe('action-1');
  });
});
