/**
 * @file src/modules/realtime/prana-stream/services/realtime-aggregator.service.ts
 * @module realtime/prana-stream
 * @description Aggregates domain updates and market ticks; emits per-user snapshots and changes
 * @author BharatERP
 * @created 2025-09-24
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppLoggerService } from '../../../../shared/logger';
import { SubscriptionPayload, SubscriptionRegistryService } from './subscription-registry.service';
import { CompositeMarketDataAdapter } from '../adapters/composite-market-data.adapter';
import { Tick } from '../adapters/market-data.provider';
import { AccountEntity } from '../../../accounts/entities/account.entity';
import { OrderEntity } from '../../../oms/entities/order.entity';
import { PositionLedgerEntryEntity } from '../../../accounts/entities/position-ledger-entry.entity';
import { CashLedgerEntryEntity } from '../../../accounts/entities/cash-ledger-entry.entity';
import { HoldEntity } from '../../../accounts/entities/hold.entity';
import { In, Repository } from 'typeorm';

@Injectable()
export class RealtimeAggregatorService {
  private server?: { to: (room: string) => { emit: (event: string, payload: any) => void } };
  private readonly throttleMs: number;
  private readonly tickBuffers: Map<string, Map<string, Tick>> = new Map(); // userId -> key -> Tick
  private readonly tickTimers: Map<string, NodeJS.Timeout> = new Map(); // userId -> timer
  private readonly lastSentPrices: Map<string, Map<string, number>> = new Map(); // userId -> key -> price

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accountsRepo: Repository<AccountEntity>,
    @InjectRepository(OrderEntity)
    private readonly ordersRepo: Repository<OrderEntity>,
    @InjectRepository(PositionLedgerEntryEntity)
    private readonly positionsRepo: Repository<PositionLedgerEntryEntity>,
    @InjectRepository(CashLedgerEntryEntity)
    private readonly cashRepo: Repository<CashLedgerEntryEntity>,
    @InjectRepository(HoldEntity)
    private readonly holdsRepo: Repository<HoldEntity>,
    private readonly logger: AppLoggerService,
    private readonly subs: SubscriptionRegistryService,
    private readonly market: CompositeMarketDataAdapter,
  ) {
    this.logger.setContext(RealtimeAggregatorService.name);
    this.market.onTicks((ticks) => this.handleTicks(ticks));
    this.throttleMs = Number(process.env.PRANA_TICK_THROTTLE_MS || 1000);
  }

  bindServer(server: { to: (room: string) => { emit: (event: string, payload: any) => void } }) {
    if (!this.server) {
      this.server = server;
      this.logger.debug('Socket server bound to aggregator');
    }
  }

  private handleTicks(ticks: Tick[]) {
    if (!this.server || ticks.length === 0) return;
    // For each tick, buffer per-user and schedule throttled flush
    for (const t of ticks) {
      const watchers = this.subs.getWatchersFor(t.exchange, t.symbol);
      const key = `${t.exchange}:${t.symbol}`;
      for (const userId of watchers) {
        if (!this.tickBuffers.has(userId)) this.tickBuffers.set(userId, new Map());
        this.tickBuffers.get(userId).set(key, t);
        this.scheduleFlush(userId);
      }
    }
  }

  private scheduleFlush(userId: string) {
    if (this.tickTimers.has(userId)) return;
    const timer = setTimeout(() => this.flushUser(userId), this.throttleMs);
    this.tickTimers.set(userId, timer);
  }

  private flushUser(userId: string) {
    this.tickTimers.delete(userId);
    const buf = this.tickBuffers.get(userId);
    if (!buf || !this.server) return;
    const last = this.lastSentPrices.get(userId) || new Map<string, number>();
    const changed: Tick[] = [];
    for (const [key, tick] of buf.entries()) {
      const prev = last.get(key);
      if (prev === undefined || prev !== tick.price) {
        changed.push(tick);
        last.set(key, tick.price);
      }
    }
    this.tickBuffers.set(userId, new Map());
    this.lastSentPrices.set(userId, last);
    if (changed.length === 0) return;
    this.server.to(`user:${userId}`).emit('watchlist.ticks', {
      type: 'watchlist.tick',
      userId,
      seq: Date.now(),
      ts: new Date().toISOString(),
      data: changed,
      v: 1,
    });
  }

  async recomputeMarketSubscriptions() {
    const all = this.subs.getAllWatchedSymbols();
    await this.market.unsubscribeTicks('prana');
    if (all.length > 0) {
      await this.market.subscribeTicks('prana', all);
    }
  }

  async getSnapshots(
    userId: string,
    tenantId: string | null | undefined,
    payload: SubscriptionPayload,
  ) {
    this.logger.debug('getSnapshots', { userId, tenantId });
    const out: any = {};
    if (payload.watchlist && payload.watchlist.length > 0) {
      out.watchlist = await this.market.getSnapshot(payload.watchlist);
    }
    if (!tenantId) {
      if (payload.orders) out.orders = [];
      if (payload.positions) out.positions = [];
      if (payload.accounts) out.accounts = [];
      return out;
    }
    const accountIds = await this.getAccountIdsForUser(tenantId, userId);
    if (payload.orders) out.orders = await this.snapshotOrders(tenantId, accountIds);
    if (payload.positions)
      out.positions = await this.snapshotPositions(tenantId, accountIds);
    if (payload.accounts)
      out.accounts = await this.snapshotAccountBalances(tenantId, accountIds);
    return out;
  }

  private async getAccountIdsForUser(
    tenantId: string,
    userId: string,
  ): Promise<string[]> {
    const rows = await this.accountsRepo.find({
      where: { tenantId, userId },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  private async snapshotOrders(tenantId: string, accountIds: string[]) {
    if (accountIds.length === 0) return [];
    const rows = await this.ordersRepo.find({
      where: { tenantId, accountId: In(accountIds) },
      order: { createdAt: 'DESC' } as any,
      take: 20,
    });
    return rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      instrumentId: row.instrumentId,
      side: row.side,
      type: row.type,
      quantity: row.quantity,
      price: row.price,
      status: row.status,
      createdAt: row.createdAt,
    }));
  }

  private async snapshotPositions(tenantId: string, accountIds: string[]) {
    if (accountIds.length === 0) return [];
    const rows = await this.positionsRepo
      .createQueryBuilder('p')
      .select('p.account_id', 'accountId')
      .addSelect('p.instrument_id', 'instrumentId')
      .addSelect('COALESCE(SUM(p.quantity_delta::numeric), 0)', 'netQty')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.account_id IN (:...accountIds)', { accountIds })
      .groupBy('p.account_id')
      .addGroupBy('p.instrument_id')
      .getRawMany<{
        accountId: string;
        instrumentId: string;
        netQty: string;
      }>();
    return rows
      .filter((row) => Number(row.netQty) !== 0)
      .map((row) => ({
        accountId: row.accountId,
        instrumentId: row.instrumentId,
        netQty: row.netQty,
      }));
  }

  private async snapshotAccountBalances(tenantId: string, accountIds: string[]) {
    if (accountIds.length === 0) return [];
    const [cashRows, holdRows] = await Promise.all([
      this.cashRepo
        .createQueryBuilder('c')
        .select('c.account_id', 'accountId')
        .addSelect(
          `COALESCE(SUM(CASE WHEN c.direction = 'credit' THEN c.amount::numeric ELSE -c.amount::numeric END), 0)`,
          'totalCash',
        )
        .where('c.tenant_id = :tenantId', { tenantId })
        .andWhere('c.account_id IN (:...accountIds)', { accountIds })
        .groupBy('c.account_id')
        .getRawMany<{ accountId: string; totalCash: string }>(),
      this.holdsRepo
        .createQueryBuilder('h')
        .select('h.account_id', 'accountId')
        .addSelect('COALESCE(SUM(h.amount::numeric), 0)', 'lockedCash')
        .where('h.tenant_id = :tenantId', { tenantId })
        .andWhere('h.account_id IN (:...accountIds)', { accountIds })
        .andWhere(`h.state = 'ACTIVE'`)
        .groupBy('h.account_id')
        .getRawMany<{ accountId: string; lockedCash: string }>(),
    ]);

    const cashMap = new Map(cashRows.map((row) => [row.accountId, row.totalCash]));
    const holdMap = new Map(holdRows.map((row) => [row.accountId, row.lockedCash]));

    return accountIds.map((accountId) => {
      const totalCash = Number(cashMap.get(accountId) ?? '0');
      const lockedCash = Number(holdMap.get(accountId) ?? '0');
      const availableCash = totalCash - lockedCash;
      return {
        accountId,
        totalCash: totalCash.toFixed(8),
        lockedCash: lockedCash.toFixed(8),
        availableCash: availableCash.toFixed(8),
      };
    });
  }

  // Domain fan-in methods (to be called by OMS/Accounts services)
  publishOrderUpdate(userId: string, data: any) {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit('order.updated', {
      type: 'order.updated',
      userId,
      seq: Date.now(),
      ts: new Date().toISOString(),
      data,
      v: 1,
    });
  }

  publishPositionUpdate(userId: string, data: any) {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit('position.updated', {
      type: 'position.updated',
      userId,
      seq: Date.now(),
      ts: new Date().toISOString(),
      data,
      v: 1,
    });
  }

  publishAccountUpdate(userId: string, data: any) {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit('account.updated', {
      type: 'account.updated',
      userId,
      seq: Date.now(),
      ts: new Date().toISOString(),
      data,
      v: 1,
    });
  }
}


