/**
 * @file src/modules/auth/dto/list-sessions.dto.ts
 * @module auth
 * @description DTOs for listing sessions with filters
 * @author BharatERP
 * @created 2025-09-24
 */

import { IsOptional, IsString } from 'class-validator';

export class ListSessionsDto {
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  deviceInfo?: string;
}

export class HistorySessionsDto {
  @IsOptional()
  @IsString()
  limit?: string; // parse to int at controller if needed
}


