/**
 * @file src/modules/risk-policy/entities/tenant-risk-policy.entity.ts
 * @module risk-policy
 * @description Assignment map for tenant accounts to active risk policies
 * @author BharatERP
 * @created 2026-02-17
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType()
@Entity('tenant_risk_policies')
export class TenantRiskPolicyEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field(() => ID)
  tenantId!: string;

  @Column({ type: 'uuid' })
  @Field(() => ID)
  riskPolicyId!: string;

  @Column({ type: 'varchar', length: 64 })
  @Field()
  scopeType!: string;

  @Column({ type: 'varchar', length: 128 })
  @Field()
  scopeValue!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @Field()
  updatedAt!: Date;
}
