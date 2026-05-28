/**
 * @file src/modules/users/dto/create-user.dto.ts
 * @module users
 * @description DTO for creating a user
 * @author BharatERP
 * @created 2025-09-18
 */

import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MaxLength(64)
  tenantId!: string;

  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/)
  mobileE164!: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;
}
