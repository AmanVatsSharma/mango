/**
 * File:        apps/backend/src/modules/broker-hierarchy/entities/ib-relationship.entity.ts
 * Module:      broker-hierarchy
 * Purpose:     Stores the IB referral tree — who referred whom, up to 3 levels deep.
 *              Used by IbCommissionService to walk the tree on each execution.
 *
 * Exports:
 *   - IbRelationshipEntity — TypeORM entity for `ib_relationships` table
 *
 * Depends on:  typeorm
 * Side-effects: none
 *
 * Key invariants:
 *   - level: 1 = direct IB (introduced the client), 2 = IB's IB, 3 = top-level
 *   - parentIbUserId null means this IB is a top-level (no sponsor)
 *   - Unique constraint on (tenantId, ibUserId) — one IB node per tenant per user
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('ib_relationships')
@Index('idx_ib_tenant_user', ['tenantId', 'ibUserId'], { unique: true })
@Index('idx_ib_parent', ['tenantId', 'parentIbUserId'])
export class IbRelationshipEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'ib_user_id', type: 'uuid' })
  ibUserId!: string;

  @Column({ name: 'parent_ib_user_id', type: 'uuid', nullable: true })
  parentIbUserId?: string | null;

  @Column({ name: 'level', type: 'int', default: 1 })
  level!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
