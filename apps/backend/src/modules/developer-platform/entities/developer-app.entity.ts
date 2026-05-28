/**
 * @file src/modules/developer-platform/entities/developer-app.entity.ts
 * @module developer-platform
 * @description Developer app entity for API consumer registration
 * @author BharatERP
 * @created 2026-02-19
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('developer_apps')
export class DeveloperAppEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ type: 'varchar', length: 64 })
  slug!: string;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status!: string;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
