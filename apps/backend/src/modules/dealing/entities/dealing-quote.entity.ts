/**
 * File:        apps/backend/src/modules/dealing/entities/dealing-quote.entity.ts
 * Module:      dealing
 * Purpose:     Quote entity for RFQ and quote tracking
 *
 * Exports:
 *   - DealingQuoteEntity  — DB entity (managed by DealingService)
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
 *   1. DealingQuoteEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@ObjectType()
@Entity('dealing_quotes')
export class DealingQuoteEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field()
  tenantId!: string;

  @Column({ type: 'varchar', length: 64 })
  @Field()
  instrumentId!: string;

  @Column({ type: 'decimal', precision: 24, scale: 8 })
  @Field()
  bid!: string;

  @Column({ type: 'decimal', precision: 24, scale: 8 })
  @Field()
  ask!: string;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  @Field()
  status!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;
}
