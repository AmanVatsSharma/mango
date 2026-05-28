/**
 * File:        apps/backend/src/modules/support/entities/support-comment.entity.ts
 * Module:      support
 * Purpose:     Support comment entity for ticket thread
 *
 * Exports:
 *   - SupportCommentEntity  — DB entity (managed by SupportService)
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
 *   1. SupportCommentEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@ObjectType()
@Entity('support_comments')
export class SupportCommentEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ type: 'uuid' })
  @Field()
  ticketId!: string;

  @Column({ type: 'uuid' })
  @Field()
  authorId!: string;

  @Column({ type: 'text' })
  @Field()
  body!: string;

  @Column({ type: 'boolean', default: false })
  @Field()
  isInternal!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  @Field()
  createdAt!: Date;
}
