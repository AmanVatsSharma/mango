/**
 * File:        apps/backend/src/modules/compliance/tests/compliance.service.spec.ts
 * Module:      compliance
 * Purpose:     Unit tests for ComplianceService — policy management and pre-trade enforcement.
 *
 * Exports: none (Jest test suite)
 *
 * Depends on:
 *   - ComplianceService under test
 *   - DfsaAdapter, FcaAdapter — mocked for adapter dispatch tests
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - enforcePreTrade is a no-op when tenant has no configured policies
 *   - adapter violations are aggregated and thrown as single COMPLIANCE_BREACH
 *   - adapters are dispatched by policy.jurisdictionCode
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { DfsaAdapter } from '../adapters/dfsa.adapter';
import { FcaAdapter } from '../adapters/fca.adapter';
import { CompliancePolicyEntity } from '../entities/compliance-policy.entity';
import { ComplianceService } from '../services/compliance.service';

const TENANT = 'a8ed251a-cdb7-4fac-ab0f-f0a6bd45138a';

const mockDfsa = {
  jurisdictionCode: jest.fn().mockReturnValue('DFSA'),
  enforcePreTrade: jest.fn().mockResolvedValue({ passed: true, violations: [] }),
};

const mockFca = {
  jurisdictionCode: jest.fn().mockReturnValue('FCA'),
  enforcePreTrade: jest.fn().mockResolvedValue({ passed: true, violations: [] }),
};

describe('ComplianceService', () => {
  let service: ComplianceService;
  const repo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceService,
        { provide: getRepositoryToken(CompliancePolicyEntity), useValue: repo },
        { provide: AppLoggerService, useValue: { setContext: jest.fn(), debug: jest.fn() } },
        { provide: DfsaAdapter, useValue: mockDfsa },
        { provide: FcaAdapter, useValue: mockFca },
      ],
    }).compile();
    service = module.get<ComplianceService>(ComplianceService);
    jest.clearAllMocks();
    mockDfsa.jurisdictionCode.mockReturnValue('DFSA');
    mockFca.jurisdictionCode.mockReturnValue('FCA');
  });

  it('upserts policy', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.create.mockReturnValue({ tenantId: TENANT });
    repo.save.mockResolvedValue({ id: 'policy-1', tenantId: TENANT });
    const result = await service.upsertPolicy({
      tenantId: TENANT,
      jurisdictionCode: 'DFSA',
      kycTier: 'BASIC',
      amlRiskLevel: 'LOW',
      sanctionsProvider: 'provider-x',
      suitabilityRules: '{}',
      auditRetentionDays: 365,
    });
    expect(result.id).toBe('policy-1');
  });

  it('enforcePreTrade is a no-op when tenant has no policies', async () => {
    repo.find.mockResolvedValue([]);
    await expect(
      service.enforcePreTrade({ tenantId: TENANT, accountId: 'acct-1', instrumentId: 'inst-1', instrumentType: 'EQUITY', quantity: 10, price: 100 }),
    ).resolves.toBeUndefined();
    expect(mockDfsa.enforcePreTrade).not.toHaveBeenCalled();
  });

  it('dispatches to DFSA adapter when policy jurisdictionCode is DFSA', async () => {
    repo.find.mockResolvedValue([{ jurisdictionCode: 'DFSA' }]);
    mockDfsa.enforcePreTrade.mockResolvedValue({ passed: true, violations: [] });

    await service.enforcePreTrade({
      tenantId: TENANT,
      accountId: 'acct-1',
      instrumentId: 'inst-1',
      instrumentType: 'EQUITY',
      quantity: 10,
      price: 100,
    });

    expect(mockDfsa.enforcePreTrade).toHaveBeenCalledTimes(1);
    expect(mockFca.enforcePreTrade).not.toHaveBeenCalled();
  });

  it('throws COMPLIANCE_BREACH when adapter returns violations', async () => {
    repo.find.mockResolvedValue([{ jurisdictionCode: 'DFSA' }]);
    mockDfsa.enforcePreTrade.mockResolvedValue({
      passed: false,
      violations: ['DFSA: leverage 100:1 exceeds retail cap 30:1'],
    });

    await expect(
      service.enforcePreTrade({
        tenantId: TENANT,
        accountId: 'acct-1',
        instrumentId: 'inst-1',
        instrumentType: 'FX_MAJOR',
        quantity: 100_000,
        price: 1.08,
        leverage: 100,
      }),
    ).rejects.toMatchObject({ code: 'COMPLIANCE_BREACH' });
  });

  it('aggregates violations from multiple adapters', async () => {
    repo.find.mockResolvedValue([{ jurisdictionCode: 'DFSA' }, { jurisdictionCode: 'FCA' }]);
    mockDfsa.enforcePreTrade.mockResolvedValue({ passed: false, violations: ['DFSA violation 1'] });
    mockFca.enforcePreTrade.mockResolvedValue({ passed: false, violations: ['FCA violation 1'] });

    await expect(
      service.enforcePreTrade({
        tenantId: TENANT,
        accountId: 'acct-1',
        instrumentId: 'inst-1',
        instrumentType: 'CRYPTO',
        quantity: 1,
        price: 50000,
        leverage: 10,
      }),
    ).rejects.toMatchObject({
      code: 'COMPLIANCE_BREACH',
      message: expect.stringContaining('DFSA violation 1'),
    });
  });
});
