/**
 * @file src/modules/accounts/entities/cash-ledger-entry.entity.ts
 * @module accounts
 * @description Cash ledger entries (double-entry style by direction) with idempotency via externalRefId
 * @author BharatERP
 * @created 2025-09-19
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@ObjectType()
@Entity('cash_ledger_entries')
@Index('idx_cash_ledger_account_created', [
  'tenantId',
  'accountId',
  'createdAt',
])
@Index('ux_cash_ledger_ref', ['tenantId', 'externalRefId'], { unique: true })
export class CashLedgerEntryEntity {
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
  amount!: string; // positive decimal as string

  @Field(() => String)
  @Column({ name: 'currency', type: 'varchar', length: 8 })
  currency!: string;

  @Field(() => String)
  @Column({ name: 'direction', type: 'varchar', length: 8 })
  direction!: 'credit' | 'debit';

  @Field(() => String)
  @Column({ name: 'kind', type: 'varchar', length: 24 })
  kind!:
    | 'deposit'
    | 'withdrawal'
    | 'fee'
    | 'adjustment'
    | 'trade'
    | 'settlement'
    | 'hold'
    | 'release';

  @Field(() => String)
  @Column({ name: 'external_ref_id', type: 'varchar', length: 128 })
  externalRefId!: string;

  // meta is jsonb — opaque to GraphQL, no @Field
  @Column({ name: 'meta', type: 'jsonb', nullable: true })
  meta?: Record<string, unknown> | null;

  @Field(() => Date)
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
