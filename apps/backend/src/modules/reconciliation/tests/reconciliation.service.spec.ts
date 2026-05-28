/**
 * File:        apps/backend/src/modules/reconciliation/tests/reconciliation.service.spec.ts
 * Module:      reconciliation
 * Purpose:     Unit tests for ReconciliationService — import, matching, break management.
 *
 * Exports: none (Jest test suite)
 *
 * Depends on:
 *   - ReconciliationService under test
 *   - Jest mocks for repositories and OutboxService
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - importStatement skips 23505 duplicate errors silently
 *   - runReconciliation produces correct break types for each mismatch scenario
 *   - resolveBreak enforces OPEN/ESCALATED → RESOLVED transition
 *   - flagAgingBreaks uses QueryBuilder update, not individual saves
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { OutboxService } from '../../../shared/outbox/outbox.service';
import { ExecutionEntity } from '../../oms/entities/execution.entity';
import { ImportStatementDto, RunReconciliationDto } from '../dtos/import-statement.dto';
import { LpStatementLineEntity } from '../entities/lp-statement-line.entity';
import { ReconciliationBreakEntity } from '../entities/reconciliation-break.entity';
import { ReconciliationService } from '../services/reconciliation.service';

const TENANT = 'f3cb1857-f41b-4615-9ce6-9494fc59de23';
const DATE = '2026-04-24';

function makeExecution(overrides: Partial<ExecutionEntity> = {}): ExecutionEntity {
  return {
    id: 'exec-1',
    tenantId: TENANT,
    orderId: 'order-1',
    accountId: 'acct-1',
    instrumentId: 'inst-1',
    quantity: '10.00000000',
    price: '1500.00000000',
    fees: '0.00000000',
    externalRefId: 'LP-REF-001',
    meta: null,
    createdAt: new Date(`${DATE}T10:00:00Z`),
    ...overrides,
  } as ExecutionEntity;
}

function makeLpLine(overrides: Partial<LpStatementLineEntity> = {}): LpStatementLineEntity {
  return {
    id: 'lp-1',
    tenantId: TENANT,
    statementDate: DATE,
    externalTradeId: 'LP-REF-001',
    lpAccountId: 'lp-acct-1',
    symbol: 'XAUUSD',
    quantity: '10.00000000',
    price: '1500.00000000',
    side: 'BUY',
    importedAt: new Date(),
    ...overrides,
  } as LpStatementLineEntity;
}

describe('ReconciliationService', () => {
  let service: ReconciliationService;

  const breaksRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const lpLinesRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  const executionsRepo = {
    createQueryBuilder: jest.fn(),
  };

  const outbox = { append: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationService,
        { provide: getRepositoryToken(ReconciliationBreakEntity), useValue: breaksRepo },
        { provide: getRepositoryToken(LpStatementLineEntity), useValue: lpLinesRepo },
        { provide: getRepositoryToken(ExecutionEntity), useValue: executionsRepo },
        { provide: OutboxService, useValue: outbox },
        { provide: AppLoggerService, useValue: { setContext: jest.fn(), debug: jest.fn() } },
      ],
    }).compile();

    service = module.get<ReconciliationService>(ReconciliationService);
    jest.clearAllMocks();
  });

  describe('importStatement', () => {
    it('saves new lines and returns them', async () => {
      const line = makeLpLine();
      lpLinesRepo.create.mockReturnValue(line);
      lpLinesRepo.save.mockResolvedValue(line);

      const dto: ImportStatementDto = {
        tenantId: TENANT,
        statementDate: DATE,
        lines: [{ externalTradeId: 'LP-REF-001', symbol: 'XAUUSD', quantity: '10', price: '1500', side: 'BUY' }],
      };

      const result = await service.importStatement(dto);
      expect(result).toHaveLength(1);
      expect(lpLinesRepo.save).toHaveBeenCalledTimes(1);
    });

    it('skips duplicate lines (23505 error) without throwing', async () => {
      lpLinesRepo.create.mockReturnValue({});
      lpLinesRepo.save.mockRejectedValue({ code: '23505' });

      const dto: ImportStatementDto = {
        tenantId: TENANT,
        statementDate: DATE,
        lines: [{ externalTradeId: 'LP-REF-001', symbol: 'XAUUSD', quantity: '10', price: '1500', side: 'BUY' }],
      };

      const result = await service.importStatement(dto);
      expect(result).toHaveLength(0);
    });

    it('rethrows non-duplicate errors', async () => {
      lpLinesRepo.create.mockReturnValue({});
      lpLinesRepo.save.mockRejectedValue(new Error('DB_TIMEOUT'));

      const dto: ImportStatementDto = {
        tenantId: TENANT,
        statementDate: DATE,
        lines: [{ externalTradeId: 'LP-REF-001', symbol: 'XAUUSD', quantity: '10', price: '1500', side: 'BUY' }],
      };

      await expect(service.importStatement(dto)).rejects.toThrow('DB_TIMEOUT');
    });
  });

  describe('runReconciliation', () => {
    function setupRunMocks(lpLines: LpStatementLineEntity[], executions: ExecutionEntity[]) {
      lpLinesRepo.find.mockResolvedValue(lpLines);
      const qb = { where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue(executions) };
      executionsRepo.createQueryBuilder.mockReturnValue(qb);
      const savedBreak = { id: 'break-uuid', ...{} };
      breaksRepo.create.mockReturnValue(savedBreak);
      breaksRepo.save.mockResolvedValue(savedBreak);
    }

    it('returns no breaks when LP and internal match perfectly', async () => {
      setupRunMocks([makeLpLine()], [makeExecution()]);

      const dto: RunReconciliationDto = { tenantId: TENANT, statementDate: DATE };
      const breaks = await service.runReconciliation(dto);
      expect(breaks).toHaveLength(0);
    });

    it('creates UNMATCHED_LP_TRADE break when LP trade has no internal match', async () => {
      setupRunMocks([makeLpLine({ externalTradeId: 'LP-UNKNOWN' })], []);

      const dto: RunReconciliationDto = { tenantId: TENANT, statementDate: DATE };
      const breaks = await service.runReconciliation(dto);
      expect(breaks).toHaveLength(1);
      expect(breaksRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ breakType: 'UNMATCHED_LP_TRADE' }),
      );
    });

    it('creates UNMATCHED_INTERNAL_TRADE break when internal execution has no LP match', async () => {
      setupRunMocks([], [makeExecution({ externalRefId: 'INT-ONLY' })]);

      const dto: RunReconciliationDto = { tenantId: TENANT, statementDate: DATE };
      const breaks = await service.runReconciliation(dto);
      expect(breaks).toHaveLength(1);
      expect(breaksRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ breakType: 'UNMATCHED_INTERNAL_TRADE' }),
      );
    });

    it('creates QUANTITY_MISMATCH break when quantities diverge', async () => {
      const lp = makeLpLine({ quantity: '10.00000000' });
      const exec = makeExecution({ quantity: '9.00000000' });
      setupRunMocks([lp], [exec]);

      const dto: RunReconciliationDto = { tenantId: TENANT, statementDate: DATE };
      const breaks = await service.runReconciliation(dto);
      expect(breaks).toHaveLength(1);
      expect(breaksRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ breakType: 'QUANTITY_MISMATCH' }),
      );
    });

    it('creates PRICE_MISMATCH break when price diverges > 1 bp', async () => {
      const lp = makeLpLine({ price: '1500.00000000' });
      const exec = makeExecution({ price: '1500.30000000' }); // ~2 bps off
      setupRunMocks([lp], [exec]);

      const dto: RunReconciliationDto = { tenantId: TENANT, statementDate: DATE };
      const breaks = await service.runReconciliation(dto);
      expect(breaks).toHaveLength(1);
      expect(breaksRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ breakType: 'PRICE_MISMATCH' }),
      );
    });

    it('does NOT create break when price diverges < 1 bp', async () => {
      const lp = makeLpLine({ price: '1500.00000000' });
      const exec = makeExecution({ price: '1500.00010000' }); // < 0.01 bps
      setupRunMocks([lp], [exec]);

      const dto: RunReconciliationDto = { tenantId: TENANT, statementDate: DATE };
      const breaks = await service.runReconciliation(dto);
      expect(breaks).toHaveLength(0);
    });
  });

  describe('resolveBreak', () => {
    it('transitions OPEN break to RESOLVED', async () => {
      const brk = { id: 'b1', status: 'OPEN', metadata: {} };
      breaksRepo.findOne.mockResolvedValue(brk);
      breaksRepo.save.mockResolvedValue({ ...brk, status: 'RESOLVED' });

      const result = await service.resolveBreak('b1', 'ops-user');
      expect(result.status).toBe('RESOLVED');
      expect(breaksRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'RESOLVED' }));
    });

    it('throws RESOURCE_NOT_FOUND when break does not exist', async () => {
      breaksRepo.findOne.mockResolvedValue(null);
      await expect(service.resolveBreak('missing')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    });

    it('throws VALIDATION_ERROR when break is already RESOLVED', async () => {
      breaksRepo.findOne.mockResolvedValue({ id: 'b1', status: 'RESOLVED', metadata: {} });
      await expect(service.resolveBreak('b1')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });

  describe('flagAgingBreaks', () => {
    it('calls QueryBuilder update and returns affected count', async () => {
      const updateResult = { affected: 3 };
      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(updateResult),
      };
      breaksRepo.createQueryBuilder.mockReturnValue(qb);

      const count = await service.flagAgingBreaks();
      expect(count).toBe(3);
      expect(qb.set).toHaveBeenCalledWith({ isAging: true });
    });
  });
});
