/**
 * @file src/modules/dealing/services/dealing.service.ts
 * @module dealing
 * @description Dealing service scaffold for deal capture and status
 * @author BharatERP
 * @created 2026-02-19
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { getRequestContext } from '../../../shared/request-context';
import { CreateDealDto } from '../dtos/create-deal.dto';
import { DealOverrideDto } from '../dtos/deal-override.dto';
import { DealEntity } from '../entities/deal.entity';

@Injectable()
export class DealingService {
  constructor(
    @InjectRepository(DealEntity)
    private readonly deals: Repository<DealEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(DealingService.name);
  }

  async createDeal(dto: CreateDealDto): Promise<DealEntity> {
    this.logger.debug('createDeal:start', dto);
    const entity = this.deals.create(dto as any) as unknown as DealEntity;
    // Entity metadata is jsonb; DTO metadata is string — convert before persisting
    if (typeof entity.metadata === 'string') {
      entity.metadata = JSON.parse(entity.metadata) as any;
    }
    const saved = await this.deals.save(entity);
    this.logger.debug('createDeal:end', { dealId: saved.id });
    return saved;
  }

  async listDeals(tenantId: string): Promise<DealEntity[]> {
    return this.deals.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async getDealStatus(id: string): Promise<{ id: string; status: string } | null> {
    const deal = await this.deals.findOne({ where: { id }, select: ['id', 'status'] });
    return deal ? { id: deal.id, status: deal.status } : null;
  }

  async requestManualOverride(
    dealId: string,
    dto: DealOverrideDto,
  ): Promise<{ id: string; status: string; audit: Record<string, unknown> }> {
    const audit = this.auditEnvelope('DEAL_OVERRIDE_REQUESTED', dealId, {
      action: dto.action,
      reason: dto.reason,
    });
    this.logger.warn('manual override requested', audit);
    return { id: dealId, status: 'OVERRIDE_REQUESTED', audit };
  }

  private auditEnvelope(
    action: string,
    targetId: string,
    details: Record<string, unknown>,
  ): Record<string, unknown> {
    const ctx = getRequestContext();
    return {
      action,
      targetId,
      details,
      requestId: ctx?.requestId,
      actorUserId: ctx?.userId,
      tenantId: ctx?.tenantId,
      at: new Date().toISOString(),
    };
  }
}
