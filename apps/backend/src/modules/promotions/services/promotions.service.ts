/**
 * File:        apps/backend/src/modules/promotions/services/promotions.service.ts
 * Module:      promotions
 * Purpose:     Promotions service — campaign CRUD and announcement
 *
 * Exports:
 *   - PromotionsService — promotion management
 *
 * Depends on:
 *   - PromotionEntity   — promotion entity
 *   - AppLoggerService  — structured logging
 *
 * Side-effects:  DB writes only
 *
 * Key invariants:
 *   - none
 *
 * Read order:
 *   1. CRUD — createPromotion, listPromotions, updatePromotion
 *   2. Announcement — announcePromotion
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '@obsidian/backend-shared';
import { AppError } from '@obsidian/backend-common';
import { PromotionEntity } from '../entities/promotion.entity';
import { CreatePromotionDto } from '../dtos/create-promotion.dto';
import { UpdatePromotionDto } from '../dtos/update-promotion.dto';

@Injectable()
export class PromotionsService {
  constructor(
    @InjectRepository(PromotionEntity)
    private readonly promotions: Repository<PromotionEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(PromotionsService.name);
  }

  async createPromotion(dto: CreatePromotionDto): Promise<PromotionEntity> {
    this.logger.debug('createPromotion:start', dto);
    if (new Date(dto.endDate) < new Date(dto.startDate)) {
      throw new AppError('VALIDATION_ERROR', 'endDate must be on or after startDate');
    }
    const entity = this.promotions.create({
      tenantId: dto.tenantId,
      name: dto.name,
      type: dto.type,
      startDate: dto.startDate,
      endDate: dto.endDate,
      budget: dto.budget !== undefined ? String(dto.budget) : '0',
      spent: '0',
      status: 'DRAFT',
    });
    const saved = await this.promotions.save(entity);
    this.logger.debug('createPromotion:end', { promotionId: saved.id });
    return saved;
  }

  async listPromotions(tenantId: string): Promise<PromotionEntity[]> {
    this.logger.debug('listPromotions:start', { tenantId });
    return this.promotions.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async updatePromotion(id: string, dto: UpdatePromotionDto): Promise<PromotionEntity> {
    this.logger.debug('updatePromotion:start', { id, dto });
    const promotion = await this.promotions.findOne({ where: { id } });
    if (!promotion) {
      throw new AppError('RESOURCE_NOT_FOUND', `Promotion ${id} not found`);
    }
    if (dto.name !== undefined) promotion.name = dto.name;
    if (dto.type !== undefined) promotion.type = dto.type;
    if (dto.status !== undefined) promotion.status = dto.status;
    if (dto.startDate !== undefined) promotion.startDate = dto.startDate;
    if (dto.endDate !== undefined) promotion.endDate = dto.endDate;
    if (dto.budget !== undefined) promotion.budget = String(dto.budget);
    const saved = await this.promotions.save(promotion);
    this.logger.debug('updatePromotion:end', { promotionId: saved.id });
    return saved;
  }

  async announcePromotion(id: string): Promise<{ announced: boolean }> {
    this.logger.debug('announcePromotion:start', { id });
    const promotion = await this.promotions.findOne({ where: { id } });
    if (!promotion) {
      throw new AppError('RESOURCE_NOT_FOUND', `Promotion ${id} not found`);
    }
    promotion.status = 'ACTIVE';
    await this.promotions.save(promotion);
    this.logger.debug('announcePromotion:end', { promotionId: id });
    return { announced: true };
  }
}