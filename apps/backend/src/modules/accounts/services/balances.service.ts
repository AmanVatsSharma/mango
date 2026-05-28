/**
 * @file src/modules/accounts/services/balances.service.ts
 * @module accounts
 * @description Computes balances and positions valuation with FX conversion and buying power
 * @author BharatERP
 * @created 2025-09-19
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashLedgerEntryEntity } from '../entities/cash-ledger-entry.entity';
import { HoldEntity } from '../entities/hold.entity';
import { PositionLedgerEntryEntity } from '../entities/position-ledger-entry.entity';
import { FxService } from '../../../shared/fx/fx.service';
import { AppLoggerService } from '../../../shared/logger';
import { getRequestContext } from '../../../shared/request-context';
import { PriceFeedService } from '../../market/services/price-feed.service';
import { InstrumentsService } from '../../market/services/instruments.service';
import { AccountsRiskService } from './accounts-risk.service';

type BalancesResult = {
  totalCash: string;
  lockedCash: string;
  availableCash: string;
  positionsValue: string;
  unrealizedPnl: string;
  equity: string;
  buyingPower: string;
  currency: string;
};

@Injectable()
export class BalancesService {
  constructor(
    @InjectRepository(CashLedgerEntryEntity)
    private readonly cash: Repository<CashLedgerEntryEntity>,
    @InjectRepository(HoldEntity)
    private readonly holds: Repository<HoldEntity>,
    @InjectRepository(PositionLedgerEntryEntity)
    private readonly pos: Repository<PositionLedgerEntryEntity>,
    private readonly prices: PriceFeedService,
    private readonly instrumentsService: InstrumentsService,
    private readonly fx: FxService,
    private readonly riskConfig: AccountsRiskService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(BalancesService.name);
  }

  async getBalances(
    accountId: string,
    query: { currency?: string },
  ): Promise<BalancesResult> {
    const ctx = getRequestContext();
    const tenantId = ctx.tenantId;
    this.logger.debug('getBalances()', { accountId, tenantId, query });

    // Sum cash credits/debits by direction
    const credits = await this.cash
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.amount::numeric), 0)', 'sum')
      .where(
        "c.tenant_id = :tenantId AND c.account_id = :accountId AND c.direction = 'credit'",
        { tenantId, accountId },
      )
      .getRawOne<{ sum: string }>();
    const debits = await this.cash
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.amount::numeric), 0)', 'sum')
      .where(
        "c.tenant_id = :tenantId AND c.account_id = :accountId AND c.direction = 'debit'",
        { tenantId, accountId },
      )
      .getRawOne<{ sum: string }>();
    const totalCash = (
      Number(credits?.sum ?? '0') - Number(debits?.sum ?? '0')
    ).toFixed(8);

    const locked = await this.holds
      .createQueryBuilder('h')
      .select('COALESCE(SUM(h.amount::numeric), 0)', 'sum')
      .where(
        "h.tenant_id = :tenantId AND h.account_id = :accountId AND h.state = 'ACTIVE'",
        { tenantId, accountId },
      )
      .getRawOne<{ sum: string }>();
    const lockedCash = Number(locked?.sum ?? '0').toFixed(8);

    const availableCash = (Number(totalCash) - Number(lockedCash)).toFixed(8);

    // Aggregate positions by instrument
    const rows = await this.pos
      .createQueryBuilder('p')
      .select('p.instrument_id', 'instrumentId')
      .addSelect('COALESCE(SUM(p.quantity_delta::numeric), 0)', 'netQty')
      .where('p.tenant_id = :tenantId AND p.account_id = :accountId', {
        tenantId,
        accountId,
      })
      .groupBy('p.instrument_id')
      .getRawMany<{ instrumentId: string; netQty: string }>();

    let positionsValueNum = 0;
    const unrealizedPnlNum = 0;

    // Mark-to-market using latest price snapshots when available
    for (const r of rows) {
      const netQty = Number(r.netQty);
      if (netQty === 0) continue;
      // Retrieve instrument to map to exchange and symbol (simplified: uses id list API)
      const instruments = await this.instrumentsService.listByIds([r.instrumentId]);
      const inst = instruments[0];
      let last = 0;
      if (inst) {
        const snap = this.prices.getSnapshot([{ exchange: inst.exchangeCode, symbol: inst.symbol }]);
        if (snap.length > 0) last = snap[0].price;
      }
      positionsValueNum += netQty * last;
    }

    const positionsValue = positionsValueNum.toFixed(8);
    const unrealizedPnl = unrealizedPnlNum.toFixed(8);
    const equity = (Number(availableCash) + Number(positionsValue)).toFixed(8);

    // Buying power via OMS risk config
    const multiplier = await this.riskConfig.getBuyingPowerMultiplier();
    const buyingPower = (Number(equity) * multiplier).toFixed(8);

    return {
      totalCash: await this.fx.convert(totalCash, 'INR', query.currency ?? 'INR'),
      lockedCash: await this.fx.convert(lockedCash, 'INR', query.currency ?? 'INR'),
      availableCash: await this.fx.convert(availableCash, 'INR', query.currency ?? 'INR'),
      positionsValue: await this.fx.convert(positionsValue, 'INR', query.currency ?? 'INR'),
      unrealizedPnl: await this.fx.convert(unrealizedPnl, 'INR', query.currency ?? 'INR'),
      equity: await this.fx.convert(equity, 'INR', query.currency ?? 'INR'),
      buyingPower: await this.fx.convert(buyingPower, 'INR', query.currency ?? 'INR'),
      currency: query.currency ?? 'INR',
    };
  }
}
