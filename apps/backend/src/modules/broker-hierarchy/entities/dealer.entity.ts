/**
 * File:        apps/backend/src/modules/broker-hierarchy/entities/dealer.entity.ts
 * Module:      broker-hierarchy
 * Purpose:     Dealer node mapping users to execution desks.
 *
 * Exports:
 *   - DealerEntity   — TypeORM entity for `broker_dealers` table
 *
 * Depends on:
 *   - @nestjs/graphql — ObjectType, Field, ID decorators
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - deskId references DeskEntity.id
 *   - userId references the user's account
 *   - tenantId is a virtual column populated by the service layer
 *
 * Read order:
 *   1. DealerEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType('Dealer')
@Entity('broker_dealers')
export class DealerEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field()
  tenantId!: string;

  @Column({ type: 'uuid' })
  @Field()
  deskId!: string;

  @Column({ type: 'uuid' })
  @Field()
  userId!: string;

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
