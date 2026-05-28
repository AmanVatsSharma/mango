/**
 * @file src/modules/oms/entities/execution.entity.ts
 * @module oms
 * @description Trade execution (fill) records for orders
 * @author BharatERP
 * @created 2025-09-19
 */

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('executions')
@Index('idx_exec_tenant_order', ['tenantId', 'orderId'])
@Unique('ux_exec_ref', ['tenantId', 'externalRefId'])
export class ExecutionEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @Column({ name: 'instrument_id', type: 'uuid' })
  instrumentId!: string;

  @Column({ name: 'quantity', type: 'numeric', precision: 28, scale: 8 })
  quantity!: string;

  @Column({ name: 'price', type: 'numeric', precision: 28, scale: 8 })
  price!: string;

  @Column({ name: 'fees', type: 'numeric', precision: 28, scale: 8, default: 0 })
  fees!: string;

  @Column({ name: 'external_ref_id', type: 'varchar', length: 128 })
  externalRefId!: string;

  @Column({ name: 'meta', type: 'jsonb', nullable: true })
  meta?: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}


