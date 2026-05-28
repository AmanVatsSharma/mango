/**
 * @file src/modules/auth/dto/refresh.dto.ts
 * @module auth
 * @description DTO to refresh tokens
 * @author BharatERP
 * @created 2025-09-18
 */

import { IsString, MaxLength } from 'class-validator';

export class RefreshDto {
  @IsString()
  @MaxLength(64)
  tokenId!: string;
}
