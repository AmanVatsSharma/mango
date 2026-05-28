/**
 * File:        apps/backend/src/modules/broker-hierarchy/entities/branch.entity.ts
 * Module:      broker-hierarchy
 * Purpose:     Branch node under broker hierarchy.
 *
 * Exports:
 *   - BranchEntity   — TypeORM entity for `broker_branches` table
 *
 * Depends on:
 *   - @nestjs/graphql — ObjectType, Field, ID decorators
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - brokerId references BrokerEntity.id
 *
 * Read order:
 *   1. BranchEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType('Branch')
@Entity('broker_branches')
export class BranchEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field()
  tenantId!: string;

  @Column({ type: 'uuid' })
  @Field()
  brokerId!: string;

  @Column({ type: 'varchar', length: 128 })
  @Field()
  branchCode!: string;

  @Column({ type: 'varchar', length: 255 })
  @Field()
  displayName!: string;

  @Column({ type: 'varchar', length: 64 })
  @Field()
  countryCode!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @Field()
  updatedAt!: Date;
}
