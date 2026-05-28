/**
 * File:        apps/backend/src/modules/support/entities/support-ticket.entity.ts
 * Module:      support
 * Purpose:     Support ticket entity for tracking customer issues
 *
 * Exports:
 *   - SupportTicketEntity  — DB entity (managed by SupportService)
 *
 * Depends on:
 *   - none
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - status transitions: OPEN → IN_PROGRESS → RESOLVED → CLOSED
 *
 * Read order:
 *   1. SupportTicketEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@ObjectType()
@Entity('support_tickets')
export class SupportTicketEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field()
  tenantId!: string;

  @Column({ type: 'uuid' })
  @Field()
  userId!: string;

  @Column({ type: 'varchar', length: 256 })
  @Field()
  subject!: string;

  @Column({ type: 'text' })
  @Field()
  description!: string;

  @Column({ type: 'varchar', length: 32, default: 'OPEN' })
  @Field()
  status!: string;

  @Column({ type: 'varchar', length: 32 })
  @Field()
  priority!: string;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  @Field()
  updatedAt!: Date;
}
