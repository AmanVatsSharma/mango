/**
 * @file src/shared/outbox/entities/outbox.entity.ts
 * @module shared/outbox
 * @description Outbox entity for transactional message publishing
 * @author BharatERP
 * @created 2026-02-19
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('outbox')
@Index('idx_outbox_status_created', ['status', 'createdAt'])
@Index('idx_outbox_tenant_status', ['tenantId', 'status'])
export class OutboxEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  tenantId!: string | null;

  @Column({ type: 'varchar', length: 128 })
  topic!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status!: string;

  @Column({ type: 'int', default: 0 })
  retryCount!: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastAttemptAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
