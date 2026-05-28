/**
 * @file src/modules/risk-policy/entities/risk-policy.entity.ts
 * @module risk-policy
 * @description Risk policy definitions assignable by tenant and jurisdiction
 * @author BharatERP
 * @created 2026-02-17
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ObjectType, Field, ID, Float } from '@nestjs/graphql';

@ObjectType()
@Entity('risk_policies')
export class RiskPolicyEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field(() => ID)
  tenantId!: string;

  @Column({ type: 'varchar', length: 32 })
  @Field()
  jurisdictionCode!: string;

  @Column({ type: 'varchar', length: 128 })
  @Field()
  policyName!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 1 })
  @Field(() => Float)
  maxLeverage!: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  @Field(() => Float)
  maxOrderNotional!: number;

  @Column({ type: 'jsonb', default: [] })
  restrictedProducts!: string[];

  @Column({ type: 'boolean', default: true })
  @Field()
  sanctionsCheckRequired!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @Field()
  updatedAt!: Date;
}
