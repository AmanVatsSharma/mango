/**
 * File:        apps/backend/src/modules/pamm/entities/pamm-slave.entity.ts
 * Module:      pamm
 * Purpose:     PAMM slave (follower) allocation record linking a user to a PAMM master
 *
 * Exports:
 *   - PamMSlaveEntity  — DB entity (managed by PammService)
 *
 * Depends on:
 *   - none
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - allocationPct is 0–100
 *
 * Read order:
 *   1. PamMSlaveEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@ObjectType()
@Entity('pamm_slaves')
export class PamMSlaveEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field()
  tenantId!: string;

  @Column({ type: 'uuid' })
  @Field()
  masterId!: string;

  @Column({ type: 'uuid' })
  @Field()
  userId!: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  @Field()
  allocationPct!: string;

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