/**
 * @file src/modules/auth/tests/admin-auth.controller.spec.ts
 * @module auth
 * @description Unit tests for AdminAuthController
 * @author BharatERP
 * @created 2025-09-24
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AdminAuthController } from '../controllers/admin-auth.controller';
import { AuthService } from '../auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { TenantGuard } from '../../rbac/guards/tenant.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';

describe('AdminAuthController', () => {
  let controller: AdminAuthController;
  let service: {
    listSessions: jest.Mock;
    revokeSession: jest.Mock;
    revokeAllSessions: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      listSessions: jest.fn(),
      revokeSession: jest.fn(),
      revokeAllSessions: jest.fn(),
    };

    const moduleBuilder = Test.createTestingModule({
      controllers: [AdminAuthController],
      providers: [
        { provide: AuthService, useValue: service },
      ],
    });

    moduleBuilder.overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true });
    moduleBuilder.overrideGuard(TenantGuard).useValue({ canActivate: () => true });
    moduleBuilder.overrideGuard(PermissionsGuard).useValue({ canActivate: () => true });

    const module: TestingModule = await moduleBuilder.compile();
    controller = module.get<AdminAuthController>(AdminAuthController);
  });

  it('lists user sessions', async () => {
    service.listSessions.mockResolvedValue([{ tokenId: 'jti-1' }]);
    const result = await controller.listUserSessions('user-1', {} as any);
    expect(service.listSessions).toHaveBeenCalledWith('user-1', {} as any);
    expect(result).toEqual([{ tokenId: 'jti-1' }]);
  });

  it('revokes a specific session', async () => {
    service.revokeSession.mockResolvedValue({ revoked: true });
    const result = await controller.revokeUserSession('user-1', { tokenId: 'jti-1' });
    expect(service.revokeSession).toHaveBeenCalledWith('user-1', 'jti-1');
    expect(result).toEqual({ revoked: true });
  });

  it('revokes all sessions', async () => {
    service.revokeAllSessions.mockResolvedValue({ revoked: 2 });
    const result = await controller.revokeAllUserSessions('user-1');
    expect(service.revokeAllSessions).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ revoked: 2 });
  });
});
