/**
 * File:        apps/backend/src/modules/broker-hierarchy/entities/client-group.entity.ts
 * Module:      broker-hierarchy
 * Purpose:     Client group entity — logical grouping of trading accounts under a broker.
 *              Used for bulk operations, reporting, and per-group risk limits.
 *
 * Exports:
 *   - ClientGroupEntity   — TypeORM entity for `client_groups` table
 *
 * Depends on:
 *   - typeorm
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - unique constraint on (tenantId, name) prevents duplicate groups per tenant
 *
 * Read order:
 *   1. ClientGroupEntity — fields and constraints
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('client_groups')
@Index('idx_client_group_tenant', ['tenantId'])
@Index('idx_client_group_tenant_name', ['tenantId', 'name'], { unique: true })
export class ClientGroupEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'uuid' })
  brokerId!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}