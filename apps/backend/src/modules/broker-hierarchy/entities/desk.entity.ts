/**
 * File:        apps/backend/src/modules/broker-hierarchy/entities/desk.entity.ts
 * Module:      broker-hierarchy
 * Purpose:     Trading desk under branch hierarchy.
 *
 * Exports:
 *   - DeskEntity   — TypeORM entity for `broker_desks` table
 *
 * Depends on:
 *   - @nestjs/graphql — ObjectType, Field, ID decorators
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - branchId references BranchEntity.id
 *
 * Read order:
 *   1. DeskEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType('Desk')
@Entity('broker_desks')
export class DeskEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field()
  tenantId!: string;

  @Column({ type: 'uuid' })
  @Field()
  branchId!: string;

  @Column({ type: 'varchar', length: 128 })
  @Field()
  deskCode!: string;

  @Column({ type: 'varchar', length: 255 })
  @Field()
  displayName!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @Field()
  updatedAt!: Date;
}
