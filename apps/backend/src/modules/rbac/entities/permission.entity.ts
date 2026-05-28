/**
 * File:        apps/backend/src/modules/rbac/entities/permission.entity.ts
 * Module:      rbac
 * Purpose:     Permission entity (tenant-scoped)
 *
 * Exports:
 *   - PermissionEntity  — DB entity (managed by RbacService)
 *
 * Depends on:
 *   - none
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - none
 *
 * Read order:
 *   1. PermissionEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@ObjectType()
@Entity('permissions')
@Unique(['tenantId', 'name'])
@Index('idx_permissions_tenant_name', ['tenantId', 'name'])
export class PermissionEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  @Field(() => ID)
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  @Field()
  tenantId!: string;

  @Column({ name: 'name', type: 'varchar', length: 64 })
  @Field()
  name!: string;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  @Field({ nullable: true })
  description?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  @Field()
  updatedAt!: Date;
}
