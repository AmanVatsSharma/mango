/**
 * @file src/modules/accounts/services/deposits.service.ts
 * @module accounts
 * @description Handles deposit requests and approval, integrating with cash ledger
 * @author BharatERP
 * @created 2025-01-09
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepositRequestEntity } from '../entities/deposit-request.entity';
import { AccountEntity } from '../entities/account.entity';
import { AppLoggerService } from '../../../shared/logger';
import { getRequestContext } from '../../../shared/request-context';
import { CreateDepositRequestDto } from '../dtos/create-deposit-request.dto';
import { AppError } from '../../../common/errors/app-error';
import { DemoAccountOperationError } from '../../../common/errors/domain.errors';
import { LedgerService } from './ledger.service';
import { AccountsService } from './accounts.service';
import { CashCreditDebitDto } from '../dtos/cash-credit-debit.dto';
import { NotificationService } from '../../notifications/services/notification.service';

@Injectable()
export class DepositsService {
  constructor(
    @InjectRepository(DepositRequestEntity)
    private readonly deposits: Repository<DepositRequestEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly logger: AppLoggerService,
    private readonly ledger: LedgerService,
    private readonly accountsService: AccountsService,
    private readonly notifications: NotificationService,
  ) {
    this.logger.setContext(DepositsService.name);
  }

  async requestDeposit(
    dto: CreateDepositRequestDto,
    userId: string,
  ): Promise<DepositRequestEntity> {
    const ctx = getRequestContext();
    if (!ctx?.tenantId) {
      throw new AppError('VALIDATION_ERROR', 'Tenant context missing');
    }
    const account = await this.accountsService.getById(dto.accountId);
    if (account?.accountType === 'DEMO') {
      throw new DemoAccountOperationError('Deposits are not allowed for demo accounts');
    }
    this.logger.debug('requestDeposit', { tenantId: ctx.tenantId, userId, externalRefId: dto.externalRefId });

    const existing = await this.deposits.findOne({
      where: { tenantId: ctx.tenantId, externalRefId: dto.externalRefId },
    });
    if (existing) {
      if (
        existing.accountId !== dto.accountId ||
        existing.amount !== dto.amount ||
        existing.currency !== dto.currency
      ) {
        throw new AppError(
          'DUPLICATE_RESOURCE',
          'externalRefId already used with different payload',
        );
      }
      return existing;
    }

    const entity = this.deposits.create({
      tenantId: ctx.tenantId,
      userId,
      accountId: dto.accountId,
      amount: dto.amount,
      currency: dto.currency,
      externalRefId: dto.externalRefId,
      referenceNote: dto.referenceNote ?? null,
      proofUrl: dto.proofUrl ?? null,
      status: 'PENDING',
    });
    return this.deposits.save(entity);
  }

  async approve(depositId: string, adminUserId: string): Promise<DepositRequestEntity> {
    const ctx = getRequestContext();
    if (!ctx?.tenantId) {
      throw new AppError('VALIDATION_ERROR', 'Tenant context missing');
    }
    this.logger.debug('approveDeposit', { tenantId: ctx.tenantId, adminUserId, depositId });

    const deposit = await this.deposits.findOne({
      where: { id: depositId, tenantId: ctx.tenantId },
    });
    if (!deposit) throw new AppError('RESOURCE_NOT_FOUND', 'Deposit request not found');
    if (deposit.status !== 'PENDING') return deposit;

    const cashDto: CashCreditDebitDto = {
      amount: deposit.amount,
      currency: deposit.currency,
      direction: 'credit',
      kind: 'deposit',
      externalRefId: `deposit:${deposit.externalRefId}`,
    };
    await this.ledger.postCash(deposit.accountId, cashDto);

    deposit.status = 'APPROVED';
    deposit.approvedAt = new Date();
    deposit.approvedBy = adminUserId;
    deposit.meta = { ...(deposit.meta ?? {}), approved: true };
    await this.deposits.save(deposit);
    await this.notifications.send({
      userId: deposit.userId,
      type: 'deposit.approved',
      title: 'Deposit approved',
      bodyTemplate: 'Your deposit of {{amount}} {{currency}} has been approved.',
      vars: { amount: deposit.amount, currency: deposit.currency },
      channels: ['in-app', 'email'],
      category: 'funds',
    });
    return deposit;
  }

  async reject(depositId: string, adminUserId: string, reason?: string): Promise<DepositRequestEntity> {
    const ctx = getRequestContext();
    if (!ctx?.tenantId) {
      throw new AppError('VALIDATION_ERROR', 'Tenant context missing');
    }
    this.logger.debug('rejectDeposit', { tenantId: ctx.tenantId, adminUserId, depositId });

    const deposit = await this.deposits.findOne({
      where: { id: depositId, tenantId: ctx.tenantId },
    });
    if (!deposit) throw new AppError('RESOURCE_NOT_FOUND', 'Deposit request not found');
    if (deposit.status !== 'PENDING') return deposit;

    deposit.status = 'REJECTED';
    deposit.approvedAt = new Date();
    deposit.approvedBy = adminUserId;
    deposit.meta = { ...(deposit.meta ?? {}), rejected: true, reason: reason ?? null };
    await this.deposits.save(deposit);
    await this.notifications.send({
      userId: deposit.userId,
      type: 'deposit.rejected',
      title: 'Deposit rejected',
      bodyTemplate: 'Your deposit of {{amount}} {{currency}} was rejected. Reason: {{reason}}',
      vars: { amount: deposit.amount, currency: deposit.currency, reason: reason ?? 'N/A' },
      channels: ['in-app', 'email'],
      category: 'funds',
    });
    return deposit;
  }

  async listMine(userId: string): Promise<DepositRequestEntity[]> {
    const ctx = getRequestContext();
    if (!ctx?.tenantId) {
      throw new AppError('VALIDATION_ERROR', 'Tenant context missing');
    }
    this.logger.debug('listDepositRequests', { tenantId: ctx.tenantId, userId });
    return this.deposits.find({
      where: { tenantId: ctx.tenantId, userId },
      order: { createdAt: 'DESC' } as any,
    });
  }

  async listAll(): Promise<DepositRequestEntity[]> {
    const ctx = getRequestContext();
    if (!ctx?.tenantId) {
      throw new AppError('VALIDATION_ERROR', 'Tenant context missing');
    }
    return this.deposits.find({
      where: { tenantId: ctx.tenantId },
      order: { createdAt: 'DESC' } as any,
    });
  }

  /**
   * Admin: list all deposits for the tenant with account → user name enrichment.
   * Used by the broker-admin transactions page to display client names.
   */
  async listAllAdmin(): Promise<Array<DepositRequestEntity & { userName?: string | null }>> {
    const ctx = getRequestContext();
    if (!ctx?.tenantId) {
      throw new AppError('VALIDATION_ERROR', 'Tenant context missing');
    }
    const rows = await this.deposits.find({
      where: { tenantId: ctx.tenantId },
      order: { createdAt: 'DESC' } as any,
    });
    if (rows.length === 0) return rows;

    // Batch-fetch accounts to resolve account → user relationship
    const accountIds = [...new Set(rows.map(r => r.accountId))];
    const accountMap = new Map<string, AccountEntity>();
    await Promise.all(
      accountIds.map(aid =>
        this.accounts.findOne({ where: { id: aid } }).then(acc => {
          if (acc) accountMap.set(aid, acc);
        }),
      ),
    );

    // User names are resolved by the frontend via GET /admin/users
    // We attach account info for reference
    return rows.map(r => ({
      ...r,
      userName: null as string | null,
      accountDisplayId: accountMap.get(r.accountId)?.id.slice(0, 8) ?? r.accountId.slice(0, 8),
    })) as any;
  }
}

