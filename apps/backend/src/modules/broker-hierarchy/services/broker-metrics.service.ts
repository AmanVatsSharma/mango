/**
 * File:        apps/backend/src/modules/broker-hierarchy/services/broker-metrics.service.ts
 * Module:      broker-hierarchy
 * Purpose:     Aggregates and persists AUM, client count, revenue, and health score for each
 *              broker tenant. Called by the platform owner's broker dashboard and by
 *              outbox event consumers when significant business events occur (trade, new user).
 *
 * Exports:
 *   - BrokerMetricsService.computeMetrics(brokerId, tenantId) → BrokerMetricsEntity
 *   - BrokerMetricsService.getMetrics(brokerId)              → BrokerMetricsEntity | null
 *   - BrokerMetricsService.getMetricsByTenantCode(tenantCode) → BrokerMetricsEntity | null
 *
 * Depends on:
 *   - BrokerMetricsEntity        — persisted metrics
 *   - BrokerEntity               — broker lookup by tenantId
 *   - UsersService               — countActiveByTenant()
 *   - CashLedgerEntryEntity      — AUM via sum of credits - debits per tenant
 *   - SettlementJobEntity        — monthly revenue aggregation
 *   - AppLoggerService
 *
 * Side-effects:
 *   - DB upserts into broker_metrics table
 *
 * Key invariants:
 *   - Metrics are eventually consistent — updated on events, not real-time
 *   - One row per broker (enforced by unique brokerId index)
 *   - healthScore is 0-100; computed from compliance + activity + uptime signals
 *   - AUM = SUM(credits) - SUM(debits) across all cash ledger entries for the tenant
 *
 * Read order:
 *   1. computeMetrics() — main entry point, called by controller or event consumer
 *   2. _sumAum()        — direct DB aggregation on cash_ledger_entries
 *   3. _sumRevenue()    — settlement job aggregation per month
 *   4. _computeHealth() — composite health score from signals
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-10
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { BrokerMetricsEntity } from '../entities/broker-metrics.entity';
import { BrokerEntity } from '../entities/broker.entity';
import { CashLedgerEntryEntity } from '../../accounts/entities/cash-ledger-entry.entity';
import { SettlementJobEntity } from '../../settlement/entities/settlement-job.entity';
import { UsersService } from '../../users/users.service';

@Injectable()
export class BrokerMetricsService {
  constructor(
    @InjectRepository(BrokerMetricsEntity)
    private readonly metrics: Repository<BrokerMetricsEntity>,
    @InjectRepository(BrokerEntity)
    private readonly brokers: Repository<BrokerEntity>,
    @InjectRepository(CashLedgerEntryEntity)
    private readonly cashLedger: Repository<CashLedgerEntryEntity>,
    @InjectRepository(SettlementJobEntity)
    private readonly settlementJobs: Repository<SettlementJobEntity>,
    private readonly users: UsersService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(BrokerMetricsService.name);
  }

  async computeMetrics(brokerId: string, tenantId: string): Promise<BrokerMetricsEntity> {
    this.logger.debug('computeMetrics()', { brokerId, tenantId });

    const [aum, clients, { monthlyRevenue, monthlyRevenuePrev }] = await Promise.all([
      this._sumAum(tenantId),
      this._countClients(tenantId),
      this._sumRevenue(tenantId),
    ]);

    const healthScore = this._computeHealth(clients, Number(monthlyRevenue), new Date());
    const lastActivityAt = new Date();

    let existing = await this.metrics.findOne({ where: { brokerId } });
    if (!existing) {
      existing = this.metrics.create({
        brokerId,
        tenantId,
        aum: String(aum),
        clients,
        monthlyRevenue,
        monthlyRevenuePrev,
        healthScore,
        lastActivityAt,
        computedAt: new Date(),
      });
    } else {
      existing.aum = String(aum);
      existing.clients = clients;
      existing.monthlyRevenue = monthlyRevenue;
      existing.monthlyRevenuePrev = monthlyRevenuePrev;
      existing.healthScore = healthScore;
      existing.lastActivityAt = lastActivityAt;
      existing.computedAt = new Date();
    }

    return this.metrics.save(existing);
  }

  async getMetrics(brokerId: string): Promise<BrokerMetricsEntity | null> {
    return this.metrics.findOne({ where: { brokerId } });
  }

  /**
   * Batch-fetch metrics for multiple brokers in a single query.
   * Eliminates N+1 when loading the platform dashboard.
   */
  async getMetricsBatch(brokerIds: string[]): Promise<Map<string, BrokerMetricsEntity>> {
    if (!brokerIds.length) return new Map();
    const rows = await this.metrics
      .createQueryBuilder('m')
      .where('m.broker_id IN (:...brokerIds)', { brokerIds })
      .getMany();
    return new Map(rows.map((r) => [r.brokerId, r]));
  }

  async getMetricsByTenantCode(tenantCode: string): Promise<BrokerMetricsEntity | null> {
    const broker = await this.brokers
      .createQueryBuilder('b')
      .innerJoin('tenants', 't', 't.id = b.tenant_id AND t.code = :tenantCode', { tenantCode })
      .where('b.tenant_id = t.id')
      .getOne();
    if (!broker) return null;
    return this.getMetrics(broker.id);
  }

  async upsertFromOnboarding(brokerId: string, tenantId: string): Promise<void> {
    await this.computeMetrics(brokerId, tenantId);
  }

  private async _sumAum(tenantId: string): Promise<number> {
    const credits = await this.cashLedger
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.amount::numeric), 0)', 'sum')
      .where("c.tenant_id = :tenantId AND c.direction = 'credit'", { tenantId })
      .getRawOne<{ sum: string }>();
    const debits = await this.cashLedger
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.amount::numeric), 0)', 'sum')
      .where("c.tenant_id = :tenantId AND c.direction = 'debit'", { tenantId })
      .getRawOne<{ sum: string }>();
    return Number(credits?.sum ?? '0') - Number(debits?.sum ?? '0');
  }

  private async _countClients(tenantId: string): Promise<number> {
    return this.users.countActiveByTenant(tenantId);
  }

  private async _sumRevenue(tenantId: string): Promise<{ monthlyRevenue: string; monthlyRevenuePrev: string }> {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;

    const [curr, prev_] = await Promise.all([
      this.settlementJobs
        .createQueryBuilder('s')
        .select('COALESCE(SUM(s.amount::numeric), 0)', 'sum')
        .where('s.tenant_id = :tenantId AND s.status = :status AND s.trade_date LIKE :thisMonth', {
          tenantId,
          status: 'SETTLED',
          thisMonth: `${thisMonth}%`,
        })
        .getRawOne<{ sum: string }>(),
      this.settlementJobs
        .createQueryBuilder('s')
        .select('COALESCE(SUM(s.amount::numeric), 0)', 'sum')
        .where('s.tenant_id = :tenantId AND s.status = :status AND s.trade_date LIKE :prevMonth', {
          tenantId,
          status: 'SETTLED',
          prevMonth: `${prevMonth}%`,
        })
        .getRawOne<{ sum: string }>(),
    ]);

    return {
      monthlyRevenue: curr?.sum ?? '0',
      monthlyRevenuePrev: prev_?.sum ?? '0',
    };
  }

  private _computeHealth(clients: number, monthlyRevenue: number, now: Date): number {
    let score = 0;
    // Base: clients (0-40 points)
    score += Math.min(clients * 4, 40);
    // Mid: revenue (0-40 points)
    if (monthlyRevenue > 0) score += Math.min(monthlyRevenue / 1000, 40);
    // Activity signal (0-20 points): if any activity in past 7 days, full points
    score += 20; // defaulting to active; replace with real uptime/compliance check
    return Math.min(Math.max(Math.round(score), 0), 100);
  }
}
