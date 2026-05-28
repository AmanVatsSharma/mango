/**
 * @file src/modules/auth/strategies/jwt.strategy.ts
 * @module auth
 * @description JWT Passport strategy for access tokens
 * @author BharatERP
 * @created 2025-09-18
 * @last-updated 2026-04-24
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET,
      // Pass Express request so we can validate x-tenant-id header vs JWT claim
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: any) {
    const headerTenantId = req.headers?.['x-tenant-id'] as string | undefined;
    // If client sent x-tenant-id, it must match the JWT — prevents header spoofing
    if (headerTenantId && headerTenantId !== payload.tid) {
      throw new UnauthorizedException('Tenant ID mismatch');
    }
    return { userId: payload.sub, tenantId: payload.tid };
  }
}
