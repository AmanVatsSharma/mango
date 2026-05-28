/**
 * File:        apps/backend/src/modules/lp-routing/entities/lp-provider.entity.ts
 * Module:      lp-routing
 * Purpose:     LP (Liquidity Provider) provider entity — routing configuration per tenant
 *
 * Exports:
 *   - LpProviderEntity  — DB entity (managed by LpRoutingService)
 *
 * Depends on:
 *   - none
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - lower priority number = higher precedence
 *
 * Read order:
 *   1. LpProviderEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@ObjectType()
@Entity('lp_providers')
export class LpProviderEntity {
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

  @Column({ type: 'varchar', length: 512, nullable: true })
  @Field({ nullable: true })
  apiEndpoint!: string | null;

  @Column({ type: 'boolean', default: true })
  @Field()
  isEnabled!: boolean;

  @Column({ type: 'int', default: 100 })
  @Field()
  priority!: number;

  @Column({ type: 'jsonb', nullable: true })
  config!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @Field()
  updatedAt!: Date;
}