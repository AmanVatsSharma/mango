/**
 * @file src/modules/developer-platform/tests/developer-platform.service.spec.ts
 * @module developer-platform
 * @description Unit tests for developer platform service scaffold
 * @author BharatERP
 * @created 2026-02-19
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { ApiKeyEntity } from '../entities/api-key.entity';
import { DeveloperPlatformService } from '../services/developer-platform.service';

describe('DeveloperPlatformService', () => {
  let service: DeveloperPlatformService;
  const repo = { save: jest.fn(), create: jest.fn(), find: jest.fn(), findOne: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeveloperPlatformService,
        { provide: getRepositoryToken(ApiKeyEntity), useValue: repo },
        { provide: AppLoggerService, useValue: { setContext: jest.fn(), debug: jest.fn() } },
      ],
    }).compile();
    service = module.get<DeveloperPlatformService>(DeveloperPlatformService);
    jest.clearAllMocks();
  });

  it('creates api key', async () => {
    repo.create.mockReturnValue({});
    repo.save.mockResolvedValue({ id: 'key-1' });
    const result = await service.createApiKey({
      tenantId: '50edbf05-f7f0-4f95-a9d5-141bce0e7471',
      appId: 'app-123',
      keyPrefix: 'nt_',
      scopes: ['read:orders'],
    });
    expect(result.id).toBe('key-1');
  });

  it('returns api key status', async () => {
    repo.findOne.mockResolvedValue({ id: 'key-1', status: 'ACTIVE' });
    const result = await service.getApiKeyStatus('key-1');
    expect(result).toEqual({ id: 'key-1', status: 'ACTIVE' });
  });
});
