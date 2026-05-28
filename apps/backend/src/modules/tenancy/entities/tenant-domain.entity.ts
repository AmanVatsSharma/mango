/**
 * File:        apps/backend/src/modules/tenancy/entities/tenant-domain.entity.ts
 * Module:      tenancy
 * Purpose:     Manages custom domains registered against each tenant. Supports
 *              multiple domains per tenant, primary designation, DNS verification
 *              status, and SSL activation tracking.
 *
 * Exports:
 *   - TenantDomainEntity   — DB entity (managed by TenancyService)
 *
 * Depends on:
 *   - none
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - (tenantId, domain) is unique — prevents duplicate domain registration.
 *
 * Read order:
 *   1. TenantDomainEntity — all fields self-explanatory by name
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@ObjectType()
@Entity('tenant_domains')
@Index(['tenantId', 'domain'], { unique: true })
export class TenantDomainEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  @Field()
  tenantId!: string;

  @Column({ type: 'varchar', length: 255 })
  @Field()
  domain!: string;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  @Field()
  isPrimary!: boolean;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  @Field()
  isVerified!: boolean;

  @Column({ name: 'ssl_active', type: 'boolean', default: false })
  @Field()
  sslActive!: boolean;

  @Column({ name: 'dns_verified_at', type: 'timestamptz', nullable: true })
  @Field({ nullable: true })
  dnsVerifiedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  @Field()
  updatedAt!: Date;
}