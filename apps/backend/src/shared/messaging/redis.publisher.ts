/**
 * @file src/shared/messaging/redis.publisher.ts
 * @module shared/messaging
 * @description IMessagePublisher implementation backed by Redis Pub/Sub.
 *              Interim transport until Kafka is wired in Phase 4.
 * @author BharatERP
 * @created 2026-04-24
 *
 * Exports:
 *   - RedisPublisher — implements IMessagePublisher, injected via MESSAGE_PUBLISHER token
 *
 * Depends on:
 *   - RedisService (SharedModule) — for the ioredis client
 *
 * Side-effects:
 *   - Redis PUBLISH on each outbox message
 *
 * Key invariants:
 *   - If Redis client is unavailable, publish is a no-op (logs warning, does not throw)
 *   - Channel name = topic (e.g. "obsidian.orders.placed")
 */

import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { AppLoggerService } from '../logger';
import { IMessagePublisher } from './publisher.interface';
import { MessageEnvelope, PublishOptions } from './messaging-contracts';

@Injectable()
export class RedisPublisher implements IMessagePublisher {
  constructor(
    private readonly redis: RedisService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(RedisPublisher.name);
  }

  async publish<T>(topic: string, payload: MessageEnvelope<T>, _options?: PublishOptions): Promise<void> {
    const client = this.redis.getClient();
    if (!client) {
      this.logger.warn(`RedisPublisher: no client, skipping publish to ${topic}`);
      return;
    }
    await client.publish(topic, JSON.stringify(payload));
    this.logger.debug(`RedisPublisher: published to ${topic}`);
  }

  async publishBatch<T>(
    topic: string,
    payloads: MessageEnvelope<T>[],
    options?: PublishOptions,
  ): Promise<void> {
    for (const payload of payloads) {
      await this.publish(topic, payload, options);
    }
  }
}
