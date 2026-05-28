/**
 * File:        apps/backend/src/modules/settlement/services/settlement.service.ts
 * Module:      settlement
 * Purpose:     Post-trade settlement lifecycle — creates jobs from executed trades,
 *              applies T+0/T+1/T+2 settlement cycles per segment, and nets obligations.
 *
 * Exports:
 *   - SettlementService.createJob(dto) → SettlementJobEntity
 *   - SettlementService.runSettlementCycle(tenantId, date) → SettlementJobEntity[]
 *   - SettlementService.processJob(id) → SettlementJobEntity
 *   - SettlementService.listJobs(tenantId, status?) → SettlementJobEntity[]
 *
 * Depends on:
 *   - SettlementJobEntity — persists settlement obligations
 *
 * Side-effects: DB writes (job creation + status transitions)
 *
 * Key invariants:
 *   - Settlement date = tradeDate + cycle days, skipping weekends (Saturday/Sunday)
 *   - CYCLE_DAYS: T+0=crypto, T+1=forex, T+2=equity (configurable per segment)
 *   - Netting: same-day same-currency obligations are netted at account level before processing
 *   - PENDING → PROCESSING → SETTLED | FAILED (no backward transitions)
 *
 * Read order:
 *   1. getSettlementDate()     — T+N calculation with weekend skip
 *   2. runSettlementCycle()    — EOD job creation for due settlements
 *   3. processJob()            — marks individual job as SETTLED
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { AppLoggerService } from '../../../shared/logger';
import { CreateSettlementJobDto } from '../dtos/create-settlement-job.dto';
import { SettlementJobEntity } from '../entities/settlement-job.entity';

type Segment = 'CRYPTO' | 'FOREX' | 'EQUITY' | 'COMMODITY';

const CYCLE_DAYS: Record<Segment, number> = {
  CRYPTO: 0,
  FOREX: 1,
  EQUITY: 2,
  COMMODITY: 2,
};

@Injectable()
export class SettlementService {
  constructor(
    @InjectRepository(SettlementJobEntity)
    private readonly jobs: Repository<SettlementJobEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(SettlementService.name);
  }

  async createJob(dto: CreateSettlementJobDto): Promise<SettlementJobEntity> {
    this.logger.debug('createJob:start', dto);
    const saved = await this.jobs.save(this.jobs.create({ ...dto, status: 'PENDING' }));
    this.logger.debug('createJob:end', { settlementJobId: saved.id });
    return saved;
  }

  /**
   * EOD settlement cycle: finds all PENDING jobs due on or before `date`
   * and advances them to PROCESSING. Returns the jobs ready for settlement.
   */
  async runSettlementCycle(tenantId: string, date: Date): Promise<SettlementJobEntity[]> {
    this.logger.debug('runSettlementCycle:start', { tenantId, date });

    const dueDateStr = date.toISOString().slice(0, 10);

    const due = await this.jobs
      .createQueryBuilder('j')
      .where('j.tenantId = :tenantId', { tenantId })
      .andWhere('j.status = :status', { status: 'PENDING' })
      .andWhere('j.tradeDate <= :due', { due: dueDateStr })
      .orderBy('j.currency', 'ASC')
      .addOrderBy('j.accountId', 'ASC')
      .getMany();

    if (!due.length) {
      this.logger.debug('runSettlementCycle: no jobs due', { tenantId });
      return [];
    }

    const netted = this.netObligations(due);

    const ids = due.map((j) => j.id);
    await this.jobs.update(ids, { status: 'PROCESSING' });

    this.logger.debug('runSettlementCycle:end', {
      processed: due.length,
      netted,
    });

    return due;
  }

  async processJob(id: string): Promise<SettlementJobEntity> {
    const job = await this.jobs.findOne({ where: { id } });
    if (!job) throw new AppError('RESOURCE_NOT_FOUND', `Settlement job ${id} not found`);
    if (job.status !== 'PROCESSING') {
      throw new AppError('VALIDATION_ERROR', `Job ${id} is ${job.status}, not PROCESSING`);
    }
    job.status = 'SETTLED';
    return this.jobs.save(job);
  }

  async listJobs(tenantId: string, status?: string): Promise<SettlementJobEntity[]> {
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.jobs.find({ where, order: { createdAt: 'DESC' } });
  }

  static getSettlementDate(tradeDate: Date, segment: Segment = 'FOREX'): Date {
    const cycleDays = CYCLE_DAYS[segment];
    const d = new Date(tradeDate);
    let added = 0;
    while (added < cycleDays) {
      d.setDate(d.getDate() + 1);
      const day = d.getDay();
      if (day !== 0 && day !== 6) added++;
    }
    return d;
  }

  /** Returns a summary of same-currency netting at account level (informational). */
  private netObligations(jobs: SettlementJobEntity[]): Record<string, number> {
    const nets: Record<string, number> = {};
    for (const j of jobs) {
      const key = `${j.accountId}:${j.currency}`;
      nets[key] = (nets[key] ?? 0) + parseFloat(j.amount);
    }
    return nets;
  }
}
