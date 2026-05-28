/**
 * File:        apps/backend/src/modules/limits-and-controls/entities/limit-exception.entity.ts
 * Module:      limits-and-controls
 * Purpose:     Exception queue item for breached controls needing broker approval
 *
 * Exports:
 *   - LimitExceptionEntity  — DB entity (managed by LimitsAndControlsService)
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
 *  1. LimitExceptionEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@ObjectType()
@Entity('limit_exceptions')
export class LimitExceptionEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field()
  tenantId!: string;

  @Column({ type: 'uuid' })
  @Field()
  limitControlId!: string;

  @Column({ type: 'varchar', length: 255 })
  @Field()
  reason!: string;

  @Column({ type: 'varchar', length: 32, default: 'OPEN' })
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
