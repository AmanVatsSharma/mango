/**
 * @file src/modules/oms/entities/user-leverage-override.entity.ts
 * @module oms
 * @description Per-user leverage override rules (tenant scoped)
 * @author BharatERP
 * @created 2025-09-24
 */

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

@Entity('user_leverage_overrides')
@Unique('ux_user_leverage_override', ['tenantId', 'userId', 'segment', 'positionType'])
@Index('idx_leverage_overrides_tenant_user', ['tenantId', 'userId'])
export class UserLeverageOverrideEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'segment', type: 'varchar', length: 16 })
  segment!: 'EQUITY' | 'FNO' | 'FOREX' | 'CRYPTO';

  @Column({ name: 'position_type', type: 'varchar', length: 16 })
  positionType!: 'INTRADAY' | 'DELIVERY' | 'SHORT' | 'LONG';

  @Column({ name: 'leverage_multiplier', type: 'numeric', precision: 18, scale: 8, default: 1 })
  leverageMultiplier!: string;

  @Column({ name: 'valid_from', type: 'timestamptz', nullable: true })
  validFrom?: Date | null;

  @Column({ name: 'valid_to', type: 'timestamptz', nullable: true })
  validTo?: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
