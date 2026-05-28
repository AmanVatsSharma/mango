/**
 * File:        apps/backend/src/modules/crm/services/crm.service.ts
 * Module:      crm
 * Purpose:     Retention CRM service — outreach, churn risk, and retention offers
 *
 * Exports:
 *   - CrmService — CRM operations
 *
 * Depends on:
 *   - CrmOutreachEntity        — outreach records
 *   - CrmRetentionOfferEntity — retention offers
 *   - AppLoggerService        — structured logging
 *
 * Side-effects:  DB writes only
 *
 * Key invariants:
 *   - none
 *
 * Read order:
 *   1. Outreach — sendOutreach, listOutreach
 *   2. Churn risk — getChurnRiskScores
 *   3. Retention — createRetentionOffer
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '@obsidian/backend-shared';
import { CrmOutreachEntity } from '../entities/crm-outreach.entity';
import { CrmRetentionOfferEntity } from '../entities/crm-retention-offer.entity';
import { CreateCrmOutreachDto } from '../dtos/create-crm-outreach.dto';
import { CreateRetentionOfferDto } from '../dtos/create-retention-offer.dto';

@Injectable()
export class CrmService {
  constructor(
    @InjectRepository(CrmOutreachEntity)
    private readonly outreach: Repository<CrmOutreachEntity>,
    @InjectRepository(CrmRetentionOfferEntity)
    private readonly retentionOffers: Repository<CrmRetentionOfferEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(CrmService.name);
  }

  async listClients(tenantId: string): Promise<CrmOutreachEntity[]> {
    this.logger.debug('listClients:start', { tenantId });
    return this.outreach.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async sendOutreach(dto: CreateCrmOutreachDto): Promise<CrmOutreachEntity> {
    this.logger.debug('sendOutreach:start', dto);
    const entity = this.outreach.create({
      tenantId: dto.tenantId,
      userId: dto.userId,
      type: dto.type,
      message: dto.message ?? null,
      status: 'SENT',
      sentAt: new Date(),
    });
    const saved = await this.outreach.save(entity);
    this.logger.debug('sendOutreach:end', { outreachId: saved.id });
    return saved;
  }

  async getChurnRiskScores(tenantId: string): Promise<{ userId: string; riskScore: number }[]> {
    this.logger.debug('getChurnRiskScores:start', { tenantId });
    // Stubbed — real implementation would compute risk based on trading activity
    return [
      { userId: 'stub-user-1', riskScore: 0.85 },
      { userId: 'stub-user-2', riskScore: 0.72 },
    ];
  }

  async createRetentionOffer(dto: CreateRetentionOfferDto): Promise<CrmRetentionOfferEntity> {
    this.logger.debug('createRetentionOffer:start', dto);
    const entity = this.retentionOffers.create({
      tenantId: dto.tenantId,
      userId: dto.userId,
      offerType: dto.offerType,
      value: dto.value !== undefined ? String(dto.value) : '0',
      status: 'PENDING',
    });
    const saved = await this.retentionOffers.save(entity);
    this.logger.debug('createRetentionOffer:end', { offerId: saved.id });
    return saved;
  }
}