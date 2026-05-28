/**
 * @file src/modules/corporate-actions/entities/corporate-action.entity.ts
 * @module corporate-actions
 * @description Corporate action event entity for dividends/splits/mergers
 * @author BharatERP
 * @created 2026-02-17
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType()
@Entity('corporate_actions')
export class CorporateActionEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field(() => ID)
  tenantId!: string;

  @Column({ type: 'varchar', length: 64 })
  @Field()
  actionType!: string;

  @Column({ type: 'varchar', length: 64 })
  @Field(() => ID)
  instrumentId!: string;

  @Column({ type: 'date' })
  @Field()
  effectiveDate!: string;

  @Column({ type: 'jsonb', default: {} })
  payload!: Record<string, unknown>;
  // Note: payload field intentionally has no @Field() — Record<string, unknown> is not serializable by GraphQL

  @Column({ type: 'varchar', length: 32, default: 'ANNOUNCED' })
  @Field()
  status!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @Field()
  updatedAt!: Date;
}
