/**
 * File:        apps/backend/src/modules/onboarding/dtos/kyc-document.dto.ts
 * Module:      onboarding
 * Purpose:     DTOs for KYC document upload and review endpoints.
 *
 * Exports:
 *   - UploadKycDocumentDto  — metadata for document upload (file via multipart)
 *   - ReviewKycDocumentDto  — approve or reject a pending document
 *
 * Depends on:  class-validator
 * Side-effects: none
 *
 * Author:      BharatERP
 * Last-updated: 2026-04-24
 */

import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { KycDocumentType } from '../entities/kyc-document.entity';

export class UploadKycDocumentDto {
  @IsEnum(['PASSPORT', 'NATIONAL_ID', 'DRIVERS_LICENSE', 'UTILITY_BILL', 'BANK_STATEMENT', 'OTHER'])
  documentType!: KycDocumentType;
}

export class ReviewKycDocumentDto {
  @IsEnum(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  rejectionReason?: string;
}
