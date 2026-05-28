/**
 * @file src/modules/accounts/services/bank-accounts.service.ts
 * @module accounts
 * @description Manage user bank accounts with basic verification and primary selection
 * @author BharatERP
 * @created 2025-01-09
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankAccountEntity } from '../entities/bank-account.entity';
import { AppLoggerService } from '../../../shared/logger';
import { getRequestContext } from '../../../shared/request-context';
import { CreateBankAccountDto } from '../dtos/create-bank-account.dto';
import { AppError } from '../../../common/errors/app-error';

@Injectable()
export class BankAccountsService {
  constructor(
    @InjectRepository(BankAccountEntity)
    private readonly bankAccounts: Repository<BankAccountEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(BankAccountsService.name);
  }

  async create(dto: CreateBankAccountDto, userId: string): Promise<BankAccountEntity> {
    const ctx = getRequestContext();
    if (!ctx?.tenantId) {
      throw new AppError('VALIDATION_ERROR', 'Tenant context missing');
    }
    this.logger.debug('create bank account', { userId, tenantId: ctx.tenantId, isPrimary: dto.isPrimary });

    const existing = await this.bankAccounts.findOne({
      where: {
        tenantId: ctx.tenantId,
        userId,
        accountNumber: dto.accountNumber,
      },
    });
    if (existing) {
      return existing;
    }

    if (dto.isPrimary) {
      await this.bankAccounts.update(
        { tenantId: ctx.tenantId, userId },
        { isPrimary: false },
      );
    }

    const masked = this.maskAccountNumber(dto.accountNumber);
    const entity = this.bankAccounts.create({
      tenantId: ctx.tenantId,
      userId,
      accountId: dto.accountId ?? null,
      holderName: dto.holderName,
      bankName: dto.bankName,
      accountNumber: dto.accountNumber,
      accountNumberMasked: masked,
      ifscCode: dto.ifscCode,
      status: 'PENDING_VERIFICATION',
      isPrimary: dto.isPrimary ?? false,
      verificationMeta: { mode: 'mock', ts: new Date().toISOString() },
    });
    return this.bankAccounts.save(entity);
  }

  async list(userId: string): Promise<BankAccountEntity[]> {
    const ctx = getRequestContext();
    if (!ctx?.tenantId) {
      throw new AppError('VALIDATION_ERROR', 'Tenant context missing');
    }
    this.logger.debug('list bank accounts', { userId, tenantId: ctx.tenantId });
    return this.bankAccounts.find({
      where: { tenantId: ctx.tenantId, userId },
      order: { createdAt: 'DESC' } as any,
    });
  }

  private maskAccountNumber(value: string): string {
    if (!value || value.length < 4) return '****';
    const last4 = value.slice(-4);
    return `${'*'.repeat(Math.max(0, value.length - 4))}${last4}`;
  }
}

