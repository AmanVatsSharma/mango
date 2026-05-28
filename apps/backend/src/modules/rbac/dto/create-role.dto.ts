/**
 * @file src/modules/rbac/dto/create-role.dto.ts
 * @module rbac
 * @description DTO for creating a role
 * @author BharatERP
 * @created 2025-09-19
 */

import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @MaxLength(64)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
