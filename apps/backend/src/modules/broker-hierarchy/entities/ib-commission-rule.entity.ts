/**
 * File:        apps/backend/src/modules/broker-hierarchy/entities/ib-commission-rule.entity.ts
 * Module:      broker-hierarchy
 * Purpose:     Defines the commission rate and type for an IB at a specific tree level.
 *
 * Exports:
 *   - IbCommissionRuleEntity   — TypeORM entity for `ib_commission_rules` table
 *   - CommissionType           — union of supported calculation methods
 *
 * Depends on:  typeorm
 * Side-effects: none
 *
 * Key invariants:
 *   - rate is stored as a decimal string (e.g. "0.0025" = 0.25% per notional)
 *   - instrumentGroup null means the rule applies to all instruments
 *   - per_lot_flat: rate per lot (quantity unit)
 *   - percent_notional: rate * order notional value
 *   - revenue_share: rate * broker gross revenue on the trade (requires broker revenue data)
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type CommissionType = 'per_lot_flat' | 'percent_notional' | 'revenue_share';

@Entity('ib_commission_rules')
@Index('idx_ib_comm_rule_tenant_ib', ['tenantId', 'ibUserId'])
export class IbCommissionRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'ib_user_id', type: 'uuid' })
  ibUserId!: string;

  @Column({ name: 'commission_type', type: 'varchar', length: 32 })
  commissionType!: CommissionType;

  @Column({ name: 'rate', type: 'decimal', precision: 20, scale: 8 })
  rate!: string;

  @Column({ name: 'instrument_group', type: 'varchar', length: 64, nullable: true })
  instrumentGroup?: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
