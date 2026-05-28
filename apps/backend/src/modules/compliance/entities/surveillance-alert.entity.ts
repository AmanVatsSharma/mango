/**
 * File:        apps/backend/src/modules/compliance/entities/surveillance-alert.entity.ts
 * Module:      surveillance
 * Purpose:     Surveillance alert entity for compliance breach notifications and audit logs.
 *
 * Exports:
 *   - SurveillanceAlertEntity — DB entity for surveillance alert records
 *
 * Depends on:
 *   - none
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - Status transitions: TRIGGERED → ACKNOWLEDGED → DISMISSED (or ESCALATED)
 *   - severity: LOW | MEDIUM | HIGH | CRITICAL
 *
 * Read order:
 *   1. SurveillanceAlertEntity — data shape
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-16
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('surveillance_alerts')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'severity'])
@Index(['tenantId', 'createdAt'])
export class SurveillanceAlertEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  /** Alert classification — maps to compliance rule identifier */
  @Column({ type: 'varchar', length: 64 })
  alertType!: string;

  /** Instrument involved, if applicable (e.g. NSE:RELIANCE) */
  @Column({ type: 'varchar', length: 128, nullable: true })
  instrumentId?: string | null;

  /** User ID whose activity triggered the alert */
  @Column({ type: 'uuid', nullable: true })
  userId?: string | null;

  /** LOW | MEDIUM | HIGH | CRITICAL */
  @Column({ type: 'varchar', length: 16, default: 'MEDIUM' })
  severity!: string;

  /** TRIGGERED | ACKNOWLEDGED | DISMISSED | ESCALATED */
  @Column({ type: 'varchar', length: 16, default: 'TRIGGERED' })
  status!: string;

  /** Human-readable description of what triggered the alert */
  @Column({ type: 'text' })
  description!: string;

  /** JSON metadata — rule config, threshold values, context at trigger time */
  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  acknowledgedAt?: Date | null;

  @Column({ type: 'uuid', nullable: true })
  acknowledgedBy?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  dismissedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  dismissedReason?: string | null;

  @Column({ type: 'uuid', nullable: true })
  dismissedBy?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}