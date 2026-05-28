/**
 * File:        apps/backend/src/modules/market/entities/instrument.entity.ts
 * Module:      market · Entities
 * Purpose:     Instrument entity across equities/forex/crypto with exchange linkage
 *
 * Exports:
 *   - InstrumentEntity — exchange-traded instrument record
 *
 * Depends on:
 *   - @nestjs/graphql — @ObjectType, @Field decorators
 *
 * Side-effects:  none
 *
 * Key invariants:
 *   - symbol + exchangeCode form a unique trading pair
 *   - tickSize and lotSize are stored as strings to preserve precision
 *
 * Read order:
 *   1. InstrumentEntity — entity shape (this file)
 *   2. MarketResolver   — how InstrumentDto maps from InstrumentEntity
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
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
@Entity('instruments')
@Index('idx_instruments_symbol_exchange', ['symbol', 'exchangeCode'])
export class InstrumentEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  @Field(() => ID)
  id!: string;

  @Column({ name: 'exchange_code', type: 'varchar', length: 16 })
  @Field()
  exchangeCode!: string; // references exchanges.code

  @Column({ name: 'symbol', type: 'varchar', length: 64 })
  @Field()
  symbol!: string; // e.g., INFY, AAPL, EURUSD, BTCUSDT

  @Column({ name: 'type', type: 'varchar', length: 16 })
  @Field()
  type!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 128 })
  @Field()
  displayName!: string;

  @Column({
    name: 'tick_size',
    type: 'numeric',
    precision: 18,
    scale: 8,
    default: 0.01,
  })
  @Field(() => Float, { nullable: true })
  tickSize?: string;

  @Column({
    name: 'lot_size',
    type: 'numeric',
    precision: 18,
    scale: 4,
    default: 1,
  })
  @Field(() => Float, { nullable: true })
  lotSize?: string;

  @Column({ name: 'meta', type: 'jsonb', nullable: true })
  meta?: Record<string, unknown> | null;
  // NOTE: no @Field on jsonb columns

  @CreateDateColumn({ name: 'created_at' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  @Field()
  updatedAt!: Date;
}
