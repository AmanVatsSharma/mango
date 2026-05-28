/**
 * File:        apps/backend/src/modules/saas-control-plane/entities/billing-invoice-placeholder.entity.ts
 * Module:      saas-control-plane
 * Purpose:     Billing placeholder entity for invoice lifecycle scaffolding.
 *              Supports idempotency via unique idempotency_key.
 *
 * Exports:
 *   - BillingInvoicePlaceholderEntity
 *
 * Depends on:
 *   - None (standalone entity)
 *
 * Side-effects:  DB writes only
 *
 * Key invariants:
 *   - invoice_number + tenant_id have a unique constraint for idempotent creation.
 *   - idempotency_key is an optional client-provided key (e.g., clientOrderId) for deduplication.
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-14
 */

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('billing_invoice_placeholders')
@Index(['tenantId', 'invoiceNumber'], { unique: true })
export class BillingInvoicePlaceholderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 64 })
  invoiceNumber!: string;

  @Column({ type: 'decimal', precision: 20, scale: 4 })
  amount!: string;

  @Column({ type: 'varchar', length: 8 })
  currency!: string;

  @Column({ type: 'varchar', length: 32, default: 'DRAFT' })
  status!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  @Index()
  idempotencyKey?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
