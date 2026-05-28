/**
 * @file src/modules/oms/entities/brokerage-rule.entity.ts
 * @module oms
 * @description Brokerage rule schedules per tenant/user/segment/product/side
 * @author BharatERP
 * @created 2025-09-24
 */

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('brokerage_rules')
@Index('idx_brokerage_rules_tenant', ['tenantId'])
export class BrokerageRuleEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

  @Column({ name: 'applies_to', type: 'varchar', length: 8 })
  appliesTo!: 'TENANT' | 'USER';

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string | null;

  @Column({ name: 'segment', type: 'varchar', length: 16 })
  segment!: 'EQUITY' | 'FNO' | 'FOREX' | 'CRYPTO';

  @Column({ name: 'product', type: 'varchar', length: 16 })
  product!: 'CASH' | 'FUTURES' | 'OPTIONS';

  @Column({ name: 'side', type: 'varchar', length: 8, default: 'BOTH' })
  side!: 'BUY' | 'SELL' | 'BOTH';

  @Column({ name: 'percent', type: 'numeric', precision: 18, scale: 8, default: 0 })
  percent!: string;

  @Column({ name: 'per_order_flat', type: 'numeric', precision: 18, scale: 8, default: 0 })
  perOrderFlat!: string;

  @Column({ name: 'cap_per_order', type: 'numeric', precision: 18, scale: 8, nullable: true })
  capPerOrder?: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}


