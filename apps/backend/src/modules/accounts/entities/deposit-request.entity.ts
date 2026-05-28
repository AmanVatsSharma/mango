/**
 * @file src/modules/accounts/entities/deposit-request.entity.ts
 * @module accounts
 * @description Deposit request entity awaiting admin approval before crediting ledger
 * @author BharatERP
 * @created 2025-01-09
 */

import { ObjectType, Field, ID, Float } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@ObjectType()
@Entity('deposit_requests')
@Index('idx_deposits_user', ['tenantId', 'userId'])
@Index('ux_deposits_external_ref', ['tenantId', 'externalRefId'], { unique: true })
export class DepositRequestEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Field(() => String)
  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

  @Field(() => ID)
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Field(() => ID)
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @Field(() => String)
  @Column({ name: 'amount', type: 'numeric', precision: 28, scale: 8 })
  amount!: string;

  @Field(() => String)
  @Column({ name: 'currency', type: 'varchar', length: 8 })
  currency!: string;

  @Field(() => String)
  @Column({ name: 'external_ref_id', type: 'varchar', length: 128 })
  externalRefId!: string;

  @Field(() => String, { nullable: true })
  @Column({ name: 'reference_note', type: 'varchar', length: 255, nullable: true })
  referenceNote?: string | null;

  @Field(() => String, { nullable: true })
  @Column({ name: 'proof_url', type: 'varchar', length: 512, nullable: true })
  proofUrl?: string | null;

  @Field(() => String)
  @Column({
    name: 'status',
    type: 'varchar',
    length: 24,
    default: 'PENDING',
  })
  status!: 'PENDING' | 'APPROVED' | 'REJECTED';

  @Field(() => ID, { nullable: true })
  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy?: string | null;

  @Field(() => Date, { nullable: true })
  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt?: Date | null;

  // meta is jsonb — opaque to GraphQL, no @Field
  @Column({ name: 'meta', type: 'jsonb', nullable: true })
  meta?: Record<string, unknown> | null;

  @Field(() => Date)
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Field(() => Date)
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

