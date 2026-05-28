/**
 * @file src/modules/auth/guards/jwt-auth.guard.ts
 * @module auth
 * @description Guard wrapping passport-jwt strategy
 * @author BharatERP
 * @created 2025-09-18
 */

import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
