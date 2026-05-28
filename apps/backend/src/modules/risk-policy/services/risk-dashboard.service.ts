/**
 * File:        apps/backend/src/modules/risk-policy/services/risk-dashboard.service.ts
 * Module:      risk-policy
 * Purpose:     Aggregated risk dashboard data — net/gross exposure per instrument,
 *              active alerts, and real-time position summaries for admin screens.
 *
 * Exports:
 *   - RiskDashboardService.getDashboard(tenantId)     — net/gross per instrument
 *   - RiskDashboardService.getAlerts(tenantId, opts)  — paginated surveillance alerts
 *   - RiskDashboardService.dismissAlert(id, tenantId) — admin dismiss with reason
 *
 * Depends on:
 *   - DataSource — raw SQL for aggregated position queries
 *   - SurveillanceAlertEntity — alert persistence
 *
 * Side-effects:
 *   - DB writes on dismissAlert()
 *
 * Key invariants:
 *   - dashboard queries run with LIMIT to avoid unbounded result sets
 *   - dismissed alerts are soft-deleted (status = DISMISSED), not hard-deleted
 *
 * Read order:
 *   1. getDashboard()  — position aggregation from position_ledger_entries
 *   2. getAlerts()     — alert query with optional severity filter
 *   3. dismissAlert()  — soft status update with audit trail
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { AppError } from '../../../common/errors/app-error';
import { SurveillanceAlertEntity } from '@obsidian/backend-compliance';

@Injectable()
export class RiskDashboardService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(SurveillanceAlertEntity)
    private readonly alerts: Repository<SurveillanceAlertEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(RiskDashboardService.name);
  }

  /**
   * Net and gross exposure per instrument for the admin risk dashboard.
   * Uses raw SQL for fast aggregation without loading full position ledger.
   */
  async getDashboard(tenantId: string): Promise<{
    instruments: Array<{
      instrumentId: string;
      netQty: number;
      grossNotional: number;
      netNotional: number;
    }>;
    totalNetNotional: number;
    totalGrossNotional: number;
  }> {
    this.logger.debug('getDashboard:start', { tenantId });
    const rows = await this.dataSource.query(
      `SELECT
         p.instrument_id,
         COALESCE(SUM(p.quantity_delta::numeric), 0) AS net_qty,
         COALESCE(SUM(ABS(p.quantity_delta::numeric) * p.price::numeric), 0) AS gross_notional
       FROM position_ledger_entries p
       WHERE p.tenant_id = $1
       GROUP BY p.instrument_id
       ORDER BY gross_notional DESC
       LIMIT 200`,
      [tenantId],
    );

    const instruments = rows.map((r) => {
      const netQty = Number(r.net_qty);
      const grossNotional = Math.abs(Number(r.gross_notional));
      return {
        instrumentId: r.instrument_id,
        netQty,
        grossNotional,
        netNotional: netQty * grossNotional,
      };
    });

    const totalNetNotional = instruments.reduce((s, i) => s + i.netNotional, 0);
    const totalGrossNotional = instruments.reduce((s, i) => s + i.grossNotional, 0);

    this.logger.debug('getDashboard:end', { tenantId, count: instruments.length });
    return { instruments, totalNetNotional, totalGrossNotional };
  }

  async getAlerts(
    tenantId: string,
    opts?: { severity?: string; limit?: number; offset?: number },
  ): Promise<{ data: SurveillanceAlertEntity[]; total: number }> {
    this.logger.debug('getAlerts:start', { tenantId, opts });
    const { severity, limit = 50, offset = 0 } = opts ?? {};

    const qb = this.alerts
      .createQueryBuilder('a')
      .where('a.tenantId = :tenantId', { tenantId })
      .andWhere('a.status != :dismissed', { dismissed: 'DISMISSED' })
      .orderBy('a.createdAt', 'DESC')
      .skip(offset)
      .take(limit);

    if (severity) {
      qb.andWhere('a.severity = :severity', { severity });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async dismissAlert(id: string, tenantId: string, reason?: string): Promise<SurveillanceAlertEntity> {
    this.logger.debug('dismissAlert:start', { id, tenantId, reason });
    const alert = await this.alerts.findOne({ where: { id, tenantId } });
    if (!alert) {
      throw new AppError('RESOURCE_NOT_FOUND', `Alert ${id} not found`);
    }
    if (alert.status === 'DISMISSED') {
      throw new AppError('VALIDATION_ERROR', 'Alert is already dismissed');
    }
    alert.status = 'DISMISSED';
    (alert as any).dismissedAt = new Date();
    (alert as any).dismissedReason = reason ?? null;
    const saved = await this.alerts.save(alert);
    this.logger.debug('dismissAlert:end', { id });
    return saved;
  }
}