/**
 * File:        apps/backend/src/modules/broker-hierarchy/entities/ib-commission-ledger.entity.ts
 * Module:      broker-hierarchy
 * Purpose:     Immutable ledger record of commission earned by an IB on a specific
 *              trade execution. Aggregated by calculatePayout() to produce payout requests.
 *
 * Exports:
 *   - IbCommissionLedgerEntity   — TypeORM entity for `ib_commission_ledger` table
 *   - IbCommissionStatus         — PENDING → PAYABLE → PAID
 *
 * Depends on:  typeorm
 * Side-effects: none
 *
 * Key invariants:
 *   - executionId is unique per ledger row to prevent double-booking on retries
 *   - amount is always positive (even when PENDING)
 *   - level matches IbRelationshipEntity.level at time of booking (denormalized for reporting)
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type IbCommissionStatus = 'PENDING' | 'PAYABLE' | 'PAID';

@Entity('ib_commission_ledger')
@Index('idx_ib_ledger_tenant_ib', ['tenantId', 'ibUserId'])
@Index('idx_ib_ledger_execution', ['tenantId', 'executionId', 'ibUserId'], { unique: true })
export class IbCommissionLedgerEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'ib_user_id', type: 'uuid' })
  ibUserId!: string;

  @Column({ name: 'execution_id', type: 'uuid' })
  executionId!: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @Column({ name: 'level', type: 'int' })
  level!: number;

  @Column({ name: 'commission_type', type: 'varchar', length: 32 })
  commissionType!: string;

  @Column({ name: 'amount', type: 'decimal', precision: 20, scale: 8 })
  amount!: string;

  @Column({ name: 'currency', type: 'varchar', length: 8 })
  currency!: string;

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'PENDING' })
  status!: IbCommissionStatus;

  @Column({ name: 'period_key', type: 'varchar', length: 8, nullable: true })
  periodKey?: string | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt?: Date | null;

  @Column({ name: 'paid_by', type: 'uuid', nullable: true })
  paidBy?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
