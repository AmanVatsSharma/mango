/**
 * @file src/modules/notifications/dtos/update-notification-preferences.dto.ts
 * @module notifications
 * @description DTO for updating notification preferences per category
 * @author BharatERP
 * @created 2025-01-09
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsString } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @ApiProperty({ enum: ['orders', 'funds', 'statements', 'security', 'general'] })
  @IsString()
  @IsIn(['orders', 'funds', 'statements', 'security', 'general'])
  category!: string;

  @ApiProperty({ default: true })
  @IsBoolean()
  email!: boolean;

  @ApiProperty({ default: false })
  @IsBoolean()
  sms!: boolean;

  @ApiProperty({ default: false })
  @IsBoolean()
  push!: boolean;
}

