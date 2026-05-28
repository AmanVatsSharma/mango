/**
 * @file src/modules/notifications/entities/notification-preference.entity.ts
 * @module notifications
 * @description User notification preferences per category and channel
 * @author BharatERP
 * @created 2025-01-09
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('notification_preferences')
@Unique('ux_notification_pref_user_category', ['tenantId', 'userId', 'category'])
@Index('idx_notification_pref_user', ['tenantId', 'userId'])
export class NotificationPreferenceEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64 })
  tenantId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'category', type: 'varchar', length: 64 })
  category!: string; // e.g., orders, funds, statements, security

  @Column({ name: 'email', type: 'boolean', default: true })
  email!: boolean;

  @Column({ name: 'sms', type: 'boolean', default: false })
  sms!: boolean;

  @Column({ name: 'push', type: 'boolean', default: false })
  push!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

