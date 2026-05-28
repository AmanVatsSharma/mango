/**
 * @file src/modules/oms/entities/position-snapshot.entity.ts
 * @module oms
 * @description Position snapshot captured periodically or at EOD
 * @author BharatERP
 * @created 2025-09-19
 */

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('position_snapshots')
@Index('idx_pos_snap_tenant_account_instrument', ['tenantId', 'accountId', 'instrumentId'])
export class PositionSnapshotEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @Column({ name: 'instrument_id', type: 'uuid' })
  instrumentId!: string;

  @Column({ name: 'net_qty', type: 'numeric', precision: 28, scale: 8 })
  netQty!: string;

  @Column({ name: 'avg_price', type: 'numeric', precision: 28, scale: 8, nullable: true })
  avgPrice?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}


