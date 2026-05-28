/**
 * File:        apps/backend/src/modules/copy-trading/entities/copy-trading-signal.entity.ts
 * Module:      copy-trading
 * Purpose:     Copy trading signal entity — trades copied from master to slave accounts
 *
 * Exports:
 *   - CopyTradingSignalEntity  — DB entity (managed by CopyTradingService)
 *
 * Depends on:
 *   - none
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - direction is BUY or SELL
 *
 * Read order:
 *   1. CopyTradingSignalEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@ObjectType()
@Entity('copy_trading_signals')
export class CopyTradingSignalEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field()
  tenantId!: string;

  @Column({ type: 'uuid' })
  @Field()
  masterUserId!: string;

  @Column({ type: 'varchar', length: 64 })
  @Field()
  symbol!: string;

  @Column({ type: 'varchar', length: 4 })
  @Field()
  direction!: string;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  @Field()
  lots!: string;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  @Field()
  status!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;
}