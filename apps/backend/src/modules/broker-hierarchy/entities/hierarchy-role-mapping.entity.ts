/**
 * @file src/modules/broker-hierarchy/entities/hierarchy-role-mapping.entity.ts
 * @module broker-hierarchy
 * @description Role delegation map from platform owner to broker-admin and dealer tiers
 * @author BharatERP
 * @created 2026-02-17
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type HierarchyPrincipalType = 'PLATFORM_OWNER' | 'BROKER_ADMIN' | 'DEALER';

@Entity('hierarchy_role_mappings')
export class HierarchyRoleMappingEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 32 })
  principalType!: HierarchyPrincipalType;

  @Column({ type: 'uuid' })
  principalId!: string;

  @Column({ type: 'varchar', length: 64 })
  roleCode!: string;

  @Column({ type: 'boolean', default: true })
  delegated!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
