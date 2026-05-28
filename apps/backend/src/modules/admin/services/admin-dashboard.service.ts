/**
 * @file src/modules/admin/services/admin-dashboard.service.ts
 * @module admin
 * @description Provides KPIs and audit listings for admin dashboard
 * @author BharatERP
 * @created 2025-01-09
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { OrderAuditEntity } from '../../oms/entities/order-audit.entity';
import { OrderEntity } from '../../oms/entities/order.entity';
import { AccountEntity } from '../../accounts/entities/account.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { CashLedgerEntryEntity } from '../../accounts/entities/cash-ledger-entry.entity';
import { getRequestContext } from '../../../shared/request-context';
import { AppLoggerService } from '../../../shared/logger';

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(OrderAuditEntity)
    private readonly orderAudits: Repository<OrderAuditEntity>,
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(CashLedgerEntryEntity)
    private readonly cashLedger: Repository<CashLedgerEntryEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(AdminDashboardService.name);
  }

  async getStats(from?: string, to?: string) {
    const ctx = getRequestContext();
    const where: any = { tenantId: ctx?.tenantId ?? undefined }
    const dateRange =
      from && to ? { createdAt: Between(new Date(from), new Date(to)) } : undefined;

    const [userCount, accountCount, orderCount] = await Promise.all([
      this.users.count({ where: { ...where, ...(dateRange ?? {}) } }),
      this.accounts.count({ where: { ...where, ...(dateRange ?? {}) } }),
      this.orders.count({ where: { ...where, ...(dateRange ?? {}) } }),
    ]);

    const latestAudits = await this.orderAudits.find({
      where,
      order: { createdAt: 'DESC' } as any,
      take: 5,
    });

    return {
      users: userCount,
      accounts: accountCount,
      orders: orderCount,
      sampleAudits: latestAudits.map((a) => ({
        action: a.action,
        orderId: a.orderId,
        createdAt: a.createdAt,
      })),
    };
  }

  async listOrderAuditsByTenant(limitArg?: string): Promise<unknown[]> {
    const ctx = getRequestContext();
    const limit = limitArg ? Math.min(parseInt(limitArg, 10) || 50, 200) : 50;
    this.logger.debug('listOrderAuditsByTenant()', { ctx, limit });
    return this.orderAudits.find({
      where: { tenantId: ctx?.tenantId ?? undefined },
      order: { createdAt: 'DESC' } as any,
      take: limit,
    });
  }

  async listOrderAudits(limit = 50): Promise<unknown[]> {
    const ctx = getRequestContext();
    const where: any = { tenantId: ctx?.tenantId ?? undefined };
    return this.orderAudits.find({
      where,
      order: { createdAt: 'DESC' } as any,
      take: limit,
    });
  }

  /**
   * Admin: list all audit log entries across the tenant.
   * Supports filtering by actor, module, and date range.
   * Accepts pre-parsed numeric limit/offset (GraphQL resolver) or raw string
   * query params (REST controller); parsing is done here to keep controllers thin.
   */
  async listAllAudits(opts: {
    actor?: string;
    module?: string;
    action?: string;
    from?: string;
    to?: string;
    limit?: string | number;
    offset?: string | number;
  }) {
    const ctx = getRequestContext();
    const { actor, module, action, from, to, limit: limArg, offset: offArg } = opts;
    const limit = typeof limArg === 'string'
      ? Math.min(parseInt(limArg, 10) || 50, 200)
      : (limArg ?? 50);
    const offset = typeof offArg === 'string'
      ? parseInt(offArg, 10) || 0
      : (offArg ?? 0);
    this.logger.debug('listAllAudits()', { ctx, actor, module, action, from, to, limit, offset });

    const where: any = { tenantId: ctx.tenantId };
    const qb = this.orderAudits.createQueryBuilder('a').where('a.tenant_id = :tenantId', { tenantId: ctx.tenantId });
    if (actor) qb.andWhere('a.actor = :actor', { actor });
    if (module) qb.andWhere('a.module = :module', { module });
    if (action) qb.andWhere('a.action = :action', { action });
    if (from) qb.andWhere('a.created_at >= :from', { from: new Date(from) });
    if (to) qb.andWhere('a.created_at <= :to', { to: new Date(to) });

    const [rows, total] = await Promise.all([
      qb.orderBy('a.created_at', 'DESC').skip(offset).take(limit).getManyAndCount(),
      qb.clone().select('COUNT(*)', 'cnt').getRawOne(),
    ]);
    return { data: rows, total, limit, offset };
  }

  async getRevenueStats(period: 'daily' | 'weekly' | 'mtd' = 'mtd') {
    const ctx = getRequestContext();
    this.logger.debug('getRevenueStats:start', { ctx, period });

    const now = new Date();
    let from: Date;
    let labelFmt: (d: Date) => string;

    if (period === 'daily') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      labelFmt = (d: Date) => d.toISOString().slice(0, 10);
    } else if (period === 'weekly') {
      const dow = now.getDay();
      from = new Date(now);
      from.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
      from.setHours(0, 0, 0, 0);
      labelFmt = (d: Date) => `Week ${Math.ceil((d.getDate()) / 7)} ${d.toLocaleString('default', { month: 'short' })}`;
    } else {
      // mtd
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      labelFmt = (d: Date) => d.toLocaleString('default', { month: 'short', year: '2-digit' });
    }

    const rows = await this.cashLedger
      .createQueryBuilder('c')
      .select("TO_CHAR(c.created_at, 'YYYY-MM-DD')", 'label')
      .addSelect(
        `SUM(CASE WHEN c.kind = 'trade' THEN ABS(c.amount::numeric) ELSE 0 END)`,
        'spread',
      )
      .addSelect(
        `SUM(CASE WHEN c.kind = 'fee' THEN ABS(c.amount::numeric) ELSE 0 END)`,
        'commission',
      )
      .addSelect(
        `SUM(CASE WHEN c.kind IN ('swap','adjustment') THEN ABS(c.amount::numeric) ELSE 0 END)`,
        'swap',
      )
      .where('c.tenant_id = :tenantId', { tenantId: ctx.tenantId })
      .andWhere('c.created_at >= :from', { from })
      .andWhere('c.direction = :direction', { direction: 'credit' })
      .groupBy("TO_CHAR(c.created_at, 'YYYY-MM-DD')")
      .orderBy("TO_CHAR(c.created_at, 'YYYY-MM-DD')", 'ASC')
      .getRawMany<{ label: string; spread: string; commission: string; swap: string }>();

    return rows.map((r) => {
      const spread = Number(r.spread);
      const commission = Number(r.commission);
      const swap = Number(r.swap);
      return {
        label: labelFmt(new Date(r.label)),
        spread,
        commission,
        swap,
        total: spread + commission + swap,
      };
    });
  }

  getSystemStatus() {
    return [
      { service: 'API Gateway', status: 'operational', latency: 12 },
      { service: 'Database', status: 'operational', latency: 5 },
      { service: 'Cache', status: 'operational', latency: 2 },
      { service: 'OMS', status: 'operational', latency: 18 },
    ];
  }
}

