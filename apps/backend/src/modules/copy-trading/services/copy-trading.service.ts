/**
 * File:        apps/backend/src/modules/copy-trading/services/copy-trading.service.ts
 * Module:      copy-trading
 * Purpose:     Copy trading signal management and subscription service
 *
 * Exports:
 *   - CopyTradingService — signals and subscriptions CRUD
 *
 * Depends on:
 *   - CopyTradingSignalEntity        — signal entity
 *   - CopyTradingSubscriptionEntity — subscription entity
 *   - AppLoggerService               — structured logging
 *
 * Side-effects:  DB writes only
 *
 * Key invariants:
 *   - none
 *
 * Read order:
 *   1. Signals — listSignals
 *   2. Subscriptions — createOrUpdateSubscription, listSubscriptions
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '@obsidian/backend-shared';
import { CopyTradingSignalEntity } from '../entities/copy-trading-signal.entity';
import { CopyTradingSubscriptionEntity } from '../entities/copy-trading-subscription.entity';
import { CreateCopyTradingSubscriptionDto } from '../dtos/create-copy-trading-subscription.dto';

@Injectable()
export class CopyTradingService {
  constructor(
    @InjectRepository(CopyTradingSignalEntity)
    private readonly signals: Repository<CopyTradingSignalEntity>,
    @InjectRepository(CopyTradingSubscriptionEntity)
    private readonly subscriptions: Repository<CopyTradingSubscriptionEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(CopyTradingService.name);
  }

  async listSignals(tenantId: string): Promise<CopyTradingSignalEntity[]> {
    this.logger.debug('listSignals:start', { tenantId });
    return this.signals.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async createSubscription(dto: CreateCopyTradingSubscriptionDto): Promise<CopyTradingSubscriptionEntity> {
    this.logger.debug('createSubscription:start', dto);

    const existing = await this.subscriptions.findOne({
      where: { masterUserId: dto.masterUserId, slaveUserId: dto.slaveUserId },
    });

    if (existing) {
      existing.copyPct = dto.copyPct !== undefined ? String(dto.copyPct) : existing.copyPct;
      const updated = await this.subscriptions.save(existing);
      this.logger.debug('createSubscription:updated', { subscriptionId: updated.id });
      return updated;
    }

    const entity = this.subscriptions.create({
      tenantId: dto.tenantId,
      masterUserId: dto.masterUserId,
      slaveUserId: dto.slaveUserId,
      copyPct: dto.copyPct !== undefined ? String(dto.copyPct) : '100',
      status: 'ACTIVE',
    });
    const saved = await this.subscriptions.save(entity);
    this.logger.debug('createSubscription:created', { subscriptionId: saved.id });
    return saved;
  }

  async listSubscriptions(tenantId: string): Promise<CopyTradingSubscriptionEntity[]> {
    this.logger.debug('listSubscriptions:start', { tenantId });
    return this.subscriptions.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async getPerformanceSummary(tenantId: string): Promise<{ totalSignals: number; activeSubscriptions: number }> {
    this.logger.debug('getPerformanceSummary:start', { tenantId });

    const [totalSignals, activeSubscriptions] = await Promise.all([
      this.signals.count({ where: { tenantId } }),
      this.subscriptions.count({ where: { tenantId, status: 'ACTIVE' } }),
    ]);

    return { totalSignals, activeSubscriptions };
  }
}