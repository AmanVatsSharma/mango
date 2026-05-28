/**
 * File:        apps/backend/src/modules/broker-hierarchy/services/ib-commission.service.ts
 * Module:      broker-hierarchy
 * Purpose:     Computes and books IB commissions on trade executions, walking the
 *              referral tree up to MAX_IB_LEVELS deep. Also handles payout aggregation.
 *
 * Exports:
 *   - IbCommissionService.computeOnExecution(params) → IbCommissionLedgerEntity[]
 *   - IbCommissionService.calculatePayout(ibUserId, period) → { total, entries }
 *   - IbCommissionService.listPayouts(tenantId, ibUserId) → IbCommissionLedgerEntity[]
 *
 * Depends on:
 *   - IbRelationshipEntity   — tree traversal
 *   - IbCommissionRuleEntity — per-IB rate lookup
 *   - IbCommissionLedgerEntity — ledger write
 *
 * Side-effects:
 *   - Writes IbCommissionLedgerEntity rows (one per IB in the chain per execution)
 *
 * Key invariants:
 *   - MAX_IB_LEVELS = 3: tree walk stops at level 3 regardless of depth
 *   - Idempotent: unique constraint on (tenantId, executionId, ibUserId) prevents double-booking
 *   - amount calculation: per_lot_flat = rate * quantity; percent_notional = rate * (quantity * price)
 *   - calculatePayout marks matching PENDING rows as PAYABLE and returns total
 *
 * Read order:
 *   1. computeOnExecution() — entry point; calls walkTree() then bookCommission()
 *   2. walkTree()           — recursive IB chain traversal
 *   3. bookCommission()     — writes one ledger row per IB level
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppLoggerService } from '../../../shared/logger';
import { IbRelationshipEntity } from '../entities/ib-relationship.entity';
import { IbCommissionRuleEntity } from '../entities/ib-commission-rule.entity';
import { IbCommissionLedgerEntity } from '../entities/ib-commission-ledger.entity';

const MAX_IB_LEVELS = 3;

export interface ExecutionCommissionParams {
  tenantId: string;
  executionId: string;
  accountId: string;
  /** IB user who directly introduced the trading account */
  directIbUserId: string;
  quantity: number;
  price: number;
  currency: string;
}

@Injectable()
export class IbCommissionService {
  constructor(
    @InjectRepository(IbRelationshipEntity)
    private readonly relationships: Repository<IbRelationshipEntity>,
    @InjectRepository(IbCommissionRuleEntity)
    private readonly rules: Repository<IbCommissionRuleEntity>,
    @InjectRepository(IbCommissionLedgerEntity)
    private readonly ledger: Repository<IbCommissionLedgerEntity>,
    private readonly logger: AppLoggerService,
  ) {
    this.logger.setContext(IbCommissionService.name);
  }

  async computeOnExecution(params: ExecutionCommissionParams): Promise<IbCommissionLedgerEntity[]> {
    this.logger.debug('computeOnExecution:start', { executionId: params.executionId });

    const chain = await this.walkTree(params.tenantId, params.directIbUserId);
    const booked: IbCommissionLedgerEntity[] = [];

    for (const node of chain) {
      const rule = await this.rules.findOne({
        where: { tenantId: params.tenantId, ibUserId: node.ibUserId, isActive: true },
      });
      if (!rule) continue;

      const amount = this.calculateAmount(rule, params.quantity, params.price);
      if (amount <= 0) continue;

      try {
        const entry = this.ledger.create({
          tenantId: params.tenantId,
          ibUserId: node.ibUserId,
          executionId: params.executionId,
          accountId: params.accountId,
          level: node.level,
          commissionType: rule.commissionType,
          amount: amount.toFixed(8),
          currency: params.currency,
          status: 'PENDING',
        });
        const saved = await this.ledger.save(entry);
        booked.push(saved);
        this.logger.debug('IB commission booked', { ibUserId: node.ibUserId, amount, level: node.level });
      } catch (err: any) {
        // unique constraint violation = duplicate execution, skip
        if (err?.code === '23505') continue;
        throw err;
      }
    }

    this.logger.debug('computeOnExecution:end', { count: booked.length });
    return booked;
  }

  async calculatePayout(
    tenantId: string,
    ibUserId: string,
    periodKey: string,
  ): Promise<{ total: string; entries: IbCommissionLedgerEntity[] }> {
    this.logger.debug('calculatePayout:start', { tenantId, ibUserId, periodKey });

    const pending = await this.ledger.find({
      where: { tenantId, ibUserId, status: 'PENDING' },
    });

    if (pending.length === 0) return { total: '0.00000000', entries: [] };

    const total = pending.reduce((sum, e) => sum + parseFloat(e.amount), 0);

    await this.ledger.update(
      pending.map((e) => e.id),
      { status: 'PAYABLE', periodKey },
    );

    const updated = await this.ledger.find({
      where: { tenantId, ibUserId, status: 'PAYABLE', periodKey },
    });

    this.logger.debug('calculatePayout:end', { total, count: updated.length });
    return { total: total.toFixed(8), entries: updated };
  }

  async listPayouts(
    tenantId: string,
    ibUserId?: string,
    status?: 'PENDING' | 'PAYABLE' | 'PAID',
  ): Promise<IbCommissionLedgerEntity[]> {
    const where: any = { tenantId };
    if (ibUserId) where.ibUserId = ibUserId;
    if (status) where.status = status;
    return this.ledger.find({ where, order: { createdAt: 'DESC' } });
  }

  /**
   * Mark all PAYABLE ledger rows for a specific IB as PAID.
   * Called by the payout endpoint after a broker admin confirms the disbursement.
   */
  async markAsPaid(tenantId: string, ibUserId: string, periodKey: string): Promise<number> {
    this.logger.debug('markAsPaid', { tenantId, ibUserId, periodKey });
    const result = await this.ledger.update(
      { tenantId, ibUserId, status: 'PAYABLE' },
      { status: 'PAID', paidAt: new Date(), periodKey },
    );
    return result.affected ?? 0;
  }

  private async walkTree(
    tenantId: string,
    startIbUserId: string,
  ): Promise<Array<{ ibUserId: string; level: number }>> {
    const chain: Array<{ ibUserId: string; level: number }> = [];
    let currentId: string | null | undefined = startIbUserId;
    let level = 1;

    while (currentId && level <= MAX_IB_LEVELS) {
      chain.push({ ibUserId: currentId, level });
      const node = await this.relationships.findOne({
        where: { tenantId, ibUserId: currentId, isActive: true },
      });
      currentId = node?.parentIbUserId;
      level += 1;
    }

    return chain;
  }

  private calculateAmount(
    rule: IbCommissionRuleEntity,
    quantity: number,
    price: number,
  ): number {
    const rate = parseFloat(rule.rate);
    if (rule.commissionType === 'per_lot_flat') {
      return rate * quantity;
    }
    if (rule.commissionType === 'percent_notional') {
      return rate * (quantity * price);
    }
    return 0;
  }
}
