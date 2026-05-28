/**
 * @file src/modules/accounts/entities/account.entity.ts
 * @module accounts
 * @description Trading account entity bound to user and tenant; supports multi-account and multi-currency
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
@Entity('accounts')
@Index('idx_accounts_user', ['tenantId', 'userId'])
@Index('idx_accounts_status', ['status'])
@Index('idx_accounts_tenant_user_type', ['tenantId', 'userId', 'accountType'])
export class AccountEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Field(() => ID)
  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

  @Field(() => ID)
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string; // references users.id

  @Field(() => String)
  @Column({ name: 'account_type', type: 'varchar', length: 16, default: 'LIVE' })
  accountType!: 'LIVE' | 'DEMO';

  @Field(() => String)
  @Column({ name: 'status', type: 'varchar', length: 16, default: 'ACTIVE' })
  status!: 'ACTIVE' | 'DISABLED';

  @Field(() => String)
  @Column({ name: 'base_currency', type: 'varchar', length: 8, default: 'INR' })
  baseCurrency!: string; // e.g., INR, USD

  // preferences is jsonb — opaque to GraphQL, no @Field
  @Column({ name: 'preferences', type: 'jsonb', nullable: true })
  preferences?: Record<string, unknown> | null; // includes statement timezone preference

  @Field(() => Date)
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Field(() => Date)
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
