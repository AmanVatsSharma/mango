/**
 * @file src/modules/oms/entities/order.entity.ts
 * @module oms
 * @description Core order entity representing client orders
 * @author BharatERP
 * @created 2025-09-19
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Field, ID, Float, ObjectType } from '@nestjs/graphql';

@ObjectType()
@Entity('orders')
@Index('idx_orders_tenant_account_status', ['tenantId', 'accountId', 'status'])
@Unique('ux_orders_client_id', ['tenantId', 'clientOrderId'])
@Unique('ux_orders_external_ref', ['tenantId', 'externalRefId'])
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  @Field(() => ID)
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  @Field()
  tenantId!: string;

  @Column({ name: 'account_id', type: 'uuid' })
  @Field(() => ID)
  accountId!: string;

  @Column({ name: 'instrument_id', type: 'uuid' })
  @Field(() => ID)
  instrumentId!: string;

  @Column({ name: 'side', type: 'varchar', length: 8 })
  @Field(() => String)
  side!: 'BUY' | 'SELL';

  @Column({ name: 'type', type: 'varchar', length: 16 })
  @Field(() => String)
  type!: 'MARKET' | 'LIMIT';

  @Column({ name: 'quantity', type: 'numeric', precision: 28, scale: 8 })
  @Field(() => Float)
  quantity!: string;

  @Column({ name: 'price', type: 'numeric', precision: 28, scale: 8, nullable: true })
  @Field(() => Float, { nullable: true })
  price?: string | null;

  @Column({ name: 'time_in_force', type: 'varchar', length: 16, default: 'DAY' })
  @Field(() => String)
  timeInForce!: 'DAY' | 'IOC' | 'GTC' | 'FOK';

  @Column({ name: 'status', type: 'varchar', length: 24, default: 'NEW' })
  @Field(() => String)
  status!: 'NEW' | 'PLACED' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED';

  @Column({ name: 'client_order_id', type: 'varchar', length: 64 })
  @Field()
  clientOrderId!: string;

  @Column({ name: 'external_ref_id', type: 'varchar', length: 128 })
  @Field()
  externalRefId!: string;

  @Column({ name: 'hold_ref', type: 'varchar', length: 128, nullable: true })
  @Field({ nullable: true })
  holdRef?: string | null;

  @Column({ name: 'meta', type: 'jsonb', nullable: true })
  meta?: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  @Field()
  updatedAt!: Date;
}