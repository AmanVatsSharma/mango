/**
 * @file src/modules/demo-accounts/services/demo-account.service.ts
 * @module demo-accounts
 * @description Create and list demo accounts with optional virtual balance seed
 * @author BharatERP
 * @created 2026-03-15
 */

import { Injectable } from '@nestjs/common';
import { AccountsService } from '../../accounts/services/accounts.service';
import { LedgerService } from '../../accounts/services/ledger.service';
import { AppLoggerService } from '../../../shared/logger';
import { getRequestContext } from '../../../shared/request-context';
import type { CreateDemoAccountDto } from '../dtos/create-demo-account.dto';
import type { AccountEntity } from '../../accounts/entities/account.entity';

@Injectable()
export class DemoAccountService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly ledgerService: LedgerService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(DemoAccountService.name);
  }

  async createDemoAccount(dto: CreateDemoAccountDto): Promise<AccountEntity> {
    const ctx = getRequestContext();
    const tenantId = ctx?.tenantId;
    const userId = ctx?.userId;
    this.logger.debug('createDemoAccount()', { tenantId, userId, dto });

    const account = await this.accountsService.createAccount({
      userId,
      baseCurrency: dto.baseCurrency ?? 'INR',
      status: 'ACTIVE',
      accountType: 'DEMO',
    });

    if (dto.seedAmount != null && dto.seedAmount > 0) {
      const currency = dto.seedBalanceCcy ?? account.baseCurrency;
      await this.ledgerService.postCash(account.id, {
        amount: String(dto.seedAmount),
        currency,
        direction: 'credit',
        kind: 'adjustment',
        externalRefId: `demo-seed:${account.id}`,
      });
    }

    return account;
  }

  async listDemoAccounts(): Promise<AccountEntity[]> {
    const ctx = getRequestContext();
    const tenantId = ctx?.tenantId;
    const userId = ctx?.userId;
    this.logger.debug('listDemoAccounts()', { tenantId, userId });
    return this.accountsService.listByUserAndType(tenantId, userId, 'DEMO');
  }
}
