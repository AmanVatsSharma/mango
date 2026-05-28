/**
 * @file src/modules/tenancy/tests/tenancy.service.spec.ts
 * @module tenancy
 * @description Unit tests for tenancy service scaffold flows
 * @author BharatERP
 * @created 2026-02-17
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { LegalEntityEntity } from '../entities/legal-entity.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { TenantBrandConfigEntity } from '../entities/tenant-brand-config.entity';
import { TenantDomainEntity } from '../entities/tenant-domain.entity';
import { TenancyService } from '../services/tenancy.service';

describe('TenancyService', () => {
  let service: TenancyService;
  const tenantsRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };
  const legalRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };
  const brandConfigRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((x: any) => x),
    save: jest.fn().mockImplementation(async (x: any) => ({ id: 'bc-1', ...x })),
  };
  const domainsRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenancyService,
        { provide: getRepositoryToken(TenantEntity), useValue: tenantsRepo },
        { provide: getRepositoryToken(LegalEntityEntity), useValue: legalRepo },
        { provide: getRepositoryToken(TenantBrandConfigEntity), useValue: brandConfigRepo },
        { provide: getRepositoryToken(TenantDomainEntity), useValue: domainsRepo },
        { provide: DataSource, useValue: { transaction: async (_iso: any, fn: any) => fn({ query: async () => {}, getRepository: () => ({ findOne: jest.fn(), create: jest.fn(), save: jest.fn() }) }) } },
        { provide: AppLoggerService, useValue: { setContext: jest.fn(), debug: jest.fn() } },
      ],
    }).compile();

    service = module.get<TenancyService>(TenancyService);
    jest.clearAllMocks();
  });

  it('creates a tenant scaffold', async () => {
    tenantsRepo.findOne.mockResolvedValue(null);
    tenantsRepo.create.mockReturnValue({ code: 'demo-tenant' });
    tenantsRepo.save.mockResolvedValue({ id: 'tenant-1', code: 'demo-tenant' });

    const result = await service.createTenant({
      code: 'demo-tenant',
      displayName: 'Demo Tenant',
    });

    expect(result.id).toBe('tenant-1');
    expect(tenantsRepo.save).toHaveBeenCalled();
  });
});
