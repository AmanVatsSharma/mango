/**
 * File:        apps/backend/src/modules/reconciliation/entities/reconciliation-break.entity.ts
 * Module:      reconciliation
 * Purpose:     Records a reconciliation discrepancy between the internal ledger and LP statement.
 *              Supports break typing (unmatched, quantity mismatch, price mismatch), aging,
 *              and resolution tracking.
 *
 * Exports:
 *   - ReconciliationBreakEntity — @Entity('reconciliation_breaks')
 *   - BreakType — union of all canonical break type strings
 *   - BreakStatus — 'OPEN' | 'RESOLVED' | 'ESCALATED'
 *
 * Depends on:
 *   - @nestjs/graphql — ObjectType, Field, ID decorators
 *
 * Side-effects: DB writes
 *
 * Key invariants:
 *   - status transitions: OPEN → RESOLVED | ESCALATED (no backward)
 *   - isAging is set by the EOD aging job when the break is > 1 calendar day old and still OPEN
 *   - externalRef = LP trade ID; internalRef = internal execution UUID
 *   - metadata is stored as jsonb — NO @Field on jsonb columns
 *
 * Read order:
 *   1. BreakType / BreakStatus — type vocabulary
 *   2. ReconciliationBreakEntity — column shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { CreateDateColumn, Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';

export type BreakType =
  | 'UNMATCHED_LP_TRADE'
  | 'UNMATCHED_INTERNAL_TRADE'
  | 'QUANTITY_MISMATCH'
  | 'PRICE_MISMATCH'
  | 'SETTLEMENT_MISMATCH'
  | 'MANUAL';

export type BreakStatus = 'OPEN' | 'RESOLVED' | 'ESCALATED';

@ObjectType('ReconciliationBreak')
@Entity('reconciliation_breaks')
@Index('idx_recon_break_tenant_date', ['tenantId', 'statementDate'])
@Index('idx_recon_break_status', ['tenantId', 'status'])
export class ReconciliationBreakEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field()
  tenantId!: string;

  @Column({ type: 'date', nullable: true })
  @Field({ nullable: true })
  statementDate?: string | null;

  @Column({ type: 'varchar', length: 64 })
  @Field()
  breakType!: string;

  @Column({ type: 'varchar', length: 255 })
  @Field()
  description!: string;

  @Column({ type: 'varchar', length: 32, default: 'OPEN' })
  @Field()
  status!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  @Field({ nullable: true })
  externalRef?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  @Field({ nullable: true })
  internalRef?: string | null;

  @Column({ type: 'boolean', default: false })
  @Field()
  isAging!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  @Field({ nullable: true })
  resolvedAt?: Date | null;

  /** Stored as jsonb — no @Field on this column */
  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @Field()
  updatedAt!: Date;
}
