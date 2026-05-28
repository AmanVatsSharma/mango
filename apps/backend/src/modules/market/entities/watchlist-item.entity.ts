/**
 * File:        apps/backend/src/modules/market/entities/watchlist-item.entity.ts
 * Module:      market · Entities
 * Purpose:     Watchlist item linking user watchlists to instruments
 *
 * Exports:
 *   - WatchlistItemEntity — join between watchlist and instrument
 *
 * Depends on:
 *   - @nestjs/graphql — @ObjectType, @Field decorators
 *
 * Side-effects:  none
 *
 * Key invariants:
 *   - each watchlistId + instrumentId pair should be unique at the DB level
 *
 * Read order:
 *   1. WatchlistItemEntity — entity shape (this file)
 *   2. MarketResolver      — WatchlistItemDto mapping
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
@Entity('watchlist_items')
@Index('idx_watchlist_items_watchlist', ['watchlistId'])
export class WatchlistItemEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  @Field(() => ID)
  id!: string;

  @Column({ name: 'watchlist_id', type: 'uuid' })
  @Field()
  watchlistId!: string;

  @Column({ name: 'instrument_id', type: 'uuid' })
  @Field()
  instrumentId!: string;

  @CreateDateColumn({ name: 'created_at' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  @Field()
  updatedAt!: Date;
}
