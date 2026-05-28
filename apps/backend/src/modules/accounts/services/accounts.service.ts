/**
 * @file src/modules/accounts/services/accounts.service.ts
 * @module accounts
 * @description Business logic for accounts CRUD and access control scoping
 * @author BharatERP
 * @created 2025-09-19
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountEntity } from '../entities/account.entity';
import { CreateAccountDto } from '../dtos/create-account.dto';
import { AppLoggerService } from '../../../shared/logger';
import { getRequestContext } from '../../../shared/request-context';
import { RealtimePublisherService } from '../../realtime/prana-stream/services/realtime-publisher.service';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly logger: AppLoggerService,
    private readonly realtime: RealtimePublisherService,
  ) {
    this.logger.setContext(AccountsService.name);
  }

  async createAccount(dto: CreateAccountDto): Promise<AccountEntity> {
    const ctx = getRequestContext();
    const entity = this.accounts.create({
      tenantId: ctx?.tenantId,
      userId: dto.userId,
      accountType: dto.accountType ?? 'LIVE',
      baseCurrency: dto.baseCurrency,
      status: dto.status ?? 'ACTIVE',
    });
    this.logger.debug('Persisting new account', entity);
    const saved = await this.accounts.save(entity);
    this.realtime.publishAccountUpdate(dto.userId, { account: saved });
    return saved;
  }

  async listMyAccounts(): Promise<AccountEntity[]> {
    const ctx = getRequestContext();
    this.logger.debug('listMyAccounts()', ctx);
    return this.accounts.find({
      where: { tenantId: ctx?.tenantId, userId: ctx?.userId },
    });
  }

  async listByUserAndType(
    tenantId: string,
    userId: string,
    accountType: 'LIVE' | 'DEMO',
  ): Promise<AccountEntity[]> {
    this.logger.debug('listByUserAndType()', { tenantId, userId, accountType });
    return this.accounts.find({
      where: { tenantId, userId, accountType },
    });
  }

  /** Admin-scoped: list all accounts for a tenant, optionally filtered by userId */
  async listByTenant(tenantId: string, userId?: string): Promise<AccountEntity[]> {
    this.logger.debug('listByTenant()', { tenantId, userId });
    return this.accounts.find({
      where: userId ? { tenantId, userId } : { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async getById(id: string): Promise<AccountEntity | null> {
    const ctx = getRequestContext();
    this.logger.debug('getById()', { id, ctx });
    return this.accounts.findOne({ where: { id, tenantId: ctx?.tenantId } });
  }

  async disableAccount(id: string): Promise<AccountEntity | null> {
    const ctx = getRequestContext();
    this.logger.debug('disableAccount()', { id, ctx });
    await this.accounts.update({ id, tenantId: ctx?.tenantId }, { status: 'DISABLED' });
    return this.getById(id);
  }

  async enableAccount(id: string): Promise<AccountEntity | null> {
    const ctx = getRequestContext();
    this.logger.debug('enableAccount()', { id, ctx });
    await this.accounts.update({ id, tenantId: ctx?.tenantId }, { status: 'ACTIVE' });
    return this.getById(id);
  }
}
