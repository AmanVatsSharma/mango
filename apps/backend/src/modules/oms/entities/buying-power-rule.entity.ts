/**
 * @file src/modules/oms/entities/buying-power-rule.entity.ts
 * @module oms
 * @description Buying power rules moved from Accounts to OMS for risk ownership
 * @author BharatERP
 * @created 2025-09-19
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('buying_power_rules')
@Index('idx_bp_rules_tenant_segment_position', [
  'tenantId',
  'segment',
  'positionType',
])
export class BuyingPowerRuleEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

  @Column({ name: 'segment', type: 'varchar', length: 16 })
  segment!: 'EQUITY' | 'FNO' | 'FOREX' | 'CRYPTO';

  @Column({ name: 'position_type', type: 'varchar', length: 16 })
  positionType!: 'INTRADAY' | 'DELIVERY' | 'SHORT' | 'LONG';

  @Column({ name: 'multiplier', type: 'numeric', precision: 18, scale: 8, default: 1 })
  multiplier!: string;

  @Column({ name: 'maintenance_margin_rate', type: 'numeric', precision: 18, scale: 8, default: 0.1 })
  maintenanceMarginRate!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'meta', type: 'jsonb', nullable: true })
  meta?: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}


