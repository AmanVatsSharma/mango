/**
 * File:        apps/backend/src/modules/dealing/entities/deal.entity.ts
 * Module:      dealing
 * Purpose:     Deal entity for capture and status tracking
 *
 * Exports:
 *   - DealEntity  — DB entity (managed by DealingService)
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
 *   1. DealEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@ObjectType()
@Entity('dealing_deals')
export class DealEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field()
  tenantId!: string;

  @Column({ type: 'varchar', length: 64 })
  @Field()
  instrumentId!: string;

  @Column({ type: 'varchar', length: 16 })
  @Field()
  side!: string;

  @Column({ type: 'decimal', precision: 24, scale: 8 })
  @Field()
  quantity!: string;

  @Column({ type: 'decimal', precision: 24, scale: 8 })
  @Field()
  price!: string;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  @Field()
  status!: string;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @Field()
  updatedAt!: Date;
}
