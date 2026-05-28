/**
 * @file src/modules/accounts/services/statements.service.ts
 * @module accounts
 * @description Generate and list daily statements; EOD job with cash/PnL computation
 * @author BharatERP
 * @created 2025-09-19
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DailyStatementEntity } from '../entities/daily-statement.entity';
import { AppLoggerService } from '../../../shared/logger';
import { getRequestContext } from '../../../shared/request-context';
import { CashLedgerEntryEntity } from '../entities/cash-ledger-entry.entity';
import { PositionLedgerEntryEntity } from '../entities/position-ledger-entry.entity';
import { InstrumentsService } from '../../market/services/instruments.service';
import { PriceFeedService } from '../../market/services/price-feed.service';
import { Parser as CsvParser } from 'json2csv';
import PDFDocument = require('pdfkit');
import { NotificationService } from '../../notifications/services/notification.service';
import { AccountsRiskService } from './accounts-risk.service';

@Injectable()
export class StatementsService {
  constructor(
    @InjectRepository(DailyStatementEntity)
    private readonly daily: Repository<DailyStatementEntity>,
    @InjectRepository(CashLedgerEntryEntity)
    private readonly cash: Repository<CashLedgerEntryEntity>,
    @InjectRepository(PositionLedgerEntryEntity)
    private readonly positions: Repository<PositionLedgerEntryEntity>,
    private readonly logger: AppLoggerService,
    private readonly instruments: InstrumentsService,
    private readonly prices: PriceFeedService,
    private readonly riskConfig: AccountsRiskService,
    private readonly notifications: NotificationService,
  ) {
    this.logger.setContext(StatementsService.name);
  }

  async exportStatement(
    accountId: string,
    date: string,
    format: 'pdf' | 'csv' = 'pdf',
  ): Promise<{ filename: string; mime: string; buffer: Buffer }> {
    const ctx = getRequestContext();
    if (!ctx?.tenantId) {
      throw new Error('Tenant context missing');
    }
    const stmt = await this.daily.findOne({
      where: { tenantId: ctx.tenantId, accountId, date },
    });
    if (!stmt) {
      throw new Error('Statement not found');
    }
    // Async notification stub for statement readiness (email dispatch to be added via NotificationService integration)
    await this.notifications.send({
      userId: ctx.userId ?? accountId,
      type: 'statement.ready',
      title: 'Statement ready',
      bodyTemplate: 'Your statement for {{date}} is ready for download.',
      vars: { date },
      channels: ['in-app', 'email'],
      category: 'statements',
      inAppOnly: false,
    });
    if (format === 'csv') {
      const parser = new CsvParser();
      const csv = parser.parse([stmt]);
      return {
        filename: `statement-${accountId}-${date}.csv`,
        mime: 'text/csv',
        buffer: Buffer.from(csv, 'utf8'),
      };
    }
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('error', (e) => this.logger.error('PDF generation failed', e.stack));

    doc.fontSize(16).text('Daily Statement', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10);
    doc.text(`Tenant: ${ctx.tenantId}`);
    doc.text(`Account: ${accountId}`);
    doc.text(`Date: ${date}`);
    doc.moveDown();
    doc.text(`Opening Cash: ${stmt.openingCash}`);
    doc.text(`Closing Cash: ${stmt.closingCash}`);
    doc.text(`Deposits: ${stmt.deposits}`);
    doc.text(`Withdrawals: ${stmt.withdrawals}`);
    doc.text(`Fees: ${stmt.fees}`);
    doc.text(`Realized PnL: ${stmt.realizedPnl}`);
    doc.text(`Unrealized PnL: ${stmt.unrealizedPnl}`);
    doc.text(`Equity: ${stmt.equity}`);
    doc.text(`Maintenance Margin: ${stmt.maintenanceMargin}`);
    doc.text(`Buying Power: ${stmt.buyingPower}`);
    doc.end();

    const buffer: Buffer = await new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    return {
      filename: `statement-${accountId}-${date}.pdf`,
      mime: 'application/pdf',
      buffer,
    };
  }

  async listStatements(
    accountId: string,
    query: { from?: string; to?: string },
  ): Promise<DailyStatementEntity[]> {
    const ctx = getRequestContext();
    const qb = this.daily
      .createQueryBuilder('d')
      .where('d.tenant_id = :tenantId AND d.account_id = :accountId', {
        tenantId: ctx.tenantId,
        accountId,
      });
    if (query.from) qb.andWhere('d.date >= :from', { from: query.from });
    if (query.to) qb.andWhere('d.date <= :to', { to: query.to });
    this.logger.debug('listStatements()', { accountId, query });
    return qb.orderBy('d.date', 'DESC').getMany();
  }

  // EOD job: compute statement with cash flows and MTM
  async generateEodStatement(accountId: string, date: string): Promise<void> {
    const ctx = getRequestContext();
    if (!ctx?.tenantId) return;
    this.logger.debug('generateEodStatement() called', { accountId, date, tenantId: ctx.tenantId });

    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    const openingCash = await this.sumNetCash(accountId, ctx.tenantId, { before: dayStart });
    const closingCash = await this.sumNetCash(accountId, ctx.tenantId, { before: dayEnd });
    const deposits = await this.sumCashByKind(accountId, ctx.tenantId, 'deposit', dayStart, dayEnd);
    const withdrawals = await this.sumCashByKind(accountId, ctx.tenantId, 'withdrawal', dayStart, dayEnd);
    const fees = await this.sumCashByKind(accountId, ctx.tenantId, 'fee', dayStart, dayEnd);

    const { unrealizedPnl, positionsValue } = await this.computeUnrealized(accountId, ctx.tenantId, dayEnd);
    const equity = (Number(closingCash) + positionsValue).toFixed(8);
    const multiplier = await this.riskConfig.getBuyingPowerMultiplier();
    const buyingPower = (Number(equity) * multiplier).toFixed(8);

    const existing = await this.daily.findOne({
      where: { tenantId: ctx.tenantId, accountId, date } as any,
    });
    const stmt = existing ?? this.daily.create({ tenantId: ctx.tenantId, accountId, date });
    stmt.openingCash = openingCash;
    stmt.closingCash = closingCash;
    stmt.deposits = deposits;
    stmt.withdrawals = withdrawals;
    stmt.fees = fees;
    stmt.realizedPnl = stmt.realizedPnl ?? '0';
    stmt.unrealizedPnl = unrealizedPnl.toFixed(8);
    stmt.equity = equity;
    stmt.maintenanceMargin = stmt.maintenanceMargin ?? '0';
    stmt.buyingPower = buyingPower;
    await this.daily.save(stmt);
  }

  private async sumNetCash(
    accountId: string,
    tenantId: string,
    opts: { before: Date },
  ): Promise<string> {
    const row = await this.cash
      .createQueryBuilder('c')
      .select(
        `COALESCE(SUM(CASE WHEN c.direction = 'credit' THEN c.amount::numeric ELSE -c.amount::numeric END), 0)`,
        'sum',
      )
      .where('c.tenant_id = :tenantId AND c.account_id = :accountId AND c.created_at <= :before', {
        tenantId,
        accountId,
        before: opts.before,
      })
      .getRawOne<{ sum: string }>();
    return Number(row?.sum ?? '0').toFixed(8);
  }

  private async sumCashByKind(
    accountId: string,
    tenantId: string,
    kind: string,
    from: Date,
    to: Date,
  ): Promise<string> {
    const row = await this.cash
      .createQueryBuilder('c')
      .select(
        `COALESCE(SUM(CASE WHEN c.direction = 'credit' THEN c.amount::numeric ELSE -c.amount::numeric END), 0)`,
        'sum',
      )
      .where(
        'c.tenant_id = :tenantId AND c.account_id = :accountId AND c.kind = :kind AND c.created_at BETWEEN :from AND :to',
        { tenantId, accountId, kind, from, to },
      )
      .getRawOne<{ sum: string }>();
    return Number(row?.sum ?? '0').toFixed(8);
  }

  private async computeUnrealized(accountId: string, tenantId: string, upTo: Date) {
    const rows = await this.positions
      .createQueryBuilder('p')
      .select('p.instrument_id', 'instrumentId')
      .addSelect('COALESCE(SUM(p.quantity_delta::numeric), 0)', 'netQty')
      .addSelect('COALESCE(SUM(p.quantity_delta::numeric * p.price::numeric), 0)', 'sumQtyPrice')
      .where(
        'p.tenant_id = :tenantId AND p.account_id = :accountId AND p.created_at <= :to',
        { tenantId, accountId, to: upTo },
      )
      .groupBy('p.instrument_id')
      .getRawMany<{ instrumentId: string; netQty: string; sumQtyPrice: string }>();

    let unrealizedPnl = 0;
    let positionsValue = 0;
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
      const mtm = (lastPrice - avgPrice) * netQty;
      unrealizedPnl += mtm;
      positionsValue += lastPrice * netQty;
    }
    return { unrealizedPnl, positionsValue };
  }
}
