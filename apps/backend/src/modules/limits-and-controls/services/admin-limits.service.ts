/**
 * File:        apps/backend/src/modules/limits-and-controls/services/admin-limits.service.ts
 * Module:      limits-and-controls
 * Purpose:     Admin service for exposure limit management — CRUD and pre-trade checks.
 *
 * Exports:
 *   - AdminLimitsService.createLimit(dto)   — create or upsert exposure limit
 *   - AdminLimitsService.listLimits(tenantId) — list all for tenant
 *   - AdminLimitsService.updateLimit(id, tenantId, dto) — partial update
 *   - AdminLimitsService.checkExposureLimit(instrumentId, proposedDelta) — pre-trade gate
 *
 * Depends on:
 *   - ExposureLimitEntity  — DB entity
 *
 * Side-effects:
 *   - DB write (upsert on create; update on patch)
 *
 * Key invariants:
 *   - checkExposureLimit is fail-open — if no limit is configured, passes
 *   - Instrument-level unique constraint prevents duplicate entries per tenant
 *
 * Read order:
 *   1. createLimit()  — upsert pattern
 *   2. listLimits()   — read for admin
 *   3. checkExposureLimit()  — pre-trade gate used by OMS
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { AppError } from '../../../common/errors/app-error';
import { ExposureLimitEntity } from '../entities/exposure-limit.entity';
import { CreateExposureLimitDto } from '../dtos/exposure-limit.dto';
import { UpdateExposureLimitDto } from '../dtos/exposure-limit.dto';

@Injectable()
export class AdminLimitsService {
  constructor(
    @InjectRepository(ExposureLimitEntity)
    private readonly limits: Repository<ExposureLimitEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminLimitsService.name);
  }

  async createLimit(dto: CreateExposureLimitDto): Promise<ExposureLimitEntity> {
    this.logger.debug('createLimit:start', dto);

    if (dto.alertThreshold >= 1) {
      throw new AppError('VALIDATION_ERROR', 'alertThreshold must be less than 1.0');
    }
    if (dto.hardLimit < dto.maxNetExposure) {
      throw new AppError('VALIDATION_ERROR', 'hardLimit must be >= maxNetExposure');
    }

    const existing = await this.limits.findOne({
      where: { tenantId: dto.tenantId, instrumentId: dto.instrumentId },
    });

    const entity = this.limits.create({
      ...(existing ?? {}),
      tenantId: dto.tenantId,
      instrumentId: dto.instrumentId,
      maxNetExposure: String(dto.maxNetExposure),
      alertThreshold: String(dto.alertThreshold),
      hardLimit: String(dto.hardLimit),
      enabled: dto.enabled ?? true,
    });

    const saved = await this.limits.save(entity);
    this.logger.debug('createLimit:end', { id: saved.id });
    return saved;
  }

  async listLimits(tenantId: string): Promise<ExposureLimitEntity[]> {
    return this.limits.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async updateLimit(
    id: string,
    tenantId: string,
    dto: UpdateExposureLimitDto,
  ): Promise<ExposureLimitEntity> {
    this.logger.debug('updateLimit:start', { id, tenantId, dto });

    const existing = await this.limits.findOne({ where: { id, tenantId } });
    if (!existing) {
      throw new AppError('RESOURCE_NOT_FOUND', `Exposure limit ${id} not found`);
    }

    if (dto.alertThreshold !== undefined && dto.alertThreshold >= 1) {
      throw new AppError('VALIDATION_ERROR', 'alertThreshold must be less than 1.0');
    }
    if (
      dto.hardLimit !== undefined &&
      dto.maxNetExposure !== undefined &&
      dto.hardLimit < dto.maxNetExposure
    ) {
      throw new AppError('VALIDATION_ERROR', 'hardLimit must be >= maxNetExposure');
    }

    if (dto.maxNetExposure !== undefined) existing.maxNetExposure = String(dto.maxNetExposure);
    if (dto.alertThreshold !== undefined) existing.alertThreshold = String(dto.alertThreshold);
    if (dto.hardLimit !== undefined) existing.hardLimit = String(dto.hardLimit);
    if (dto.enabled !== undefined) existing.enabled = dto.enabled;

    const saved = await this.limits.save(existing);
    this.logger.debug('updateLimit:end', { id: saved.id });
    return saved;
  }

  /**
   * Called by OMS before order submission — checks if the proposed delta
   * would push currentNetExposure beyond hardLimit.
   * Fail-open: if no limit is configured for the instrument, returns null.
   */
  async checkExposureLimit(
    tenantId: string,
    instrumentId: string,
    proposedDelta: number,
  ): Promise<{ allowed: boolean; message?: string } | null> {
    const limit = await this.limits.findOne({
      where: { tenantId, instrumentId, enabled: true },
    });
    if (!limit) return null; // no limit configured

    const current = Number(limit.currentNetExposure);
    const hard = Number(limit.hardLimit);
    const after = current + proposedDelta;

    if (after > hard) {
      return {
        allowed: false,
        message: `Exposure limit breached for ${instrumentId}: ${after} > ${hard}`,
      };
    }

    const alertAt = Number(limit.alertThreshold) * hard;
    if (after > alertAt) {
      this.logger.debug('checkExposureLimit:alert', { instrumentId, after, alertAt });
    }

    return { allowed: true };
  }
}