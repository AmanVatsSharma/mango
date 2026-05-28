/**
 * @file src/modules/limits-and-controls/tests/limits-and-controls.service.spec.ts
 * @module limits-and-controls
 * @description Unit tests for limits-and-controls service scaffold
 * @author BharatERP
 * @created 2026-02-17
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { LimitControlEntity } from '../entities/limit-control.entity';
import { LimitExceptionEntity } from '../entities/limit-exception.entity';
import { TenantEntity } from '../../tenancy/entities/tenant.entity';
import { LimitsAndControlsService } from '../services/limits-and-controls.service';

describe('LimitsAndControlsService', () => {
  let service: LimitsAndControlsService;
  const controls = { save: jest.fn(), create: jest.fn(), find: jest.fn() };
  const exceptions = { save: jest.fn(), create: jest.fn(), find: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LimitsAndControlsService,
        { provide: getRepositoryToken(LimitControlEntity), useValue: controls },
        { provide: getRepositoryToken(LimitExceptionEntity), useValue: exceptions },
        { provide: getRepositoryToken(TenantEntity), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: AppLoggerService, useValue: { setContext: jest.fn(), debug: jest.fn() } },
      ],
    }).compile();
    service = module.get<LimitsAndControlsService>(LimitsAndControlsService);
    jest.clearAllMocks();
  });

  it('creates control', async () => {
    controls.create.mockReturnValue({});
    controls.save.mockResolvedValue({ id: 'limit-1' });
    const result = await service.createControl({
      tenantId: '19e5c270-1a2c-4342-8f87-b6a69f7485f0',
      controlType: 'MAX_ORDER_NOTIONAL',
      scopeType: 'TENANT',
      scopeValue: 'all',
      threshold: '100000',
      enabled: true,
    });
    expect(result.id).toBe('limit-1');
  });
});
