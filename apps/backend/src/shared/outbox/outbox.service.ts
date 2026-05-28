/**
 * @file src/shared/outbox/outbox.service.ts
 * @module shared/outbox
 * @description Outbox service skeleton for transactional message publishing
 * @author BharatERP
 * @created 2026-02-19
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '../logger';
import { OutboxEntity } from './entities/outbox.entity';

@Injectable()
export class OutboxService {
  constructor(
    @InjectRepository(OutboxEntity)
    private readonly repo: Repository<OutboxEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(OutboxService.name);
  }

  /**
   * Append a message to the outbox (call within transaction).
   */
  async append(
    topic: string,
    payload: Record<string, unknown>,
    tenantId?: string | null,
  ): Promise<OutboxEntity> {
    const entity = this.repo.create({
      topic,
      payload,
      tenantId: tenantId ?? null,
      status: 'PENDING',
    });
    const saved = await this.repo.save(entity);
    this.logger.debug('Outbox appended', { id: saved.id, topic });
    return saved;
  }

  /**
   * Fetch pending messages for processing (skeleton).
   */
  async fetchPending(limit = 100): Promise<OutboxEntity[]> {
    return this.repo.find({
      where: { status: 'PENDING' },
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }

  /**
   * Mark message as published (skeleton).
   */
  async markPublished(id: string): Promise<void> {
    await this.repo.update(id, { status: 'PUBLISHED' });
  }

  /**
   * Mark message as failed with error (skeleton).
   */
  async markFailed(id: string, error: string): Promise<void> {
    const entity = await this.repo.findOne({ where: { id } });
    if (entity) {
      entity.status = 'FAILED';
      entity.lastError = error;
      entity.lastAttemptAt = new Date();
      entity.retryCount += 1;
      await this.repo.save(entity);
    }
  }
}
