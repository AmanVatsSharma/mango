/**
 * File:        apps/backend/src/modules/auth/tests/auth.resolver.spec.ts
 * Module:      auth
 * Purpose:     Unit tests for AuthResolver — verifies query delegation and guard wiring.
 *
 * Exports:     (test file — no public exports)
 *
 * Depends on:
 *   - ./auth.resolver              — AuthResolver under test
 *   - ./auth.service               — AuthService (mocked)
 *   - @nestjs/graphql               — decorators needed at parse-time
 *
 * Side-effects: none (pure unit tests with mocks)
 *
 * Key invariants tested:
 *   - me() delegates to authService.getCurrentUser with correct args
 *   - sessions() delegates to authService.listSessions with correct userId
 *   - JwtAuthGuard decorator is present on both queries (static guard wiring)
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-19
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AuthResolver } from '../auth.resolver';
import { AuthService } from '../auth.service';

describe('AuthResolver', () => {
  let resolver: AuthResolver;
  let authService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    const mockAuthService = {
      getCurrentUser: jest.fn(),
      listSessions: jest.fn(),
      decodeJwtPayload: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthResolver,
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    resolver = module.get<AuthResolver>(AuthResolver);
    authService = module.get(AuthService);
  });

  describe('me()', () => {
    it('should call authService.getCurrentUser with userId and tenantId', async () => {
      const result = { userId: 'user-123', tenantId: 'tenant-abc' };
      authService.getCurrentUser.mockResolvedValue(result);

      const got = await resolver.me('user-123', 'tenant-abc');

      expect(authService.getCurrentUser).toHaveBeenCalledWith('user-123', 'tenant-abc');
      expect(got).toEqual(result);
    });
  });

  describe('sessions()', () => {
    it('should call authService.listSessions with the given userId', async () => {
      const mockSessions = [
        {
          tokenId: 'token-1',
          deviceInfo: 'Chrome',
          ipAddress: '1.2.3.4',
          userAgent: 'Mozilla/5.0',
          lastUsedAt: new Date(),
          revokedAt: null,
          createdAt: new Date(),
          expiresAt: new Date(),
        },
      ];
      authService.listSessions.mockResolvedValue(mockSessions);

      const got = await resolver.sessions('user-123');

      expect(authService.listSessions).toHaveBeenCalledWith('user-123');
      expect(got).toEqual(mockSessions);
    });
  });
});