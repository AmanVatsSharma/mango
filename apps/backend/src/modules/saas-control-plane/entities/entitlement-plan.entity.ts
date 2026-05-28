/**
 * @file src/modules/saas-control-plane/entities/entitlement-plan.entity.ts
 * @module saas-control-plane
 * @description Tenant entitlement and feature-flag plan entity
 * @author BharatERP
 * @created 2026-02-17
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('tenant_entitlement_plans')
export class EntitlementPlanEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 64 })
  planCode!: string;

  @Column({ type: 'jsonb', default: {} })
  entitlements!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  featureFlags!: Record<string, boolean>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
