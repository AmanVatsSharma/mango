/**
 * @file src/modules/accounts/entities/position-ledger-entry.entity.ts
 * @module accounts
 * @description Position ledger: quantity deltas for instruments; stores fill price & fees
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
@Entity('position_ledger_entries')
@Index('idx_pos_ledger_account_instrument_created', [
  'tenantId',
  'accountId',
  'instrumentId',
  'createdAt',
])
@Index('ux_pos_ledger_ref', ['tenantId', 'externalRefId'], { unique: true })
export class PositionLedgerEntryEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Field(() => String)
  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

  @Field(() => ID)
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @Field(() => ID)
  @Column({ name: 'instrument_id', type: 'uuid' })
  instrumentId!: string;

  @Field(() => String)
  @Column({ name: 'quantity_delta', type: 'numeric', precision: 28, scale: 8 })
  quantityDelta!: string; // signed

  @Field(() => String)
  @Column({ name: 'price', type: 'numeric', precision: 28, scale: 8 })
  price!: string;

  @Field(() => String)
  @Column({
    name: 'fees',
    type: 'numeric',
    precision: 28,
    scale: 8,
    default: 0,
  })
  fees!: string;

  @Field(() => String)
  @Column({ name: 'side', type: 'varchar', length: 8 })
  side!: 'BUY' | 'SELL';

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
