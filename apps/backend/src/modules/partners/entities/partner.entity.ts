/**
 * @file src/modules/partners/entities/partner.entity.ts
 * @module partners
 * @description Partner entity for B2B partner management
 * @author BharatERP
 * @created 2026-02-19
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType()
@Entity('partners')
export class PartnerEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field(() => ID)
  tenantId!: string;

  @Column({ type: 'varchar', length: 128 })
  @Field()
  name!: string;

  @Column({ type: 'varchar', length: 64 })
  @Field()
  code!: string;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  @Field()
  status!: string;

  @Column({ type: 'varchar', length: 256, nullable: true })
  @Field({ nullable: true })
  contactEmail?: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;
  // Note: metadata intentionally has no @Field() — Record<string, unknown> is not serializable by GraphQL

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @Field()
  updatedAt!: Date;
}
