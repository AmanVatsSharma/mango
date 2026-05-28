/**
 * File:        apps/backend/src/modules/tenancy/entities/tenant-brand-config.entity.ts
 * Module:      tenancy
 * Purpose:     Stores per-tenant white-label brand configuration served to the
 *              frontend (colors, logo, domain, feature flags).
 *
 * Exports:
 *   - TenantBrandConfigEntity   — DB entity (managed by TenancyService)
 *
 * Depends on:
 *   - none
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - One row per tenant (unique constraint on tenantId)
 *
 * Read order:
 *   1. TenantBrandConfigEntity — all fields self-explanatory by name
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@ObjectType()
@Entity('tenant_brand_configs')
export class TenantBrandConfigEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid', unique: true })
  @Field()
  tenantId!: string;

  @Column({ name: 'primary_color', type: 'varchar', length: 32, nullable: true })
  @Field({ nullable: true })
  primaryColor?: string | null;

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  @Field({ nullable: true })
  logoUrl?: string | null;

  @Column({ name: 'favicon_url', type: 'text', nullable: true })
  @Field({ nullable: true })
  faviconUrl?: string | null;

  @Column({ name: 'app_name', type: 'varchar', length: 128, nullable: true })
  @Field({ nullable: true })
  appName?: string | null;

  @Column({ name: 'tagline', type: 'varchar', length: 255, nullable: true })
  @Field({ nullable: true })
  tagline?: string | null;

  @Column({ name: 'custom_domain', type: 'varchar', length: 255, nullable: true })
  @Field({ nullable: true })
  customDomain?: string | null;

  @Column({ name: 'support_email', type: 'varchar', length: 255, nullable: true })
  @Field({ nullable: true })
  supportEmail?: string | null;

  @Column({ name: 'support_phone', type: 'varchar', length: 64, nullable: true })
  @Field({ nullable: true })
  supportPhone?: string | null;

  @Column({ type: 'jsonb', default: {} })
  features!: Record<string, boolean>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  @Field()
  updatedAt!: Date;
}
