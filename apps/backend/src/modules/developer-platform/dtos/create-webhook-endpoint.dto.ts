/**
 * @file src/modules/developer-platform/dtos/create-webhook-endpoint.dto.ts
 * @module developer-platform
 * @description DTO for webhook endpoint placeholder registration
 * @author BharatERP
 * @created 2026-02-19
 */

import { IsIn, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateWebhookEndpointDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @MaxLength(128)
  name!: string;

  @IsString()
  @MaxLength(512)
  callbackUrl!: string;

  @IsIn(['HMAC_SHA256', 'JWT'])
  signatureMode!: 'HMAC_SHA256' | 'JWT';
}
