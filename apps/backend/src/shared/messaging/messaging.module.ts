/**
 * @file src/shared/messaging/messaging.module.ts
 * @module shared/messaging
 * @description Global messaging module providing IMessagePublisher backed by Redis Pub/Sub.
 *              Phase 4 upgrade path: swap RedisPublisher for KafkaPublisher by changing the
 *              useClass below — all consumers stay the same.
 * @author BharatERP
 * @created 2026-02-19
 * @last-updated 2026-04-24
 *
 * Exports:
 *   - MESSAGE_PUBLISHER token (IMessagePublisher) — injectable anywhere in the app
 *   - RedisPublisher                               — concrete Redis pub/sub implementation
 *
 * Key invariants:
 *   - If REDIS_URL is not set, publisher is a no-op (development safety net)
 *   - Each message is JSON-serialised; consumers must deserialise from the channel
 */

import { Global, Module } from '@nestjs/common';
import { SharedModule } from '../shared.module';
import { RedisPublisher } from './redis.publisher';

export const MESSAGE_PUBLISHER = 'IMessagePublisher';

@Global()
@Module({
  imports: [SharedModule],
  providers: [
    RedisPublisher,
    { provide: MESSAGE_PUBLISHER, useClass: RedisPublisher },
  ],
  exports: [MESSAGE_PUBLISHER],
})
export class MessagingModule {}
