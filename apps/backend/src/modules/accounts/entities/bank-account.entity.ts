/**
 * @file src/modules/accounts/entities/bank-account.entity.ts
 * @module accounts
 * @description Bank account entity for funding and withdrawals with verification status
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
@Entity('bank_accounts')
@Index('idx_bank_accounts_user', ['tenantId', 'userId'])
@Index('idx_bank_accounts_primary', ['tenantId', 'userId', 'isPrimary'])
@Index('ux_bank_accounts_unique', ['tenantId', 'userId', 'accountNumber'], {
  unique: true,
})
export class BankAccountEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Field(() => String)
  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

  @Field(() => ID)
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Field(() => ID, { nullable: true })
  @Column({ name: 'account_id', type: 'uuid', nullable: true })
  accountId?: string | null;

  @Field(() => String)
  @Column({ name: 'holder_name', type: 'varchar', length: 128 })
  holderName!: string;

  @Field(() => String)
  @Column({ name: 'bank_name', type: 'varchar', length: 128 })
  bankName!: string;

  @Field(() => String)
  @Column({ name: 'account_number', type: 'varchar', length: 64 })
  accountNumber!: string;

  @Field(() => String)
  @Column({ name: 'account_number_masked', type: 'varchar', length: 64 })
  accountNumberMasked!: string;

  @Field(() => String)
  @Column({ name: 'ifsc_code', type: 'varchar', length: 16 })
  ifscCode!: string;

  @Field(() => String)
  @Column({
    name: 'status',
    type: 'varchar',
    length: 32,
    default: 'PENDING_VERIFICATION',
  })
  status!: 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';

  @Field(() => Boolean)
  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary!: boolean;

  // verificationMeta is jsonb — opaque to GraphQL, no @Field
  @Column({ name: 'verification_meta', type: 'jsonb', nullable: true })
  verificationMeta?: Record<string, unknown> | null;

  @Field(() => Date)
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Field(() => Date)
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

