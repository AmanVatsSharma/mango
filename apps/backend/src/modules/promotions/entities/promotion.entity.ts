/**
 * File:        apps/backend/src/modules/promotions/entities/promotion.entity.ts
 * Module:      promotions
 * Purpose:     Promotion entity — bonus, cashback, and discount campaigns per tenant
 *
 * Exports:
 *   - PromotionEntity  — DB entity (managed by PromotionsService)
 *
 * Depends on:
 *   - none
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - endDate must be >= startDate (validation in DTO)
 *
 * Read order:
 *   1. PromotionEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@ObjectType()
@Entity('promotions')
export class PromotionEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field()
  tenantId!: string;

  @Column({ type: 'varchar', length: 255 })
  @Field()
  name!: string;

  @Column({ type: 'varchar', length: 64 })
  @Field()
  type!: string;

  @Column({ type: 'varchar', length: 32, default: 'DRAFT' })
  @Field()
  status!: string;

  @Column({ type: 'date' })
  @Field()
  startDate!: string;

  @Column({ type: 'date' })
  @Field()
  endDate!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  @Field()
  budget!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  @Field()
  spent!: string;

  @Column({ type: 'jsonb', nullable: true })
  config!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;
}