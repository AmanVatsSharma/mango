/**
 * File:        apps/backend/src/modules/notifications/entities/notification.entity.ts
 * Module:      notifications · Entities
 * Purpose:     Notification log entity for tracking delivery status across channels
 *
 * Exports:
 *   - NotificationEntity — notification record with delivery state
 *
 * Depends on:
 *   - @nestjs/graphql — @ObjectType, @Field decorators
 *
 * Side-effects:  none
 *
 * Key invariants:
 *   - channel field mirrors NotificationPreferenceEntity.channel choices
 *   - status transitions: pending → sent | failed (one-way per delivery attempt)
 *
 * Read order:
 *   1. NotificationEntity — entity shape (this file)
 *   2. NotificationsResolver — NotificationDto mapping
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-21
 */

import { ObjectType, Field, ID } from '@nestjs/graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@ObjectType()
@Entity('notifications')
@Index('idx_notifications_user', ['tenantId', 'userId', 'createdAt'])
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  @Field(() => ID)
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  @Field()
  tenantId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Field()
  userId!: string;

  @Column({ name: 'type', type: 'varchar', length: 64 })
  @Field()
  type!: string; // e.g., order.fill, deposit.approved, statement.ready

  @Column({ name: 'channel', type: 'varchar', length: 16 })
  @Field()
  channel!: string;

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'pending' })
  @Field()
  status!: string;

  @Column({ name: 'title', type: 'varchar', length: 160 })
  @Field()
  title!: string;

  @Column({ name: 'body', type: 'text' })
  @Field()
  body!: string;

  @Column({ name: 'meta', type: 'jsonb', nullable: true })
  meta?: Record<string, unknown> | null;
  // NOTE: no @Field on jsonb columns

  @CreateDateColumn({ name: 'created_at' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  @Field()
  updatedAt!: Date;
}

