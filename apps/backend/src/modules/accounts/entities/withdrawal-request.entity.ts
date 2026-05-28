/**
 * @file src/modules/accounts/entities/withdrawal-request.entity.ts
 * @module accounts
 * @description Withdrawal requests requiring admin approval workflow
 * @author BharatERP
 * @created 2025-09-19
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
@Entity('withdrawal_requests')
@Index('idx_withdrawal_account_state', ['tenantId', 'accountId', 'state'])
export class WithdrawalRequestEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Field(() => String)
  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

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
  @Column({ name: 'state', type: 'varchar', length: 16, default: 'PENDING' })
  state!: 'PENDING' | 'APPROVED' | 'REJECTED' | 'FULFILLED';

  @Field(() => String, { nullable: true })
  @Column({
    name: 'external_ref_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  externalRefId?: string | null; // reference to payout id when fulfilled

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
