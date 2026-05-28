/**
 * @file src/modules/accounts/tests/accounts.controller.spec.ts
 * @module accounts
 * @description Unit tests for AccountsController disable/enable endpoints
 * @author BharatERP
 * @created 2025-09-24
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AccountsController } from '../controllers/accounts.controller';
import { AccountsService } from '../services/accounts.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { AppLoggerService } from '../../../shared/logger';

describe('AccountsController', () => {
  let controller: AccountsController;
  let service: { disableAccount: jest.Mock; enableAccount: jest.Mock };

  beforeEach(async () => {
    service = {
      disableAccount: jest.fn(),
      enableAccount: jest.fn(),
    } as any;

    const moduleBuilder = Test.createTestingModule({
      controllers: [AccountsController],
      providers: [
        { provide: AccountsService, useValue: service },
        { provide: AppLoggerService, useValue: { setContext: jest.fn(), debug: jest.fn() } },
      ],
    });

    moduleBuilder.overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true });
    moduleBuilder.overrideGuard(TenantGuard).useValue({ canActivate: () => true });
    moduleBuilder.overrideGuard(PermissionsGuard).useValue({ canActivate: () => true });

    const module: TestingModule = await moduleBuilder.compile();
    controller = module.get<AccountsController>(AccountsController);
  });

  it('disables account', async () => {
    const id = 'acc-1';
    service.disableAccount.mockResolvedValue({ id, status: 'DISABLED' });
    const result = await controller.disable(id);
    expect(service.disableAccount).toHaveBeenCalledWith(id);
    expect(result).toEqual({ id, status: 'DISABLED' });
  });

  it('enables account', async () => {
    const id = 'acc-2';
    service.enableAccount.mockResolvedValue({ id, status: 'ACTIVE' });
    const result = await controller.enable(id);
    expect(service.enableAccount).toHaveBeenCalledWith(id);
    expect(result).toEqual({ id, status: 'ACTIVE' });
  });
});
