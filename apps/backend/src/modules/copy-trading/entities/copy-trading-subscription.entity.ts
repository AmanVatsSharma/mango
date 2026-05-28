/**
 * File:        apps/backend/src/modules/copy-trading/entities/copy-trading-subscription.entity.ts
 * Module:      copy-trading
 * Purpose:     Copy trading subscription entity — links a slave user to a master user
 *
 * Exports:
 *   - CopyTradingSubscriptionEntity  — DB entity (managed by CopyTradingService)
 *
 * Depends on:
 *   - none
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - none
 *
 * Read order:
 *   1. CopyTradingSubscriptionEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@ObjectType()
@Entity('copy_trading_subscriptions')
export class CopyTradingSubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field()
  tenantId!: string;

  @Column({ type: 'uuid' })
  @Field()
  masterUserId!: string;

  @Column({ type: 'uuid' })
  @Field()
  slaveUserId!: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 100 })
  @Field()
  copyPct!: string;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  @Field()
  status!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @Field()
  updatedAt!: Date;
}