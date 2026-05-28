/**
 * @file src/modules/realtime/prana-stream/guards/ws-jwt.guard.ts
 * @module realtime/prana-stream
 * @description WebSocket guard verifying JWT and attaching user context
 * @author BharatERP
 * @created 2025-09-24
 */

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { AppLoggerService } from '../../../../shared/logger';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(WsJwtGuard.name);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient<Socket>();
    const token = this.extractToken(client);
    if (!token) throw new UnauthorizedException('Missing token');
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      // Attach user to handshake auth for downstream usage
      client.handshake.auth = {
        ...(client.handshake.auth || {}),
        userId: payload.sub,
        tenantId: payload.tid,
      } as any;
      return true;
    } catch (e) {
      this.logger.warn('WS token verification failed');
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractToken(client: Socket): string | undefined {
    const header = client.handshake.headers['authorization'];
    if (header && header.startsWith('Bearer ')) return header.slice(7);
    const fromAuth = (client.handshake.auth as any)?.token as string | undefined;
    return fromAuth;
  }
}


