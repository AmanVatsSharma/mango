/**
 * File:        apps/backend/src/modules/compliance/services/surveillance.service.ts
 * Module:      surveillance
 * Purpose:     Surveillance alert lifecycle management — emit, list, dismiss.
 *
 * Exports:
 *   - SurveillanceService.emitAlert(dto)       — create a new surveillance alert
 *   - SurveillanceService.listAlerts(tenantId) — list alerts with optional filters
 *   - SurveillanceService.dismissAlert(id, tenantId, dismissedBy, reason) — soft dismiss
 *   - SurveillanceService.acknowledgeAlert(id, tenantId, acknowledgedBy) — mark as seen
 *
 * Depends on:
 *   - SurveillanceAlertEntity  — DB entity
 *
 * Side-effects:
 *   - DB writes on emit, dismiss, acknowledge
 *
 * Key invariants:
 *   - Dismiss is soft — status changed to DISMISSED, row remains for audit
 *   - Multiple alerts can fire for the same instrument/user in the same day
 *
 * Read order:
 *   1. emitAlert()   — alert creation (called by compliance rules engine)
 *   2. listAlerts()  — admin read path
 *   3. dismissAlert() — soft delete with audit trail
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { SurveillanceAlertEntity } from '../entities/surveillance-alert.entity';

export interface EmitAlertDto {
  tenantId: string;
  alertType: string;
  instrumentId?: string;
  userId?: string;
  severity?: string;
  description: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class SurveillanceService {
  constructor(
    @InjectRepository(SurveillanceAlertEntity)
    private readonly alerts: Repository<SurveillanceAlertEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(SurveillanceService.name);
  }

  async emitAlert(dto: EmitAlertDto): Promise<SurveillanceAlertEntity> {
    this.logger.debug('emitAlert:start', dto);
    const entity = this.alerts.create({
      tenantId: dto.tenantId,
      alertType: dto.alertType,
      instrumentId: dto.instrumentId ?? null,
      userId: dto.userId ?? null,
      severity: dto.severity ?? 'MEDIUM',
      status: 'TRIGGERED',
      description: dto.description,
      metadata: dto.metadata ?? {},
    });
    const saved = await this.alerts.save(entity);
    this.logger.debug('emitAlert:end', { id: saved.id, severity: saved.severity });
    return saved;
  }

  async listAlerts(
    tenantId: string,
    opts?: { severity?: string; status?: string; limit?: number; offset?: number },
  ): Promise<{ data: SurveillanceAlertEntity[]; total: number }> {
    this.logger.debug('listAlerts:start', { tenantId, opts });
    const { severity, status, limit = 50, offset = 0 } = opts ?? {};

    const qb = this.alerts
      .createQueryBuilder('a')
      .where('a.tenantId = :tenantId', { tenantId })
      .orderBy('a.createdAt', 'DESC')
      .skip(offset)
      .take(limit);

    if (severity) qb.andWhere('a.severity = :severity', { severity });
    if (status) qb.andWhere('a.status = :status', { status });

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async acknowledgeAlert(id: string, tenantId: string, acknowledgedBy: string): Promise<SurveillanceAlertEntity> {
    const alert = await this.alerts.findOne({ where: { id, tenantId } });
    if (!alert) throw new Error(`Alert ${id} not found`);
    alert.status = 'ACKNOWLEDGED';
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = acknowledgedBy;
    return this.alerts.save(alert);
  }

  async dismissAlert(
    id: string,
    tenantId: string,
    dismissedBy: string,
    reason?: string,
  ): Promise<SurveillanceAlertEntity> {
    this.logger.debug('dismissAlert:start', { id, tenantId });
    const alert = await this.alerts.findOne({ where: { id, tenantId } });
    if (!alert) throw new Error(`Alert ${id} not found`);
    alert.status = 'DISMISSED';
    alert.dismissedAt = new Date();
    alert.dismissedBy = dismissedBy;
    alert.dismissedReason = reason ?? null;
    const saved = await this.alerts.save(alert);
    this.logger.debug('dismissAlert:end', { id });
    return saved;
  }
}