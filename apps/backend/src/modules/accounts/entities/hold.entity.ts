/**
 * @file src/modules/accounts/entities/hold.entity.ts
 * @module accounts
 * @description Cash hold entity for OMS/margin/withdrawal locks with lifecycle
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
@Entity('holds')
@Index('idx_holds_account_state', ['tenantId', 'accountId', 'state'])
@Index('ux_holds_ref', ['tenantId', 'externalRefId'], { unique: true })
export class HoldEntity {
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
  @Column({ name: 'reason', type: 'varchar', length: 16 })
  reason!: 'ORDER' | 'MARGIN' | 'WITHDRAWAL';

  @Field(() => String)
  @Column({ name: 'amount', type: 'numeric', precision: 28, scale: 8 })
  amount!: string;

  @Field(() => String)
  @Column({ name: 'currency', type: 'varchar', length: 8 })
  currency!: string;

  @Field(() => String)
  @Column({ name: 'state', type: 'varchar', length: 16, default: 'ACTIVE' })
  state!: 'ACTIVE' | 'RELEASED';

  @Field(() => String)
  @Column({ name: 'external_ref_id', type: 'varchar', length: 128 })
  externalRefId!: string;

  // meta is jsonb — opaque to GraphQL, no @Field
  @Column({ name: 'meta', type: 'jsonb', nullable: true })
  meta?: Record<string, unknown> | null;

  @Field(() => Date)
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Field(() => Date, { nullable: true })
  @UpdateDateColumn({ name: 'released_at', nullable: true })
  releasedAt?: Date | null;
}
