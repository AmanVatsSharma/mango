/**
 * @file src/modules/demo-accounts/tests/demo-account.service.spec.ts
 * @module demo-accounts
 * @description Unit tests for DemoAccountService
 * @author BharatERP
 * @created 2026-03-15
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DemoAccountService } from '../services/demo-account.service';
import { AccountsService } from '../../accounts/services/accounts.service';
import { LedgerService } from '../../accounts/services/ledger.service';
import { AppLoggerService } from '../../../shared/logger';

jest.mock('../../../shared/request-context', () => ({
  getRequestContext: () => ({ tenantId: 't1', userId: 'u1' }),
}));

describe('DemoAccountService', () => {
  let service: DemoAccountService;
  let accountsService: { createAccount: jest.Mock; listByUserAndType: jest.Mock };
  let ledgerService: { postCash: jest.Mock };

  beforeEach(async () => {
    accountsService = {
      createAccount: jest.fn().mockResolvedValue({ id: 'acc-1', accountType: 'DEMO', baseCurrency: 'INR' }),
      listByUserAndType: jest.fn().mockResolvedValue([]),
    };
    ledgerService = { postCash: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemoAccountService,
        { provide: AccountsService, useValue: accountsService },
        { provide: LedgerService, useValue: ledgerService },
        { provide: AppLoggerService, useValue: { setContext: jest.fn(), debug: jest.fn() } },
      ],
    }).compile();
    service = module.get(DemoAccountService);
  });

  it('creates demo account with accountType DEMO', async () => {
    const result = await service.createDemoAccount({});
    expect(accountsService.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', baseCurrency: 'INR', status: 'ACTIVE', accountType: 'DEMO' }),
    );
    expect(result.accountType).toBe('DEMO');
    expect(ledgerService.postCash).not.toHaveBeenCalled();
  });

  it('seeds balance when seedAmount provided', async () => {
    await service.createDemoAccount({ seedAmount: 100000, seedBalanceCcy: 'INR' });
    expect(accountsService.createAccount).toHaveBeenCalled();
    expect(ledgerService.postCash).toHaveBeenCalledWith(
      'acc-1',
      expect.objectContaining({
        amount: '100000',
        currency: 'INR',
        direction: 'credit',
        kind: 'adjustment',
      }),
    );
  });

  it('listDemoAccounts calls listByUserAndType with DEMO', async () => {
    accountsService.listByUserAndType.mockResolvedValue([{ id: 'acc-1', accountType: 'DEMO' }]);
    const list = await service.listDemoAccounts();
    expect(accountsService.listByUserAndType).toHaveBeenCalledWith('t1', 'u1', 'DEMO');
    expect(list).toHaveLength(1);
    expect(list[0].accountType).toBe('DEMO');
  });
});
