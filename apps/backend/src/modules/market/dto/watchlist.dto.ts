/**
 * @file src/modules/market/dto/watchlist.dto.ts
 * @module market
 * @description DTOs for watchlists CRUD
 * @author BharatERP
 * @created 2025-09-19
 */

import { IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateWatchlistDto {
  @IsString()
  @MaxLength(64)
  name!: string;
}

export class RenameWatchlistDto {
  @IsString()
  @MaxLength(64)
  name!: string;
}

export class AddWatchlistItemDto {
  @IsUUID()
  instrumentId!: string;
}
