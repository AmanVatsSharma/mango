/**
 * File:        apps/backend/src/modules/reconciliation/entities/lp-statement-line.entity.ts
 * Module:      reconciliation
 * Purpose:     Persists an imported LP/MT5 daily statement line for reconciliation matching.
 *              Each row represents one trade as reported by the liquidity provider.
 *
 * Exports:
 *   - LpStatementLineEntity — @Entity('lp_statement_lines')
 *
 * Depends on:
 *   - none
 *
 * Side-effects: DB writes on import
 *
 * Key invariants:
 *   - (tenantId, statementDate, externalTradeId) is unique — re-importing same statement is idempotent
 *   - quantity and price stored as numeric strings (TypeORM decimal)
 *   - side is 'BUY' | 'SELL'
 *
 * Read order:
 *   1. LpStatementLineEntity — column shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('lp_statement_lines')
@Index('idx_lp_stmt_tenant_date', ['tenantId', 'statementDate'])
@Unique('ux_lp_stmt_ext_trade', ['tenantId', 'statementDate', 'externalTradeId'])
export class LpStatementLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'date' })
  statementDate!: string;

  @Column({ type: 'varchar', length: 128 })
  externalTradeId!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  lpAccountId?: string | null;

  @Column({ type: 'varchar', length: 64 })
  symbol!: string;

  @Column({ type: 'numeric', precision: 28, scale: 8 })
  quantity!: string;

  @Column({ type: 'numeric', precision: 28, scale: 8 })
  price!: string;

  @Column({ type: 'varchar', length: 8 })
  side!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  importedAt!: Date;
}
