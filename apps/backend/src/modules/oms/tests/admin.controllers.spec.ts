/**
 * @file src/modules/oms/tests/admin.controllers.spec.ts
 * @module oms-tests
 * @description Smoke tests for admin leverage/brokerage controllers
 * @author BharatERP
 * @created 2025-09-25
 */

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminLeverageOverridesController } from '../controllers/admin-leverage.controller';
import { AdminBrokerageRulesController } from '../controllers/admin-brokerage.controller';
import { UserLeverageOverrideEntity } from '../entities/user-leverage-override.entity';
import { BrokerageRuleEntity } from '../entities/brokerage-rule.entity';
import { AppLoggerService } from '../../../shared/logger';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacService } from '../../rbac/rbac.service';

jest.mock('../../../shared/request-context', () => ({
  getRequestContext: () => ({ tenantId: 't1', requestId: 'r1' }),
}));

describe('OMS Admin controllers', () => {
  it('leverage overrides controller constructs and lists', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminLeverageOverridesController],
      providers: [
        { provide: getRepositoryToken(UserLeverageOverrideEntity), useValue: { find: jest.fn().mockResolvedValue([]), create: jest.fn(), save: jest.fn(), findOne: jest.fn(), remove: jest.fn() } as Partial<Repository<UserLeverageOverrideEntity>> },
        AppLoggerService,
        { provide: PermissionsGuard, useValue: { canActivate: jest.fn().mockResolvedValue(true) } },
        { provide: TenantGuard, useValue: { canActivate: jest.fn().mockResolvedValue(true) } },
        { provide: JwtAuthGuard, useValue: { canActivate: jest.fn().mockResolvedValue(true) } },
        { provide: RbacService, useValue: { userHasAllPermissions: async () => true, userHasAnyRole: async () => true } },
      ],
    }).compile();
    const ctrl = moduleRef.get(AdminLeverageOverridesController);
    const list = await ctrl.list();
    expect(list).toEqual([]);
  });

  it('brokerage rules controller constructs and lists', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminBrokerageRulesController],
      providers: [
        { provide: getRepositoryToken(BrokerageRuleEntity), useValue: { find: jest.fn().mockResolvedValue([]), create: jest.fn(), save: jest.fn(), findOne: jest.fn(), remove: jest.fn() } as Partial<Repository<BrokerageRuleEntity>> },
        AppLoggerService,
        { provide: PermissionsGuard, useValue: { canActivate: jest.fn().mockResolvedValue(true) } },
        { provide: TenantGuard, useValue: { canActivate: jest.fn().mockResolvedValue(true) } },
        { provide: JwtAuthGuard, useValue: { canActivate: jest.fn().mockResolvedValue(true) } },
        { provide: RbacService, useValue: { userHasAllPermissions: async () => true, userHasAnyRole: async () => true } },
      ],
    }).compile();
    const ctrl = moduleRef.get(AdminBrokerageRulesController);
    const list = await ctrl.list();
    expect(list).toEqual([]);
  });
});


