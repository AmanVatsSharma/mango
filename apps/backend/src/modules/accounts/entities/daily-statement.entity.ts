/**
 * @file src/modules/accounts/entities/daily-statement.entity.ts
 * @module accounts
 * @description Daily statements snapshot per account and date
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
  Unique,
} from 'typeorm';

@ObjectType()
@Entity('daily_statements')
@Unique('ux_daily_statement_account_date', ['tenantId', 'accountId', 'date'])
export class DailyStatementEntity {
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
  @Column({ name: 'date', type: 'date' })
  date!: string; // UTC date (YYYY-MM-DD)

  @Field(() => String)
  @Column({
    name: 'opening_cash',
    type: 'numeric',
    precision: 28,
    scale: 8,
    default: 0,
  })
  openingCash!: string;

  @Field(() => String)
  @Column({
    name: 'closing_cash',
    type: 'numeric',
    precision: 28,
    scale: 8,
    default: 0,
  })
  closingCash!: string;

  @Field(() => String)
  @Column({
    name: 'deposits',
    type: 'numeric',
    precision: 28,
    scale: 8,
    default: 0,
  })
  deposits!: string;

  @Field(() => String)
  @Column({
    name: 'withdrawals',
    type: 'numeric',
    precision: 28,
    scale: 8,
    default: 0,
  })
  withdrawals!: string;

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
  @Column({
    name: 'realized_pnl',
    type: 'numeric',
    precision: 28,
    scale: 8,
    default: 0,
  })
  realizedPnl!: string;

  @Field(() => String)
  @Column({
    name: 'unrealized_pnl',
    type: 'numeric',
    precision: 28,
    scale: 8,
    default: 0,
  })
  unrealizedPnl!: string;

  @Field(() => String)
  @Column({
    name: 'equity',
    type: 'numeric',
    precision: 28,
    scale: 8,
    default: 0,
  })
  equity!: string;

  @Field(() => String)
  @Column({
    name: 'maintenance_margin',
    type: 'numeric',
    precision: 28,
    scale: 8,
    default: 0,
  })
  maintenanceMargin!: string;

  @Field(() => String)
  @Column({
    name: 'buying_power',
    type: 'numeric',
    precision: 28,
    scale: 8,
    default: 0,
  })
  buyingPower!: string;

  @Field(() => Date)
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
