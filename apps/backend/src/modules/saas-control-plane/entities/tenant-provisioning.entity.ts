/**
 * @file src/modules/saas-control-plane/entities/tenant-provisioning.entity.ts
 * @module saas-control-plane
 * @description Tenant provisioning lifecycle record for platform-owner operations
 * @author BharatERP
 * @created 2026-02-17
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('tenant_provisioning_requests')
export class TenantProvisioningEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 64 })
  requestedBy!: string;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status!: string;

  @Column({ type: 'jsonb', default: {} })
  resources!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
