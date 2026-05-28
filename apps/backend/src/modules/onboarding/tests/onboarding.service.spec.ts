/**
 * @file src/modules/onboarding/tests/onboarding.service.spec.ts
 * @module onboarding
 * @description Unit tests for onboarding profile service scaffold
 * @author BharatERP
 * @created 2026-02-17
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { OnboardingProfileEntity } from '../entities/onboarding-profile.entity';
import { OnboardingService } from '../services/onboarding.service';

describe('OnboardingService', () => {
  let service: OnboardingService;
  const repo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: getRepositoryToken(OnboardingProfileEntity), useValue: repo },
        { provide: AppLoggerService, useValue: { setContext: jest.fn(), debug: jest.fn() } },
      ],
    }).compile();
    service = module.get<OnboardingService>(OnboardingService);
    jest.clearAllMocks();
  });

  it('upserts onboarding profile', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.create.mockReturnValue({ userId: 'user-1' });
    repo.save.mockResolvedValue({ id: 'profile-1', userId: 'user-1' });

    const result = await service.upsertProfile({
      tenantId: 'ca4bc58f-92ec-417a-82f1-9a391cca9ea5',
      userId: 'f5913c2f-5ec3-4eb0-b4ed-3502c7004514',
      countryCode: 'IN',
      kycTier: 'BASIC',
      status: 'PENDING',
      amlFlags: {},
    });

    expect(result.id).toBe('profile-1');
  });
});
