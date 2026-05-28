/**
 * @file src/modules/onboarding/entities/onboarding-profile.entity.ts
 * @module onboarding
 * @description Onboarding and KYC tracking profile for tenant users
 * @author BharatERP
 * @created 2026-02-17
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType()
@Entity('onboarding_profiles')
export class OnboardingProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field(() => ID)
  tenantId!: string;

  @Column({ type: 'uuid' })
  @Field(() => ID)
  userId!: string;

  @Column({ type: 'varchar', length: 32 })
  @Field()
  countryCode!: string;

  @Column({ type: 'varchar', length: 16 })
  @Field()
  kycTier!: string;

  @Column({ type: 'varchar', length: 16, default: 'PENDING' })
  @Field()
  status!: string;

  @Column({ type: 'jsonb', default: {} })
  amlFlags!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @Field()
  updatedAt!: Date;
}
