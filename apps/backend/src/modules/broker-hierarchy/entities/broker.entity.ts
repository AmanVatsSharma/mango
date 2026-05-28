/**
 * File:        apps/backend/src/modules/broker-hierarchy/entities/broker.entity.ts
 * Module:      broker-hierarchy
 * Purpose:     Broker organization node under a tenant.
 *
 * Exports:
 *   - BrokerEntity   — TypeORM entity for `brokers` table
 *
 * Depends on:
 *   - @nestjs/graphql — ObjectType, Field, ID decorators
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - tenantId is set by the tenant context on insert
 *   - status is ACTIVE | SUSPENDED | PENDING_APPROVAL
 *
 * Read order:
 *   1. BrokerEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType('Broker')
@Entity('brokers')
export class BrokerEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field()
  tenantId!: string;

  @Column({ type: 'varchar', length: 128 })
  @Field()
  brokerCode!: string;

  @Column({ type: 'varchar', length: 255 })
  @Field()
  displayName!: string;

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
