/**
 * File:        apps/backend/src/modules/crm/entities/crm-outreach.entity.ts
 * Module:      crm
 * Purpose:     CRM outreach entity — tracks outreach communications to users
 *
 * Exports:
 *   - CrmOutreachEntity — outreach record
 *
 * Depends on:
 *   - none
 *
 * Side-effects:  none
 *
 * Key invariants:
 *   - none
 *
 * Read order:
 *   1. CrmOutreachEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('crm_outreach')
export class CrmOutreachEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 64 })
  type!: string;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt!: Date | null;
}