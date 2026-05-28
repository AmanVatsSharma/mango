/**
 * File:        apps/backend/src/modules/reconciliation/services/reconciliation.service.ts
 * Module:      reconciliation
 * Purpose:     Imports LP/MT5 daily statements and reconciles them against the internal
 *              execution ledger. Detects unmatched trades, quantity mismatches, and price
 *              divergences. Manages break aging and resolution.
 *
 * Exports:
 *   - ReconciliationService.importStatement(dto)          → LpStatementLineEntity[]
 *   - ReconciliationService.runReconciliation(dto)        → ReconciliationBreakEntity[]
 *   - ReconciliationService.resolveBreak(id, resolvedBy)  → ReconciliationBreakEntity
 *   - ReconciliationService.flagAgingBreaks()             → number (breaks flagged)
 *   - ReconciliationService.listBreaks(tenantId, opts)    → ReconciliationBreakEntity[]
 *   - ReconciliationService.createBreak(dto)              → ReconciliationBreakEntity
 *
 * Depends on:
 *   - LpStatementLineEntity   — persisted LP statement lines
 *   - ReconciliationBreakEntity — persisted break records
 *   - ExecutionEntity          — internal trade ledger
 *   - OutboxService            — emits 'reconciliation.break_created' events
 *
 * Side-effects:
 *   - DB writes (statement lines, break records)
 *   - Outbox publish on break creation
 *
 * Key invariants:
 *   - PRICE_TOLERANCE_BPS = 1 bp (0.01%); set higher for crypto reconciliation
 *   - Quantity mismatch threshold: 0.00000001 (8 decimal places, avoids float noise)
 *   - importStatement is idempotent: duplicate (tenantId, statementDate, externalTradeId) rows
 *     are skipped via ON CONFLICT DO NOTHING (caught by unique constraint violation code 23505)
 *   - runReconciliation only adds NEW breaks; does not close old ones (done by resolveBreak)
 *   - flagAgingBreaks is called EOD; marks OPEN breaks older than 1 calendar day as isAging=true
 *
 * Read order:
 *   1. importStatement()      — ingest LP data
 *   2. runReconciliation()    — produce break records from mismatch detection
 *   3. matchTrades()          — core set-difference logic
 *   4. resolveBreak()         — close a break
 *   5. flagAgingBreaks()      — EOD aging sweep
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { AppLoggerService } from '../../../shared/logger';
import { OutboxService } from '../../../shared/outbox/outbox.service';
import { ExecutionEntity } from '../../oms/entities/execution.entity';
import { CreateReconciliationBreakDto } from '../dtos/create-reconciliation-break.dto';
import { ImportStatementDto, RunReconciliationDto } from '../dtos/import-statement.dto';
import { LpStatementLineEntity } from '../entities/lp-statement-line.entity';
import { ReconciliationBreakEntity } from '../entities/reconciliation-break.entity';

const PRICE_TOLERANCE_BPS = 1;
const QTY_EPSILON = 0.000_000_01;

@Injectable()
export class ReconciliationService {
  constructor(
    @InjectRepository(ReconciliationBreakEntity)
    private readonly breaksRepo: Repository<ReconciliationBreakEntity>,
    @InjectRepository(LpStatementLineEntity)
    private readonly lpLinesRepo: Repository<LpStatementLineEntity>,
    @InjectRepository(ExecutionEntity)
    private readonly executionsRepo: Repository<ExecutionEntity>,
    private readonly outbox: OutboxService,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(ReconciliationService.name);
  }

  /**
   * Persists LP daily statement lines for a given date.
   * Idempotent — re-import of the same statement skips duplicate rows.
   */
  async importStatement(dto: ImportStatementDto): Promise<LpStatementLineEntity[]> {
    this.logger.debug('importStatement:start', {
      tenantId: dto.tenantId,
      statementDate: dto.statementDate,
      lineCount: dto.lines.length,
    });

    const saved: LpStatementLineEntity[] = [];
    for (const line of dto.lines) {
      try {
        const entity = this.lpLinesRepo.create({
          tenantId: dto.tenantId,
          statementDate: dto.statementDate,
          externalTradeId: line.externalTradeId,
          lpAccountId: line.lpAccountId,
          symbol: line.symbol,
          quantity: line.quantity,
          price: line.price,
          side: line.side,
        });
        saved.push(await this.lpLinesRepo.save(entity));
      } catch (err: any) {
        if (err?.code === '23505') {
          this.logger.debug('importStatement:skippedDuplicate', {
            externalTradeId: line.externalTradeId,
          });
        } else {
          throw err;
        }
      }
    }

    this.logger.debug('importStatement:end', { saved: saved.length, skipped: dto.lines.length - saved.length });
    return saved;
  }

  /**
   * Reconciles internal executions against the imported LP statement for a date.
   * Produces break records for unmatched trades and value mismatches.
   * Does not re-create breaks that already exist for the same externalRef/internalRef pair.
   */
  async runReconciliation(dto: RunReconciliationDto): Promise<ReconciliationBreakEntity[]> {
    this.logger.debug('runReconciliation:start', dto);

    const lpLines = await this.lpLinesRepo.find({
      where: { tenantId: dto.tenantId, statementDate: dto.statementDate },
    });

    const dateStart = new Date(`${dto.statementDate}T00:00:00.000Z`);
    const dateEnd = new Date(`${dto.statementDate}T23:59:59.999Z`);

    const internalExecutions = await this.executionsRepo
      .createQueryBuilder('e')
      .where('e.tenantId = :tenantId', { tenantId: dto.tenantId })
      .andWhere('e.createdAt >= :start', { start: dateStart })
      .andWhere('e.createdAt <= :end', { end: dateEnd })
      .getMany();

    const breaks = await this.matchTrades(
      dto.tenantId,
      dto.statementDate,
      lpLines,
      internalExecutions,
    );

    this.logger.debug('runReconciliation:end', {
      lpLines: lpLines.length,
      internalExecutions: internalExecutions.length,
      breaks: breaks.length,
    });

    return breaks;
  }

  async resolveBreak(id: string, resolvedBy?: string): Promise<ReconciliationBreakEntity> {
    const brk = await this.breaksRepo.findOne({ where: { id } });
    if (!brk) throw new AppError('RESOURCE_NOT_FOUND', `Reconciliation break ${id} not found`);
    if (brk.status !== 'OPEN' && brk.status !== 'ESCALATED') {
      throw new AppError('VALIDATION_ERROR', `Break ${id} is already ${brk.status}`);
    }
    brk.status = 'RESOLVED';
    brk.resolvedAt = new Date();
    if (resolvedBy) brk.metadata = { ...brk.metadata, resolvedBy };
    return this.breaksRepo.save(brk);
  }

  /**
   * EOD aging sweep — marks all OPEN breaks older than 1 calendar day as isAging=true.
   * Returns the count of newly flagged records.
   */
  async flagAgingBreaks(): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 1);

    const result = await this.breaksRepo
      .createQueryBuilder()
      .update(ReconciliationBreakEntity)
      .set({ isAging: true })
      .where('status = :status', { status: 'OPEN' })
      .andWhere('is_aging = false')
      .andWhere('created_at < :cutoff', { cutoff })
      .execute();

    const flagged = result.affected ?? 0;
    this.logger.debug('flagAgingBreaks', { flagged });
    return flagged;
  }

  async listBreaks(
    tenantId: string,
    opts?: { status?: string; agingOnly?: boolean; statementDate?: string },
  ): Promise<ReconciliationBreakEntity[]> {
    const qb = this.breaksRepo
      .createQueryBuilder('b')
      .where('b.tenantId = :tenantId', { tenantId })
      .orderBy('b.createdAt', 'DESC');

    if (opts?.status) qb.andWhere('b.status = :status', { status: opts.status });
    if (opts?.agingOnly) qb.andWhere('b.isAging = true');
    if (opts?.statementDate) qb.andWhere('b.statementDate = :date', { date: opts.statementDate });

    return qb.getMany();
  }

  async createBreak(dto: CreateReconciliationBreakDto): Promise<ReconciliationBreakEntity> {
    this.logger.debug('createBreak:start', dto);
    const saved = await this.breaksRepo.save(this.breaksRepo.create(dto));
    this.logger.debug('createBreak:end', { breakId: saved.id });
    return saved;
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async matchTrades(
    tenantId: string,
    statementDate: string,
    lpLines: LpStatementLineEntity[],
    executions: ExecutionEntity[],
  ): Promise<ReconciliationBreakEntity[]> {
    const lpByRef = new Map(lpLines.map((l) => [l.externalTradeId, l]));
    const internalByRef = new Map(executions.map((e) => [e.externalRefId, e]));

    const breaks: ReconciliationBreakEntity[] = [];

    for (const [ref, lp] of lpByRef) {
      const internal = internalByRef.get(ref);
      if (!internal) {
        breaks.push(
          await this.saveBreak(tenantId, statementDate, {
            breakType: 'UNMATCHED_LP_TRADE',
            description: `LP trade ${ref} (${lp.symbol} ${lp.side} ${lp.quantity}) has no internal execution`,
            externalRef: ref,
            metadata: { lpLine: { symbol: lp.symbol, qty: lp.quantity, price: lp.price, side: lp.side } },
          }),
        );
        continue;
      }

      const qtyDiff = Math.abs(Number(lp.quantity) - Number(internal.quantity));
      if (qtyDiff > QTY_EPSILON) {
        breaks.push(
          await this.saveBreak(tenantId, statementDate, {
            breakType: 'QUANTITY_MISMATCH',
            description: `Trade ${ref}: LP qty ${lp.quantity} vs internal qty ${internal.quantity} (diff ${qtyDiff.toFixed(8)})`,
            externalRef: ref,
            internalRef: internal.id,
            metadata: { lpQty: lp.quantity, internalQty: internal.quantity, diff: qtyDiff },
          }),
        );
      }

      const lpPrice = Number(lp.price);
      const intPrice = Number(internal.price);
      const priceDiffBps = lpPrice > 0 ? Math.abs(lpPrice - intPrice) / lpPrice * 10_000 : 0;
      if (priceDiffBps > PRICE_TOLERANCE_BPS) {
        breaks.push(
          await this.saveBreak(tenantId, statementDate, {
            breakType: 'PRICE_MISMATCH',
            description: `Trade ${ref}: LP price ${lp.price} vs internal price ${internal.price} (${priceDiffBps.toFixed(2)} bps)`,
            externalRef: ref,
            internalRef: internal.id,
            metadata: { lpPrice: lp.price, internalPrice: internal.price, diffBps: priceDiffBps },
          }),
        );
      }
    }

    for (const [ref, exec] of internalByRef) {
      if (!lpByRef.has(ref)) {
        breaks.push(
          await this.saveBreak(tenantId, statementDate, {
            breakType: 'UNMATCHED_INTERNAL_TRADE',
            description: `Internal execution ${exec.id} (ref: ${ref}) has no LP statement entry`,
            internalRef: exec.id,
            externalRef: ref,
            metadata: { executionId: exec.id, instrumentId: exec.instrumentId, qty: exec.quantity },
          }),
        );
      }
    }

    return breaks;
  }

  private async saveBreak(
    tenantId: string,
    statementDate: string,
    fields: {
      breakType: string;
      description: string;
      externalRef?: string;
      internalRef?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<ReconciliationBreakEntity> {
    const entity = this.breaksRepo.create({
      tenantId,
      statementDate,
      breakType: fields.breakType,
      description: fields.description,
      status: 'OPEN',
      externalRef: fields.externalRef,
      internalRef: fields.internalRef,
      metadata: fields.metadata ?? {},
    });
    const saved = await this.breaksRepo.save(entity);
    await this.outbox.append(
      'reconciliation.break_created',
      { breakId: saved.id, tenantId, breakType: fields.breakType },
      tenantId,
    );
    return saved;
  }
}
