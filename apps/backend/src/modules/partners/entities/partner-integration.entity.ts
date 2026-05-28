/**
 * @file src/modules/partners/entities/partner-integration.entity.ts
 * @module partners
 * @description Partner integration entity for API/connector config
 * @author BharatERP
 * @created 2026-02-19
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('partner_integrations')
export class PartnerIntegrationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  partnerId!: string;

  @Column({ type: 'varchar', length: 64 })
  integrationType!: string;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status!: string;

  @Column({ type: 'jsonb', default: {} })
  config!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
