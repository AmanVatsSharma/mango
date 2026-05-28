/**
 * @file src/modules/saas-control-plane/entities/support-impersonation-audit.entity.ts
 * @module saas-control-plane
 * @description Audit trail entity for support impersonation controls
 * @author BharatERP
 * @created 2026-02-17
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('support_impersonation_audits')
export class SupportImpersonationAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 64 })
  actorUserId!: string;

  @Column({ type: 'varchar', length: 64 })
  targetUserId!: string;

  @Column({ type: 'varchar', length: 255 })
  reason!: string;

  @Column({ type: 'varchar', length: 32, default: 'STARTED' })
  action!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
