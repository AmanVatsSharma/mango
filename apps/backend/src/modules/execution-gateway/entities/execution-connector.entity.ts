/**
 * @file src/modules/execution-gateway/entities/execution-connector.entity.ts
 * @module execution-gateway
 * @description Connector registry entity for tenant-level adapter routing
 * @author BharatERP
 * @created 2026-02-17
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ConnectorFamily } from '../connectors/contracts/execution-gateway.contract';

@Entity('execution_connectors')
export class ExecutionConnectorEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 64 })
  connectorFamily!: ConnectorFamily;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
