/**
 * @file src/modules/oms/entities/order-audit.entity.ts
 * @module oms
 * @description Order audit trail for actions and state changes
 * @author BharatERP
 * @created 2025-09-19
 */

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('order_audit')
@Index('idx_order_audit_order', ['tenantId', 'orderId'])
export class OrderAuditEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Column({ name: 'action', type: 'varchar', length: 24 })
  action!: 'PLACE' | 'MODIFY' | 'CANCEL' | 'STATUS' | 'EXECUTION';

  @Column({ name: 'data', type: 'jsonb', nullable: true })
  data?: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}


