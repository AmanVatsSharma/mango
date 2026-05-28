/**
 * File:        apps/backend/src/modules/limits-and-controls/entities/exposure-limit.entity.ts
 * Module:      limits-and-controls
 * Purpose:     Per-instrument net exposure limits for broker risk management.
 *              Tracks current net exposure and emits alerts when thresholds are breached.
 *
 * Exports:
 *   - ExposureLimitEntity  — DB entity (managed by LimitsAndControlsService)
 *
 * Depends on:
 *   - none
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - alertThreshold < hardLimit always (enforced by DTO validation)
 *   - currentNetExposure is updated by positions reconciliation job, not by this entity directly
 *
 * Read order:
 *   1. ExposureLimitEntity  — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType()
@Entity('exposure_limits')
@Index(['tenantId'])
@Index(['tenantId', 'instrumentId'], { unique: true })
export class ExposureLimitEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field()
  tenantId!: string;

  /** Exchange + symbol, e.g. "NSE:RELIANCE" or "NSE:NIFTY16FUT" */
  @Column({ type: 'varchar', length: 64 })
  @Field()
  instrumentId!: string;

  /** Maximum allowed net (long - short) position quantity or notional */
  @Column({ type: 'decimal', precision: 20, scale: 4 })
  @Field()
  maxNetExposure!: string;

  /** Running net position — updated by reconciliation job */
  @Column({ type: 'decimal', precision: 20, scale: 4, default: 0 })
  @Field()
  currentNetExposure!: string;

  /** % of maxNetExposure at which an alert is emitted (0.0–1.0) */
  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0.75 })
  @Field()
  alertThreshold!: string;

  /** Hard cap — orders blocked above this regardless of alert */
  @Column({ type: 'decimal', precision: 20, scale: 4, default: 0 })
  @Field()
  hardLimit!: string;

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