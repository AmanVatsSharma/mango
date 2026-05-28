/**
 * @file src/modules/auth/tests/auth.controller.sessions.spec.ts
 * @module auth
 * @description Unit tests for AuthController session endpoints
 * @author BharatERP
 * @created 2025-09-24
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

describe('AuthController sessions', () => {
  let controller: AuthController;
  let service: { listSessions: jest.Mock };

  beforeEach(async () => {
    service = { listSessions: jest.fn() } as any;
    const moduleBuilder = Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: service }],
    });
    moduleBuilder.overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true });
    const module: TestingModule = await moduleBuilder.compile();
    controller = module.get<AuthController>(AuthController);
  });

  it('returns history with default limit', async () => {
    const rows = Array.from({ length: 20 }).map((_, i) => ({ tokenId: `jti-${i}` }));
    service.listSessions.mockResolvedValue(rows);
    const result = await controller.history({ user: { userId: 'u1' } } as any, {} as any);
    expect(service.listSessions).toHaveBeenCalledWith('u1');
    expect(result).toHaveLength(10);
  });
});


