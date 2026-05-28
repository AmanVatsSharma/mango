/**
 * File:        apps/backend/src/shared/audit/audit-log.entity.ts
 * Module:      shared/audit
 * Purpose:     Immutable audit record for every state-changing action — order changes,
 *              auth events, config changes, impersonation. Each row carries an HMAC
 *              signature for tamper evidence.
 *
 * Exports:
 *   - AuditLogEntity — TypeORM entity for `audit_logs` table
 *
 * Depends on:  typeorm
 * Side-effects: none
 *
 * Key invariants:
 *   - Records must never be updated or deleted (append-only)
 *   - hmacSignature = HMAC-SHA256(tenantId+actorId+action+resourceId+timestamp, perTenantSecret)
 *   - before/after are jsonb snapshots — null when not applicable (e.g. creation events)
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('audit_logs')
@Index('idx_audit_tenant_actor', ['tenantId', 'actorId'])
@Index('idx_audit_resource', ['tenantId', 'resourceType', 'resourceId'])
@Index('idx_audit_action', ['tenantId', 'action'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

  @Column({ name: 'actor_id', type: 'varchar', length: 64 })
  actorId!: string;

  @Column({ name: 'action', type: 'varchar', length: 128 })
  action!: string;

  @Column({ name: 'resource_type', type: 'varchar', length: 64 })
  resourceType!: string;

  @Column({ name: 'resource_id', type: 'varchar', length: 64 })
  resourceId!: string;

  @Column({ name: 'before', type: 'jsonb', nullable: true })
  before?: Record<string, unknown> | null;

  @Column({ name: 'after', type: 'jsonb', nullable: true })
  after?: Record<string, unknown> | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress?: string | null;

  @Column({ name: 'request_id', type: 'varchar', length: 64, nullable: true })
  requestId?: string | null;

  @Column({ name: 'hmac_signature', type: 'varchar', length: 128 })
  hmacSignature!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
