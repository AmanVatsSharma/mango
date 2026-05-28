/**
 * File:        apps/backend/src/modules/limits-and-controls/entities/limit-control.entity.ts
 * Module:      limits-and-controls
 * Purpose:     Limit and control configuration for broker operational risk gates
 *
 * Exports:
 *   - LimitControlEntity  — DB entity (managed by LimitsAndControlsService)
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
 *   1. LimitControlEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@ObjectType()
@Entity('limit_controls')
export class LimitControlEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field()
  tenantId!: string;

  @Column({ type: 'varchar', length: 64 })
  @Field()
  controlType!: string;

  @Column({ type: 'varchar', length: 64 })
  @Field()
  scopeType!: string;

  @Column({ type: 'varchar', length: 128 })
  @Field()
  scopeValue!: string;

  @Column({ type: 'decimal', precision: 20, scale: 4 })
  @Field()
  threshold!: string;

  @Column({ type: 'boolean', default: true })
  @Field()
  enabled!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @Field()
  updatedAt!: Date;
}
