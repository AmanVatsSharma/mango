/**
 * File:        apps/backend/src/modules/saas-control-plane/dtos/create-tenant-provisioning.dto.ts
 * Module:      saas-control-plane
 * Purpose:     DTOs for control-plane provisioning, entitlement, billing, and audit APIs.
 *
 * Exports:
 *   - CreateTenantProvisioningDto       — tenant provisioning
 *   - UpsertEntitlementPlanDto         — entitlements upsert (partial updates supported)
 *   - CreateBillingInvoicePlaceholderDto — billing invoice with idempotency
 *   - CreateSupportImpersonationAuditDto — audit record
 *
 * Depends on:
 *   - class-validator decorators for all field validation
 *
 * Key invariants:
 *   - UpsertEntitlementPlanDto allows partial updates — entitlements/featureFlags can be omitted
 *   - CreateBillingInvoicePlaceholderDto requires invoiceNumber for idempotent lookup
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-14
 */

import { IsEmail, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CreateTenantProvisioningDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  requestedBy!: string;

  @IsOptional()
  @IsEmail()
  brokerAdminEmail?: string;

  @IsOptional()
  @IsObject()
  resources?: Record<string, unknown>;
}

export class UpsertEntitlementPlanDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  planCode!: string;

  @IsOptional()
  @IsObject()
  entitlements?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  featureFlags?: Record<string, boolean>;
}

export class CreateBillingInvoicePlaceholderDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  invoiceNumber!: string;

  @Matches(/^\d+(\.\d+)?$/)
  amount!: string;

  @IsString()
  @IsNotEmpty()
  currency!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,128}$/)
  idempotencyKey?: string;
}

export class CreateSupportImpersonationAuditDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  actorUserId!: string;

  @IsString()
  @IsNotEmpty()
  targetUserId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsString()
  @IsNotEmpty()
  action!: string;
}
