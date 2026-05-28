/**
 * File:        apps/backend/src/modules/tenancy/entities/tenant.entity.ts
 * Module:      tenancy
 * Purpose:     Tenant aggregate root entity for broker SaaS provisioning
 *
 * Exports:
 *   - TenantEntity       — DB entity (managed by TenancyService)
 *   - TenantStatus       — union type for tenant status
 *
 * Depends on:
 *   - none
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - code is unique across all tenants
 *
 * Read order:
 *   1. TenantEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING';

@ObjectType()
@Entity('tenants')
export class TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'varchar', length: 128, unique: true })
  @Field()
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  @Field()
  displayName!: string;

  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  @Field()
  timezone!: string;

  @Column({ type: 'varchar', length: 64, default: 'GLOBAL' })
  @Field()
  jurisdictionProfile!: string;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  @Field()
  status!: TenantStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @Field()
  updatedAt!: Date;
}
