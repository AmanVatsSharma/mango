/**
 * @file src/modules/accounts/services/ledger.service.ts
 * @module accounts
 * @description Ledger operations: cash postings, holds, withdrawal workflow with per-account advisory locks
 * @author BharatERP
 * @created 2025-09-19
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CashLedgerEntryEntity } from '../entities/cash-ledger-entry.entity';
import { HoldEntity } from '../entities/hold.entity';
import { WithdrawalRequestEntity } from '../entities/withdrawal-request.entity';
import { AccountEntity } from '../entities/account.entity';
import { CashCreditDebitDto } from '../dtos/cash-credit-debit.dto';
import { CashHoldDto, CashReleaseDto } from '../dtos/cash-hold-release.dto';
import { AppLoggerService } from '../../../shared/logger';
import { getRequestContext } from '../../../shared/request-context';
import { AppError } from '../../../common/errors/app-error';
import { DemoAccountOperationError } from '../../../common/errors/domain.errors';
import { PositionLedgerEntryEntity } from '../entities/position-ledger-entry.entity';
import { RealtimePublisherService } from '../../realtime/prana-stream/services/realtime-publisher.service';
import { AccountsService } from './accounts.service';

function lockKey(tenantId: string, accountId: string): number {
  // simple hash, collision risk acceptable within 32-bit advisory locks; avoid crypto for perf
  let hash = 0;
  const input = `${tenantId}:${accountId}`;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return hash;
}

@Injectable()
export class LedgerService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CashLedgerEntryEntity)
    private readonly cashLedger: Repository<CashLedgerEntryEntity>,
    @InjectRepository(HoldEntity)
    private readonly holds: Repository<HoldEntity>,
    @InjectRepository(WithdrawalRequestEntity)
    private readonly withdrawals: Repository<WithdrawalRequestEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly logger: AppLoggerService,
    private readonly realtime: RealtimePublisherService,
    private readonly accountsService: AccountsService,
  ) {
    this.logger.setContext(LedgerService.name);
  }

  async postCash(accountId: string, dto: CashCreditDebitDto) {
    const ctx = getRequestContext();
    this.logger.debug('postCash()', { accountId, dto, ctx });
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [
        lockKey(ctx.tenantId, accountId),
      ]);

      // idempotency check
      const existing = await manager
        .getRepository(CashLedgerEntryEntity)
        .findOne({
          where: { tenantId: ctx.tenantId, externalRefId: dto.externalRefId },
        });
      if (existing) {
        // treat as idempotent conflict when parameters differ
        if (
          existing.accountId !== accountId ||
          existing.amount !== dto.amount ||
          existing.currency !== dto.currency ||
          existing.direction !== dto.direction ||
          existing.kind !== dto.kind
        ) {
          throw new AppError(
            'DUPLICATE_RESOURCE',
            'externalRefId already used with different payload',
          );
        }
        return existing;
      }

      const entry = manager.getRepository(CashLedgerEntryEntity).create({
        tenantId: ctx.tenantId,
        accountId,
        amount: dto.amount,
        currency: dto.currency,
        direction: dto.direction,
        kind: dto.kind,
        externalRefId: dto.externalRefId,
        meta: dto.meta ?? null,
      });
      const saved = await manager.getRepository(CashLedgerEntryEntity).save(entry);
      this.realtime.publishAccountUpdate(ctx.userId ?? accountId, { cash: saved });
      return saved;
    });
  }

  async createHold(accountId: string, dto: CashHoldDto) {
    const ctx = getRequestContext();
    this.logger.debug('createHold()', { accountId, dto, ctx });
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [
        lockKey(ctx.tenantId, accountId),
      ]);

      const existing = await manager.getRepository(HoldEntity).findOne({
        where: { tenantId: ctx.tenantId, externalRefId: dto.externalRefId },
      });
      if (existing) {
        if (
          existing.accountId !== accountId ||
          existing.amount !== dto.amount ||
          existing.currency !== dto.currency ||
          existing.reason !== dto.reason
        ) {
          throw new AppError(
            'DUPLICATE_RESOURCE',
            'externalRefId already used with different payload',
          );
        }
        return existing;
      }

      const hold = manager.getRepository(HoldEntity).create({
        tenantId: ctx.tenantId,
        accountId,
        reason: dto.reason,
        amount: dto.amount,
        currency: dto.currency,
        state: 'ACTIVE',
        externalRefId: dto.externalRefId,
        meta: dto.meta ?? null,
      });
      // also post a ledger entry for hold (direction debit)
      const cash = manager.getRepository(CashLedgerEntryEntity).create({
        tenantId: ctx.tenantId,
        accountId,
        amount: dto.amount,
        currency: dto.currency,
        direction: 'debit',
        kind: 'hold',
        externalRefId: `hold:${dto.externalRefId}`,
        meta: { via: 'hold' },
      });
      const cashSaved = await manager.getRepository(CashLedgerEntryEntity).save(cash);
      const holdSaved = await manager.getRepository(HoldEntity).save(hold);
      this.realtime.publishAccountUpdate(ctx.userId ?? accountId, {
        hold: holdSaved,
        cash: cashSaved,
      });
      return holdSaved;
    });
  }

  async releaseHold(accountId: string, dto: CashReleaseDto) {
    const ctx = getRequestContext();
    this.logger.debug('releaseHold()', { accountId, dto, ctx });
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [
        lockKey(ctx.tenantId, accountId),
      ]);

      const hold = await manager.getRepository(HoldEntity).findOne({
        where: {
          tenantId: ctx.tenantId,
          accountId,
          externalRefId: dto.externalRefId,
          state: 'ACTIVE',
        },
      });
      if (!hold)
        throw new AppError('RESOURCE_NOT_FOUND', 'Active hold not found');

      hold.state = 'RELEASED';
      await manager.getRepository(HoldEntity).save(hold);
      // ledger release (credit)
      const cash = manager.getRepository(CashLedgerEntryEntity).create({
        tenantId: ctx.tenantId,
        accountId,
        amount: hold.amount,
        currency: hold.currency,
        direction: 'credit',
        kind: 'release',
        externalRefId: `release:${dto.externalRefId}`,
        meta: { via: 'hold-release' },
      });
      const cashSaved = await manager.getRepository(CashLedgerEntryEntity).save(cash);
      this.realtime.publishAccountUpdate(ctx.userId ?? accountId, {
        hold,
        cash: cashSaved,
      });
      return hold;
    });
  }

  async postPosition(
    accountId: string,
    payload: {
      instrumentId: string;
      quantityDelta: string; // signed
      price: string;
      fees: string;
      side: 'BUY' | 'SELL';
      externalRefId: string;
      meta?: Record<string, unknown>;
    },
  ) {
    const ctx = getRequestContext();
    this.logger.debug('postPosition()', { accountId, payload });
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [
        lockKey(ctx.tenantId, accountId),
      ]);

      const existing = await manager
        .getRepository(PositionLedgerEntryEntity)
        .findOne({
          where: { tenantId: ctx.tenantId, externalRefId: payload.externalRefId },
        });
      if (existing) {
        if (
          existing.accountId !== accountId ||
          existing.instrumentId !== payload.instrumentId ||
          existing.quantityDelta !== payload.quantityDelta ||
          existing.price !== payload.price ||
          existing.fees !== payload.fees ||
          existing.side !== payload.side
        ) {
          throw new AppError(
            'DUPLICATE_RESOURCE',
            'externalRefId already used with different payload',
          );
        }
        return existing;
      }

      const entry = manager.getRepository(PositionLedgerEntryEntity).create({
        tenantId: ctx.tenantId,
        accountId,
        instrumentId: payload.instrumentId,
        quantityDelta: payload.quantityDelta,
        price: payload.price,
        fees: payload.fees,
        side: payload.side,
        externalRefId: payload.externalRefId,
        meta: payload.meta ?? null,
      });
      const saved = await manager.getRepository(PositionLedgerEntryEntity).save(entry);
      this.realtime.publishPositionUpdate(ctx.userId ?? accountId, {
        position: saved,
      });
      return saved;
    });
  }

  async listCashLedger(
    accountId: string,
    query: {
      from?: string;
      to?: string;
      externalRefId?: string;
      kind?: string;
      offset?: number;
      limit?: number;
    },
  ) {
    const ctx = getRequestContext();
    const qb = this.cashLedger
      .createQueryBuilder('l')
      .where('l.tenant_id = :tenantId AND l.account_id = :accountId', {
        tenantId: ctx.tenantId,
        accountId,
      })
      .orderBy('l.created_at', 'DESC')
      .offset(query.offset ?? 0)
      .limit(Math.min(query.limit ?? 50, 200));
    if (query.from) qb.andWhere('l.created_at >= :from', { from: query.from });
    if (query.to) qb.andWhere('l.created_at <= :to', { to: query.to });
    if (query.externalRefId)
      qb.andWhere('l.external_ref_id = :ref', { ref: query.externalRefId });
    if (query.kind) qb.andWhere('l.kind = :kind', { kind: query.kind });
    this.logger.debug('listCashLedger()', { accountId, query });
    const [rows, count] = await Promise.all([qb.getMany(), qb.getCount()]);
    return { count, rows };
  }

  async requestWithdrawal(
    accountId: string,
    dto: { amount: string; currency: string; externalRefId?: string | null },
  ) {
    const ctx = getRequestContext();
    const account = await this.accountsService.getById(accountId);
    if (account?.accountType === 'DEMO') {
      throw new DemoAccountOperationError('Withdrawals are not allowed for demo accounts');
    }
    this.logger.debug('requestWithdrawal()', { accountId, dto, ctx });
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [
        lockKey(ctx.tenantId, accountId),
      ]);

      const req = manager.getRepository(WithdrawalRequestEntity).create({
        tenantId: ctx.tenantId,
        accountId,
        amount: dto.amount,
        currency: dto.currency,
        state: 'PENDING',
        externalRefId: dto.externalRefId ?? null,
      });
      return manager.getRepository(WithdrawalRequestEntity).save(req);
    });
  }

  async approveWithdrawal(accountId: string, wid: string) {
    const ctx = getRequestContext();
    this.logger.debug('approveWithdrawal()', { accountId, wid, ctx });
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [
        lockKey(ctx.tenantId, accountId),
      ]);
      const repo = manager.getRepository(WithdrawalRequestEntity);
      const wr = await repo.findOne({
        where: { id: wid, tenantId: ctx.tenantId, accountId },
      });
      if (!wr)
        throw new AppError(
          'RESOURCE_NOT_FOUND',
          'Withdrawal request not found',
        );
      if (wr.state !== 'PENDING') return wr;
      wr.state = 'APPROVED';
      await repo.save(wr);
      return wr;
    });
  }

  async rejectWithdrawal(accountId: string, wid: string) {
    const ctx = getRequestContext();
    this.logger.debug('rejectWithdrawal()', { accountId, wid, ctx });
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [
        lockKey(ctx.tenantId, accountId),
      ]);
      const repo = manager.getRepository(WithdrawalRequestEntity);
      const wr = await repo.findOne({
        where: { id: wid, tenantId: ctx.tenantId, accountId },
      });
      if (!wr)
        throw new AppError(
          'RESOURCE_NOT_FOUND',
          'Withdrawal request not found',
        );
      if (wr.state !== 'PENDING') return wr;
      wr.state = 'REJECTED';
      await repo.save(wr);
      return wr;
    });
  }

  async listWithdrawals(accountId: string) {
    const ctx = getRequestContext();
    this.logger.debug('listWithdrawals()', { accountId, ctx });
    return this.withdrawals.find({
      where: { tenantId: ctx.tenantId, accountId },
      order: { createdAt: 'DESC' } as any,
    });
  }

  /**
   * Admin: list all withdrawal requests across the tenant (not just one account).
   * Supports optional filtering by accountId and state, plus pagination.
   * Enriches each withdrawal with account → user name for display in broker admin.
   */
  async listAllWithdrawals(opts: {
    accountId?: string;
    state?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'FULFILLED';
    limit?: number;
    offset?: number;
  }) {
    const ctx = getRequestContext();
    const { accountId, state, limit = 50, offset = 0 } = opts;
    this.logger.debug('listAllWithdrawals()', { ctx, accountId, state, limit, offset });

    const where: any = { tenantId: ctx.tenantId };
    if (accountId) where.accountId = accountId;
    if (state) where.state = state;

    const [rows, total] = await Promise.all([
      this.withdrawals.find({
        where,
        order: { createdAt: 'DESC' } as any,
        take: limit,
        skip: offset,
      }),
      this.withdrawals.count({ where }),
    ]);

    // Batch-fetch account → user name mapping so frontend can show client names
    const accountIds = [...new Set(rows.map(r => r.accountId))];
    const accountUserMap = new Map<string, string>();
    const accountMap = new Map<string, AccountEntity>();
    await Promise.all(
      accountIds.map(aid =>
        this.accounts.findOne({ where: { id: aid } }).then(acc => {
          if (acc) {
            accountMap.set(aid, acc);
            // userId is stored on the account; we use the accountId as identifier for now
            // User name lookup requires UsersService which LedgerService doesn't have access to
            // The frontend resolves clientName via GET /admin/users as a fallback
            accountUserMap.set(aid, acc.id); // store accountId for enrichment in frontend
          }
        }),
      ),
    );

    const enriched = rows.map(w => ({
      ...w,
      userName: null, // resolved by frontend via GET /admin/users
      accountDisplayId: accountMap.get(w.accountId)?.id.slice(0, 8) ?? w.accountId.slice(0, 8),
    }));

    return { data: enriched, total, limit, offset };
  }

  /**
   * Admin: approve a withdrawal by its UUID (resolves accountId from the entity).
   * Requires tenantId match from request context.
   */
  async approveWithdrawalById(wid: string) {
    const ctx = getRequestContext();
    this.logger.debug('approveWithdrawalById()', { wid, ctx });

    const wr = await this.withdrawals.findOne({
      where: { id: wid, tenantId: ctx.tenantId } as any,
    });
    if (!wr) throw new AppError('RESOURCE_NOT_FOUND', 'Withdrawal request not found');
    if (wr.state !== 'PENDING') return wr;

    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [
        lockKey(ctx.tenantId, wr.accountId),
      ]);
      const repo = manager.getRepository(WithdrawalRequestEntity);
      const fresh = await repo.findOne({ where: { id: wid, tenantId: ctx.tenantId } as any });
      if (!fresh) throw new AppError('RESOURCE_NOT_FOUND', 'Withdrawal request not found');
      if (fresh.state !== 'PENDING') return fresh;
      fresh.state = 'APPROVED';
      return repo.save(fresh);
    });
  }

  /**
   * Admin: reject a withdrawal by its UUID.
   */
  async rejectWithdrawalById(wid: string, reason?: string) {
    const ctx = getRequestContext();
    this.logger.debug('rejectWithdrawalById()', { wid, reason, ctx });

    const wr = await this.withdrawals.findOne({
      where: { id: wid, tenantId: ctx.tenantId } as any,
    });
    if (!wr) throw new AppError('RESOURCE_NOT_FOUND', 'Withdrawal request not found');
    if (wr.state !== 'PENDING') return wr;

    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [
        lockKey(ctx.tenantId, wr.accountId),
      ]);
      const repo = manager.getRepository(WithdrawalRequestEntity);
      const fresh = await repo.findOne({ where: { id: wid, tenantId: ctx.tenantId } as any });
      if (!fresh) throw new AppError('RESOURCE_NOT_FOUND', 'Withdrawal request not found');
      if (fresh.state !== 'PENDING') return fresh;
      fresh.state = 'REJECTED';
      fresh.meta = { ...(fresh.meta ?? {}), rejectedReason: reason ?? null };
      return repo.save(fresh);
    });
  }
}
