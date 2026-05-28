/**
 * File:        apps/backend/src/modules/market/entities/watchlist.entity.ts
 * Module:      market · Entities
 * Purpose:     User watchlist entity (tenant-scoped)
 *
 * Exports:
 *   - WatchlistEntity — named instrument collection per user
 *
 * Depends on:
 *   - @nestjs/graphql — @ObjectType, @Field decorators
 *
 * Side-effects:  none
 *
 * Key invariants:
 *   - tenantId + userId scope ensures isolation between accounts
 *
 * Read order:
 *   1. WatchlistEntity — entity shape (this file)
 *   2. MarketResolver  — WatchlistDto mapping
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@ObjectType()
@Entity('watchlists')
@Index('idx_watchlists_user', ['tenantId', 'userId'])
export class WatchlistEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  @Field(() => ID)
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  @Field()
  tenantId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Field()
  userId!: string;

  @Column({ name: 'name', type: 'varchar', length: 64 })
  @Field()
  name!: string;

  @CreateDateColumn({ name: 'created_at' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  @Field()
  updatedAt!: Date;
}
