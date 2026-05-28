/**
 * @file src/modules/partners/tests/partners.service.spec.ts
 * @module partners
 * @description Unit tests for partners service scaffold
 * @author BharatERP
 * @created 2026-02-19
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { PartnerEntity } from '../entities/partner.entity';
import { PartnersService } from '../services/partners.service';

describe('PartnersService', () => {
  let service: PartnersService;
  const repo = { save: jest.fn(), create: jest.fn(), find: jest.fn(), findOne: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartnersService,
        { provide: getRepositoryToken(PartnerEntity), useValue: repo },
        { provide: AppLoggerService, useValue: { setContext: jest.fn(), debug: jest.fn() } },
      ],
    }).compile();
    service = module.get<PartnersService>(PartnersService);
    jest.clearAllMocks();
  });

  it('creates partner', async () => {
    repo.create.mockReturnValue({});
    repo.save.mockResolvedValue({ id: 'partner-1' });
    const result = await service.createPartner({
      tenantId: '50edbf05-f7f0-4f95-a9d5-141bce0e7471',
      name: 'Acme Corp',
      code: 'ACME',
      metadata: '{}',
    });
    expect(result.id).toBe('partner-1');
  });

  it('returns partner status', async () => {
    repo.findOne.mockResolvedValue({ id: 'partner-1', status: 'PENDING' });
    const result = await service.getPartnerStatus('partner-1');
    expect(result).toEqual({ id: 'partner-1', status: 'PENDING' });
  });
});
