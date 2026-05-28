/**
 * @file src/modules/accounts/tests/ledger.service.spec.ts
 * @module accounts
 * @description Unit tests for LedgerService idempotency behavior
 * @author BharatERP
 * @created 2025-09-24
 */

jest.mock('../../../shared/request-context', () => ({
  getRequestContext: () => ({ tenantId: 't', requestId: 'req-1', userId: 'u-1' }),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { LedgerService } from '../services/ledger.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CashLedgerEntryEntity } from '../entities/cash-ledger-entry.entity';
import { HoldEntity } from '../entities/hold.entity';
import { WithdrawalRequestEntity } from '../entities/withdrawal-request.entity';
import { AccountEntity } from '../entities/account.entity';
import { AppLoggerService } from '../../../shared/logger';
import { AppError } from '../../../common/errors/app-error';
import { AccountsService } from '../services/accounts.service';
import { OrderEventsService } from '../../oms/services/order-events.service';

describe('LedgerService idempotency', () => {
  let service: LedgerService;
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    dataSource = { transaction: jest.fn((iso, fn) => fn({
      query: jest.fn(),
      getRepository: (Entity: any) => ({
        findOne: jest.fn(),
        create: jest.fn((x) => x),
        save: jest.fn((x) => ({ id: 'id-1', ...x })),
      }),
    })) } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(CashLedgerEntryEntity), useValue: {} as Partial<Repository<CashLedgerEntryEntity>> },
        { provide: getRepositoryToken(HoldEntity), useValue: {} as Partial<Repository<HoldEntity>> },
        { provide: getRepositoryToken(WithdrawalRequestEntity), useValue: {} as Partial<Repository<WithdrawalRequestEntity>> },
        { provide: getRepositoryToken(AccountEntity), useValue: {} as Partial<Repository<AccountEntity>> },
        { provide: AppLoggerService, useValue: { setContext: jest.fn(), debug: jest.fn() } },
        { provide: require('../../realtime/prana-stream/services/realtime-publisher.service').RealtimePublisherService, useValue: { publishAccountUpdate: jest.fn() } },
        { provide: AccountsService, useValue: { getById: jest.fn().mockResolvedValue({ accountType: 'LIVE' }) } },
        { provide: OrderEventsService, useValue: { publish: jest.fn() } },
      ],
    }).compile();

    service = module.get<LedgerService>(LedgerService);
  });

  it('returns existing entry on perfect idempotent replay (cash)', async () => {
    const existing = {
      id: 'cle-1',
      accountId: 'acc1',
      amount: '100.00',
      currency: 'INR',
      direction: 'credit',
      kind: 'deposit',
      externalRefId: 'ref-1',
      tenantId: 't',
    } as any;
    // override transaction inner repo behavior
    dataSource.transaction.mockImplementation((_iso, fn) => fn({
      query: jest.fn(),
      getRepository: (Entity: any) => ({
        findOne: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
        save: jest.fn(),
      }),
    }));

    const result = await service.postCash('acc1', {
      amount: '100.00', currency: 'INR', direction: 'credit', kind: 'deposit', externalRefId: 'ref-1',
    } as any);
    expect(result).toBe(existing);
  });

  it('throws conflict when externalRefId reused with different payload (cash)', async () => {
    const existing = {
      id: 'cle-1',
      accountId: 'acc1',
      amount: '200.00', // differs
      currency: 'INR',
      direction: 'credit',
      kind: 'deposit',
      externalRefId: 'ref-1',
      tenantId: 't',
    } as any;
    dataSource.transaction.mockImplementation((_iso, fn) => fn({
      query: jest.fn(),
      getRepository: (_: any) => ({
        findOne: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
        save: jest.fn(),
      }),
    }));

    await expect(
      service.postCash('acc1', {
        amount: '100.00', currency: 'INR', direction: 'credit', kind: 'deposit', externalRefId: 'ref-1',
      } as any),
    ).rejects.toBeInstanceOf(AppError);
  });
});


