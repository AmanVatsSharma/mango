/**
 * File:        apps/backend/src/modules/crm/entities/crm-retention-offer.entity.ts
 * Module:      crm
 * Purpose:     Retention offer entity — tracks discount/cashback offers sent to at-risk users
 *
 * Exports:
 *   - CrmRetentionOfferEntity — retention offer record
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
 *   1. CrmRetentionOfferEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('crm_retention_offers')
export class CrmRetentionOfferEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 64 })
  offerType!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  value!: string;

  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}