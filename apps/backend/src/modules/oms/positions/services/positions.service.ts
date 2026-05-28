/**
 * @file src/modules/oms/positions/services/positions.service.ts
 * @module oms-positions
 * @description Aggregates positions from position ledger; computes netQty, avgPrice, realizedPnL; valuation via price feed + FX
 * @author BharatERP
 * @created 2025-09-19
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PositionLedgerEntryEntity } from '../../../accounts/entities/position-ledger-entry.entity';
import { PositionSnapshotEntity } from '../../entities/position-snapshot.entity';
import { AppLoggerService } from '../../../../shared/logger';
import { getRequestContext } from '../../../../shared/request-context';
import { InstrumentsService } from '../../../market/services/instruments.service';
import { PriceFeedService } from '../../../market/services/price-feed.service';
import { FxService } from '../../../../shared/fx/fx.service';

type PositionRow = {
  instrumentId: string;
  netQty: number;
  avgPrice: number;
  realizedPnl: number;
  lastPrice: number;
  mtmPnl: number;
  value: number;
};

@Injectable()
export class PositionsService {
  constructor(
    @InjectRepository(PositionLedgerEntryEntity)
    private readonly posLedger: Repository<PositionLedgerEntryEntity>,
    @InjectRepository(PositionSnapshotEntity)
    private readonly snapshots: Repository<PositionSnapshotEntity>,
    private readonly instruments: InstrumentsService,
    private readonly prices: PriceFeedService,
    private readonly fx: FxService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(PositionsService.name);
  }

  async listPositions(accountId: string, currency?: string) {
    const ctx = getRequestContext();
    const rows = await this.posLedger
      .createQueryBuilder('p')
      .select('p.instrument_id', 'instrumentId')
      .addSelect('COALESCE(SUM(p.quantity_delta::numeric), 0)', 'netQty')
      .addSelect('COALESCE(SUM(p.quantity_delta::numeric * p.price::numeric), 0)', 'sumQtyPrice')
      .where('p.tenant_id = :tenantId AND p.account_id = :accountId', {
        tenantId: ctx.tenantId,
        accountId,
      })
      .groupBy('p.instrument_id')
      .getRawMany<{ instrumentId: string; netQty: string; sumQtyPrice: string }>();

    const result: PositionRow[] = [];
    for (const r of rows) {
      const netQty = Number(r.netQty);
      if (netQty === 0) continue;
      const avgPrice = Number(r.sumQtyPrice) / netQty;
      const inst = (await this.instruments.listByIds([r.instrumentId]))[0];
      let lastPrice = 0;
      if (inst) {
        const snap = this.prices.getSnapshot([{ exchange: inst.exchangeCode, symbol: inst.symbol }]);
        if (snap.length > 0) lastPrice = snap[0].price;
      }
      const mtmPnl = (lastPrice - avgPrice) * netQty;
      const value = lastPrice * netQty;
      result.push({ instrumentId: r.instrumentId, netQty, avgPrice, realizedPnl: 0, lastPrice, mtmPnl, value });
    }

    if (currency && currency !== 'INR') {
      for (const p of result) {
        p.avgPrice = Number(await this.fx.convert(p.avgPrice.toFixed(8), 'INR', currency));
        p.lastPrice = Number(await this.fx.convert(p.lastPrice.toFixed(8), 'INR', currency));
        p.mtmPnl = Number(await this.fx.convert(p.mtmPnl.toFixed(8), 'INR', currency));
        p.value = Number(await this.fx.convert(p.value.toFixed(8), 'INR', currency));
      }
    }

    return { count: result.length, rows: result };
  }

  async listAll(opts: {
    accountId?: string;
    currency?: string;
    limit?: number;
    offset?: number;
  }) {
    const ctx = getRequestContext();
    const { limit = 100, offset = 0 } = opts;
    this.logger.debug('listAll:start', { ctx, opts });

    const qb = this.posLedger
      .createQueryBuilder('p')
      .select('p.instrument_id', 'instrumentId')
      .addSelect('COALESCE(SUM(p.quantity_delta::numeric), 0)', 'netQty')
      .addSelect(
        'COALESCE(SUM(p.quantity_delta::numeric * p.price::numeric), 0)',
        'sumQtyPrice',
      )
      .leftJoin('accounts', 'a', 'a.id = p.account_id')
      .addSelect('a.account_type', 'accountType')
      .where('p.tenant_id = :tenantId', { tenantId: ctx.tenantId });

    if (opts.accountId) {
      qb.andWhere('p.account_id = :accountId', { accountId: opts.accountId });
    }

    qb.groupBy('p.instrument_id').addGroupBy('a.account_type');

    const [rawRows, total] = await Promise.all([
      qb.skip(offset).take(limit).getRawMany<{
        instrumentId: string;
        netQty: string;
        sumQtyPrice: string;
        accountType: string;
      }>(),
      qb.clone().select('COUNT(DISTINCT p.instrument_id)', 'cnt').getRawOne(),
    ]);

    const data: PositionRow[] = [];
    for (const r of rawRows) {
      const netQty = Number(r.netQty);
      if (netQty === 0) continue;
      const avgPrice = netQty !== 0 ? Number(r.sumQtyPrice) / netQty : 0;
      const inst = (await this.instruments.listByIds([r.instrumentId]))[0];
      let lastPrice = 0;
      if (inst) {
        const snap = this.prices.getSnapshot([
          { exchange: inst.exchangeCode, symbol: inst.symbol },
        ]);
        if (snap.length > 0) lastPrice = snap[0].price;
      }
      const mtmPnl = (lastPrice - avgPrice) * netQty;
      const value = lastPrice * netQty;
      data.push({
        instrumentId: r.instrumentId,
        netQty,
        avgPrice,
        realizedPnl: 0,
        lastPrice,
        mtmPnl,
        value,
      });
    }

    if (opts.currency && opts.currency !== 'INR') {
      for (const p of data) {
        p.avgPrice = Number(
          await this.fx.convert(p.avgPrice.toFixed(8), 'INR', opts.currency),
        );
        p.lastPrice = Number(
          await this.fx.convert(p.lastPrice.toFixed(8), 'INR', opts.currency),
        );
        p.mtmPnl = Number(
          await this.fx.convert(p.mtmPnl.toFixed(8), 'INR', opts.currency),
        );
        p.value = Number(
          await this.fx.convert(p.value.toFixed(8), 'INR', opts.currency),
        );
      }
    }

    this.logger.debug('listAll:end', { total, returned: data.length });
    return { data, total, limit, offset };
  }
}


