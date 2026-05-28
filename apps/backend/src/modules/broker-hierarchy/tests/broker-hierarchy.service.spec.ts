/**
 * @file src/modules/broker-hierarchy/tests/broker-hierarchy.service.spec.ts
 * @module broker-hierarchy
 * @description Unit tests for broker hierarchy service scaffold
 * @author BharatERP
 * @created 2026-02-17
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { BranchEntity } from '../entities/branch.entity';
import { BrokerEntity } from '../entities/broker.entity';
import { DealerEntity } from '../entities/dealer.entity';
import { DeskEntity } from '../entities/desk.entity';
import { HierarchyRoleMappingEntity } from '../entities/hierarchy-role-mapping.entity';
import { BrokerHierarchyService } from '../services/broker-hierarchy.service';

describe('BrokerHierarchyService', () => {
  let service: BrokerHierarchyService;
  const repoMock = () => ({
    save: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
  });
  const brokersRepo = repoMock();
  const branchesRepo = repoMock();
  const desksRepo = repoMock();
  const dealersRepo = repoMock();
  const mappingsRepo = repoMock();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrokerHierarchyService,
        { provide: getRepositoryToken(BrokerEntity), useValue: brokersRepo },
        { provide: getRepositoryToken(BranchEntity), useValue: branchesRepo },
        { provide: getRepositoryToken(DeskEntity), useValue: desksRepo },
        { provide: getRepositoryToken(DealerEntity), useValue: dealersRepo },
        { provide: getRepositoryToken(HierarchyRoleMappingEntity), useValue: mappingsRepo },
        { provide: AppLoggerService, useValue: { setContext: jest.fn(), debug: jest.fn() } },
      ],
    }).compile();

    service = module.get<BrokerHierarchyService>(BrokerHierarchyService);
    jest.clearAllMocks();
  });

  it('creates broker node', async () => {
    brokersRepo.create.mockReturnValue({ brokerCode: 'broker-1' });
    brokersRepo.save.mockResolvedValue({ id: 'b1', brokerCode: 'broker-1' });
    const result = await service.createBroker({
      tenantId: '1097ed20-d8b0-43f3-897a-e5a5f9d2282d',
      brokerCode: 'broker-1',
      displayName: 'Broker 1',
    });
    expect(result.id).toBe('b1');
  });
});
