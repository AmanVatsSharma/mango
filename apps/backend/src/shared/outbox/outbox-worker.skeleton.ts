/**
 * @file src/shared/outbox/outbox-worker.skeleton.ts
 * @module shared/outbox
 * @description Outbox worker — polls PENDING messages and publishes via IMessagePublisher.
 *              Runs on a 5-second interval. Each tick processes up to 10 messages.
 * @author BharatERP
 * @created 2026-02-19
 * @last-updated 2026-04-24
 *
 * Key invariants:
 *   - Uses MESSAGE_PUBLISHER token (currently Redis, Kafka in Phase 4)
 *   - Failed publish → status = FAILED with retry count incremented
 *   - Published → status = PUBLISHED; message no longer re-processed
 */

import { Inject, Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { AppLoggerService } from '../logger';
import { OutboxService } from './outbox.service';
import { IMessagePublisher } from '../messaging/publisher.interface';
import { MESSAGE_PUBLISHER } from '../messaging/messaging.module';

@Injectable()
export class OutboxWorkerSkeleton implements OnModuleInit, OnModuleDestroy {
  private intervalId?: NodeJS.Timeout;

  constructor(
    private readonly outbox: OutboxService,
    @Inject(MESSAGE_PUBLISHER) private readonly publisher: IMessagePublisher,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(OutboxWorkerSkeleton.name);
  }

  async onModuleInit(): Promise<void> {
    this.logger.debug('Outbox worker started');
    this.intervalId = setInterval(() => void this.tick(), 5000);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.logger.debug('Outbox worker stopped');
  }

  private async tick(): Promise<void> {
    try {
      const pending = await this.outbox.fetchPending(10);
      for (const msg of pending) {
        try {
          await this.publisher.publish(msg.topic, {
            timestamp: new Date().toISOString(),
            tenantId: msg.tenantId ?? undefined,
            payload: msg.payload,
          });
          await this.outbox.markPublished(msg.id);
          this.logger.debug('Outbox published', { id: msg.id, topic: msg.topic });
        } catch (publishErr) {
          await this.outbox.markFailed(msg.id, (publishErr as Error)?.message ?? 'unknown');
          this.logger.error('Outbox publish failed', `id=${msg.id} ${(publishErr as Error)?.stack ?? ''}`);
        }
      }
    } catch (err) {
      this.logger.error('Outbox tick error', (err as Error)?.stack);
    }
  }
}
