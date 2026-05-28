/**
 * File:        apps/backend/src/modules/onboarding/entities/kyc-document.entity.ts
 * Module:      onboarding
 * Purpose:     Tracks KYC identity documents uploaded by users — status
 *              machine: PENDING_REVIEW → APPROVED | REJECTED.
 *
 * Exports:
 *   - KycDocumentEntity     — TypeORM entity for `kyc_documents` table
 *   - KycDocumentStatus     — union of valid status strings
 *   - KycDocumentType       — union of supported document types
 *
 * Depends on:  typeorm
 * Side-effects: none
 *
 * Key invariants:
 *   - s3Key is the storage key (not the full URL) — URL constructed at read time
 *   - reviewerId nullable until document is reviewed
 *   - rejectionReason only populated on REJECTED status
 *
 * Read order:
 *   1. KycDocumentStatus / KycDocumentType — allowed values
 *   2. KycDocumentEntity — fields
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ObjectType, Field, ID, Int } from '@nestjs/graphql';

export type KycDocumentStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
export type KycDocumentType =
  | 'PASSPORT'
  | 'NATIONAL_ID'
  | 'DRIVERS_LICENSE'
  | 'UTILITY_BILL'
  | 'BANK_STATEMENT'
  | 'OTHER';

@ObjectType()
@Entity('kyc_documents')
export class KycDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => ID)
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  @Field(() => ID)
  tenantId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Field(() => ID)
  userId!: string;

  @Column({ name: 'document_type', type: 'varchar', length: 32 })
  @Field()
  documentType!: KycDocumentType;

  @Column({ name: 's3_key', type: 'text' })
  @Field()
  s3Key!: string;

  @Column({ name: 'original_filename', type: 'varchar', length: 255 })
  @Field()
  originalFilename!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 64 })
  @Field()
  mimeType!: string;

  @Column({ name: 'file_size_bytes', type: 'int' })
  @Field(() => Int)
  fileSizeBytes!: number;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'PENDING_REVIEW' })
  @Field()
  status!: KycDocumentStatus;

  @Column({ name: 'reviewer_id', type: 'uuid', nullable: true })
  @Field(() => ID, { nullable: true })
  reviewerId?: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  @Field({ nullable: true })
  reviewedAt?: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  @Field({ nullable: true })
  rejectionReason?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  @Field()
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  @Field()
  updatedAt!: Date;
}
