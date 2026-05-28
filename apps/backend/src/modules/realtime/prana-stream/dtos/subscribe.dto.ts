/**
 * @file src/modules/realtime/prana-stream/dtos/subscribe.dto.ts
 * @module realtime/prana-stream
 * @description DTOs for subscribe/unsubscribe messages
 * @author BharatERP
 * @created 2025-09-24
 */

import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SymbolDto {
  @IsString()
  exchange!: string;

  @IsString()
  symbol!: string;
}

export class SubscribeDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SymbolDto)
  watchlist?: SymbolDto[];

  @IsOptional()
  @IsBoolean()
  orders?: boolean;

  @IsOptional()
  @IsBoolean()
  positions?: boolean;

  @IsOptional()
  @IsBoolean()
  accounts?: boolean;
}


