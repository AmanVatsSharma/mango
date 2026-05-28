/**
 * @file src/modules/realtime/prana-stream/gateway/prana-stream.gateway.ts
 * @module realtime/prana-stream
 * @description Socket.IO gateway exposing unified realtime stream endpoint
 * @author BharatERP
 * @created 2025-09-24
 */

import {
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AppLoggerService } from '../../../../shared/logger';
import { SubscriptionRegistryService } from '../services/subscription-registry.service';
import { WsJwtGuard } from '../guards/ws-jwt.guard';
import { RealtimeAggregatorService } from '../services/realtime-aggregator.service';

type SubscribePayload = {
  watchlist?: Array<{ exchange: string; symbol: string }>;
  orders?: boolean;
  positions?: boolean;
  accounts?: boolean;
};

@WebSocketGateway({ namespace: '/ws/prana', cors: { origin: '*' } })
@UseGuards(WsJwtGuard)
export class PranaStreamGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly logger: AppLoggerService,
    private readonly subs: SubscriptionRegistryService,
    private readonly aggregator: RealtimeAggregatorService,
  ) {
    this.logger.setContext(PranaStreamGateway.name);
  }

  handleConnection(client: Socket): void {
    const userId = (client.handshake.auth?.userId as string) || '';
    client.join(`user:${userId}`);
    this.logger.debug('client connected', { userId, id: client.id });
    this.aggregator.bindServer(this.server);
    this.aggregator.recomputeMarketSubscriptions().catch(() => undefined);
  }

  handleDisconnect(client: Socket): void {
    const userId = (client.handshake.auth?.userId as string) || '';
    this.subs.removeAll(client.id);
    this.logger.debug('client disconnected', { userId, id: client.id });
    this.aggregator.recomputeMarketSubscriptions().catch(() => undefined);
  }

  @SubscribeMessage('subscribe')
  async subscribe(client: Socket, @MessageBody() payload: SubscribePayload) {
    const userId = (client.handshake.auth?.userId as string) || '';
    const tenantId = (client.handshake.auth?.tenantId as string) || '';
    await this.subs.apply(client.id, userId, payload);
    await this.aggregator.recomputeMarketSubscriptions();
    const snapshots = await this.aggregator.getSnapshots(userId, tenantId, payload);
    if (snapshots) client.emit('snapshot', snapshots);
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe')
  async unsubscribe(client: Socket, @MessageBody() payload: SubscribePayload) {
    const userId = (client.handshake.auth?.userId as string) || '';
    await this.subs.remove(client.id, payload);
    await this.aggregator.recomputeMarketSubscriptions();
    return { ok: true };
  }
}


