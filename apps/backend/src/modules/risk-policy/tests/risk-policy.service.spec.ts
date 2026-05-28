/**
 * @file src/modules/risk-policy/tests/risk-policy.service.spec.ts
 * @module risk-policy
 * @description Unit tests for risk policy service scaffold
 * @author BharatERP
 * @created 2026-02-17
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { RiskPolicyEntity } from '../entities/risk-policy.entity';
import { TenantRiskPolicyEntity } from '../entities/tenant-risk-policy.entity';
import { TenantEntity } from '../../tenancy/entities/tenant.entity';
import { RiskPolicyService } from '../services/risk-policy.service';

describe('RiskPolicyService', () => {
  let service: RiskPolicyService;
  const policiesRepo = { save: jest.fn(), create: jest.fn(), find: jest.fn() };
  const assignmentsRepo = { save: jest.fn(), create: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskPolicyService,
        { provide: getRepositoryToken(RiskPolicyEntity), useValue: policiesRepo },
        { provide: getRepositoryToken(TenantRiskPolicyEntity), useValue: assignmentsRepo },
        { provide: getRepositoryToken(TenantEntity), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
        { provide: DataSource, useValue: { transaction: async (_iso: any, fn: any) => fn({ query: async () => {}, getRepository: () => ({ findOne: jest.fn(), create: jest.fn(), save: jest.fn() }) }) } },
        { provide: AppLoggerService, useValue: { setContext: jest.fn(), debug: jest.fn() } },
      ],
    }).compile();
    service = module.get<RiskPolicyService>(RiskPolicyService);
    jest.clearAllMocks();
  });

  it('creates policy', async () => {
    policiesRepo.create.mockReturnValue({ policyName: 'default' });
    policiesRepo.save.mockResolvedValue({ id: 'policy-1', policyName: 'default' });
    const result = await service.createPolicy({
      tenantId: '9f7b2f5d-b4a5-4f90-a6a5-f157f36f01f8',
      jurisdictionCode: 'IN',
      policyName: 'default',
      maxLeverage: '5',
      maxOrderNotional: '1000000',
      restrictedProducts: [],
      sanctionsCheckRequired: true,
    });
    expect(result.id).toBe('policy-1');
  });
});
