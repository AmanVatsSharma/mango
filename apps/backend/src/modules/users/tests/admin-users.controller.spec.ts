/**
 * @file src/modules/users/tests/admin-users.controller.spec.ts
 * @module users
 * @description Unit tests for AdminUsersController and UsersService list/get methods
 * @author BharatERP
 * @created 2025-09-24
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AdminUsersController } from '../controllers/admin-users.controller';
import { UsersService } from '../users.service';
import { ListUsersDto } from '../dto/list-users.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';

describe('AdminUsersController', () => {
  let controller: AdminUsersController;
  let service: {
    findAll: jest.Mock;
    findOneOrThrow: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    deactivate: jest.Mock;
    reactivate: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      findOneOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deactivate: jest.fn(),
      reactivate: jest.fn(),
    };

    const moduleBuilder = Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [
        {
          provide: UsersService,
          useValue: service,
        },
      ],
    });

    moduleBuilder
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) });
    moduleBuilder
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) });
    moduleBuilder
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) });

    const module: TestingModule = await moduleBuilder.compile();

    controller = module.get<AdminUsersController>(AdminUsersController);
  });

  it('lists users with pagination', async () => {
    const tenantId = 'TENANT_A';
    const query: ListUsersDto = { page: 2, limit: 10, search: 'john' };
    const response = { data: [], page: 2, limit: 10, total: 0 };
    service.findAll.mockResolvedValue(response);

    const result = await controller.list(tenantId, query);

    expect(service.findAll).toHaveBeenCalledWith(tenantId, query);
    expect(result).toBe(response);
  });

  it('gets one user', async () => {
    const tenantId = 'TENANT_A';
    const userId = 'uuid-1';
    service.findOneOrThrow.mockResolvedValue({ id: userId });

    const result = await controller.getOne(tenantId, userId);

    expect(service.findOneOrThrow).toHaveBeenCalledWith(tenantId, userId);
    expect(result).toEqual({ id: userId });
  });

  it('creates user and enforces tenant from header', async () => {
    const tenantId = 'TENANT_A';
    const dto: any = { tenantId: 'IGNORED', mobileE164: '+911234567890' };
    service.create.mockResolvedValue({ id: 'new', tenantId, mobileE164: '+911234567890' });

    const result = await controller.create(tenantId, { ...dto });

    expect(service.create).toHaveBeenCalledWith({ tenantId, mobileE164: '+911234567890' });
    expect(result).toEqual({ id: 'new', tenantId, mobileE164: '+911234567890' });
  });

  it('updates user', async () => {
    const tenantId = 'TENANT_A';
    const userId = 'uuid-2';
    const dto: any = { email: 'e@x.com' };
    service.update.mockResolvedValue({ id: userId, email: 'e@x.com' });

    const result = await controller.update(tenantId, userId, dto);

    expect(service.update).toHaveBeenCalledWith(userId, dto);
    expect(result).toEqual({ id: userId, email: 'e@x.com' });
  });

  it('deactivates user', async () => {
    const tenantId = 'TENANT_A';
    const userId = 'uuid-3';
    service.deactivate.mockResolvedValue({ id: userId, isActive: false });

    const result = await controller.deactivate(tenantId, userId, 'clean-up');

    expect(service.deactivate).toHaveBeenCalledWith(tenantId, userId, 'clean-up');
    expect(result).toEqual({ id: userId, isActive: false });
  });

  it('reactivates user', async () => {
    const tenantId = 'TENANT_A';
    const userId = 'uuid-4';
    service.reactivate.mockResolvedValue({ id: userId, isActive: true });

    const result = await controller.reactivate(tenantId, userId);

    expect(service.reactivate).toHaveBeenCalledWith(tenantId, userId);
    expect(result).toEqual({ id: userId, isActive: true });
  });
});
