/**
 * @file src/modules/settlement/entities/settlement-job.entity.ts
 * @module settlement
 * @description Settlement job record for post-trade clearing workflows
 * @author BharatERP
 * @created 2026-02-17
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ObjectType, Field, ID, Float } from '@nestjs/graphql';

@ObjectType()
@Entity('settlement_jobs')
export class SettlementJobEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field(() => ID)
  tenantId!: string;

  @Column({ type: 'uuid' })
  @Field(() => ID)
  accountId!: string;

  @Column({ type: 'date' })
  @Field()
  tradeDate!: string;

  @Column({ type: 'decimal', precision: 20, scale: 4 })
  @Field(() => String)
  amount!: string;

  @Column({ type: 'varchar', length: 8 })
  @Field()
  currency!: string;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  @Field()
  status!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @Field()
  updatedAt!: Date;
}
