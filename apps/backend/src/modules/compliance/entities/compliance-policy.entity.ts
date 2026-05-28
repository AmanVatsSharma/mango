/**
 * File:        apps/backend/src/modules/compliance/entities/compliance-policy.entity.ts
 * Module:      compliance
 * Purpose:     Tenant-level compliance policy by jurisdiction and risk requirements.
 *
 * Exports:
 *   - CompliancePolicyEntity   — TypeORM entity for `compliance_policies` table
 *
 * Depends on:
 *   - @nestjs/graphql — ObjectType, Field, ID decorators
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - one policy per (tenantId, jurisdictionCode, kycTier) triplet
 *   - suitabilityRules is stored as jsonb — serialized as JSON string in GraphQL
 *
 * Read order:
 *   1. CompliancePolicyEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType('CompliancePolicy')
@Entity('compliance_policies')
export class CompliancePolicyEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field()
  tenantId!: string;

  @Column({ type: 'varchar', length: 32 })
  @Field()
  jurisdictionCode!: string;

  @Column({ type: 'varchar', length: 16 })
  @Field()
  kycTier!: string;

  @Column({ type: 'varchar', length: 16 })
  @Field()
  amlRiskLevel!: string;

  @Column({ type: 'varchar', length: 64, default: 'default-provider' })
  @Field()
  sanctionsProvider!: string;

  /** Stored as jsonb — always serialized as JSON string in GraphQL */
  @Column({ type: 'jsonb', default: {} })
  suitabilityRules!: Record<string, unknown>;

  @Column({ type: 'int', default: 2555 })
  @Field()
  auditRetentionDays!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @Field()
  updatedAt!: Date;
}
