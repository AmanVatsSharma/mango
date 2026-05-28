/**
 * File:        apps/backend/src/modules/pamm/entities/pamm-master.entity.ts
 * Module:      pamm
 * Purpose:     PAMM (Percentage Allocation Management Module) master strategy entity
 *
 * Exports:
 *   - PamMMasterEntity  — DB entity (managed by PammService)
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
 *   1. PamMMasterEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@ObjectType()
@Entity('pamm_masters')
export class PamMMasterEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field()
  tenantId!: string;

  @Column({ type: 'varchar', length: 255 })
  @Field()
  name!: string;

  @Column({ type: 'text', nullable: true })
  @Field({ nullable: true })
  strategyDescription!: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  @Field()
  minAllocation!: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  @Field()
  performanceFee!: string;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  @Field()
  status!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;
}